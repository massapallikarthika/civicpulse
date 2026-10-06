import { Router, type IRouter } from "express";
import { GetProfileResponse, UpdateProfileBody, UpdateProfileResponse } from "@workspace/api-zod";
import { getSession, requireSession } from "../middlewares/session";
import { mapSupabaseError } from "../lib/supabase";
import { parseWith, validateOutput } from "../lib/validation";

const router: IRouter = Router();

router.get("/profile", requireSession, async (req, res): Promise<void> => {
  const session = getSession(req);
  const { data, error } = await session.client
    .from("profiles")
    .select("user_id,email,full_name,department,title,timezone,created_at,updated_at")
    .eq("user_id", session.user.id)
    .single();
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetProfileResponse, data));
});

router.patch("/profile", requireSession, async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(UpdateProfileBody, req.body, "profile update");
  const { data, error } = await session.client
    .from("profiles")
    .update(body)
    .eq("user_id", session.user.id)
    .select("user_id,email,full_name,department,title,timezone,created_at,updated_at")
    .single();
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(UpdateProfileResponse, data));
});

export default router;
