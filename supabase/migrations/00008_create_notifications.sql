CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id),
  appointment_id  UUID REFERENCES appointments(id),
  type            TEXT NOT NULL
                  CHECK (type IN ('reminder_24h', 'reminder_2h', 'booking_confirmed',
                                   'booking_cancelled', 'swap_available', 'swap_matched',
                                   'waitlist_opened', 're_engagement')),
  channel         TEXT NOT NULL DEFAULT 'whatsapp'
                  CHECK (channel IN ('whatsapp', 'sms', 'push')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  message_body    TEXT,
  external_id     TEXT,
  sent_at         TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX idx_notifications_shop ON notifications(shop_id, created_at DESC);
CREATE INDEX idx_notifications_client ON notifications(client_id);
CREATE INDEX idx_notifications_pending ON notifications(status, created_at) WHERE status = 'pending';
