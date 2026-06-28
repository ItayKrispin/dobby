CREATE TABLE shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  logo_url        TEXT,
  cover_image_url TEXT,
  notice_text     TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#7C3AED',
  timezone        TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  opening_time    TIME NOT NULL DEFAULT '09:00',
  closing_time    TIME NOT NULL DEFAULT '20:00',
  slot_duration   INT NOT NULL DEFAULT 15,
  cancellation_window_minutes INT NOT NULL DEFAULT 30,
  auto_approve_swaps BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  subscription_plan TEXT NOT NULL DEFAULT 'starter'
);

CREATE UNIQUE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_owner ON shops(owner_user_id);
