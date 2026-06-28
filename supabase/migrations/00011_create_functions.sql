-- Function: get available appointment slots for a staff member on a given date
CREATE OR REPLACE FUNCTION get_available_slots(
  p_shop_id UUID,
  p_staff_id UUID,
  p_date DATE,
  p_service_duration INT DEFAULT 15
)
RETURNS TABLE(slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ) AS $$
DECLARE
  v_opening_time TIME;
  v_closing_time TIME;
  v_slot_duration INT;
  v_timezone TEXT;
BEGIN
  SELECT opening_time, closing_time, slot_duration, timezone
    INTO v_opening_time, v_closing_time, v_slot_duration, v_timezone
    FROM shops WHERE id = p_shop_id;

  RETURN QUERY
  WITH slots AS (
    SELECT
      (p_date + v_opening_time) AT TIME ZONE v_timezone AS s_start,
      v_closing_time,
      v_slot_duration
  ),
  generated AS (
    SELECT
      (p_date + (v_opening_time + (n * v_slot_duration) * INTERVAL '1 minute'))
        AT TIME ZONE v_timezone AS gs_start,
      (p_date + (v_opening_time + (n * v_slot_duration + p_service_duration) * INTERVAL '1 minute'))
        AT TIME ZONE v_timezone AS gs_end
    FROM generate_series(0,
      EXTRACT(EPOCH FROM (v_closing_time - v_opening_time))::INT / (v_slot_duration * 60) - 1
    ) AS n
    WHERE (p_date + (v_opening_time + (n * v_slot_duration + p_service_duration) * INTERVAL '1 minute'))
      AT TIME ZONE v_timezone
      <= (p_date + v_closing_time) AT TIME ZONE v_timezone
  )
  SELECT g.gs_start, g.gs_end
  FROM generated g
  WHERE NOT EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.staff_id = p_staff_id
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_time < g.gs_end
      AND a.end_time > g.gs_start
  )
  ORDER BY g.gs_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: execute an atomic swap between two appointments
CREATE OR REPLACE FUNCTION execute_swap(
  p_swap_offer_id UUID,
  p_accepting_appointment_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_offer swap_offers%ROWTYPE;
  v_offering_appt appointments%ROWTYPE;
  v_accepting_appt appointments%ROWTYPE;
BEGIN
  -- Lock the swap offer
  SELECT * INTO v_offer FROM swap_offers WHERE id = p_swap_offer_id FOR UPDATE;
  IF v_offer.status != 'open' AND v_offer.status != 'matched' THEN
    RETURN false;
  END IF;

  -- Lock both appointments
  SELECT * INTO v_offering_appt FROM appointments WHERE id = v_offer.offering_appointment_id FOR UPDATE;
  SELECT * INTO v_accepting_appt FROM appointments WHERE id = p_accepting_appointment_id FOR UPDATE;

  IF v_offering_appt.status != 'confirmed' OR v_accepting_appt.status != 'confirmed' THEN
    RETURN false;
  END IF;

  -- Swap the time slots (keep the staff_id, swap start_time/end_time between clients)
  UPDATE appointments SET
    start_time = v_accepting_appt.start_time,
    end_time = v_accepting_appt.end_time,
    updated_at = now()
  WHERE id = v_offering_appt.id;

  UPDATE appointments SET
    start_time = v_offering_appt.start_time,
    end_time = v_offering_appt.end_time,
    updated_at = now()
  WHERE id = v_accepting_appt.id;

  -- Mark swap as completed
  UPDATE swap_offers SET
    status = 'completed',
    accepting_appointment_id = p_accepting_appointment_id,
    accepting_client_id = v_accepting_appt.client_id,
    barber_approved = true,
    updated_at = now()
  WHERE id = p_swap_offer_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-update client stats when appointment status changes
CREATE OR REPLACE FUNCTION update_client_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE clients SET
      total_visits = total_visits + 1,
      last_visit_at = NEW.end_time,
      updated_at = now()
    WHERE id = NEW.client_id;
  END IF;

  IF NEW.status = 'no_show' AND (OLD.status IS NULL OR OLD.status != 'no_show') THEN
    UPDATE clients SET
      no_show_count = no_show_count + 1,
      updated_at = now()
    WHERE id = NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_status_change
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_client_stats();

-- Trigger: auto-update `updated_at` on any row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shops_updated_at BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_swap_offers_updated_at BEFORE UPDATE ON swap_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
