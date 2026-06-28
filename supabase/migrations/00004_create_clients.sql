CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  phone           TEXT NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT,
  notes           TEXT,
  no_show_count   INT NOT NULL DEFAULT 0,
  total_visits    INT NOT NULL DEFAULT 0,
  last_visit_at   TIMESTAMPTZ,
  is_blocked      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (shop_id, phone)
);

CREATE INDEX idx_clients_shop ON clients(shop_id);
CREATE INDEX idx_clients_phone ON clients(shop_id, phone);
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_name ON clients(shop_id, name);
