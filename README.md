# Dobby

WhatsApp AI receptionist for independent field and home-service professionals (plumbers, electricians, locksmiths, technicians, etc.).

When someone calls the tradesperson, they are redirected to a WhatsApp number. **Dobby** collects the case — what happened, whether it is an emergency, address, photos if needed, and when the customer is available — then notifies the owner with a complete packet. Dobby does **not** auto-book calendar slots.

## What works

1. Customer chats on WhatsApp → Gemini (Hebrew) runs intake
2. Conversations and jobs are persisted in Supabase
3. Owner views threads and open jobs at `/dashboard`
4. Owner can pause AI and reply manually
5. Owner ops assistant at `/dashboard/assistant`

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Google Gemini (`@google/generative-ai`)
- WhatsApp Business Cloud API
- Supabase (Postgres + Storage for job photos)

## Setup

```bash
npm install
cp .env.example .env
```

Fill:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Gemini: `GOOGLE_AI_API_KEY`
- WhatsApp: `WHATSAPP_*`
- Optional: `OWNER_NOTIFY_PHONE`, `DASHBOARD_PASSWORD`, `APP_BASE_URL`

Apply schema (new Supabase project):

```bash
# Paste supabase/migrations/00001_dobby_schema.sql in the Supabase SQL editor
# or: npx supabase db push
```

```bash
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Local chat test

```bash
curl -X POST "http://localhost:3000/api/dev/chat" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+972500000000","message":"שלום, יש לי נזילה במטבח"}'
```

## Useful routes

| Route | Purpose |
|-------|---------|
| `POST /api/webhooks/whatsapp` | WhatsApp inbound |
| `POST /api/dev/chat` | Local chat test |
| `GET /api/conversations` | Inbox list |
| `GET /api/jobs` | Open jobs |
| `/dashboard` | Owner inbox |
| `/dashboard/business` | Business profile + job types |
