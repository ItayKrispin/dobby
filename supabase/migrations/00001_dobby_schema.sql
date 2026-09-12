-- Dobby schema (fresh empty project only)
-- If your project already has BarberAI tables (ERROR: relation "conversations" already exists),
-- run 00002_upgrade_barber_to_dobby.sql instead of this file.

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_paused BOOLEAN NOT NULL DEFAULT false,
  paused_at TIMESTAMPTZ,
  customer_name TEXT,
  owner_notes TEXT,
  draft_problem TEXT,
  draft_is_emergency BOOLEAN,
  draft_address TEXT,
  draft_availability TEXT,
  draft_job_type TEXT,
  draft_location_lat DOUBLE PRECISION,
  draft_location_lng DOUBLE PRECISION,
  draft_photo_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'owner')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_created_at_idx
  ON messages (conversation_id, created_at);

CREATE INDEX conversations_last_message_at_idx
  ON conversations (last_message_at DESC);

CREATE TABLE owner_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('owner', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional park for later calendar use (unused in v1 intake)
CREATE TABLE google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
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

CREATE INDEX jobs_phone_idx ON jobs (phone);
CREATE INDEX jobs_status_idx ON jobs (status);
CREATE INDEX jobs_conversation_id_idx ON jobs (conversation_id);
CREATE INDEX jobs_created_at_idx ON jobs (created_at DESC);

CREATE TABLE job_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  whatsapp_media_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX job_media_job_id_idx ON job_media (job_id);
CREATE INDEX job_media_conversation_id_idx ON job_media (conversation_id);

-- Job types (optional catalog for the AI to map against)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX services_active_name_uidx
  ON services (name)
  WHERE is_active = true;

-- Job types start empty; owners add their own from the dashboard

CREATE TABLE business_profile (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  name TEXT NOT NULL DEFAULT '',
  trade TEXT NOT NULL DEFAULT 'plumber',
  persona TEXT NOT NULL DEFAULT 'friendly and professional field-service receptionist named Dobby',
  service_area TEXT NOT NULL DEFAULT '',
  owner_notify_phone TEXT NOT NULL DEFAULT '',
  photo_policy TEXT NOT NULL DEFAULT 'always'
    CHECK (photo_policy IN ('always', 'if_helpful', 'never')),
  emergency_policy TEXT NOT NULL DEFAULT 'נזילה חזקה, הצפה, או סכנה מיידית = חירום',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_profile (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE business_hours (
  day_of_week SMALLINT PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  intervals JSONB NOT NULL DEFAULT '[{"open":"08:00","close":"17:00"}]'::jsonb
);

INSERT INTO business_hours (day_of_week, is_open, intervals) VALUES
  (0, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (1, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (2, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (3, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (4, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (5, true, '[{"open":"08:00","close":"17:00"}]'::jsonb),
  (6, false, '[{"open":"08:00","close":"17:00"}]'::jsonb)
ON CONFLICT (day_of_week) DO NOTHING;

-- Private bucket for WhatsApp job photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;
