-- Deduplicate WhatsApp webhook deliveries (Meta retries slow handlers)
CREATE TABLE IF NOT EXISTS processed_whatsapp_messages (
  wa_message_id TEXT PRIMARY KEY,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_wa_created
  ON processed_whatsapp_messages (created_at);

-- Working hours: hard limit vs flexible guideline
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS hours_policy TEXT NOT NULL DEFAULT 'flexible'
  CHECK (hours_policy IN ('hard', 'flexible'));
