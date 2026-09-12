-- Deleting a conversation must not delete the customer's job request.
-- Jobs keep phone/customer data; conversation_id is cleared instead.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_conversation_id_fkey;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES conversations(id)
  ON DELETE SET NULL;

-- Job photos belong to the job; keep them when chat history is removed.
ALTER TABLE job_media DROP CONSTRAINT IF EXISTS job_media_conversation_id_fkey;

ALTER TABLE job_media
  ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE job_media
  ADD CONSTRAINT job_media_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES conversations(id)
  ON DELETE SET NULL;
