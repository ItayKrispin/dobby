-- Owner UX upgrades: pins, notifications inbox, job reminders

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_pinned_at_idx
  ON conversations (pinned_at DESC NULLS LAST, last_message_at DESC);

CREATE TABLE IF NOT EXISTS owner_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('owner_handoff', 'new_job', 'job_reminder')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  phone TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_notifications_created_at_idx
  ON owner_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS owner_notifications_unread_idx
  ON owner_notifications (created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS job_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes IN (60, 180, 1440)),
  fire_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS job_reminders_due_idx
  ON job_reminders (fire_at)
  WHERE sent_at IS NULL;
