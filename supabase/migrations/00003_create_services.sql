CREATE TABLE services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 15,
  price           INT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#3B82F6',
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_services_shop ON services(shop_id);
