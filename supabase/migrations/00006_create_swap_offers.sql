CREATE TABLE swap_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  offering_appointment_id UUID NOT NULL REFERENCES appointments(id),
  offering_client_id  UUID NOT NULL REFERENCES clients(id),
  accepting_appointment_id UUID REFERENCES appointments(id),
  accepting_client_id UUID REFERENCES clients(id),
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'matched', 'accepted', 'completed', 'expired', 'cancelled')),
  preferred_time_start TIME,
  preferred_time_end   TIME,
  preferred_date      DATE,
  expires_at          TIMESTAMPTZ NOT NULL,
  barber_approved     BOOLEAN DEFAULT NULL
);

CREATE INDEX idx_swaps_shop_status ON swap_offers(shop_id, status);
CREATE INDEX idx_swaps_offering ON swap_offers(offering_appointment_id);
CREATE INDEX idx_swaps_expiry ON swap_offers(expires_at) WHERE status = 'open';
