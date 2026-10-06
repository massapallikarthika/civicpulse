import { Router, type IRouter } from "express";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
} from "@workspace/api-zod";
import { getSession, requireSession, setSessionCookies, clearSessionCookies } from "../middlewares/session";
import { getSupabaseClient, HttpError, mapSupabaseError } from "../lib/supabase";
import { parseWith, validateOutput } from "../lib/validation";

const router: IRouter = Router();

async function readProfile(
  accessToken: string,
  userId: string,
  authEmail: string | undefined,
  metadataName: string | undefined,
) {
  const client = getSupabaseClient(accessToken);
  const result = await client
    .from("profiles")
    .select("user_id,email,full_name,department,title,timezone,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) throw mapSupabaseError(result.error);
  if (result.data) {
    return {
      ...result.data,
      email: authEmail ?? result.data.email,
    };
  }

  throw new HttpError(
    "The officer profile was not provisioned. Verify the Supabase profile trigger migration.",
    500,
    "PROFILE_NOT_PROVISIONED",
  );
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const body = parseWith(RegisterBody, req.body, "registration details");
  const authClient = getSupabaseClient();
  const { data, error } = await authClient.auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: { full_name: body.full_name } },
  });

  if (error) {
    req.log.warn({ code: error.status }, "CivicPulse account registration was rejected");
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data.user || !data.session) {
    res.status(409).json({
      error: "Account created, but Supabase email confirmation is enabled. Complete confirmation before signing in.",
    });
    return;
  }

  setSessionCookies(
    res,
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in,
  );
  const profile = await readProfile(
    data.session.access_token,
    data.user.id,
    data.user.email,
    body.full_name,
  );
  res.status(201).json(validateOutput(RegisterResponse, { user: profile }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = parseWith(LoginBody, req.body, "sign-in details");
  const authClient = getSupabaseClient();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.user || !data.session) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  const profile = await readProfile(
    data.session.access_token,
    data.user.id,
    data.user.email,
    typeof data.user.user_metadata.full_name === "string"
      ? data.user.user_metadata.full_name
      : undefined,
  );
  setSessionCookies(
    res,
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in,
  );
  res.json(validateOutput(LoginResponse, { user: profile }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const accessToken = req.cookies?.civicpulse_access as string | undefined;
  const refreshToken = req.cookies?.civicpulse_refresh as string | undefined;
  if (accessToken && refreshToken) {
    try {
      const client = getSupabaseClient();
      await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      await client.auth.signOut({ scope: "local" });
    } catch (error) {
      req.log.warn({ err: error }, "Supabase sign-out did not complete; clearing local session cookies");
    }
  }
  clearSessionCookies(res);
  res.status(204).end();
});

router.get("/auth/me", requireSession, async (req, res): Promise<void> => {
  const session = getSession(req);
  const { data, error } = await session.client
    .from("profiles")
    .select("user_id,email,full_name,department,title,timezone,created_at,updated_at")
    .eq("user_id", session.user.id)
    .single();
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetCurrentUserResponse, data));
});

export default router;
