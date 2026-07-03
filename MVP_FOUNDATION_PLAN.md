# MVP Foundation Plan

Concrete plan for Phase 1 — the foundation of the AI-native barbershop scheduler.

## High-Level System Architecture & Component Design

The system will be split into two main structural layers:

- **The Core Engine:** The backend orchestration layer that handles the incoming WhatsApp messages, talks to the LLM Gateway, and updates the state.
- **The Barber's Companion App:** A frontend UI where the barber can see the real-time activity of the AI agent, manually edit the calendar, and view logs of active customer conversations.

```
[Customer WhatsApp] <---> [WhatsApp API Gateway]
                               |
                        [Core Backend Engine] <---> [Barber Companion App]
                               |
             +-----------------+-----------------+
             |                                   |
    [LLM Gateway Provider]             [Calendar/DB State]
```

## Detailed Task Breakdown

### Epic 1: Architectural Selection & Foundation

**Task 1.1 (Crucial Decision):** Evaluate and select the LLM Provider API. Compare vendors (e.g., OpenAI, Anthropic, Google Gemini, or open-source models via Anyscale/Together) based on API latency, JSON-mode reliability, cost per 1K tokens, and native Hebrew linguistic performance.

**Task 1.2:** Establish database schemas to support generic businesses with vertical-specific configurations. Main schemas: Business (metadata, hours, vertical type: barbershop), Services (name, duration, price), ClientSession (active chat thread memory), and Appointments.

**Task 1.3:** Build the WhatsApp Webhook listener and verified outbound response module using Meta's official API specifications.

### Epic 2: The LLM Logic Layer & "Barbershop Persona"

**Task 2.1:** Create a Generic Prompt Template system. The prompt should ingest business-specific variables dynamically (e.g., Business Name, Operating Hours, Staff Names, and a list of Services such as "Haircut - 30 mins", "Beard Trim - 20 mins").

**Task 2.2:** Implement Function Calling / Tool Use configuration. The LLM must be strictly instructed not to hallucinate times, but instead to output a structured JSON command (e.g., `{"action": "check_slots", "date": "2026-07-10"}`) when a customer asks for an appointment.

**Task 2.3:** Build a contextual session manager that caches the last 10–15 text exchanges so the AI can handle natural conversation regressions (e.g., "Actually, Thursday doesn't work, what about Friday morning?").

### Epic 3: Calendar & Service Orchestration

**Task 3.1:** Write the availability engine. This algorithm takes a date, checks existing appointments in the database, maps them against the business's open hours, and factors in service durations (e.g., a "Haircut + Beard" requires a 50-minute consecutive block).

**Task 3.2:** Write the booking transaction handler. When the LLM confirms a slot choice with a customer, it executes an atomic database operation to write the appointment state as PENDING or CONFIRMED.

### Epic 4: The Barber's Tracking Companion App

**Task 4.1:** Develop a lightweight frontend dashboard (Mobile-first Web App or React Native) for the barber.

**Task 4.2:** Build an "AI Activity Feed." Create a real-time WebSocket connection between the backend engine and the companion app. When the AI agent interacts with a client on WhatsApp, the barber should see live visual card updates (e.g., "AI is currently booking Guy for tomorrow at 4:00 PM").

**Task 4.3:** Build a manual override toggle. In the companion app, give the barber a master calendar view where they can manually block out time (e.g., lunch breaks) or edit/delete appointments made by the AI.

### Epic 5: Integration, End-to-End Testing & Hebrew Polish

**Task 5.1:** Conduct strict edge-case testing for Hebrew right-to-left (RTL) formatting and colloquial language parsing (e.g., understanding slang for times like "חמש בערך" or "על הבוקר").

**Task 5.2:** Implement an automated fallback system. If the LLM confidence score drops or the customer expresses frustration, the backend flags the conversation in the barber's app as Requires Human Intervention and pauses the AI agent for that phone number.
