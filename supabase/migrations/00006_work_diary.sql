-- Work diary: accepted jobs with optional scheduled visit times

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS in_diary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS diary_added_at TIMESTAMPTZ;

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_schedule_pair_chk;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_schedule_pair_chk
  CHECK (
    (scheduled_start IS NULL AND scheduled_end IS NULL)
    OR (
      scheduled_start IS NOT NULL
      AND scheduled_end IS NOT NULL
      AND scheduled_end > scheduled_start
    )
  );

CREATE INDEX IF NOT EXISTS jobs_diary_scheduled_start_idx
  ON jobs (in_diary, scheduled_start)
  WHERE in_diary = true;
