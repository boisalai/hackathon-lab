# Hackathon Lab

A personal sandbox for learning how to build TypeScript-based AI applications for legal work — with security and privacy treated as first-class concerns, not afterthoughts.

This project is a learning vehicle, not a product. It exists so that one developer (an undergraduate law student at Université Laval) can become fluent enough in a modern AI-and-web stack to contribute meaningfully during short legal-tech hackathons. The code is a by-product; the real deliverable is the muscle memory and the journal of pitfalls captured in `docs/`.

That said, the application is functional end-to-end and the codebase is structured to be **forkable** as a starter for similar hackathon projects.

## Status

The application is in active development. As of Phase 6 it is feature-complete on the following dimensions:

- Authentication (email/password plus GitHub and Google OAuth).
- Multi-model LLM orchestration (local Apple Silicon model plus three Anthropic Claude models, with automatic local-to-cloud fallback).
- One streaming structured-output vertical (judgment summarizer).
- One tool-calling vertical (text anonymizer).
- A leak-detection safeguard that intercepts personally-identifiable information before any LLM call, with explicit user override and a per-user audit journal.

Phases 1 through 6 are documented in detail under `docs/phase-1.md` through `docs/phase-6.md`. Each document records architectural decisions, real code, and — most importantly — the pitfalls encountered.

## Verticals included

| Vertical | URL | What it does | Models | Safeguard |
| --- | --- | --- | --- | --- |
| Documents | `/` | Simple CRUD of text documents, scoped per user | None | n/a |
| Judgment summarizer | `/judgment` | Streams a structured CanLII-style summary of a Quebec judgment | Claude Haiku 4.5, Sonnet 4.6, Opus 4.7 | None (open work) |
| Text anonymizer | `/anonymize` | Replaces parties, witnesses, addresses, dates and identifiers with neutral placeholders | Qwen3-8B local (via MLX), all Claude models | PII detector + explicit override |
| Security journal | `/security` | Read-only view of the user's own override and block events | n/a | n/a |

The judgment summarizer and the anonymizer demonstrate two different patterns for working around the limitation that streaming and structured output do not compose well with tRPC: a native route handler with `streamText + Output.object` for Claude, and `generateText + tool calling` for the local model.

## Tech stack

| Layer | Technology | Role |
| --- | --- | --- |
| Web framework | Next.js 16 (App Router, webpack) | Routing, SSR, route handlers |
| Language | TypeScript (strict mode) | End-to-end typing |
| Styling | Tailwind CSS 4 | Utility-first styling |
| UI components | shadcn/ui on top of Radix UI | Buttons, forms, dialogs, sidebar, etc. |
| Client/server contract | tRPC v11 + TanStack Query | Type-safe RPC (no REST or GraphQL) |
| ORM | Prisma 7 | Schema, migrations, query builder |
| Database | PostgreSQL 18 | Relational storage |
| Validation | Zod | Input validation at every boundary |
| Authentication | Better Auth | Sessions, OAuth (GitHub, Google), cookie management |
| LLM SDK | Vercel AI SDK 6 (`ai`) | Unified `generateText` / `streamText` / `Output.object` / tool calling |
| Cloud provider | `@ai-sdk/anthropic` | Claude API calls |
| Local provider | `@ai-sdk/openai-compatible` | OpenAI-compatible HTTP clients (Ollama, LM Studio, MLX server) |
| Local model | `mlx-community/Qwen3-8B-4bit-AWQ` via `mlx_lm.server` | Apple-Silicon-native local inference |

The stack is deliberately unified around TypeScript and Node.js. No separate Python service is required for current functionality; the local LLM is consumed over HTTP using the same OpenAI-compatible protocol the cloud providers use.

## Using this for a hackathon

If you are forking this for a legal-tech or general AI hackathon, here is what you get out of the box and what you typically still need to do.

**Already wired up:**

- Authentication and per-user data isolation. All routes that read user data filter by `session.user.id` server-side.
- Prisma schema with `User`, `Session`, `Account`, `Document`, `SecurityEvent` and the Better Auth tables.
- A central model registry (`lib/models-registry.ts`) describing each available LLM, its capabilities (`streaming-structured`, `tool-calling`), and an optional `fallbackTo` cloud model.
- A reusable fallback helper (`lib/with-fallback.ts`) that catches local-server connection failures and transparently retries on a cloud model, signalling the substitution back to the UI.
- A pure regex-based PII detector (`lib/leak-detector.ts`) covering Quebec/Canada identifiers (SIN, RAMQ, postal code, phone, email, credit card with Luhn validation), with a small ad-hoc test harness under `scripts/`.
- A model-selector UI component (`components/anonymize/model-selector.tsx`) that the user can drop into any vertical to expose model choice with grouping by provider.
- A safeguard pattern (HTTP 409 with declarative override) ready to copy to other verticals that send user text to remote models.

**Typical hackathon additions:**

- A new vertical: a page under `app/<feature>/page.tsx`, a route handler under `app/api/<feature>/route.ts`, a schema-and-prompt file under `lib/<feature>-schema.ts`, and components under `components/<feature>/`. The judgment summarizer and the anonymizer can both be used as templates.
- New environment variables (OpenAI key, third-party APIs, etc.) wired into `.env`.
- Optional: extending the leak detector to cover additional identifiers your domain requires.
- Optional: extending the security journal to log events from your new vertical (the `route` field on `SecurityEvent` is intentionally generic).

The branch `main` is the development sandbox. A clean `hackathon-starter` branch is planned (per `docs/plan-apprentissage.md`) but not yet cut.

## Getting started

### Prerequisites

- Node.js 20 or newer and `pnpm` 11 (the repository's `packageManager` field pins a specific version).
- PostgreSQL 18 reachable locally or remotely.
- An Anthropic API key (for Claude verticals).
- Optionally, a Mac with Apple Silicon and Python 3.10+ to run the local LLM. Without it, the local-model option is unavailable but the cloud verticals work unchanged.

### Install dependencies

```bash
pnpm install
```

### Environment variables

Create a `.env` file at the repository root with the following keys:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/hackathon_lab"

BETTER_AUTH_SECRET="<generate a random 32+ character string>"
BETTER_AUTH_URL="http://localhost:3000"

GITHUB_CLIENT_ID="<from your GitHub OAuth app>"
GITHUB_CLIENT_SECRET=""

GOOGLE_CLIENT_ID="<from your Google Cloud OAuth credentials>"
GOOGLE_CLIENT_SECRET=""

ANTHROPIC_API_KEY="sk-ant-..."

# Optional — defaults to http://localhost:8080/v1 if unset
LOCAL_LLM_BASE_URL="http://localhost:8080/v1"
```

OAuth credentials are only required if you want the corresponding sign-in button to work; email/password authentication works without them.

### Initialize the database

```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

For a fresh dev database you can use `pnpm prisma migrate dev` instead, which applies migrations and regenerates the client. Be aware that on Prisma 7.8 the client is not always regenerated automatically after `migrate dev` — run `pnpm prisma generate` explicitly if you see `Property 'X' does not exist on type 'PrismaClient'` errors.

### Optional: run the local LLM

The anonymizer can run entirely on-device using Qwen3-8B on Apple Silicon. From a separate terminal:

```bash
# One-time setup
python3 -m venv ~/.venvs/mlx
source ~/.venvs/mlx/bin/activate
pip install "mlx-lm[server]"

# Each session
source ~/.venvs/mlx/bin/activate
mlx_lm.server --model mlx-community/Qwen3-8B-4bit-AWQ --port 8080
```

If the server is not running, the anonymizer falls back automatically to Claude Haiku 4.5 and notifies the user. The other verticals are unaffected.

### Run the application

```bash
pnpm dev
```

Then open `http://localhost:3000`. Create an account, sign in, and the verticals listed above become available from the sidebar.

## Architecture highlights

A few patterns worth knowing before extending the codebase. Each is discussed in greater depth in the corresponding `docs/phase-*.md` file.

**tRPC for everything except streaming.** Streaming responses and structured output do not compose cleanly with tRPC, so verticals that need either drop down to a native Next.js route handler under `app/api/`. The cost is duplicated authentication (both `protectedProcedure` and a manual `auth.api.getSession` call in the route handler); the benefit is a clean streaming model.

**Model registry with capabilities.** `lib/models-registry.ts` is the single source of truth for available models. Each vertical filters the registry by required capability (`modelsWith("streaming-structured")` for the summarizer, full list for the anonymizer). Adding a new model means one entry in the registry; every vertical that can use it picks it up automatically.

**Client-server type boundary.** The `LanguageModel` instance type from the AI SDK must not cross into client bundles. Components that need to display model metadata receive a minimal `ClientModelInfo` (id, label, provider, description, available) computed server-side.

**Graceful degradation with transparency.** The fallback helper logs the substitution and propagates a `fellBack` flag through to the UI, which renders an amber banner explaining what happened. Users who chose a local model for privacy reasons are never silently switched to cloud without notice.

**Safeguard as HTTP 409.** When the PII detector finds sensitive data, the route handler returns `409 Conflict` with the findings — not `400` or `500`. The client treats `409` as a business signal (display the warning), distinct from errors. The user can resubmit with `override: true` in the body. Both blocks and overrides are persisted to a per-user security journal.

**State machines for UI flows.** Multi-state forms use TypeScript discriminated unions:

```typescript
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; leaks: Finding[] }
  | { status: "success"; data: T }
  | { status: "error"; message: string };
```

This eliminates the classic bug of rendering stale data while a request is in flight.

## Documentation

The `docs/` directory is the source of truth for how the codebase came to be the way it is. In recommended reading order:

- `plan-apprentissage.md` — the original learning plan and phase breakdown.
- `phase-1.md` through `phase-6.md` — execution journals for each phase, with real code, decisions, and pitfalls.
- `phase-2-concepts.md`, `phase-3-concepts.md` — deeper conceptual write-ups on tRPC/Prisma and Better Auth.
- `comprendre-shadcn-ui.md` — reference notes on shadcn/ui internals.

These documents are in French. The code, identifiers and UI are also predominantly in French, reflecting the Quebec legal context.

## Disclaimer

This is a learning prototype. It is not legal advice, not a regulated product, and not certified for handling real client data. The PII detector covers common Quebec/Canada identifiers using regex heuristics — it is not a substitute for a properly engineered data-loss-prevention system. The Anthropic API receives data when cloud models are used; review their data-handling terms before sending content of any real sensitivity.

Do not paste real client information into any deployed instance of this application unless you have implemented and audited appropriate additional controls.
