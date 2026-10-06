import { Router, type IRouter } from "express";
import {
  GenerateAiInsightsBody,
  GenerateAiInsightsResponse,
  GetAiInsightsQueryParams,
  GetAiInsightsResponse,
  UpdateAiInsightBody,
  UpdateAiInsightParams,
  UpdateAiInsightResponse,
} from "@workspace/api-zod";
import { getSession, requireSession } from "../middlewares/session";
import { GEMINI_MODEL, generateOperationalInsights, INSIGHTS_PROMPT_VERSION } from "../lib/ai";
import { HttpError, mapSupabaseError } from "../lib/supabase";
import { parseWith, validateOutput } from "../lib/validation";

const router: IRouter = Router();
router.use(requireSession);

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.ceil(total / pageSize),
  };
}

router.get("/ai-insights", async (req, res): Promise<void> => {
  const session = getSession(req);
  const params = parseWith(GetAiInsightsQueryParams, req.query, "insight filters");
  let query = session.client
    .from("ai_insights")
    .select("*", { count: "exact" })
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  if (params.status) query = query.eq("status", params.status);
  if (params.kind) query = query.eq("kind", params.kind);
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetAiInsightsResponse, {
    data: data ?? [],
    pagination: pagination(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/ai-insights/generate", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(GenerateAiInsightsBody, req.body ?? {}, "insight request");
  let complaintsQuery = session.client
    .from("complaints")
    .select("id,ward_id,title,description,category,priority,department,status,created_at")
    .eq("user_id", session.user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  let projectsQuery = session.client
    .from("projects")
    .select("id,ward_id,name,description,department,budget,amount_spent,progress,status,deadline")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false })
    .limit(25);
  let servicesQuery = session.client
    .from("services")
    .select("id,ward_id,service_type,coverage,satisfaction,status,reporting_period")
    .eq("user_id", session.user.id)
    .order("reporting_period", { ascending: false })
    .limit(40);

  if (body.ward_id) {
    complaintsQuery = complaintsQuery.eq("ward_id", body.ward_id);
    projectsQuery = projectsQuery.eq("ward_id", body.ward_id);
    servicesQuery = servicesQuery.eq("ward_id", body.ward_id);
  }
  if (body.department) {
    complaintsQuery = complaintsQuery.eq("department", body.department);
    projectsQuery = projectsQuery.eq("department", body.department);
  }
  if (body.from) {
    complaintsQuery = complaintsQuery.gte("created_at", body.from.toISOString());
    servicesQuery = servicesQuery.gte("reporting_period", body.from.toISOString().slice(0, 10));
  }
  if (body.to) {
    complaintsQuery = complaintsQuery.lte("created_at", body.to.toISOString());
    servicesQuery = servicesQuery.lte("reporting_period", body.to.toISOString().slice(0, 10));
  }

  const [complaints, projects, services] = await Promise.all([
    complaintsQuery,
    projectsQuery,
    servicesQuery,
  ]);
  if (complaints.error) throw mapSupabaseError(complaints.error);
  if (projects.error) throw mapSupabaseError(projects.error);
  if (services.error) throw mapSupabaseError(services.error);

  const source = {
    complaints: complaints.data ?? [],
    projects: projects.data ?? [],
    services: services.data ?? [],
  };
  const recordCount =
    source.complaints.length + source.projects.length + source.services.length;
  if (recordCount === 0) {
    throw new HttpError(
      "There are no operational records in this scope to analyze.",
      422,
      "NO_INSIGHT_SOURCE_DATA",
    );
  }

  const sourceScope = {
    ...(body.ward_id ? { ward_id: body.ward_id } : {}),
    ...(body.department ? { department: body.department } : {}),
    ...(body.from ? { from: body.from.toISOString() } : {}),
    ...(body.to ? { to: body.to.toISOString() } : {}),
    sample_counts: {
      complaints: source.complaints.length,
      projects: source.projects.length,
      services: source.services.length,
    },
  };
  const prompt = [
    "You are preparing evidence-based operational insights for a local-government officer.",
    "Use only the supplied records. Do not infer population totals, causes, service levels, or trends that are not represented by these records.",
    "Return zero to five useful insights. If there is not enough evidence for an insight, return an empty array.",
    "Every insight must include at least one evidence item that refers to the supplied record values or IDs. Recommendations must be practical and must not claim that an action has already occurred.",
    "Allowed kinds: complaint_pattern, service_gap, project_risk. Allowed severity values: low, medium, high, critical.",
    JSON.stringify(source),
  ].join("\n\n");
  const generated = await generateOperationalInsights(session, req.log, prompt);

  if (generated.length === 0) {
    res.json(validateOutput(GenerateAiInsightsResponse, { insights: [] }));
    return;
  }
  const { data, error } = await session.client
    .from("ai_insights")
    .insert(generated.map((insight) => ({
      ...insight,
      user_id: session.user.id,
      source_type: "operations_snapshot",
      source_scope: sourceScope,
      model: GEMINI_MODEL,
      prompt_version: INSIGHTS_PROMPT_VERSION,
      status: "new",
    })))
    .select("*");
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(GenerateAiInsightsResponse, { insights: data ?? [] }));
});

router.patch("/ai-insights/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateAiInsightParams, req.params, "insight id");
  const body = parseWith(UpdateAiInsightBody, req.body, "insight update");
  const { data, error } = await session.client
    .from("ai_insights")
    .update(body)
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("*")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) {
    throw new HttpError("Insight not found.", 404, "NOT_FOUND");
  }
  res.json(validateOutput(UpdateAiInsightResponse, data));
});

export default router;
