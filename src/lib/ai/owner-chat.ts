import {
  FunctionDeclaration,
  FunctionDeclarationsTool,
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";
import { buildOwnerSystemPrompt } from "@/lib/ai/owner-prompt";
import { getBusinessProfile } from "@/lib/business";
import {
  findCustomers,
  saveMessage,
  setAiPaused,
  setCustomerName,
  setOwnerNotes,
} from "@/lib/conversations";
import {
  getJobById,
  listJobs,
  listJobsForPhone,
  updateJobStatus,
} from "@/lib/jobs";
import {
  loadOwnerAssistantHistory,
  saveOwnerAssistantExchange,
} from "@/lib/owner-assistant";
import { listActiveServices } from "@/lib/services";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import type { JobStatus } from "@/types/database";

const MAX_TOOL_ITERATIONS = 8;

function buildOwnerTools(): FunctionDeclarationsTool[] {
  const findCustomerTool: FunctionDeclaration = {
    name: "find_customer",
    description:
      "Find customers by name or phone substring. Call before acting on a named customer.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "Customer name or phone (partial match ok)",
        },
      },
      required: ["query"],
    },
  };

  const listOpenJobsTool: FunctionDeclaration = {
    name: "list_open_jobs",
    description:
      "List open jobs (not closed). Optionally filter by customer phone.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone: {
          type: SchemaType.STRING,
          description: "Optional customer phone filter",
        },
      },
      required: [],
    },
  };

  const getJobTool: FunctionDeclaration = {
    name: "get_job",
    description: "Get one job by id.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        job_id: { type: SchemaType.STRING, description: "Job UUID" },
      },
      required: ["job_id"],
    },
  };

  const updateJobStatusTool: FunctionDeclaration = {
    name: "update_job_status",
    description:
      "Update job status to owner_handling or closed (or notified/ready if needed).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        job_id: { type: SchemaType.STRING },
        status: {
          type: SchemaType.STRING,
          description: "owner_handling | closed | notified | ready | intake",
        },
      },
      required: ["job_id", "status"],
    },
  };

  const messageCustomerTool: FunctionDeclaration = {
    name: "message_customer",
    description: "Send a Hebrew WhatsApp message to a customer phone.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone: { type: SchemaType.STRING },
        message: { type: SchemaType.STRING },
      },
      required: ["phone", "message"],
    },
  };

  const setAiPausedTool: FunctionDeclaration = {
    name: "set_ai_paused",
    description: "Pause or resume the customer-facing AI for a phone.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone: { type: SchemaType.STRING },
        paused: { type: SchemaType.BOOLEAN },
      },
      required: ["phone", "paused"],
    },
  };

  const updateCustomerNameTool: FunctionDeclaration = {
    name: "update_customer_name",
    description: "Update a customer's display name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone: { type: SchemaType.STRING },
        name: { type: SchemaType.STRING },
      },
      required: ["phone", "name"],
    },
  };

  const updateCustomerNotesTool: FunctionDeclaration = {
    name: "update_customer_notes",
    description: "Update private owner notes for a customer.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING },
      },
      required: ["phone", "notes"],
    },
  };

  return [
    {
      functionDeclarations: [
        findCustomerTool,
        listOpenJobsTool,
        getJobTool,
        updateJobStatusTool,
        messageCustomerTool,
        setAiPausedTool,
        updateCustomerNameTool,
        updateCustomerNotesTool,
      ],
    },
  ];
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function boolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

async function runOwnerTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "find_customer") {
    return { ok: true, customers: await findCustomers(stringArg(args, "query")) };
  }

  if (name === "list_open_jobs") {
    const phone = stringArg(args, "phone");
    const jobs = phone
      ? (await listJobsForPhone(phone)).filter((job) => job.status !== "closed")
      : await listJobs({ openOnly: true });
    return { ok: true, jobs };
  }

  if (name === "get_job") {
    const job = await getJobById(stringArg(args, "job_id"));
    if (!job) return { ok: false, error: "Job not found" };
    return { ok: true, job };
  }

  if (name === "update_job_status") {
    const status = stringArg(args, "status") as JobStatus;
    const allowed: JobStatus[] = [
      "intake",
      "ready",
      "notified",
      "owner_handling",
      "closed",
    ];
    if (!allowed.includes(status)) {
      return { ok: false, error: "Invalid status" };
    }
    const job = await updateJobStatus(stringArg(args, "job_id"), status);
    return { ok: true, job };
  }

  if (name === "message_customer") {
    const phone = stringArg(args, "phone");
    const message = stringArg(args, "message");
    if (!phone || !message) {
      return { ok: false, error: "phone and message are required" };
    }
    await sendWhatsAppMessage(phone, message);
    await saveMessage(phone, "owner", message);
    return { ok: true };
  }

  if (name === "set_ai_paused") {
    const phone = stringArg(args, "phone");
    const paused = boolArg(args, "paused");
    const conversation = await setAiPaused(phone, paused);
    return { ok: true, ai_paused: conversation.ai_paused };
  }

  if (name === "update_customer_name") {
    const updated = await setCustomerName(
      stringArg(args, "phone"),
      stringArg(args, "name"),
    );
    return { ok: true, customer_name: updated.customer_name };
  }

  if (name === "update_customer_notes") {
    const updated = await setOwnerNotes(
      stringArg(args, "phone"),
      stringArg(args, "notes"),
    );
    return { ok: true, owner_notes: updated.owner_notes };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

function toGeminiHistory(
  history: { role: "owner" | "assistant"; content: string }[],
) {
  let start = 0;
  while (start < history.length && history[start].role !== "owner") {
    start += 1;
  }
  const trimmed = history.slice(start);
  return trimmed.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

export async function ownerChat(ownerMessage: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  const [history, services, business] = await Promise.all([
    loadOwnerAssistantHistory(),
    listActiveServices(),
    getBusinessProfile(),
  ]);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: buildOwnerSystemPrompt({
      services,
      business: {
        name: business.name,
        trade: business.trade,
        hoursSummary: business.hoursSummary,
      },
    }),
    tools: buildOwnerTools(),
  });

  const chatSession = model.startChat({
    history: toGeminiHistory(history),
  });

  let result = await chatSession.sendMessage(ownerMessage);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
    const functionCalls = result.response.functionCalls();
    if (!functionCalls || functionCalls.length === 0) {
      break;
    }

    const responseParts = [];
    for (const call of functionCalls) {
      const toolResult = await runOwnerTool(
        call.name,
        (call.args ?? {}) as Record<string, unknown>,
      );
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: toolResult as object,
        },
      });
    }

    result = await chatSession.sendMessage(responseParts);
  }

  const reply = result.response.text().trim();
  if (!reply) {
    throw new Error("Empty model response");
  }

  await saveOwnerAssistantExchange(ownerMessage, reply);
  return reply;
}
