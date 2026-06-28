CREATE TABLE appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id),
  client_id       UUID NOT NULL REFERENCES clients(id),
  service_id      UUID NOT NULL REFERENCES services(id),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show', 'swap_pending')),
  booked_via      TEXT NOT NULL DEFAULT 'web'
                  CHECK (booked_via IN ('web', 'whatsapp', 'dashboard', 'phone')),
  cancellation_reason TEXT,
  price           INT NOT NULL,
  notes           TEXT,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_2h_sent  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_appointments_shop_date ON appointments(shop_id, start_time);
CREATE INDEX idx_appointments_staff_date ON appointments(staff_id, start_time);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_status ON appointments(shop_id, status, start_time);

-- Prevent double-booking: only one confirmed/swap_pending appointment per staff per time
CREATE UNIQUE INDEX idx_no_double_booking
  ON appointments(staff_id, start_time)
  WHERE status NOT IN ('cancelled', 'no_show');
