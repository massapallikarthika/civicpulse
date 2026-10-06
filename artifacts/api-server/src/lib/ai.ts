import { GoogleGenAI, Type } from "@google/genai";
import { AnalyzeComplaintResponse } from "@workspace/api-zod";
import { z } from "zod";
import type { CivicPulseSession } from "../middlewares/session";
import { HttpError, mapSupabaseError } from "./supabase";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const COMPLAINT_PROMPT_VERSION = "complaint-analysis-v1";
export const INSIGHTS_PROMPT_VERSION = "operations-insights-v1";

const categories = [
  "water_supply",
  "sanitation",
  "roads",
  "street_lighting",
  "healthcare",
  "public_safety",
  "other",
] as const;
const priorities = ["low", "medium", "high", "critical"] as const;
const severities = ["low", "medium", "high", "critical"] as const;
const complaintModelOutputSchema = AnalyzeComplaintResponse.omit({
  model: true,
  prompt_version: true,
}).strict();

const modelInsightSchema = z.object({
  kind: z.enum(["complaint_pattern", "service_gap", "project_risk"]),
  title: z.string().min(1).max(180),
  summary: z.string().min(1).max(1000),
  recommended_action: z.string().min(1).max(1500),
  payload: z.array(z.object({
    issue: z.string().min(1).max(300),
    severity: z.enum(severities),
    evidence: z.array(z.string().min(1).max(300)).min(1).max(5),
    recommendation: z.string().min(1).max(1000),
  }).strict()).min(1).max(5),
}).strict();
const modelInsightsSchema = z.object({
  insights: z.array(modelInsightSchema).max(5),
}).strict();

type LoggerLike = {
  warn: (context: Record<string, unknown>, message: string) => void;
};

type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

function geminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      "Gemini is not configured. Add GEMINI_API_KEY to Replit Secrets.",
      503,
      "GEMINI_NOT_CONFIGURED",
    );
  }
  return new GoogleGenAI({ apiKey });
}

async function claimAiRequest(session: CivicPulseSession): Promise<void> {
  const { data, error } = await session.client.rpc("civicpulse_claim_ai_usage", {
    p_limit: 12,
  });
  if (error) throw mapSupabaseError(error);
  if (data !== true) {
    throw new HttpError(
      "The AI analysis limit has been reached. Try again after the hourly limit resets.",
      429,
      "AI_RATE_LIMITED",
    );
  }
}

async function recordAiRun(
  session: CivicPulseSession,
  input: {
    complaintId?: string;
    feature: string;
    promptVersion: string;
    status: "succeeded" | "failed";
    usage?: TokenUsage;
    durationMs: number;
    errorCode?: string;
  },
  logger: LoggerLike,
): Promise<void> {
  const { error } = await session.client.from("ai_runs").insert({
    user_id: session.user.id,
    complaint_id: input.complaintId ?? null,
    feature: input.feature,
    model: GEMINI_MODEL,
    prompt_version: input.promptVersion,
    status: input.status,
    input_tokens: input.usage?.inputTokens ?? null,
    output_tokens: input.usage?.outputTokens ?? null,
    duration_ms: input.durationMs,
    error_code: input.errorCode ?? null,
    completed_at: new Date().toISOString(),
  });
  if (error) {
    logger.warn(
      { code: error.code, feature: input.feature },
      "Could not persist an AI usage event",
    );
  }
}

function readTokenUsage(value: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}): TokenUsage {
  return {
    inputTokens: value.usageMetadata?.promptTokenCount ?? null,
    outputTokens: value.usageMetadata?.candidatesTokenCount ?? null,
  };
}

function parseJson(text: string | undefined): unknown {
  if (!text) {
    throw new HttpError("Gemini returned an empty analysis.", 502, "GEMINI_EMPTY_OUTPUT");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(
      "Gemini returned an invalid structured response.",
      502,
      "GEMINI_INVALID_OUTPUT",
    );
  }
}

async function generateStructured<T>(
  session: CivicPulseSession,
  logger: LoggerLike,
  input: {
    feature: string;
    promptVersion: string;
    prompt: string;
    responseSchema: object;
    complaintId?: string;
    validate: (value: unknown) => T;
  },
): Promise<T> {
  const ai = geminiClient();
  await claimAiRequest(session);
  const startedAt = Date.now();
  let usage: TokenUsage | undefined;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: input.responseSchema,
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });
    usage = readTokenUsage(response);
    const result = input.validate(parseJson(response.text));
    await recordAiRun(
      session,
      {
        complaintId: input.complaintId,
        feature: input.feature,
        promptVersion: input.promptVersion,
        status: "succeeded",
        usage,
        durationMs: Date.now() - startedAt,
      },
      logger,
    );
    return result;
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : undefined;
    const errorCode =
      error instanceof HttpError
        ? error.code ?? "GEMINI_ERROR"
        : status === 429
          ? "GEMINI_PROVIDER_RATE_LIMITED"
          : "GEMINI_REQUEST_FAILED";
    await recordAiRun(
      session,
      {
        complaintId: input.complaintId,
        feature: input.feature,
        promptVersion: input.promptVersion,
        status: "failed",
        usage,
        durationMs: Date.now() - startedAt,
        errorCode,
      },
      logger,
    );
    if (error instanceof HttpError) throw error;
    if (status === 429) {
      throw new HttpError(
        "Gemini is temporarily rate-limited. Try again shortly.",
        429,
        "GEMINI_PROVIDER_RATE_LIMITED",
      );
    }
    throw new HttpError(
      "Gemini could not complete the analysis. Try again later.",
      502,
      "GEMINI_REQUEST_FAILED",
    );
  }
}

const complaintResponseSchema = {
  type: Type.OBJECT,
  required: ["category", "priority", "department", "summary", "recommended_action", "confidence"],
  properties: {
    category: { type: Type.STRING, enum: [...categories] },
    priority: { type: Type.STRING, enum: [...priorities] },
    department: { type: Type.STRING },
    summary: { type: Type.STRING },
    recommended_action: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
  },
};

export async function analyzeComplaint(
  session: CivicPulseSession,
  complaint: Record<string, unknown>,
  logger: LoggerLike,
) {
  const wardRelation = complaint.ward;
  const ward = Array.isArray(wardRelation) ? wardRelation[0] : wardRelation;
  const wardName =
    ward && typeof ward === "object" && "name" in ward
      ? String((ward as { name: unknown }).name)
      : "not provided";
  const prompt = [
    "You are assisting a local-government officer who will review every recommendation before acting.",
    "Classify one resident complaint using only the supplied record. Do not invent facts, diagnoses, causes, dates, or legal conclusions.",
    "Choose one allowed category and priority. Recommend a department, write a concise neutral summary, and suggest a practical first action.",
    "If the evidence is incomplete or ambiguous, state that limitation in the summary or recommended action and lower confidence.",
    "Return only the JSON fields requested by the response schema. Do not change the complaint status.",
    JSON.stringify({
      title: complaint.title,
      description: complaint.description,
      current_category: complaint.category,
      current_priority: complaint.priority,
      current_department: complaint.department,
      ward: wardName,
    }),
  ].join("\n\n");

  return generateStructured(session, logger, {
    feature: "complaint_analysis",
    promptVersion: COMPLAINT_PROMPT_VERSION,
    prompt,
    responseSchema: complaintResponseSchema,
    complaintId: String(complaint.id),
    validate(value) {
      const modelOutput = complaintModelOutputSchema.safeParse(value);
      if (!modelOutput.success) {
        throw new HttpError(
          "Gemini returned analysis outside the permitted fields.",
          502,
          "GEMINI_INVALID_OUTPUT",
        );
      }
      const parsed = AnalyzeComplaintResponse.safeParse({
        ...modelOutput.data,
        model: GEMINI_MODEL,
        prompt_version: COMPLAINT_PROMPT_VERSION,
      });
      if (!parsed.success) {
        throw new HttpError(
          "Gemini returned analysis outside the permitted fields.",
          502,
          "GEMINI_INVALID_OUTPUT",
        );
      }
      return parsed.data;
    },
  });
}

export interface GeneratedInsight {
  kind: string;
  title: string;
  summary: string;
  recommended_action: string;
  payload: Array<{
    issue: string;
    severity: (typeof severities)[number];
    evidence: string[];
    recommendation: string;
  }>;
}

const insightResponseSchema = {
  type: Type.OBJECT,
  required: ["insights"],
  properties: {
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["kind", "title", "summary", "recommended_action", "payload"],
        properties: {
          kind: { type: Type.STRING, enum: ["complaint_pattern", "service_gap", "project_risk"] },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          recommended_action: { type: Type.STRING },
          payload: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["issue", "severity", "evidence", "recommendation"],
              properties: {
                issue: { type: Type.STRING },
                severity: { type: Type.STRING, enum: [...severities] },
                evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                recommendation: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  },
};

export async function generateOperationalInsights(
  session: CivicPulseSession,
  logger: LoggerLike,
  prompt: string,
): Promise<GeneratedInsight[]> {
  return generateStructured(session, logger, {
    feature: "operations_insights",
    promptVersion: INSIGHTS_PROMPT_VERSION,
    prompt,
    responseSchema: insightResponseSchema,
    validate(value) {
      const parsed = modelInsightsSchema.safeParse(value);
      if (!parsed.success) {
        throw new HttpError(
          "Gemini returned insights outside the permitted schema.",
          502,
          "GEMINI_INVALID_OUTPUT",
        );
      }
      return parsed.data.insights;
    },
  });
}
