-- Allow start-only diary schedules (end optional when duration unknown)

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_schedule_pair_chk;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_schedule_pair_chk
  CHECK (
    (scheduled_start IS NULL AND scheduled_end IS NULL)
    OR (
      scheduled_start IS NOT NULL
      AND scheduled_end IS NULL
    )
    OR (
      scheduled_start IS NOT NULL
      AND scheduled_end IS NOT NULL
      AND scheduled_end > scheduled_start
    )
  );
