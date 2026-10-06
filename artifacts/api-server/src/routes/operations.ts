import { Router, type IRouter } from "express";
import {
  CreateComplaintBody,
  CreateComplaintResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateResourceBody,
  CreateResourceResponse,
  CreateServiceBody,
  CreateServiceResponse,
  CreateWardBody,
  CreateWardResponse,
  DeleteProjectParams,
  DeleteResourceParams,
  DeleteServiceParams,
  DeleteWardParams,
  GetComplaintParams,
  GetComplaintResponse,
  GetComplaintsQueryParams,
  GetComplaintsResponse,
  GetProjectParams,
  GetProjectsQueryParams,
  GetProjectsResponse,
  GetResourceParams,
  GetResourcesQueryParams,
  GetResourcesResponse,
  GetServiceParams,
  GetServicesQueryParams,
  GetServicesResponse,
  GetWardsQueryParams,
  GetWardsResponse,
  UpdateComplaintBody,
  UpdateComplaintParams,
  UpdateComplaintResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
  UpdateResourceBody,
  UpdateResourceParams,
  UpdateResourceResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
  UpdateWardBody,
  UpdateWardParams,
  UpdateWardResponse,
} from "@workspace/api-zod";
import { getSession, requireSession } from "../middlewares/session";
import { HttpError, mapSupabaseError } from "../lib/supabase";
import { parseDateQuery, parseWith, sanitizeSearch, validateOutput } from "../lib/validation";
import { analyzeComplaint } from "../lib/ai";

const router: IRouter = Router();
router.use(requireSession);

function notFound(): never {
  throw new HttpError("Record not found.", 404, "NOT_FOUND");
}

function rowWithWardName(row: Record<string, unknown>): Record<string, unknown> {
  const relation = row.ward;
  const ward = Array.isArray(relation) ? relation[0] : relation;
  const wardName =
    ward && typeof ward === "object" && "name" in ward
      ? String((ward as { name: unknown }).name)
      : null;
  const { ward: _unused, ...rest } = row;
  return { ...rest, ward_name: wardName };
}

function resourceWithBalance(row: Record<string, unknown>): Record<string, unknown> {
  const allocated = Number(row.allocated_amount);
  const spent = Number(row.spent_amount);
  return { ...row, remaining_amount: allocated - spent };
}

function pageInfo(page: number, pageSize: number, total: number) {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.ceil(total / pageSize),
  };
}

function sortDirection(order: "asc" | "desc") {
  return order === "asc";
}

router.get("/wards", async (req, res): Promise<void> => {
  const session = getSession(req);
  const params = parseWith(GetWardsQueryParams, req.query, "ward filters");
  let query = session.client
    .from("wards")
    .select("id,name,code,description,created_at,updated_at", { count: "exact" })
    .eq("user_id", session.user.id)
    .order("name", { ascending: true });
  const search = params.q ? sanitizeSearch(params.q) : "";
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,description.ilike.%${search}%`);
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetWardsResponse, {
    data: data ?? [],
    pagination: pageInfo(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/wards", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(CreateWardBody, req.body, "ward");
  const { data, error } = await session.client
    .from("wards")
    .insert({ ...body, user_id: session.user.id })
    .select("id,name,code,description,created_at,updated_at")
    .single();
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(CreateWardResponse, data));
});

router.patch("/wards/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateWardParams, req.params, "ward id");
  const body = parseWith(UpdateWardBody, req.body, "ward update");
  const { data, error } = await session.client
    .from("wards")
    .update(body)
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("id,name,code,description,created_at,updated_at")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(UpdateWardResponse, data));
});

router.delete("/wards/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(DeleteWardParams, req.params, "ward id");
  const { data, error } = await session.client
    .from("wards")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.status(204).end();
});

router.get("/complaints", async (req, res): Promise<void> => {
  const session = getSession(req);
  const queryInput = {
    ...req.query,
    from: parseDateQuery(req.query.from),
    to: parseDateQuery(req.query.to),
  };
  const params = parseWith(GetComplaintsQueryParams, queryInput, "complaint filters");
  const allowedSort = ["created_at", "updated_at", "priority", "status", "title"];
  const sortBy = allowedSort.includes(params.sort_by ?? "") ? params.sort_by! : "created_at";
  let query = session.client
    .from("complaints")
    .select("*,ward:wards(name)", { count: "exact" })
    .eq("user_id", session.user.id)
    .is("archived_at", null)
    .order(sortBy, { ascending: sortDirection(params.sort_order) });
  if (params.ward_id) query = query.eq("ward_id", params.ward_id);
  if (params.category) query = query.eq("category", params.category);
  if (params.priority) query = query.eq("priority", params.priority);
  if (params.status) query = query.eq("status", params.status);
  if (params.department) query = query.eq("department", params.department);
  if (params.from) query = query.gte("created_at", params.from.toISOString());
  if (params.to) query = query.lte("created_at", params.to.toISOString());
  const search = params.q ? sanitizeSearch(params.q) : "";
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetComplaintsResponse, {
    data: (data ?? []).map((row) => rowWithWardName(row as Record<string, unknown>)),
    pagination: pageInfo(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/complaints", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(CreateComplaintBody, req.body, "complaint");
  const { data, error } = await session.client
    .from("complaints")
    .insert({ ...body, user_id: session.user.id })
    .select("*,ward:wards(name)")
    .single();
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(CreateComplaintResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.get("/complaints/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetComplaintParams, req.params, "complaint id");
  const { data, error } = await session.client
    .from("complaints")
    .select("*,ward:wards(name)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(GetComplaintResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.patch("/complaints/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateComplaintParams, req.params, "complaint id");
  const body = parseWith(UpdateComplaintBody, req.body, "complaint update");
  const { data, error } = await session.client
    .from("complaints")
    .update(body)
    .eq("id", id)
    .eq("user_id", session.user.id)
    .is("archived_at", null)
    .select("*,ward:wards(name)")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(UpdateComplaintResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.post("/complaints/:id/archive", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetComplaintParams, req.params, "complaint id");
  const { data, error } = await session.client
    .from("complaints")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.user.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.status(204).end();
});

router.post("/complaints/:id/analyze", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetComplaintParams, req.params, "complaint id");
  const { data, error } = await session.client
    .from("complaints")
    .select("id,ward_id,title,description,category,priority,department,status,ward:wards(name)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  const analysis = await analyzeComplaint(session, data as Record<string, unknown>, req.log);
  const { error: updateError } = await session.client
    .from("complaints")
    .update({
      ai_summary: analysis.summary,
      ai_recommended_action: analysis.recommended_action,
      ai_model: analysis.model,
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", session.user.id);
  if (updateError) throw mapSupabaseError(updateError);
  res.json(analysis);
});

router.get("/projects", async (req, res): Promise<void> => {
  const session = getSession(req);
  const params = parseWith(GetProjectsQueryParams, req.query, "project filters");
  const allowedSort = ["created_at", "updated_at", "deadline", "status", "progress", "budget", "name"];
  const sortBy = allowedSort.includes(params.sort_by ?? "") ? params.sort_by! : "created_at";
  let query = session.client
    .from("projects")
    .select("*,ward:wards(name)", { count: "exact" })
    .eq("user_id", session.user.id)
    .order(sortBy, { ascending: sortDirection(params.sort_order) });
  if (params.ward_id) query = query.eq("ward_id", params.ward_id);
  if (params.department) query = query.eq("department", params.department);
  if (params.status) query = query.eq("status", params.status);
  const search = params.q ? sanitizeSearch(params.q) : "";
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,department.ilike.%${search}%`);
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetProjectsResponse, {
    data: (data ?? []).map((row) => rowWithWardName(row as Record<string, unknown>)),
    pagination: pageInfo(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/projects", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(CreateProjectBody, req.body, "project");
  const payload = { ...body, user_id: session.user.id, deadline: body.deadline?.toISOString().slice(0, 10) ?? null };
  const { data, error } = await session.client
    .from("projects")
    .insert(payload)
    .select("*,ward:wards(name)")
    .single();
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(CreateProjectResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetProjectParams, req.params, "project id");
  const { data, error } = await session.client
    .from("projects")
    .select("*,ward:wards(name)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(GetProjectsResponse.shape.data.element, rowWithWardName(data as Record<string, unknown>)));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateProjectParams, req.params, "project id");
  const body = parseWith(UpdateProjectBody, req.body, "project update");
  const payload = {
    ...body,
    ...(body.deadline !== undefined
      ? { deadline: body.deadline?.toISOString().slice(0, 10) ?? null }
      : {}),
  };
  const { data, error } = await session.client
    .from("projects")
    .update(payload)
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("*,ward:wards(name)")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(UpdateProjectResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(DeleteProjectParams, req.params, "project id");
  const { data, error } = await session.client
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.status(204).end();
});

router.get("/resources", async (req, res): Promise<void> => {
  const session = getSession(req);
  const params = parseWith(GetResourcesQueryParams, req.query, "resource filters");
  const allowedSort = ["year", "department", "name", "allocated_amount", "spent_amount", "created_at"];
  const sortBy = allowedSort.includes(params.sort_by ?? "") ? params.sort_by! : "year";
  let query = session.client
    .from("resources")
    .select("*", { count: "exact" })
    .eq("user_id", session.user.id)
    .order(sortBy, { ascending: sortDirection(params.sort_order) });
  if (params.department) query = query.eq("department", params.department);
  if (params.year) query = query.eq("year", params.year);
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetResourcesResponse, {
    data: (data ?? []).map((row) => resourceWithBalance(row as Record<string, unknown>)),
    pagination: pageInfo(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/resources", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(CreateResourceBody, req.body, "resource");
  const { data, error } = await session.client
    .from("resources")
    .insert({ ...body, currency_code: body.currency_code.toUpperCase(), user_id: session.user.id })
    .select("*")
    .single();
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(CreateResourceResponse, resourceWithBalance(data as Record<string, unknown>)));
});

router.get("/resources/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetResourceParams, req.params, "resource id");
  const { data, error } = await session.client
    .from("resources")
    .select("*")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(GetResourcesResponse.shape.data.element, resourceWithBalance(data as Record<string, unknown>)));
});

router.patch("/resources/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateResourceParams, req.params, "resource id");
  const body = parseWith(UpdateResourceBody, req.body, "resource update");
  const { data, error } = await session.client
    .from("resources")
    .update({
      ...body,
      ...(body.currency_code ? { currency_code: body.currency_code.toUpperCase() } : {}),
    })
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("*")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(UpdateResourceResponse, resourceWithBalance(data as Record<string, unknown>)));
});

router.delete("/resources/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(DeleteResourceParams, req.params, "resource id");
  const { data, error } = await session.client
    .from("resources")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.status(204).end();
});

router.get("/services", async (req, res): Promise<void> => {
  const queryInput = {
    ...req.query,
    reporting_period: parseDateQuery(req.query.reporting_period),
  };
  const params = parseWith(GetServicesQueryParams, queryInput, "service filters");
  const session = getSession(req);
  const allowedSort = ["reporting_period", "service_type", "coverage", "satisfaction", "status", "created_at"];
  const sortBy = allowedSort.includes(params.sort_by ?? "") ? params.sort_by! : "reporting_period";
  let query = session.client
    .from("services")
    .select("*,ward:wards(name)", { count: "exact" })
    .eq("user_id", session.user.id)
    .order(sortBy, { ascending: sortDirection(params.sort_order) });
  if (params.ward_id) query = query.eq("ward_id", params.ward_id);
  if (params.service_type) query = query.eq("service_type", params.service_type);
  if (params.status) query = query.eq("status", params.status);
  if (params.reporting_period) query = query.eq("reporting_period", params.reporting_period.toISOString().slice(0, 10));
  const start = (params.page - 1) * params.page_size;
  const { data, error, count } = await query.range(start, start + params.page_size - 1);
  if (error) throw mapSupabaseError(error);
  res.json(validateOutput(GetServicesResponse, {
    data: (data ?? []).map((row) => rowWithWardName(row as Record<string, unknown>)),
    pagination: pageInfo(params.page, params.page_size, count ?? 0),
  }));
});

router.post("/services", async (req, res): Promise<void> => {
  const session = getSession(req);
  const body = parseWith(CreateServiceBody, req.body, "service");
  const { data, error } = await session.client
    .from("services")
    .insert({
      ...body,
      reporting_period: body.reporting_period.toISOString().slice(0, 10),
      user_id: session.user.id,
    })
    .select("*,ward:wards(name)")
    .single();
  if (error) throw mapSupabaseError(error);
  res.status(201).json(validateOutput(CreateServiceResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.get("/services/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(GetServiceParams, req.params, "service id");
  const { data, error } = await session.client
    .from("services")
    .select("*,ward:wards(name)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(GetServicesResponse.shape.data.element, rowWithWardName(data as Record<string, unknown>)));
});

router.patch("/services/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(UpdateServiceParams, req.params, "service id");
  const body = parseWith(UpdateServiceBody, req.body, "service update");
  const { data, error } = await session.client
    .from("services")
    .update({
      ...body,
      ...(body.reporting_period !== undefined
        ? { reporting_period: body.reporting_period.toISOString().slice(0, 10) }
        : {}),
    })
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("*,ward:wards(name)")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.json(validateOutput(UpdateServiceResponse, rowWithWardName(data as Record<string, unknown>)));
});

router.delete("/services/:id", async (req, res): Promise<void> => {
  const session = getSession(req);
  const { id } = parseWith(DeleteServiceParams, req.params, "service id");
  const { data, error } = await session.client
    .from("services")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) notFound();
  res.status(204).end();
});

export default router;
