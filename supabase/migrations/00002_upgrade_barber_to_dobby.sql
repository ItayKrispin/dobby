-- Upgrade existing BarberAI POC schema → Dobby (safe on a project that already has conversations)
-- Run this in the Supabase SQL editor instead of 00001_dobby_schema.sql

-- 1) Drop booking-era objects
DROP TABLE IF EXISTS bookings CASCADE;

-- 2) Conversations: drop booking/pending columns, add job-draft columns
ALTER TABLE conversations
  DROP COLUMN IF EXISTS draft_date,
  DROP COLUMN IF EXISTS draft_time,
  DROP COLUMN IF EXISTS draft_service,
  DROP COLUMN IF EXISTS pending_change_booking_id,
  DROP COLUMN IF EXISTS pending_change_new_starts_at,
  DROP COLUMN IF EXISTS pending_change_delay_minutes,
  DROP COLUMN IF EXISTS pending_change_note;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS owner_notes TEXT,
  ADD COLUMN IF NOT EXISTS draft_problem TEXT,
  ADD COLUMN IF NOT EXISTS draft_is_emergency BOOLEAN,
  ADD COLUMN IF NOT EXISTS draft_address TEXT,
  ADD COLUMN IF NOT EXISTS draft_availability TEXT,
  ADD COLUMN IF NOT EXISTS draft_job_type TEXT,
  ADD COLUMN IF NOT EXISTS draft_location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS draft_location_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS draft_photo_count INTEGER NOT NULL DEFAULT 0;

-- Ensure pause / name columns exist (older DBs may already have them)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Messages: allow owner role (drop old check if present, re-add)
DO $$
BEGIN
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_role_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant', 'owner'));

-- 3) Tables that may already exist from BarberAI — create if missing
CREATE TABLE IF NOT EXISTS owner_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('owner', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  customer_name TEXT,
  problem TEXT NOT NULL DEFAULT '',
  job_type TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  address_text TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  customer_availability TEXT,
  status TEXT NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake', 'ready', 'notified', 'owner_handling', 'closed')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_phone_idx ON jobs (phone);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_conversation_id_idx ON jobs (conversation_id);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS job_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  whatsapp_media_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_media_job_id_idx ON job_media (job_id);
CREATE INDEX IF NOT EXISTS job_media_conversation_id_idx ON job_media (conversation_id);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_active_name_uidx
  ON services (name)
  WHERE is_active = true;

-- Replace haircut seed with field-service job types (deactivate old barber names)
UPDATE services
SET is_active = false, updated_at = now()
WHERE name IN ('תספורת', 'זקן', 'תספורת + זקן') AND is_active = true;

INSERT INTO services (name, duration_minutes, price, sort_order)
SELECT v.name, v.duration_minutes, v.price, v.sort_order
FROM (VALUES
  ('נזילה', 60, 0::numeric, 0),
  ('סתימה', 60, 0::numeric, 1),
  ('התקנת ברז', 90, 0::numeric, 2),
  ('אחר', 60, 0::numeric, 3)
) AS v(name, duration_minutes, price, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.name = v.name AND s.is_active = true
);

-- 4) Business profile: drop concurrency, add Dobby fields
CREATE TABLE IF NOT EXISTS business_profile (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  name TEXT NOT NULL DEFAULT 'Dobby',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE business_profile DROP COLUMN IF EXISTS max_parallel;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS trade TEXT NOT NULL DEFAULT 'plumber',
  ADD COLUMN IF NOT EXISTS persona TEXT NOT NULL DEFAULT 'friendly and professional field-service receptionist named Dobby',
  ADD COLUMN IF NOT EXISTS service_area TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_notify_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_policy TEXT NOT NULL DEFAULT 'if_helpful',
  ADD COLUMN IF NOT EXISTS emergency_policy TEXT NOT NULL DEFAULT 'נזילה חזקה, הצפה, או סכנה מיידית = חירום';

-- photo_policy check (ignore if already present)
DO $$
BEGIN
  ALTER TABLE business_profile
    ADD CONSTRAINT business_profile_photo_policy_check
    CHECK (photo_policy IN ('always', 'if_helpful', 'never'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE business_profile
SET
  name = CASE WHEN name IN ('BarberAI Demo', '') THEN 'Dobby' ELSE name END,
  updated_at = now()
WHERE id = true;

INSERT INTO business_profile (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- 5) Business hours (modular intervals)
CREATE TABLE IF NOT EXISTS business_hours (
  day_of_week SMALLINT PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  intervals JSONB NOT NULL DEFAULT '[{"open":"09:00","close":"20:00"}]'::jsonb
);

-- If old open_time/close_time columns exist, migrate once then drop
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_hours' AND column_name = 'open_time'
  ) THEN
    ALTER TABLE business_hours
      ADD COLUMN IF NOT EXISTS intervals JSONB NOT NULL DEFAULT '[{"open":"09:00","close":"20:00"}]'::jsonb;

    UPDATE business_hours
    SET intervals = jsonb_build_array(
      jsonb_build_object('open', open_time::text, 'close', close_time::text)
    )
    WHERE open_time IS NOT NULL AND close_time IS NOT NULL;

    ALTER TABLE business_hours
      DROP COLUMN IF EXISTS open_time,
      DROP COLUMN IF EXISTS close_time;
  END IF;
END $$;

ALTER TABLE business_hours
  ADD COLUMN IF NOT EXISTS intervals JSONB NOT NULL DEFAULT '[{"open":"09:00","close":"20:00"}]'::jsonb;

INSERT INTO business_hours (day_of_week, is_open, intervals) VALUES
  (0, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (1, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (2, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (3, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (4, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (5, true, '[{"open":"09:00","close":"20:00"}]'::jsonb),
  (6, false, '[{"open":"09:00","close":"20:00"}]'::jsonb)
ON CONFLICT (day_of_week) DO NOTHING;

-- 6) Storage bucket for job photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;
