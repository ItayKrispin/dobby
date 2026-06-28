CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id),
  phone           TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type    TEXT NOT NULL DEFAULT 'text'
                  CHECK (message_type IN ('text', 'image', 'template', 'interactive')),
  body            TEXT,
  media_url       TEXT,
  whatsapp_message_id TEXT,
  ai_session_id   TEXT,
  is_from_ai      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_messages_shop ON messages(shop_id, created_at DESC);
CREATE INDEX idx_messages_phone ON messages(phone, created_at DESC);
CREATE INDEX idx_messages_session ON messages(ai_session_id);
