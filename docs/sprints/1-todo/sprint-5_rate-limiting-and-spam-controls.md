---
id: 5
title: "Rate limiting and spam controls"
epic: "Swap Board v1.1 — launch readiness"
status: todo
created: 2026-09-21T21:43:40+00:00
---

# Master Controller Sprint Definition — Sprint 5

**Epic:** Swap Board v1.1 — launch readiness. The two things that must be true before this board is shared campus-wide.
**Sprint Objective:** Stop a public, unauthenticated posting form from being filled with junk faster than anyone can remove it.

### Context

Sprint 2 deferred rate limiting on purpose, with the reasoning that a limit should be designed against real traffic rather than guessed at. That was correct for a board nobody could reach. It stops being correct the moment the URL goes campus-wide, which is now the plan: `POST /api/items` is publicly reachable, requires no authentication, and has no limit of any kind. Sprint 4 gives posters a way to remove their own posts, which does nothing about junk posted by someone else.

There is one technical trap here that matters more than the policy, and it is the reason this is a real sprint rather than a ten-line middleware addition. **In-memory rate limiting does not work on Vercel.** Each serverless invocation can land on a fresh instance with its own empty counter, so a limit held in a module-level `Map` works perfectly on a laptop, passes every local test, and enforces nothing in production. This is the same family of defect as sprint 1's statically-rendered health endpoint — correct-looking code whose failure is invisible except in the deployed environment — and it gets the same treatment: its own requirement, its own static check, and a live check specifically designed to span instances.

### Requirements

1. **`POST /api/items` is rate limited per client.** A limit and a window must be chosen and stated explicitly in the code and in this sprint's handoff — not left implicit in a library default. The starting policy is a judgement call, not a derived fact; something in the range of a handful of posts per client per hour is the intent, and Dev Team should state what it picked and why.

2. **The rate limit state is shared across serverless instances.** A module-level variable, an in-process `Map`, or any other per-instance store does not satisfy this requirement even if it appears to work locally. Postgres (the database this project already has) or a Vercel-provided KV store are both acceptable; the choice is Dev Team's, and if it requires a migration, that migration is committed like sprint 2's.

3. **Exceeding the limit returns `429` with a `Retry-After` header**, and a response body that tells a human what happened in plain language. It must not leak the limit's internal state, other clients' activity, or the identity of the store.

4. **The limit must not block ordinary legitimate use.** Someone posting three textbooks in one sitting is the normal case, not abuse. The chosen policy must accommodate that, and the sprint handoff must say how it was checked rather than asserting it.

5. **A honeypot field in the post form** — a field invisible to humans, submitted empty by real browsers, and filled by naive bots. A submission with it filled is rejected. It must be hidden in a way that does not expose it to screen readers as a real field, and its rejection must be indistinguishable to the client from an ordinary validation failure.

6. **If the rate-limit store is unavailable, posting continues to work.** This is a deliberate fail-open decision and it must be implemented deliberately, not arrived at by accident: a swap board that refuses all posts because a counter table is unreachable has converted a spam-prevention feature into a total outage. The failure must be logged server-side. State this choice in a comment at the point it is implemented, so a later reader does not "fix" it into fail-closed without knowing it was chosen.

7. **Client identification is documented and honest about its limits.** Vercel provides the client IP via request headers; the code must read it from the header Vercel actually sets rather than trusting a client-supplied `X-Forwarded-For` it could spoof. The handoff should state plainly that IP-based limiting is defeatable and that this is accepted for now — the goal is stopping casual junk, not a determined attacker.

8. **Rate-limit checks and the honeypot must not weaken sprint 2's existing validation.** All of it still applies, unchanged, and a rejected-for-rate-limit request must not write a row any more than a rejected-for-validation one does.

### Acceptance Criteria

**QA1 (static audit — reads the diff, never a browser):**

- Req 2: **The central static check of this sprint.** Confirm the limiter's state lives in a shared store, not in process memory. Grep the diff for a module-scope `Map`, `Set`, array, or counter used to hold limit state and confirm none is load-bearing. A cache in front of a shared store is fine; a cache *instead of* one is the defect.
- Req 1: Confirm the limit and window are explicit named values, not library defaults, and that they are stated where a reader can find them.
- Req 3: Confirm `Retry-After` is actually sent and its value is consistent with the configured window. Confirm the body reveals nothing about the store or other clients.
- Req 5: Confirm the honeypot is hidden by a technique that also hides it from assistive technology (e.g. `aria-hidden` plus off-screen positioning, not a bare `type="hidden"` that a bot trivially recognises and not a visually-hidden-but-announced field). Confirm its rejection response is identical to an ordinary validation rejection.
- Req 6: Confirm the fail-open path exists, is reached when the store throws, and carries the explanatory comment the requirement asks for. Confirm the failure is logged.
- Req 7: Confirm the client IP is read from the header Vercel sets, and that a client-supplied value cannot override it.
- Req 8: Confirm sprint 2's validation still runs on every path, and that a rate-limited or honeypot-rejected request cannot reach the insert.
- Re-read this sprint file immediately before recording the verdict, per `qa1.md`.

**LiveQA (live test against the deployed URL, after Pipeman has pushed):**

- Req 1/3: Exceed the limit against the live deployment and confirm `429` with a sane `Retry-After`. Then confirm via the board that **no rows were created** by the rejected requests.
- Req 2: **The criterion this sprint exists for.** Send the over-limit requests in a pattern likely to span multiple serverless instances — spaced out rather than a single burst, and enough of them that a cold instance is probable — and confirm the limit still holds. A limit that holds within one burst but resets when a new instance spins up is exactly the defect requirement 2 describes, and a single rapid burst will not detect it. Report how many requests were sent and over what period, so the strength of the evidence is legible.
- Req 4: Post three items in normal succession, as a real person would, and confirm none is blocked.
- Req 5: Submit directly to the API with the honeypot field filled and confirm rejection with no row created. Then confirm a real browser submission through the form succeeds — the honeypot must not break ordinary posting, which is the most likely way this feature silently breaks the product.
- Req 6: **Force the rate-limit store to be unavailable and confirm posting still works.** If the store is Postgres, the existing preview-deployment-with-a-poisoned-database technique reaches it. Note the interaction: if the limiter shares the app's database, an unreachable database breaks posting for reasons unrelated to the limiter, so the test must distinguish "posting failed because the database is down" from "posting failed because the limiter failed closed" — say which was observed. If the store is separate (KV), poison only that variable. If this cannot be arranged, record exactly what was attempted and what would clear it.
- Req 8: Re-run a short subset of sprint 2's validation checks — empty title, negative price, missing email — and confirm all still reject with `400` and no row.

### Out of Scope

- **CAPTCHA and third-party bot services.** A honeypot and a rate limit are the proportionate response to expected junk on a campus board; a CAPTCHA taxes every real user for a threat that has not appeared. Revisit with evidence.
- **Rate limiting the claim and removal endpoints.** Sprint 4 owns those routes. A 128-bit token is not brute-forceable, so they do not need it.
- **Blocking, banning, or an IP denylist.** Stateful enforcement against individuals needs a moderation story this project has deliberately not built.
- **Email verification of posters.** No mail provider in this project; see sprint 3.
- **Content filtering of titles.** Not a spam control, and a separate decision.
- **An admin view of rate-limit state.** Sprint 4 declined an admin UI; this sprint does not reintroduce one through the back door.

### Dependencies

- **Blocks:** Launch. This and sprint 4 are the two things the epic says must be true first.
- **Blocked by:** Sprint 2 (closed) for the endpoint and validation this extends.
- **External:** Neon and the Vercel deploy from `main`. If a KV store is chosen for requirement 2, provisioning it needs Vercel account access — the same dependency shape that gated sprint 1's database, and worth confirming before building against it rather than after. **Requirement 6's live criterion needs a preview deployment with a poisoned store variable**, the recurring friction point on this project; arrange it before the live test starts.
- **Parallel-work boundary:** this sprint **owns `app/api/items/route.ts`, `app/page.tsx`, and any new rate-limit module**. It must not touch `lib/items.ts` or `app/claim/**`, which belong to sprint 4.

### Team Assignments

- **Dev Team 2:** All of it. Requirements 1–8. **Run `/sprint-worktree 5` before touching any files**, and work in that worktree for the whole sprint. This is not optional and not a judgement call — it is what actually prevented collisions on this framework, where checking for overlap alone did not.
- **Dev Team 1:** Not assigned here — it owns sprint 4 in the primary checkout, running at the same time. The ownership line is by file path, stated above and in sprint 4. If either team finds it needs a file the other owns, stop and flag it rather than editing across the line.
- **On close:** sprint 5 closes from inside the worktree, on branch `devteam2/sprint-5`, which no other checkout reads. Follow CLAUDE.md's "Running two sprints at once" return path — close, commit the bookkeeping, then hand the branch and commit to Pipeman by name for the merge. Do not skip that handoff; a sprint closed in a worktree and left there reads as still-open everywhere else.

### Risks & Mitigations

- **A limit held in process memory that enforces nothing in production.** — The defining risk of this sprint, invisible locally and invisible to a single-burst live test. Requirement 2 states it, QA1 greps for the shape, and LiveQA's criterion is specifically designed to span instances rather than to trip the limit quickly.
- **The limiter fails closed and takes the board down.** — Requirement 6 makes fail-open explicit and asks for a comment at the implementation point, because the most likely way this regresses is a future reader tidying it into what looks like the safer behavior.
- **The honeypot breaks real posting.** — The quietest way to lose every post: no error, no alert, just nobody successfully posting. LiveQA confirms a real browser submission through the form still succeeds, not only that the honeypot rejects.
- **The limit is set too tight and blocks genuine users.** — Requirement 4, plus a live check with three ordinary posts. The policy is explicitly a judgement call to be stated and revisited, not a number to defend.
- **`X-Forwarded-For` spoofing defeats the limit trivially.** — Requirement 7 requires reading the header Vercel actually sets. The handoff must also state plainly that IP limiting is defeatable, so nobody mistakes this for a security control.
- **Two sprints in flight touching one small app.** — Ownership by file path, and Dev Team 2 in its own worktree.
