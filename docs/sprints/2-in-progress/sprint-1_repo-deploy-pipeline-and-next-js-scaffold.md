---
id: 1
title: "Repo, deploy pipeline, and Next.js scaffold"
epic: "Swap Board v1"
status: in_progress
created: 2026-09-19T18:55:36+00:00
---

# Master Controller Sprint Definition — Sprint 1

**Epic:** Swap Board v1 — a public board where anyone can post a textbook or piece of gear for sale and the poster can mark it claimed when it's gone.
**Sprint Objective:** Stand up a git repository, a Next.js app, and a Vercel deployment with a working Postgres connection, so that every later sprint has a real URL to be live-tested against.

### Context

This project directory currently contains the Fully Completely framework install and nothing else — no git repository, no `package.json`, no application source. That matters more than it sounds: this lifecycle's real protections are git-shaped and deploy-shaped. `/sprint-ship` compares tree content at a commit, `/sprint-liveqa` compares against the commit actually deployed, and LiveQA's entire gate is verification of a released artifact in a real environment. Until a repo, a remote, and a reachable URL all exist, those gates have nothing to attach to and every sprint after this one would be unverifiable.

So this sprint builds no product feature at all. It builds the thing that makes the next two sprints checkable. The one design decision carried here is that "working deployment" is defined as more than a page rendering: the database connection has to be proven from the deployed environment, because a Postgres that works on a laptop and fails in Vercel's runtime is the single most likely way this foundation looks finished while being broken, and it would surface in sprint 2 as a mystery rather than here as a plain failure.

### Requirements

1. **`.gitignore` extended to cover the application.** *Already done, do not redo:* the repository, branch `main`, the `origin` remote (`https://github.com/samuelaraki/textbook-gear-swap-board.git`), and the initial scaffold commit all exist as of `cd034da`, which is already on the remote; `docs/sprints/` entered version control in `d364c43`. What remains in this requirement is only that `.gitignore` gains entries for `node_modules/`, `.next/`, and `.env*` (with `.env.example` still tracked), while preserving the three Fully Completely lines already present (`docs/sprints/.locks/`, `*.fc-bak-*`, `.claude/role-claims.json`). Do not run `git init` and do not re-add `origin`.

2. **No credential, connection string, or API token is ever committed.** Real values live in Vercel's environment-variable settings and in a local `.env.local` that `.gitignore` excludes. A committed `.env.example` documents every variable the app reads, by name, with placeholder values only.

3. **A Next.js application (App Router, TypeScript) scaffolded at the repository root**, which builds clean with a production build and passes lint with no errors. No feature UI — the default or a minimal placeholder page is correct for this sprint.

4. **A Postgres database provisioned and its connection exposed to the deployed app.** *Flagged assumption — verify before building on it:* the intended route is a Postgres database provisioned through the Vercel dashboard's own storage/integrations flow for this project, which wires the connection environment variables into the project automatically. Vercel has restructured its first-party Postgres offering at least once, and this requirement deliberately does not name a product or a client library. Dev Team confirms what this account actually offers before writing code against it, and reports in the handoff what was actually provisioned. Any Postgres reachable from the deployed app satisfies this requirement; a database that only exists on a developer laptop does not.

5. **A health endpoint at `/api/health` that performs a real database round-trip on every request.** It executes an actual query against Postgres (`SELECT 1` or equivalent), and returns JSON containing at minimum: a status field, and a server-generated timestamp produced at request time. On a successful round-trip it responds `200`. If the database is unreachable or the query throws, it responds with a `5xx` status and a status field indicating failure — it never reports success when the query did not succeed.

6. **The health endpoint must not be statically rendered or cached.** Next.js App Router route handlers can be evaluated at build time and served as a static response, which would make requirement 5 report a `200` and a build-time timestamp forever, including while the database is down. The route must opt out of static rendering and caching explicitly, and two requests a few seconds apart must return different timestamps.

7. **The health endpoint leaks nothing on failure.** Its failure response body must not contain the connection string, database host, credentials, or a raw driver stack trace. A generic failure status plus a non-identifying message is what it returns; detail goes to server logs.

8. **The Vercel project is connected to the git remote and deploys automatically on push to `main`**, producing a reachable public URL. That URL is recorded in the sprint handoff so LiveQA can test it.

### Acceptance Criteria

**QA1 (static audit — reads the diff, never a browser):**

- Req 1: `.gitignore` contains entries for `node_modules/`, `.next/`, and `.env*`, and still contains all three original Fully Completely lines. Confirm `git ls-files` shows no `node_modules/` or `.next/` path was ever committed — an ignore rule added after the fact does not untrack what a scaffold already staged.
- Req 2: Search the full committed tree for connection strings, tokens, and secret-shaped values — confirm none are present, including in `.env.example`, `next.config.*`, and any committed config. Confirm `.env.example` exists, names every variable the code actually reads, and carries placeholders only. Confirm `.gitignore`'s `.env*` rule does not itself exclude `.env.example` from the commit.
- Req 3: Confirm App Router (`app/` directory, not `pages/`) and TypeScript are in use. Confirm a production build and lint both complete with no errors, from the build output, not from an assertion that they were run.
- Req 4: Confirm the database client is configured from environment variables and nothing is hardcoded. Confirm Dev Team's handoff states what was actually provisioned rather than restating the flagged assumption in requirement 4 back as fact.
- Req 5: Read the handler. Confirm it issues a genuine query and that its success path is reachable **only** after that query resolves — a handler returning `200` before or independently of the query's result fails this criterion even if the query is present in the file. Confirm the timestamp is generated inside the request handler, not at module scope, where it would be fixed for the life of the server process.
- Req 6: Confirm the route explicitly opts out of static rendering and caching (e.g. `export const dynamic = 'force-dynamic'`, or an equivalent documented mechanism). Its presence is a static fact QA1 can verify; whether it actually worked is LiveQA's to confirm, and both are required.
- Req 7: Trace the catch/error path and confirm no connection string, host, credential, or raw driver error object reaches the response body.
- Req 8: Confirm any deploy configuration committed to the repo is consistent with auto-deploy from `main`. The deployment actually working is LiveQA's criterion, not QA1's.

**LiveQA (live test against the deployed URL, after Pipeman has pushed):**

- Reqs 4, 5, 8: Request `/api/health` on the live Vercel URL. Confirm a `200` and a well-formed JSON body. This single request is what proves the deployed app can reach Postgres from Vercel's runtime — the whole point of this sprint.
- Req 6: Request `/api/health` twice, several seconds apart, and confirm the two timestamps **differ**. Identical timestamps mean the route was statically rendered and requirement 5's `200` proves nothing about the database.
- Req 3/8: Load the site root on the live URL and confirm it renders without a runtime or build error page.
- Req 7: This one is harder to trigger on purpose and it is **not** waived for that reason. Attempt it: if the deployed environment's database variable can be temporarily pointed at an unreachable host (a preview deployment with a deliberately wrong value is the intended route, never the production database), confirm the response is `5xx` and that the body contains no connection string, host, credential, or stack trace. If that environment genuinely cannot be obtained, record what was attempted and what blocked it — a bare assertion that it is untestable is not an acceptable outcome here.

### Out of Scope

- **The items table, the post form, and the board list.** Sprint 2 — this sprint deliberately ships no product schema, so that a connection failure surfaces as a connection failure rather than as a broken feature.
- **The claim token and claim page.** Sprint 3.
- **Any visual design, styling system, or component library.** Nothing here is user-facing; choosing a design direction against a placeholder page would be choosing it blind.
- **Authentication and user accounts.** The epic uses a secret claim link specifically to avoid this, permanently, not just for now.
- **A test suite beyond a clean build and lint.** There is no application logic yet to test. Sprint 2 introduces the first logic worth covering.
- **Custom domains.** The Vercel-issued URL is sufficient for LiveQA's gate.

### Dependencies

- **Blocks:** Sprint 2 (post an item / see the board) and Sprint 3 (claim flow). Both are blocked completely — neither can clear a gate without a repo and a live URL.
- **Blocked by:** Nothing. This is the first sprint in the epic.
- **External:**
  - **Resolved:** the GitHub remote exists, is reachable, and already carries the initial scaffold commit — the user created and pushed it during planning. **All further pushes are Pipeman's**, without exception. Dev Team commits locally and stops.
  - A Vercel account with permission to create a project and provision storage for it. If the account cannot provision Postgres, requirement 4 is blocked and the sprint should be returned via `/sprint-block` rather than worked around with a laptop-only database.
  - **Note on local/remote divergence at handoff:** this sprint file and `docs/sprints/registry.json` were committed locally as `d364c43`, which is one commit ahead of `origin/main`. That is expected and correct — Master Controller does not push. Pipeman carries it with sprint 1's first ship.

### Team Assignments

- **Dev Team 1:** All of it. Requirements 1–8.
- **Dev Team 2:** Not assigned. Nothing in this epic runs in parallel — see the risk below.

### Risks & Mitigations

- **Vercel's Postgres offering may not match what requirement 4 assumes.** — Requirement 4 is written implementation-agnostic and explicitly flagged as an assumption to verify first. Dev Team confirms what the account actually offers before writing a line against it, and reports what was provisioned. Any reachable Postgres satisfies the requirement.
- **The health endpoint gets statically rendered and reports a permanent, meaningless `200`.** — This is the most likely way this sprint ships broken while looking green, which is why it gets its own requirement (6), its own static criterion, and its own live criterion. The two-timestamp check is the one that actually catches it.
- **A database that works locally and fails in Vercel's runtime.** — The health check is deliberately tested on the deployed URL, not locally. A local pass is not evidence for this sprint's gate.
- **Secrets or build artifacts committed during scaffolding.** — Scaffolding tools write env files into the working tree, and `.gitignore` currently has no `node_modules/` or `.next/` rule at all, so a scaffold run before requirement 1 is applied would stage both. Requirement 1's criterion checks the tracked file list, not just the ignore file, and requirement 2 gets an explicit QA1 sweep of the full committed tree rather than only the diff.
- **This epic has no parallelizable work.** — Sprints 1, 2 and 3 form a strict chain: sprint 1 creates the repo everything else needs, and sprints 2 and 3 both edit the same schema, the same API surface, and the same page. Assigning Dev Team 2 here would mean splitting one sprint's work in half, which is what Dev Team 2 is explicitly not for. Sequential is the correct call, not a capacity failure.
