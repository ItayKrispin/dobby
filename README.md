# BarberAI

B2B SaaS for barbershop appointment management. Hebrew-only, mobile-first PWA targeting the Israeli market.

**Core differentiators:** Peer-to-peer appointment swap engine + Claude AI WhatsApp receptionist.

## Tech Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, RLS, Realtime)
- **AI:** Claude Sonnet via Anthropic SDK — 8-tool agentic loop
- **Messaging:** WhatsApp Business Cloud API (Meta)
- **Auth:** Phone OTP via Supabase Auth

## Architecture

```
src/
├── app/
│   ├── (auth)/          # Login, verify, register (phone OTP)
│   ├── (barber)/        # Dashboard, calendar, clients, services, staff, swaps, settings
│   ├── (client)/        # [shopSlug]/ — landing, booking wizard, appointments, swap board
│   └── api/
│       ├── cron/reminders/       # 24h + 2h WhatsApp reminders
│       └── webhooks/whatsapp/    # WhatsApp → Claude AI agent
├── components/
│   ├── barber/          # Calendar grid, appointment popup, day/staff selectors
│   ├── shared/          # Phone input, OTP input
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── actions/         # Server Actions (appointments, auth, booking, services, settings, staff, swaps)
│   ├── ai/              # Claude agent + 8 tool definitions
│   ├── queries/         # Data fetching (shops, appointments, swaps)
│   ├── supabase/        # Client helpers (client, server, admin, middleware)
│   ├── utils/           # Date (Hebrew), currency (agorot), slots
│   └── whatsapp/        # WhatsApp client, notification helpers
├── proxy.ts             # Auth middleware (Supabase session refresh, route protection)
└── types/database.ts    # Supabase-generated types (9 tables)

supabase/
├── migrations/          # 11 SQL migrations (schema, RLS, functions)
├── seed.sql             # Demo data (Hebrew)
└── config.toml
```

## Database

9 tables, multi-tenant via `shop_id`:

| Table | Purpose |
|-------|---------|
| `shops` | Tenant table — name, slug, hours, branding |
| `staff` | Barbers (owner/admin/barber roles) |
| `services` | Service catalog (name, duration, price in agorot) |
| `clients` | Client profiles per shop |
| `appointments` | Core bookings with status lifecycle |
| `swap_offers` | Peer-to-peer swap marketplace |
| `waitlist` | Smart waitlist with time preferences |
| `notifications` | WhatsApp notification log |
| `messages` | WhatsApp conversation history (AI sessions) |

**Key DB functions:**
- `get_available_slots()` — returns open time slots for a staff member
- `execute_swap()` — atomic appointment swap in a single transaction with row locks

## Features

### Barber Dashboard
- Calendar grid with color-coded appointments (CSS Grid, absolute positioning)
- Staff/day selectors, appointment popup with status management
- Manual appointment creation with client search
- Service catalog + staff management CRUD
- Shop settings (hours, branding, cancellation policy)
- Swap offer oversight

### Client PWA
- Shop landing page with team, services, notice banner
- Multi-step booking wizard (staff → service → date → time → confirm)
- My appointments with cancel + offer-for-swap
- Swap board — browse and accept swap offers
- Bottom navigation between pages

### Swap Engine
- Client offers appointment for swap → appears on swap board
- Another client accepts by trading their appointment
- Atomic `execute_swap` DB function (pessimistic locking, `FOR UPDATE`)
- Auto-expiry 2 hours before appointment time

### AI WhatsApp Agent
- Claude Sonnet with 8 tools: check availability, book, cancel, get appointments, get services, shop info, offer swap, join waitlist
- Agentic tool-use loop (max 5 iterations)
- Session context from messages table (2-hour window)
- Hebrew system prompt

### Notifications
- Booking confirmation via WhatsApp
- 24h and 2h appointment reminders (cron endpoint)
- Idempotent sent flags prevent duplicate notifications

## Setup

```bash
# Install
npm install

# Set up environment
cp .env.example .env.local
# Fill in Supabase, Anthropic, WhatsApp credentials

# Set up Supabase
npx supabase start          # Local dev
npx supabase db push        # Apply migrations
npx supabase db seed        # Load demo data

# Run
npm run dev
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin key (server-only) |
| `ANTHROPIC_API_KEY` | For AI agent | Claude API key |
| `WHATSAPP_ACCESS_TOKEN` | For WhatsApp | Meta Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | For WhatsApp | WhatsApp phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | For WhatsApp | Webhook verification token |
| `CRON_SECRET` | For reminders | Bearer token for cron endpoint |

## Routes

| Route | Access | Description |
|-------|--------|-------------|
| `/login`, `/verify`, `/register` | Public | Phone OTP auth + shop onboarding |
| `/dashboard` | Barber | Calendar view with appointments |
| `/clients` | Barber | Client list with visit history |
| `/services` | Barber | Service catalog management |
| `/staff` | Barber | Staff management |
| `/settings` | Barber | Shop settings |
| `/swaps` | Barber | Swap offer management |
| `/{slug}` | Public | Shop landing page |
| `/{slug}/book` | Public | Booking wizard |
| `/{slug}/appointments` | Client | My appointments |
| `/{slug}/swap` | Public | Swap board |
| `/api/cron/reminders` | Cron | Send 24h/2h reminders |
| `/api/webhooks/whatsapp` | Webhook | WhatsApp ↔ Claude AI |
