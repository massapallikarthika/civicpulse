import { z } from "zod";
import { HttpError } from "./supabase";

export function parseWith<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
  label = "request",
): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(`Invalid ${label}.`, 400, "VALIDATION_ERROR");
  }
  return parsed.data;
}

export function sanitizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function parseDateQuery(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError("Invalid date query parameter.", 400, "VALIDATION_ERROR");
  }
  return date;
}

export function validateOutput<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      "The server produced a response that does not match the API contract.",
      500,
      "RESPONSE_VALIDATION_ERROR",
    );
  }
  return parsed.data;
}
