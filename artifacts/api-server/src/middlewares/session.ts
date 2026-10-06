import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseClient, HttpError } from "../lib/supabase";

export const ACCESS_COOKIE = "civicpulse_access";
export const REFRESH_COOKIE = "civicpulse_refresh";

export interface CivicPulseSession {
  user: User;
  client: SupabaseClient;
  accessToken: string;
  refreshToken: string;
}

export interface SessionRequest extends Request {
  civicpulse?: CivicPulseSession;
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api",
};

export function setSessionCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
  expiresIn = 3600,
): void {
  response.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: Math.max(60, expiresIn) * 1000,
  });
  response.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(ACCESS_COOKIE, cookieOptions);
  response.clearCookie(REFRESH_COOKIE, cookieOptions);
}

export async function requireSession(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const req = request as SessionRequest;
  const accessToken = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (!accessToken && !refreshToken) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const authClient = getSupabaseClient();
    let currentAccessToken = accessToken;
    let currentRefreshToken = refreshToken;
    let user: User | null = null;

    if (currentAccessToken) {
      const { data, error } = await authClient.auth.getUser(currentAccessToken);
      if (!error) user = data.user;
    }

    if (!user && currentRefreshToken) {
      const { data, error } = await authClient.auth.refreshSession({
        refresh_token: currentRefreshToken,
      });
      if (error || !data.session || !data.user) {
        clearSessionCookies(response);
        response.status(401).json({ error: "Your session has expired. Sign in again." });
        return;
      }

      currentAccessToken = data.session.access_token;
      currentRefreshToken = data.session.refresh_token;
      user = data.user;
      setSessionCookies(
        response,
        currentAccessToken,
        currentRefreshToken,
        data.session.expires_in,
      );
    }

    if (!user || !currentAccessToken || !currentRefreshToken) {
      clearSessionCookies(response);
      response.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }

    req.civicpulse = {
      user,
      client: getSupabaseClient(currentAccessToken),
      accessToken: currentAccessToken,
      refreshToken: currentRefreshToken,
    };
    next();
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError("Could not verify the current session.", 502, "AUTH_CHECK_FAILED"),
    );
  }
}

export function getSession(request: Request): CivicPulseSession {
  const session = (request as SessionRequest).civicpulse;
  if (!session) {
    throw new HttpError("Authentication required.", 401, "UNAUTHENTICATED");
  }
  return session;
}
