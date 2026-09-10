import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleGoogleOAuthCallback(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google OAuth did not return access/refresh tokens");
  }

  const expiry = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600_000);

  const supabase = createAdminClient();

  // Single-owner POC: replace any existing token row.
  const { data: existingRows } = await supabase
    .from("google_calendar_tokens")
    .select("id");

  if (existingRows?.length) {
    await supabase
      .from("google_calendar_tokens")
      .delete()
      .in(
        "id",
        existingRows.map((row) => row.id),
      );
  }
  const { error } = await supabase.from("google_calendar_tokens").insert({
    access_token: encryptSecret(tokens.access_token),
    refresh_token: encryptSecret(tokens.refresh_token),
    token_expiry: expiry.toISOString(),
    calendar_id: "primary",
    is_valid: true,
  });

  if (error) {
    throw new Error(`Failed to store Google tokens: ${error.message}`);
  }
}

export async function getGoogleCalendarStatus() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("id, is_valid, calendar_id, updated_at")
    .eq("is_valid", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Google status: ${error.message}`);
  }

  return {
    connected: Boolean(data),
    calendarId: data?.calendar_id ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

export async function getAuthorizedCalendarClient() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("is_valid", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Google tokens: ${error.message}`);
  }

  if (!data) {
    throw new Error("Google Calendar is not connected");
  }

  const client = getOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(data.access_token),
    refresh_token: decryptSecret(data.refresh_token),
    expiry_date: new Date(data.token_expiry).getTime(),
  });

  client.on("tokens", async (tokens) => {
    const updates: {
      access_token?: string;
      refresh_token?: string;
      token_expiry?: string;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (tokens.access_token) {
      updates.access_token = encryptSecret(tokens.access_token);
    }
    if (tokens.refresh_token) {
      updates.refresh_token = encryptSecret(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      updates.token_expiry = new Date(tokens.expiry_date).toISOString();
    }

    await supabase
      .from("google_calendar_tokens")
      .update(updates)
      .eq("id", data.id);
  });

  return {
    auth: client,
    calendarId: data.calendar_id || "primary",
    tokenRowId: data.id,
  };
}
