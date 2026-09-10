/**
 * Parked: BarberAI calendar booking engine.
 * Dobby v1 uses job intake (`src/lib/jobs.ts`) instead of auto-booking.
 * Keep Google Calendar OAuth helpers under `src/lib/google/` for a later visit.
 */

export async function checkAvailability() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function bookAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function listUpcomingBookings() {
  return { ok: true as const, bookings: [] as unknown[] };
}

export async function listBookingsForDate() {
  return { ok: true as const, bookings: [] as unknown[] };
}

export async function cancelAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function cancelAppointmentById() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function rescheduleAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function rescheduleAppointmentById() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function updateAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function getBookingById() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function proposeDelayAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function delayAppointment() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}

export async function applyPendingChange() {
  return {
    ok: false as const,
    error: "Calendar booking is disabled in Dobby v1 (intake-only)",
  };
}
