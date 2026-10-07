import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import { getSession, requireSession } from "../middlewares/session";
import { mapSupabaseError } from "../lib/supabase";
import { validateOutput } from "../lib/validation";

const router: IRouter = Router();

router.get("/dashboard", requireSession, async (req, res): Promise<void> => {
  const session = getSession(req);
  const { data, error } = await session.client.rpc("civicpulse_dashboard_summary");
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetDashboardResponse, data));
});

export default router;
