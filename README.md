# CivicPulse

CivicPulse is a municipal operations dashboard for public-service teams. It brings complaint intake and triage, projects, resource budgets, ward and service performance, and evidence-based AI recommendations into one officer-facing workspace.

## Problem and solution

Municipal officers often have to track resident concerns, budgets, and service delivery in separate tools. CivicPulse provides one authenticated workspace for those records and a dashboard of aggregates computed from the signed-in officer's own data. Gemini can summarize a complaint or suggest operational follow-up from real records; an officer remains responsible for reviewing each recommendation.

## Features

- Supabase email/password registration and login, with HTTP-only session cookies and protected data routes.
- Dashboard totals for complaints, project progress and delays, budgets, service performance, ward performance, recent activity, and saved insights.
- Complaint intake, search, filters, sorting, status updates, archiving, and backend-only AI analysis.
- CRUD for projects, resource allocations, services, and wards.
- Validated AI insights generated from actual complaints, projects, and services, with evidence stored alongside the recommendations.
- Per-user row-level access policies and backend validation of API requests and AI output.
- Explicit loading, error, and empty states; no fabricated records or statistics.

## Stack

- React 19, Vite 7, TypeScript, Tailwind CSS
- Express 5 API, Zod validation, generated API client
- Supabase Auth and Postgres with row-level security
- Google Gemini through the server-side `@google/genai` SDK
- pnpm workspace monorepo

## Architecture

The CivicPulse frontend runs as the `artifacts/civicpulse` artifact. Its generated client sends requests to `/api`. The `artifacts/api-server` Express service validates inputs and responses, verifies Supabase sessions, and uses the user's access token for database queries so row-level security remains active. The client is configured only in backend code; Gemini keys are also read only by the backend.

`lib/api-spec/openapi.yaml` is the API contract. Generated schemas are in `lib/api-zod`, and generated React Query hooks are in `lib/api-client-react`. The SQL schema, RLS policies, activity triggers, AI usage limiter, and dashboard aggregate function are in `supabase/migrations/`.

The dashboard uses `public.civicpulse_dashboard_summary()`, which calculates aggregates from the authenticated user's database records. It returns zero-valued totals and empty arrays for an account with no records; it does not create demo data.

## Configure Supabase

The Replit Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` are used by the app. Never put real credentials in source control or in `.env.example`. For local work, copy the variable names from `.env.example` into your local secret manager.

The configured Supabase project must have the schema in `supabase/migrations/202610060001_civicpulse_core.sql`. **The current project does not expose the required tables through the Supabase Data API yet.** Before using a real account, inspect the migration against the project's existing schema and policies, then apply it in that project's Supabase SQL Editor. The migration creates tables and functions, installs or replaces its named triggers and policies, enables row-level security, and provisions profiles for existing Auth users. It does not seed sample operational records. Back up and review an existing database before applying schema changes.

After applying the migration, ensure the `public` schema is available through Supabase's Data API, and configure the Supabase Auth Site URL and allowed redirect URLs to match the deployed CivicPulse URL. Email-confirmation settings are controlled in Supabase Auth; when confirmation is enabled, new officers must confirm their email before signing in.

No database migration is run automatically by the app. The app's queries use the Supabase schema above; the unused Drizzle workspace package is not a substitute for this schema.

## Gemini

The backend calls Gemini for complaint classification and operational insights. Requests and responses are constrained by structured output schemas and validated with Zod. Insights use a bounded sample of real user-owned operational records and are not generated when there is no source data. The API key is not sent to the browser. Gemini requests are rate-limited per user by a database function and logged in `ai_runs`.

## Run on Replit

Use the managed workflows:

- `artifacts/civicpulse: web` — frontend preview at `/`.
- `artifacts/api-server: API Server` — API at `/api`.

These workflows set their own `PORT` (and `BASE_PATH` for Vite). The API health check is `/api/healthz`; it checks server availability, not Supabase schema readiness.

## Local development

Requirements: Node.js 20+ and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run dev
```

In a second terminal, start Vite with its required environment:

```sh
PORT=20389 BASE_PATH=/ pnpm --filter @workspace/civicpulse run dev
```

Run the workspace type check:

```sh
pnpm run typecheck
```

Build the services:

```sh
pnpm --filter @workspace/api-server run build
PORT=20389 BASE_PATH=/ pnpm --filter @workspace/civicpulse run build
```

## Deployment and security

Publish the web artifact through Replit after confirming that the deployed environment has the three required secrets and that the Supabase migration and Auth URL settings are complete. Never use a service-role key in the browser; the current app uses the anon key with the signed-in user's access token and row-level security. Do not use production accounts or write operations for smoke tests.
