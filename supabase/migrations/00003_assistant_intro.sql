-- Add configurable customer-facing assistant intro text
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS assistant_intro TEXT NOT NULL DEFAULT '';
