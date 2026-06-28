CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  phone           TEXT,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'barber'
                  CHECK (role IN ('owner', 'admin', 'barber')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   INT NOT NULL DEFAULT 0,
  instagram_url   TEXT,
  facebook_url    TEXT,
  whatsapp_url    TEXT
);

CREATE INDEX idx_staff_shop ON staff(shop_id);
CREATE INDEX idx_staff_user ON staff(user_id);
