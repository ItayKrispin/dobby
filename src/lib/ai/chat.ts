import {
  FunctionCallingMode,
  FunctionDeclaration,
  FunctionDeclarationsTool,
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { getBusinessProfile } from "@/lib/business";
import {
  getCustomerName,
  getJobDraft,
  getOrCreateConversation,
  loadRecentHistory,
  saveMessage,
  setAiPaused,
  setCustomerName,
  updateJobDraft,
  type ChatMessage,
  type JobDraft,
  type MessageRole,
} from "@/lib/conversations";
import { isPacketComplete, submitJob } from "@/lib/jobs";
import { createOwnerHandoffNotification } from "@/lib/notifications";
import { listActiveServices, type Service } from "@/lib/services";

const MAX_TOOL_ITERATIONS = 5;

function buildTools(services: Service[]): FunctionDeclarationsTool[] {
  const names = services.map((service) => service.name).join(", ");

  const saveCustomerNameTool: FunctionDeclaration = {
    name: "save_customer_name",
    description:
      "Save or update this customer's display name when they provide it. Call immediately after they state their name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: "Customer's name",
        },
      },
      required: ["name"],
    },
  };

  const updateJobDraftTool: FunctionDeclaration = {
    name: "update_job_draft",
    description:
      "Save or merge in-progress job intake fields as soon as the customer states or corrects them. Partial updates are allowed. Extract ALL fields present in a single message (address AND availability AND problem if present).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        problem: {
          type: SchemaType.STRING,
          description: "What happened / what they need (free text)",
        },
        address: {
          type: SchemaType.STRING,
          description: "Service address text",
        },
        availability: {
          type: SchemaType.STRING,
          description: "When the customer can be visited (windows, not a booked slot)",
        },
        job_type: {
          type: SchemaType.STRING,
          description: `Optional job type from: ${names}`,
        },
      },
      required: [],
    },
  };

  const submitJobTool: FunctionDeclaration = {
    name: "submit_job",
    description:
      "Submit the completed intake packet to the owner. Require problem, address, and availability (and a photo when the business always wants photos).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  };

  const requestOwnerTool: FunctionDeclaration = {
    name: "request_owner",
    description:
      "Call when the customer asks to speak directly with the owner / a human / בעל העסק. Pauses the AI and alerts the owner. Do not keep collecting fields after this.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  };

  return [
    {
      functionDeclarations: [
        saveCustomerNameTool,
        updateJobDraftTool,
        submitJobTool,
        requestOwnerTool,
      ],
    },
  ];
}

function buildExtractTools(services: Service[]): FunctionDeclarationsTool[] {
  const names = services.map((service) => service.name).join(", ");
  return [
    {
      functionDeclarations: [
        {
          name: "save_customer_name",
          description: "Save customer name if stated in the message.",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING, description: "Customer's name" },
            },
            required: ["name"],
          },
        },
        {
          name: "update_job_draft",
          description:
            "Extract every intake field present in the customer message. One message may contain address, availability, and problem together — fill all of them.",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              problem: { type: SchemaType.STRING },
              address: { type: SchemaType.STRING },
              availability: { type: SchemaType.STRING },
              job_type: {
                type: SchemaType.STRING,
                description: `Optional job type from: ${names}`,
              },
            },
            required: [],
          },
        },
      ],
    },
  ];
}

function speakerLabel(role: MessageRole) {
  if (role === "owner") return "בעל העסק";
  if (role === "assistant") return "עוזר";
  return "לקוח";
}

/** Strip history speaker tags the model sometimes echoes into customer-facing text. */
function sanitizeAssistantReply(text: string) {
  return text
    .replace(/^\s*\[(?:עוזר|לקוח|בעל העסק)\]\s*/gm, "")
    .trim();
}

function toGeminiRole(role: MessageRole): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

/**
 * Label speakers and merge consecutive same Gemini-role turns so:
 * - owner messages are visible to the model
 * - consecutive customer bursts (photo + address + time) are not dropped
 * - Gemini history alternates user/model correctly
 */
function toGeminiHistory(history: ChatMessage[]) {
  let start = 0;
  while (start < history.length && history[start].role === "assistant") {
    start += 1;
  }

  const trimmed = history.slice(start);
  const merged: { role: "user" | "model"; text: string }[] = [];

  for (const message of trimmed) {
    const geminiRole = toGeminiRole(message.role);
    const labeled = `[${speakerLabel(message.role)}] ${message.content}`;
    const last = merged[merged.length - 1];
    if (last && last.role === geminiRole) {
      last.text = `${last.text}\n${labeled}`;
    } else {
      merged.push({ role: geminiRole, text: labeled });
    }
  }

  // History must start with user for Gemini chat sessions.
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }

  return merged.map((entry) => ({
    role: entry.role,
    parts: [{ text: entry.text }],
  }));
}

function getModel(
  customerName: string | null,
  draft: JobDraft,
  services: Service[],
  business: {
    name: string;
    trade: string;
    persona: string;
    hoursSummary: string;
    hoursPolicy: "hard" | "flexible";
    serviceArea: string;
    photoPolicy: "always" | "if_helpful" | "never";
    assistantIntro: string;
  },
  options: {
    aiPaused?: boolean;
    hasOwnerMessages?: boolean;
    pausedAt?: string | null;
  } = {},
) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: buildSystemPrompt({
      customerName,
      draft,
      services,
      business,
      aiPaused: options.aiPaused,
      hasOwnerMessages: options.hasOwnerMessages,
      pausedAt: options.pausedAt,
    }),
    tools: buildTools(services),
  });
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function runTool(
  phone: string,
  name: string,
  args: Record<string, unknown>,
  draft: JobDraft,
): Promise<{ result: unknown; draft: JobDraft }> {
  if (name === "save_customer_name") {
    const customerName = String(args.name ?? "").trim();
    if (!customerName) {
      return { result: { ok: false, error: "name is required" }, draft };
    }
    const updated = await setCustomerName(phone, customerName);
    return {
      result: { ok: true, customer_name: updated.customer_name },
      draft,
    };
  }

  if (name === "update_job_draft") {
    try {
      const next = await updateJobDraft(phone, {
        problem: stringArg(args, "problem"),
        address: stringArg(args, "address"),
        availability: stringArg(args, "availability"),
        jobType: stringArg(args, "job_type"),
      });
      return { result: { ok: true, draft: next }, draft: next };
    } catch (error) {
      return {
        result: {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update draft",
        },
        draft,
      };
    }
  }

  if (name === "submit_job") {
    const submitted = await submitJob(phone);
    if (submitted.ok) {
      return {
        result: submitted,
        draft: {
          problem: null,
          isEmergency: null,
          address: null,
          availability: null,
          jobType: null,
          locationLat: null,
          locationLng: null,
          photoCount: 0,
        },
      };
    }
    return { result: submitted, draft };
  }

  if (name === "request_owner") {
    try {
      const conversation = await getOrCreateConversation(phone);
      const alreadyPaused = Boolean(conversation.ai_paused);
      if (!alreadyPaused) {
        await setAiPaused(phone, true);
      }
      const customerName = conversation.customer_name;
      let notified = false;
      try {
        const handoff = await createOwnerHandoffNotification({
          phone,
          conversationId: conversation.id,
          customerName,
        });
        notified = handoff.created;
      } catch (notifyError) {
        console.error("Owner handoff notification failed:", notifyError);
      }
      return {
        result: {
          ok: true,
          paused: true,
          already_paused: alreadyPaused,
          notified,
        },
        draft,
      };
    } catch (error) {
      return {
        result: {
          ok: false,
          error:
            error instanceof Error ? error.message : "Failed to request owner",
        },
        draft,
      };
    }
  }

  return { result: { ok: false, error: `Unknown tool: ${name}` }, draft };
}

/**
 * Dedicated extract pass so typed address/availability are saved even if the
 * conversational reply turn skips tool calls.
 */
async function extractFieldsFromMessage(
  phone: string,
  userMessage: string,
  draft: JobDraft,
  customerName: string | null,
  services: Service[],
): Promise<{ draft: JobDraft; customerName: string | null }> {
  // Photo / location / voice stubs only update photo count (already done); nothing to extract
  // unless the note includes a caption / accompanying text after the stub prefix.
  const trimmed = userMessage.trim();
  const photoOnly = /^\[הלקוח שלח(?: \d+)? תמונות?\]$/.test(trimmed);
  if (
    photoOnly ||
    trimmed.startsWith("[הלקוח שלח מיקום]") ||
    trimmed === "[הלקוח שלח הודעת קול]"
  ) {
    return { draft, customerName };
  }

  // Image album with caption: strip the stub so extract sees the real fields.
  const photoWithCaption = trimmed.match(
    /^\[הלקוח שלח(?: \d+)? תמונות?\]\s+([\s\S]+)$/,
  );
  const extractSource = photoWithCaption?.[1]?.trim() || trimmed;
  if (!extractSource) {
    return { draft, customerName };
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { draft, customerName };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      systemInstruction: `You extract field-service intake data from a single Hebrew customer WhatsApp message.
Call update_job_draft and/or save_customer_name for EVERY fact present.
One message may include name, problem, address, and availability together — extract all of them.
Examples:
- "רחוב החשמל 3" → address
- "אפשר בראשון בבוקר" / "ראשון בבוקר" → availability
- "צחי" alone or "שמי צחי" → name
Do not invent fields. If nothing to extract, respond with an empty text reply and call no tools.
Current known draft (do not clear existing values): problem=${draft.problem ?? "חסר"}, address=${draft.address ?? "חסר"}, availability=${draft.availability ?? "חסר"}, name=${customerName ?? "חסר"}.`,
      tools: buildExtractTools(services),
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: extractSource }] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO,
          allowedFunctionNames: ["update_job_draft", "save_customer_name"],
        },
      },
    });
    const calls = result.response.functionCalls() ?? [];
    let nextDraft = draft;
    let nextName = customerName;

    for (const call of calls) {
      const { result: toolResult, draft: updated } = await runTool(
        phone,
        call.name,
        (call.args ?? {}) as Record<string, unknown>,
        nextDraft,
      );
      nextDraft = updated;
      if (
        call.name === "save_customer_name" &&
        toolResult &&
        typeof toolResult === "object" &&
        "ok" in toolResult &&
        toolResult.ok &&
        "customer_name" in toolResult &&
        typeof toolResult.customer_name === "string"
      ) {
        nextName = toolResult.customer_name;
      }
    }

    return { draft: nextDraft, customerName: nextName };
  } catch (error) {
    console.error("Extract pass failed:", error);
    return { draft, customerName };
  }
}

export async function chat(
  phone: string,
  userMessage: string,
  options: { skipSaveUser?: boolean } = {},
): Promise<string> {
  // Persist the inbound message first so the dashboard shows it even if Gemini fails.
  if (!options.skipSaveUser) {
    await saveMessage(phone, "user", userMessage);
  }

  const [history, customerNameInitial, jobDraftInitial, services, business, conversation] =
    await Promise.all([
      loadRecentHistory(phone),
      getCustomerName(phone),
      getJobDraft(phone),
      listActiveServices(),
      getBusinessProfile(),
      getOrCreateConversation(phone),
    ]);

  // Extract fields from this message before building the reply prompt.
  const extracted = await extractFieldsFromMessage(
    phone,
    userMessage,
    jobDraftInitial,
    customerNameInitial,
    services,
  );
  let knownName = extracted.customerName;
  let draft = extracted.draft;

  // If packet is complete after extract, submit and confirm — don't re-ask.
  if (isPacketComplete(draft, business.photoPolicy)) {
    const submitted = await submitJob(phone);
    if (submitted.ok) {
      const reply =
        "תודה! קיבלתי את כל הפרטים והעברתי לבעל העסק. הוא יחזור אליך בהקדם.";
      await saveMessage(phone, "assistant", reply);
      return reply;
    }
  }

  // History already includes the user message we just saved — drop the trailing
  // duplicate before sending to Gemini (sendMessage adds the current turn).
  const historyForModel =
    history.length > 0 &&
    history[history.length - 1]?.role === "user" &&
    history[history.length - 1]?.content === userMessage
      ? history.slice(0, -1)
      : history;

  const hasOwnerMessages = historyForModel.some((m) => m.role === "owner");

  const model = getModel(
    knownName,
    draft,
    services,
    {
      name: business.name,
      trade: business.trade,
      persona: business.persona,
      hoursSummary: business.hoursSummary,
      hoursPolicy: business.hoursPolicy,
      serviceArea: business.serviceArea,
      photoPolicy: business.photoPolicy,
      assistantIntro: business.assistantIntro,
    },
    {
      aiPaused: Boolean(conversation.ai_paused),
      hasOwnerMessages,
      pausedAt: conversation.paused_at ?? null,
    },
  );

  const chatSession = model.startChat({
    history: toGeminiHistory(historyForModel),
  });

  const labeledCurrent = `[לקוח] ${userMessage}`;
  let result = await chatSession.sendMessage(labeledCurrent);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
    const functionCalls = result.response.functionCalls();
    if (!functionCalls || functionCalls.length === 0) {
      break;
    }

    const responseParts = [];
    for (const call of functionCalls) {
      const { result: toolResult, draft: nextDraft } = await runTool(
        phone,
        call.name,
        (call.args ?? {}) as Record<string, unknown>,
        draft,
      );
      draft = nextDraft;
      if (
        call.name === "save_customer_name" &&
        toolResult &&
        typeof toolResult === "object" &&
        "ok" in toolResult &&
        toolResult.ok &&
        "customer_name" in toolResult &&
        typeof toolResult.customer_name === "string"
      ) {
        knownName = toolResult.customer_name;
      }
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: toolResult as object,
        },
      });
    }

    result = await chatSession.sendMessage(responseParts);
  }

  void knownName;

  let reply = "";
  try {
    reply = result.response.text().trim();
  } catch (error) {
    console.error("Gemini text() failed:", error);
  }

  // After tool-only turns Gemini sometimes returns no text; nudge once for a reply.
  if (!reply) {
    try {
      result = await chatSession.sendMessage(
        "עכשיו ענה ללקוח בעברית בקצרה על סמך הכלים שכבר רצו. בלי לקרוא לכלים שוב אם אין צורך.",
      );
      reply = result.response.text().trim();
    } catch (error) {
      console.error("Gemini fallback nudge failed:", error);
    }
  }

  if (!reply) {
    console.error("Empty model response; using fallback reply");
    reply = "סליחה, לא הצלחתי לענות כרגע. אפשר לשלוח שוב במשפט קצר?";
  }

  reply = sanitizeAssistantReply(reply);
  if (!reply) {
    reply = "סליחה, לא הצלחתי לענות כרגע. אפשר לשלוח שוב במשפט קצר?";
  }

  await saveMessage(phone, "assistant", reply);
  return reply;
}
