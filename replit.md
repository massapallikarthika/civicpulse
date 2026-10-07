# CivicPulse

CivicPulse is a municipal operations dashboard for complaints, wards, projects, budgets, and AI-assisted insights.

## Run & Operate

- Use Replit's managed workflows to run the app:
  - `artifacts/civicpulse: web` — React/Vite frontend at `/`, local port 20389.
  - `artifacts/api-server: API Server` — Express API at `/api`, local port 8080.
- Workflows provide `PORT` and the frontend's `BASE_PATH`. Do not run the frontend dev command without these.
- `pnpm install --frozen-lockfile` — restore dependencies.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run build` — build the backend
- `PORT=20389 BASE_PATH=/ pnpm --filter @workspace/civicpulse run build` — build the frontend
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `/api/healthz` — server health endpoint (does not check Supabase).
- Required for sign-in and stored data: `SUPABASE_URL` and `SUPABASE_ANON_KEY`, supplied through Replit Secrets.
- Required for AI analysis: `GEMINI_API_KEY`, supplied through Replit Secrets.
- The configured Supabase URL is reachable, but Supabase's Data API currently returns `PGRST205` for `profiles`, `wards`, and `complaints`. The app's data features are blocked until the migration is applied or the schema is otherwise made visible to PostgREST.
- Review `supabase/migrations/202610060001_civicpulse_core.sql` against the intended Supabase project's existing schema and policies before applying it in the Supabase SQL Editor. It creates tables/functions, replaces named triggers and policies, and provisions profiles for existing users. Do not apply it to an unknown or production database without a backup and review.
- Authenticated `/api/dashboard` calls `public.civicpulse_dashboard_summary()`; its contract and validation are shared with the generated API client.
- The shared Drizzle package is present in the import, but CivicPulse's active routes use Supabase; no replacement database is needed.

## Stack

- pnpm workspaces, imported Node.js 20 runtime, TypeScript 5.9
- API: Express 5
- Data and authentication: Supabase
- Frontend: React 19, Vite 7, Tailwind CSS
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (backend ESM bundle), Vite (frontend)

## Where things live

- `artifacts/civicpulse/` — web frontend.
- `artifacts/api-server/` — backend routes, session handling, Supabase access, and Gemini analysis.
- `lib/api-spec/openapi.yaml` — API contract; generated clients and validation live in sibling library packages.
- `supabase/migrations/` — Supabase schema and access policies.
- `artifacts/mockup-sandbox/` — imported design sandbox; not needed to run CivicPulse.

## Architecture decisions

- Preserve the imported stack and folder structure. Register existing artifact definitions rather than scaffolding replacements.

## Product

Officers can manage municipal operations and review AI-generated recommendations. Protected screens require a real Supabase session.

## User preferences

The import setup request is to get the existing app running on Replit with minimal changes.

## Gotchas

- A healthy API and visible sign-in page do not mean Supabase has been configured. Without its settings, sign-in requests return an explicit configuration error.
- An unauthenticated `/api/auth/me` request returns 401 by design.
- Supabase's client warns that Node.js 20 is deprecated; upgrade the runtime before a future client release drops support.
- The dependency override for `proxy-addr` uses its current patch release because the imported lockfile's older version was blocked by the package firewall.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
