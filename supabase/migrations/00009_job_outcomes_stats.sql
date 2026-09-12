-- Job outcomes (completed/cancelled + payment), cascade delete with conversations,
-- and paused_message owner notifications.

-- 1) Status: closed → cancelled; allow completed/cancelled
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

UPDATE jobs SET status = 'cancelled' WHERE status = 'closed';

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'intake',
    'ready',
    'notified',
    'owner_handling',
    'completed',
    'cancelled'
  ));

-- 2) Payment + outcome timestamp for stats
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10, 2)
    CHECK (payment_amount IS NULL OR payment_amount >= 0);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS payment_includes_vat BOOLEAN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

UPDATE jobs
SET outcome_at = COALESCE(updated_at, created_at)
WHERE status IN ('completed', 'cancelled')
  AND outcome_at IS NULL;

CREATE INDEX IF NOT EXISTS jobs_outcome_at_idx
  ON jobs (outcome_at DESC)
  WHERE outcome_at IS NOT NULL;

-- 3) Cascade-delete jobs when conversation is deleted
-- NOTE: Reverted in 00010_keep_jobs_on_conversation_delete.sql
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_conversation_id_fkey;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES conversations(id)
  ON DELETE CASCADE;

-- 4) Notification type: paused_message
ALTER TABLE owner_notifications DROP CONSTRAINT IF EXISTS owner_notifications_type_check;

ALTER TABLE owner_notifications
  ADD CONSTRAINT owner_notifications_type_check
  CHECK (type IN (
    'owner_handoff',
    'new_job',
    'job_reminder',
    'paused_message'
  ));
