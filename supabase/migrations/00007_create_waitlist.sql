CREATE TABLE waitlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id),
  staff_id        UUID REFERENCES staff(id),
  service_id      UUID NOT NULL REFERENCES services(id),
  preferred_date  DATE NOT NULL,
  time_preference TEXT NOT NULL DEFAULT 'any'
                  CHECK (time_preference IN ('morning', 'afternoon', 'evening', 'any')),
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
  notified_at     TIMESTAMPTZ,
  priority_score  INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_waitlist_shop ON waitlist(shop_id, preferred_date, status);
CREATE INDEX idx_waitlist_match ON waitlist(shop_id, preferred_date, time_preference, status);
