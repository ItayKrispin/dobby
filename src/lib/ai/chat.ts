import {
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
  loadRecentHistory,
  saveExchange,
  setCustomerName,
  updateJobDraft,
  type ChatMessage,
  type JobDraft,
} from "@/lib/conversations";
import { submitJob } from "@/lib/jobs";
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
      "Save or merge in-progress job intake fields as soon as the customer states or corrects them. Partial updates are allowed.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        problem: {
          type: SchemaType.STRING,
          description: "What happened / what they need (free text)",
        },
        is_emergency: {
          type: SchemaType.BOOLEAN,
          description: "Whether this is an emergency",
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
      "Submit the completed intake packet to the owner. For emergencies, call as soon as problem+address are known. Otherwise require problem, emergency yes/no, address, and availability.",
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
      ],
    },
  ];
}

function toGeminiHistory(history: ChatMessage[]) {
  let start = 0;
  while (start < history.length && history[start].role !== "user") {
    start += 1;
  }

  const trimmed = history.slice(start);
  const pairs: ChatMessage[] = [];
  for (let i = 0; i + 1 < trimmed.length; i += 1) {
    const user = trimmed[i];
    const assistant = trimmed[i + 1];
    if (user.role === "user" && assistant.role === "assistant") {
      pairs.push(user, assistant);
      i += 1;
    }
  }

  return pairs.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
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
    serviceArea: string;
    photoPolicy: "always" | "if_helpful" | "never";
    emergencyPolicy: string;
  },
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
    }),
    tools: buildTools(services),
  });
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
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
        isEmergency: boolArg(args, "is_emergency"),
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

  return { result: { ok: false, error: `Unknown tool: ${name}` }, draft };
}

export async function chat(
  phone: string,
  userMessage: string,
  options: { skipSaveUser?: boolean } = {},
): Promise<string> {
  const [history, customerName, jobDraft, services, business] = await Promise.all([
    loadRecentHistory(phone),
    getCustomerName(phone),
    getJobDraft(phone),
    listActiveServices(),
    getBusinessProfile(),
  ]);

  const model = getModel(customerName, jobDraft, services, {
    name: business.name,
    trade: business.trade,
    persona: business.persona,
    hoursSummary: business.hoursSummary,
    serviceArea: business.serviceArea,
    photoPolicy: business.photoPolicy,
    emergencyPolicy: business.emergencyPolicy,
  });

  const chatSession = model.startChat({
    history: toGeminiHistory(history),
  });

  let result = await chatSession.sendMessage(userMessage);
  let knownName = customerName;
  let draft = jobDraft;

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

  const reply = result.response.text().trim();
  if (!reply) {
    throw new Error("Empty model response");
  }

  if (options.skipSaveUser) {
    const { saveMessage } = await import("@/lib/conversations");
    await saveMessage(phone, "assistant", reply);
  } else {
    await saveExchange(phone, userMessage, reply);
  }
  return reply;
}
