/** Digits-only form for comparing WhatsApp / E.164 style numbers. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * True when two numbers refer to the same handset (handles +972 vs 0 prefixes).
 */
export function phonesMatch(a: string, b: string): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;

  const shorter = da.length <= db.length ? da : db;
  const longer = da.length <= db.length ? db : da;
  // Require enough digits so short fragments don't false-match.
  return shorter.length >= 9 && longer.endsWith(shorter);
}
