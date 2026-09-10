import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildSystemPrompt } from "@/lib/ai/prompt";

/** Simple model helper (tool-enabled chat lives in chat.ts). */
export function getGeminiModel() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: buildSystemPrompt(),
  });
}
