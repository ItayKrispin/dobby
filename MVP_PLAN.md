# BarberAI MVP Plan: WhatsApp AI Business Assistant

## Context

The co-founder's research on Calmark revealed a key insight: building a full calendar/booking management UI from scratch wastes months competing with established solutions. Instead, the MVP should focus on the **AI agent layer** — a WhatsApp-based AI assistant that integrates with the business owner's existing Google Calendar. This approach is:

- **Faster to ship**: No calendar UI, no client booking web pages
- **Broader market**: Works for any small business/freelancer, not just barbershops
- **Higher differentiation**: Calmark's WhatsApp AI is "coming soon" — we ship with it from day 1
- **Lower friction**: Customers interact via WhatsApp (95% adoption in Israel), no app to download

**Two core flows to deliver:**
1. Customer asks a question via WhatsApp → AI agent answers or escalates to owner
2. Customer wants to book → AI checks Google Calendar → offers times → confirms → creates event → notifies owner

---

## Architecture Overview

```
Customer WhatsApp (text/voice)
  → WhatsApp Business API webhook
    → Voice? → Whisper transcription → text
    → Route to business by phone number
    → Load business config (persona, FAQ, services, policies)
    → Claude Sonnet agent loop (dynamic prompt + tools)
      → check_availability  → Google Calendar FreeBusy API
      → book_appointment    → GCal Event + DB + notify owner
      → cancel_appointment  → GCal delete + DB + notify owner
      → get_services        → Supabase DB
      → get_business_info   → Supabase DB
      → get_my_appointments → Supabase DB + GCal
      → notify_owner        → WhatsApp to owner's number
      → escalate_to_owner   → Forward conversation to owner
    → Store response in messages table
  → Send response via WhatsApp
```

**Key architectural decision:** Google Calendar is the source of truth for availability. Our PostgreSQL DB stores metadata GCal can't: services catalog, client info, pricing, AI conversation history. Appointments exist in both (GCal event ID stored in our DB for cross-reference).

---

## Codebase Changes

### KEEP AS-IS
- `src/lib/supabase/*` — All Supabase client utilities
- `src/components/ui/*` — All 18 shadcn/ui components
- `src/components/shared/*` — OTP input, phone input
- `src/app/(auth)/login/*`, `verify/*` — Auth flow
- `src/lib/actions/auth.ts` — Phone OTP actions
- `src/lib/utils.ts`, `src/lib/utils/*` — Utility functions
- `src/app/layout.tsx` — Root layout
- All migrations `00001-00011` — Keep schema, add on top

### MODIFY
| File | Change |
|------|--------|
| `src/lib/ai/agent.ts` | Dynamic system prompt from business config, voice message support |
| `src/lib/ai/tools.ts` | GCal-aware availability, add notify/escalate tools, remove swap/waitlist |
| `src/app/api/webhooks/whatsapp/route.ts` | Voice message detection + transcription pipeline |
| `src/lib/whatsapp/client.ts` | Add `downloadWhatsAppMedia()` |
| `src/types/database.ts` | New table types: `google_calendar_tokens`, `business_config` |
| `src/app/(auth)/register/page.tsx` | Redirect to multi-step onboarding wizard |
| `src/components/barber/sidebar-nav.tsx` | General-purpose nav (Dashboard→Conversations, remove Swaps/Staff) |
| `src/app/(barber)/dashboard/page.tsx` | Replace CalendarView with conversation monitor |
| `src/app/(barber)/settings/*` | Add GCal connection, AI config, notification preferences |
| `package.json` | Add `googleapis`, `openai` |
| `.env.example` | Add Google OAuth + OpenAI env vars |

### DEPRIORITIZE (keep code but don't use in MVP)
- `src/components/barber/calendar-grid.tsx`, `appointment-popup.tsx`, `day-selector.tsx`, `staff-selector.tsx` — Calendar UI not needed
- `src/app/(client)/*` — Client booking web UI not needed (customers use WhatsApp)
- `src/app/(barber)/swaps/*`, `src/lib/actions/swaps.ts`, `src/lib/queries/swaps.ts` — Phase 2
- `src/app/(barber)/staff/*` — MVP is single-owner (auto-create staff record)
- `src/lib/actions/client-booking.ts`, `src/lib/queries/client-appointments.ts` — Web booking removed

---

## Implementation Phases

### Phase 1: Foundation & Schema (Days 1-3)

**New migration** `supabase/migrations/00012_pivot_to_business_assistant.sql`:

```sql
-- Google Calendar OAuth tokens (encrypted at app layer)
CREATE TABLE google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business configuration (AI persona, knowledge base, notifications)
CREATE TABLE business_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE UNIQUE,
  business_type TEXT NOT NULL DEFAULT 'general',
  ai_persona TEXT,
  ai_tone TEXT NOT NULL DEFAULT 'friendly_professional',
  greeting_message TEXT,
  faq_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  policies TEXT,
  about_text TEXT,
  owner_phone TEXT,
  notify_on_booking BOOLEAN NOT NULL DEFAULT true,
  notify_on_cancel BOOLEAN NOT NULL DEFAULT true,
  notify_on_escalation BOOLEAN NOT NULL DEFAULT true,
  auto_confirm_booking BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  onboarding_step INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend existing tables
ALTER TABLE shops ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'barbershop';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_transcription TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration_seconds INT;

-- RLS
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages tokens" ON google_calendar_tokens FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE owner_user_id = auth.uid()));
ALTER TABLE business_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages config" ON business_config FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE owner_user_id = auth.uid()));
```

**Files to create:**
- `supabase/migrations/00012_pivot_to_business_assistant.sql`
- `src/lib/google/crypto.ts` — AES-256-GCM encryption for OAuth tokens

**Files to modify:**
- `src/types/database.ts` — Add new table types
- `package.json` — Add `googleapis`, `openai`
- `.env.example` — Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`

---

### Phase 2: Google Calendar Integration (Days 4-7)

**Files to create:**
- `src/lib/google/auth.ts` — `getAuthUrl()`, `handleCallback()`, `refreshTokenIfNeeded()`, `revokeAccess()`
- `src/lib/google/calendar.ts` — `checkGCalAvailability()`, `createGCalEvent()`, `updateGCalEvent()`, `deleteGCalEvent()`, `listCalendars()`
- `src/app/api/google/auth/route.ts` — Initiates OAuth2 redirect to Google consent screen
- `src/app/api/google/callback/route.ts` — Handles callback, exchanges code for tokens, stores encrypted
- `src/app/api/google/disconnect/route.ts` — Revokes and removes tokens
- `src/app/api/google/calendars/route.ts` — Lists owner's calendars for selection

**Key implementation details:**
- OAuth2 with `access_type: 'offline'`, `prompt: 'consent'` to always get refresh token
- `state` parameter contains encrypted shopId for CSRF protection
- Token refresh before every GCal API call (check `token_expiry`)
- If refresh fails → set `is_valid = false`, notify owner to reconnect
- FreeBusy API for availability (intersected with working hours from shops table)
- Events API for booking/cancellation

---

### Phase 3: AI Agent Pivot (Days 8-12)

The core value. Transform the hardcoded barbershop agent into a configurable business assistant.

**Files to create:**
- `src/lib/ai/prompt-builder.ts` — Builds dynamic system prompt from `business_config` + `shops` + `services` tables

**Files to modify:**
- `src/lib/ai/agent.ts`:
  - Replace hardcoded `SYSTEM_PROMPT` with call to `buildSystemPrompt(shopId)`
  - Load business config at the start of `handleWhatsAppMessage`
  - Accept voice transcription metadata

- `src/lib/ai/tools.ts`:
  - **Rewrite** `check_availability` → GCal FreeBusy API (with DB working-hours fallback if no GCal)
  - **Extend** `book_appointment` → Create GCal event after DB insert, trigger owner notification
  - **Extend** `cancel_appointment` → Delete GCal event, trigger owner notification
  - **Rename** `get_shop_info` → `get_business_info`, include business_config data
  - **Add** `notify_owner` — Send WhatsApp to owner's number with context
  - **Add** `escalate_to_owner` — Forward conversation thread to owner
  - **Add** `reschedule_appointment` — Cancel + rebook in one operation
  - **Remove** `offer_swap`, `join_waitlist` from active tool list (keep code for Phase 2)

**Dynamic prompt structure:**
```
You are the virtual assistant for {businessName}, a {businessType} in {city}.
Respond in Hebrew, in a {aiTone} tone.

About the business: {about_text}
Services offered: {dynamically injected from services table}
Business policies: {policies}
Frequently asked questions: {faq_entries}
Working hours: {opening_time} - {closing_time}
Today is: {date}

Rules:
- Use tools for all actions — never invent information
- Check Google Calendar for real availability before offering times
- Confirm with the client before booking or canceling
- If you can't handle a request, use escalate_to_owner
- Present prices in NIS (divide stored price by 100)
```

---

### Phase 4: Voice Message Support (Days 13-15)

**Files to create:**
- `src/lib/voice/transcribe.ts`:
  - `downloadWhatsAppMedia(mediaId)` → GET media URL from WhatsApp API, then download binary
  - `transcribeAudio(buffer, language='he')` → OpenAI Whisper API call
  - `processVoiceMessage(mediaId)` → Download + transcribe pipeline

**Files to modify:**
- `src/app/api/webhooks/whatsapp/route.ts`:
  - Detect `message.type === 'audio'` (currently returns "non_text_ignored")
  - Download and transcribe voice messages before passing to agent
  - Store `voice_transcription` and `message_type: 'voice'` in messages table
  - Add WhatsApp webhook signature verification (X-Hub-Signature-256 header)

- `src/lib/whatsapp/client.ts`:
  - Add `downloadWhatsAppMedia(mediaId): Promise<Buffer>`

---

### Phase 5: Owner Notifications (Days 16-17)

**Files to modify:**
- `src/lib/whatsapp/notifications.ts`:
  - Add owner notification message builders (booking, cancellation, escalation)
  - Make messages business-generic (no barbershop-specific language)

- `src/lib/ai/tools.ts`:
  - Wire `notify_owner` tool to send WhatsApp to `business_config.owner_phone`
  - Wire `escalate_to_owner` to forward last N messages as context
  - Trigger notifications from `book_appointment` and `cancel_appointment` based on `business_config` notification preferences

---

### Phase 6: Onboarding Wizard (Days 18-22)

Replace the single-form register page with a 5-step wizard.

**Files to create:**
- `src/app/(auth)/onboarding/page.tsx` — Multi-step wizard container
- `src/app/(auth)/onboarding/steps/business-profile.tsx` — Name, type, address, hours, description
- `src/app/(auth)/onboarding/steps/services-setup.tsx` — Add services (name, duration, price)
- `src/app/(auth)/onboarding/steps/google-calendar.tsx` — Connect GCal (OAuth button + calendar selector)
- `src/app/(auth)/onboarding/steps/ai-config.tsx` — Tone, greeting, FAQ, policies
- `src/app/(auth)/onboarding/steps/whatsapp-setup.tsx` — Instructions + webhook URL + done
- `src/lib/actions/business-config.ts` — CRUD for business_config table

**Files to modify:**
- `src/app/(auth)/register/page.tsx` — Simplify to just name+slug, redirect to `/onboarding`
- `src/lib/actions/shops.ts` — Auto-create `business_config` row when shop is created

---

### Phase 7: Dashboard & Settings Rewrite (Days 23-27)

**Dashboard** — Replace CalendarView with conversation monitor:

**Files to create:**
- `src/app/(barber)/dashboard/conversation-list.tsx` — Recent conversations (24h), client name, last message preview
- `src/app/(barber)/dashboard/conversation-detail.tsx` — Full thread view
- `src/app/(barber)/dashboard/stats-summary.tsx` — Conversations today, AI bookings, escalations
- `src/app/(barber)/settings/google-calendar-card.tsx` — GCal connection status, reconnect
- `src/app/(barber)/settings/ai-config-card.tsx` — Tone, FAQ, policies editor
- `src/app/(barber)/settings/notification-config-card.tsx` — Toggle notifications

**Files to modify:**
- `src/app/(barber)/dashboard/page.tsx` — Fetch conversations instead of calendar data
- `src/components/barber/sidebar-nav.tsx` — Update nav: Dashboard (שיחות), Services (שירותים), Clients (לקוחות), Settings (הגדרות). Remove Swaps, Staff.
- `src/app/(barber)/settings/page.tsx` — Add new settings sections

---

### Phase 8: Landing Page & Polish (Days 28-30)

- Rewrite `src/app/page.tsx` for general-purpose positioning
- Remove "מספרה" (barbershop) references from all UI text
- End-to-end testing of the full pipeline
- Security audit: webhook signature verification, token encryption, RLS policies

---

## Key Decisions

1. **Keep `shops` table name** — Renaming to `businesses` would break every RLS policy, FK, and query. Use "business" only in UI labels.
2. **Single-owner focus for MVP** — Owner is auto-created as a staff member. Multi-staff + multi-calendar is Phase 2.
3. **GCal as source of truth** — Appointments live in both GCal (for the owner's view) and our DB (for metadata). GCal event ID is cross-referenced.
4. **Claude Sonnet for agent** — Fast + affordable. Opus reserved for future business intelligence agent.
5. **WhatsApp setup is manual for beta** — Business owners need help setting up WhatsApp Business API. Plan for concierge onboarding during beta phase (5-10 businesses in Tel Aviv).

---

## Environment Variables (New)

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=    # 32-byte hex for AES-256-GCM
OPENAI_API_KEY=                 # For Whisper transcription
```

---

## Verification Plan

1. **Google Calendar flow**: Connect GCal → verify tokens stored encrypted → check availability for a date → confirm slots match real GCal → book → verify event appears in Google Calendar → cancel → verify event removed
2. **WhatsApp AI flow**: Send text message → verify agent responds in Hebrew → ask for services → verify correct data → request booking → verify GCal event created + owner notified → send voice message → verify transcription → verify agent responds to transcribed content
3. **Onboarding**: Register → complete all 5 steps → verify business_config created → verify GCal connected → verify AI uses custom persona/FAQ
4. **Owner notifications**: Book via WhatsApp → verify owner gets WhatsApp notification → escalate → verify owner gets conversation context
5. **Dashboard**: Verify conversations appear → verify stats are correct → verify settings changes propagate to AI behavior

---

## Timeline

| Phase | Days | Core Deliverable |
|-------|------|-----------------|
| 1. Foundation & Schema | 1-3 | DB tables, types, dependencies |
| 2. Google Calendar | 4-7 | Full OAuth + read/write GCal |
| 3. AI Agent Pivot | 8-12 | Configurable agent + GCal tools |
| 4. Voice Messages | 13-15 | Voice → Whisper → AI pipeline |
| 5. Owner Notifications | 16-17 | WhatsApp alerts to business owner |
| 6. Onboarding Wizard | 18-22 | 5-step setup wizard |
| 7. Dashboard & Settings | 23-27 | Conversation monitor + settings |
| 8. Polish & Launch | 28-30 | Rebrand, test, security audit |

**Total: ~30 working days (6 weeks)**

Critical path is Phases 1-3 (GCal + AI agent). These unlock the core value proposition. Phases 4-5 add important polish. Phases 6-8 are the owner-facing web UI and can ship in a reduced form if time is tight.
