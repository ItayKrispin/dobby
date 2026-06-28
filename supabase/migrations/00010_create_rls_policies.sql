-- Helper function: returns shop IDs the current user belongs to as staff
CREATE OR REPLACE FUNCTION get_user_shop_ids()
RETURNS SETOF UUID AS $$
  SELECT shop_id FROM staff WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: returns client IDs belonging to the current user
CREATE OR REPLACE FUNCTION get_user_client_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM clients WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- SHOPS
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view their shop"
  ON shops FOR SELECT
  USING (id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Owner can update shop"
  ON shops FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY "Authenticated users can create shops"
  ON shops FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- Public read for client-facing pages (by slug)
CREATE POLICY "Anyone can view active shops"
  ON shops FOR SELECT
  USING (is_active = true);

-- STAFF
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view their shop's staff"
  ON staff FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Public can view active staff"
  ON staff FOR SELECT
  USING (is_active = true);

CREATE POLICY "Owner/admin can manage staff"
  ON staff FOR ALL
  USING (shop_id IN (
    SELECT shop_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- SERVICES
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT
  USING (is_active = true);

CREATE POLICY "Staff can manage services"
  ON services FOR ALL
  USING (shop_id IN (SELECT get_user_shop_ids()));

-- CLIENTS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop clients"
  ON clients FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Staff can manage shop clients"
  ON clients FOR ALL
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Clients can view own profile"
  ON clients FOR SELECT
  USING (user_id = auth.uid());

-- APPOINTMENTS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop appointments"
  ON appointments FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Staff can manage shop appointments"
  ON appointments FOR ALL
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Clients can view own appointments"
  ON appointments FOR SELECT
  USING (client_id IN (SELECT get_user_client_ids()));

CREATE POLICY "Clients can insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (client_id IN (SELECT get_user_client_ids()));

CREATE POLICY "Clients can update own appointments"
  ON appointments FOR UPDATE
  USING (client_id IN (SELECT get_user_client_ids()));

-- SWAP_OFFERS
ALTER TABLE swap_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop members can view swaps"
  ON swap_offers FOR SELECT
  USING (
    shop_id IN (SELECT get_user_shop_ids())
    OR offering_client_id IN (SELECT get_user_client_ids())
    OR shop_id IN (SELECT shop_id FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can create swap offers"
  ON swap_offers FOR INSERT
  WITH CHECK (offering_client_id IN (SELECT get_user_client_ids()));

CREATE POLICY "Clients can update own swaps"
  ON swap_offers FOR UPDATE
  USING (
    offering_client_id IN (SELECT get_user_client_ids())
    OR accepting_client_id IN (SELECT get_user_client_ids())
    OR shop_id IN (SELECT get_user_shop_ids())
  );

-- WAITLIST
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop waitlist"
  ON waitlist FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Clients can manage own waitlist"
  ON waitlist FOR ALL
  USING (client_id IN (SELECT get_user_client_ids()));

-- NOTIFICATIONS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop notifications"
  ON notifications FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));

CREATE POLICY "Clients can view own notifications"
  ON notifications FOR SELECT
  USING (client_id IN (SELECT get_user_client_ids()));

-- MESSAGES
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop messages"
  ON messages FOR SELECT
  USING (shop_id IN (SELECT get_user_shop_ids()));
