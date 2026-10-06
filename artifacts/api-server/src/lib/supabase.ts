import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function getSupabaseClient(accessToken?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new HttpError(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.",
      503,
      "SUPABASE_NOT_CONFIGURED",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export function mapSupabaseError(error: {
  code?: string;
  message?: string;
}): HttpError {
  const code = error.code ?? "SUPABASE_ERROR";
  if (code === "23505") {
    return new HttpError("A record with these details already exists.", 409, code);
  }
  if (code === "23503") {
    return new HttpError(
      "This record is still referenced by other records.",
      409,
      code,
    );
  }
  if (code === "42501" || code === "PGRST301") {
    return new HttpError("You do not have access to this record.", 403, code);
  }
  if (code === "PGRST116") {
    return new HttpError("Record not found.", 404, code);
  }
  return new HttpError("The database request could not be completed.", 502, code);
}

export function unwrapSupabase<T>(result: {
  data: T | null;
  error: { code?: string; message?: string } | null;
}): T {
  if (result.error) {
    throw mapSupabaseError(result.error);
  }
  if (result.data === null) {
    throw new HttpError("The database returned no result.", 502, "EMPTY_RESULT");
  }
  return result.data;
}

export function requireUser(user: User | null): User {
  if (!user) {
    throw new HttpError("Authentication required.", 401, "UNAUTHENTICATED");
  }
  return user;
}
