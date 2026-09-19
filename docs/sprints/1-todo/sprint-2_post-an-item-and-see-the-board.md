---
id: 2
title: "Post an item and see the board"
epic: "Swap Board v1"
status: todo
created: 2026-09-19T20:45:25+00:00
---

# Master Controller Sprint Definition — Sprint 2

**Epic:** Swap Board v1 — a public board where anyone can post a textbook or piece of gear for sale and the poster can mark it claimed when it's gone.
**Sprint Objective:** Ship the one form and the one list — anyone can post an item, and everyone sees every posted item on a shared board.

### Context

Sprint 1 proved a Next.js app on Vercel can reach a Neon Postgres database from the deployed runtime, and it cost two QA1 rounds and three LiveQA rounds to prove it properly. Those rounds were not waste, and the reason matters for this sprint: LiveQA's round 2 verdict was CONDITIONAL because every observation until then had been on the success path, and a handler that silently swallowed its error and always returned `{"status":"ok"}` would have looked identical to a correct one. Only forcing an actual failure distinguished them. This sprint's acceptance criteria are written with that lesson applied up front rather than discovered on round 2.

This is the first sprint with real data, real user input, and a real secret. The secret is `claim_token`, and its invariant is deliberately absolute here: it is generated, stored, and never leaves the database by any path. Sprint 3 will carve exactly one narrow exception so the poster can receive their claim link. Keeping sprint 2's rule exception-free means QA1 can audit it as a flat statement — no response body, no rendered HTML, no log line, ever — and any occurrence at all is a defect, which is a far easier thing to verify than "returned in the right place only."

### Requirements

1. **An `items` table, created by a committed, re-runnable migration** (a checked-in SQL file or migration tool — not a hand-run statement in a dashboard, which leaves no record and cannot be reproduced). Columns, at minimum: a primary key; `title` (text); `price_cents` (integer); `email` (text); `claimed` (boolean, default false); `claim_token` (text); `created_at` (timestamp, default now).

2. **Price is stored as an integer number of cents, never as a float or double.** Binary floating point cannot represent most decimal money values exactly, and `$19.99` stored as a float and re-read is how a board starts displaying `$19.98`. Input is accepted in dollars and converted at the boundary.

3. **`claim_token` is generated per item using a cryptographically secure random source** (`crypto.randomUUID()` or `crypto.randomBytes` — never `Math.random()`, which is predictable and would let anyone enumerate claim links). Minimum 128 bits of entropy.

4. **`claim_token` never leaves the database in this sprint. No exceptions.** It must not appear in any API response body, in any server-rendered HTML, in any client-side JavaScript payload, in any log line, or in any error message. Queries that feed a response select columns explicitly — no `SELECT *` on a path whose result reaches a response.

5. **`POST /api/items` creates an item.** It validates input and, on success, returns `201` with the created item (minus `claim_token`, per requirement 4).

6. **Input validation rejects bad input with `400` and a message naming what was wrong**, without persisting anything:
   - `title`: required, non-empty after trimming, maximum 200 characters.
   - `price`: required, a non-negative number, maximum $100,000. Rejects negatives, `NaN`, `Infinity`, and non-numeric strings.
   - `email`: required, non-empty, containing a plausible address shape. A deliberately permissive check is correct — the address is for humans to mail, not for the system to send to, and over-strict validation rejects real addresses.
   - Validation runs **server-side** in the route handler. Client-side validation may also exist for UX, but is never the only check — the API is publicly reachable and anyone can POST to it directly.

7. **`GET` of the board returns every item, newest first**, and every visitor sees the same list. No per-visitor filtering, no session state.

8. **The board is never served as stale cached content.** This is sprint 1's Requirement 6 footgun in its second location: a statically rendered or cached board means a posted item never appears, or appears for one visitor and not another. The board route opts out of static rendering and caching explicitly, and a newly posted item is visible to a *different* client on the next load without a rebuild.

9. **One form, on the same page as the board.** Fields: title, price, email. On success the new item appears in the list without a manual page refresh. On validation failure the server's message is displayed and the user's typed input is not discarded.

10. **Rendering rules:** `price_cents` of `0` renders as `Free`; any other value renders as a currency amount with two decimal places. `email` renders as a `mailto:` link. `title` and `email` are rendered as **text, never as markup** — a title containing `<script>` or HTML must display as those literal characters.

11. **Database failure is reported as failure, never as an empty board.** If the query throws or the database is unreachable, the page and the API must surface an error state. A board that renders "no items yet" when the database is down is indistinguishable from a working empty board, and is the exact shape of defect LiveQA caught on sprint 1 round 2. No response body on any failure path may contain a connection string, host, credential, or raw driver stack trace.

12. **Housekeeping: `.gitignore` gains `.DS_Store` and `.claude/settings.local.json`.** Both are currently untracked and unignored, so the next `git add -A` commits an agent permission grant and a macOS metadata file to a public repository. This rides in a real sprint rather than the trivial-fix fast lane because that lane requires the single changed file to be a component or style file, and `.gitignore` is not one — it fails the checklist, so it does not get the lane. If either file is already tracked at build time, ignoring it is not enough; it must also be removed from the index.

### Acceptance Criteria

**QA1 (static audit — reads the diff, never a browser):**

- Req 1: The migration exists as a committed file and is re-runnable (guarded with `IF NOT EXISTS` or equivalent). Confirm column types match requirements 2 and 3.
- Req 2: `price_cents` is an integer type in the schema, and the dollars→cents conversion is inspected for a rounding bug — confirm it cannot produce a fractional or off-by-one cent for ordinary inputs like `19.99`. Confirm no float or `double precision` type holds money anywhere.
- Req 3: The token source is `crypto`-based. **Grep the whole diff for `Math.random`** and confirm it appears nowhere near token generation.
- Req 4: This is the sprint's most important static check, and it is QA1's to own because it is far easier to verify by reading than by probing. Trace *every* path that reaches a response or a rendered page and confirm `claim_token` is on none of them. Confirm no `SELECT *` feeds a response. Confirm no logging statement takes a whole item object that would include the token. Any occurrence is a FAIL, not a note.
- Req 5/6: Read the validation. Confirm each rule in requirement 6 is enforced **server-side in the route handler**, not only in the form component. Confirm a rejected request cannot write a row — check that validation precedes the insert, not that a failed insert is cleaned up afterward. Confirm the negative, `NaN`, and non-numeric price cases are actually handled rather than coerced silently.
- Req 8: Confirm the board route explicitly opts out of static rendering and caching, the same mechanism sprint 1 used for `/api/health`. Its presence is static fact; that it worked is LiveQA's.
- Req 10: Confirm `title` and `email` reach the DOM as text through JSX interpolation, and that `dangerouslySetInnerHTML` appears nowhere in the diff.
- Req 11: Trace the catch path on both the page and the API. Confirm an error surfaces as an error state, and that an exception cannot fall through to rendering an empty list. Confirm no connection string, host, credential, or raw driver error reaches a response body.
- Req 12: Confirm both entries are present in `.gitignore`, and confirm via `git ls-files` that neither path is tracked.

**LiveQA (live test against the deployed URL, after Pipeman has pushed):**

- Reqs 5/7/9: Post an item through the form on the live URL. Confirm it appears in the list. Then load the board **in a different browser session or a clean context** and confirm the same item is visible there — this is what "everyone sees the board" actually means, and a single-session check cannot distinguish it from local state.
- Req 8: Post an item, then load the board from a client that has never loaded the page before, and confirm the new item is present without a redeploy. Check response headers for evidence of a cache hit.
- Req 6: Submit directly to `POST /api/items`, bypassing the form, with each of: empty title, a 500-character title, a negative price, `"abc"` as price, and a missing email. Confirm `400` on every one, and then confirm via the board that **no row was created** by any of them. A `400` that still persisted a row passes the status check and fails the requirement.
- Req 4: Fetch the board's API response and the raw page HTML and search both for any `claim_token` value. Post a known item first so there is a specific token to hunt for. Zero occurrences required.
- Req 10: Post an item titled `<script>alert(1)</script>` and confirm it renders as literal visible text, with no script execution and no broken markup. Post an item at price `0` and confirm it renders `Free`.
- Req 11: **Force a real database failure and observe it** — the same technique that settled sprint 1's Req 7, and it worked: a preview deployment with a deliberately unreachable database value, never the production database. Confirm the board surfaces an error state rather than an empty list, and that the body leaks nothing. This requirement exists *because* sprint 1's round 2 showed success-path observation cannot distinguish a correct handler from one that swallows errors. If that environment genuinely cannot be obtained this time, record exactly what was attempted and what blocked it — a bare assertion that it is untestable is not an acceptable outcome, and sprint 1 already demonstrated it is obtainable here.

### Out of Scope

- **The claim button, the claim page, and marking an item claimed.** Sprint 3. The `claimed` column exists in this sprint's schema to avoid a later migration, but nothing reads or writes it yet, and the board does not render claimed state — an unsettable flag cannot be live-tested.
- **Returning `claim_token` to the poster.** Sprint 3 carves that single exception deliberately. In this sprint the invariant is exception-free on purpose.
- **Edit, delete, and unclaim.** The epic is "one list, one form, one button." These are permanently out, not deferred.
- **Accounts, login, and ownership.** The secret claim link exists specifically to avoid authentication.
- **Search, filtering, sorting controls, and pagination.** Newest-first is the whole ordering model. Revisit only if a real board gets long enough to need it.
- **A design system or component library.** Legible and unstyled is acceptable; a visual pass is a separate decision made against real content, not a placeholder.
- **Rate limiting and spam prevention.** Real concerns for a public unauthenticated form, and deliberately deferred — flagged as a risk below rather than silently ignored.
- **Deleting the leftover preview deployment `292jy7q6n`** from sprint 1's Req 7 test. It is a Vercel dashboard action, not a code change, and belongs to whoever owns the Vercel account.

### Dependencies

- **Blocks:** Sprint 3 (claim flow) — the claim page needs the `items` table, the `claim_token` column, and the board to render against.
- **Blocked by:** Sprint 1. It has passed both gates and sits at `complete_ready`, but it is **not closed** — closing requires the user's explicit real-time authorization, which is Dev Team's `/sprint-complete` to run, not this sprint's problem to route around. Do not start sprint 2 against an unclosed sprint 1 without confirming that is intended.
- **External:** The Neon Postgres database provisioned in sprint 1, and the Vercel project's auto-deploy from `main`. Both are known working as of sprint 1's LiveQA PASS on commit `6d5a803`.

### Team Assignments

- **Dev Team 1:** All of it. Requirements 1–12.
- **Dev Team 2:** Not assigned. Sprint 3 edits the same schema, the same API surface, and the same page as this sprint, so the two are not independent and cannot run in parallel. Splitting this sprint across both teams is not what Dev Team 2 is for.

### Risks & Mitigations

- **`claim_token` leaks through a `SELECT *` or a logged item object.** — The single highest-value defect in this sprint, and the cheapest to catch by reading. Requirement 4 states it absolutely with no exception to reason about, QA1 owns it as a hard FAIL condition, and LiveQA hunts a known token value in the live response as a second, independent check.
- **The board is statically rendered and posted items never appear.** — Identical in shape to sprint 1's health-endpoint footgun, in its second location. It gets its own requirement (8), a static check, and a live check from a cold client.
- **A database failure renders as an empty board rather than an error.** — Directly inherited from LiveQA's sprint 1 round 2 finding, which is why requirement 11 and its forced-failure live criterion exist before round 1 rather than after round 2.
- **Money stored as a float.** — Requirement 2 mandates integer cents and QA1 inspects the conversion for rounding, rather than trusting that the type is right because the display looks right.
- **A public, unauthenticated POST endpoint invites spam.** — Accepted for this sprint and explicitly out of scope, not overlooked. The maximum-length and maximum-price limits in requirement 6 bound the damage a single request can do. If the deployed board attracts junk, rate limiting becomes its own sprint with real traffic to design against, rather than a guess made now.
- **Sprint 1 is not yet closed.** — Named in Dependencies rather than assumed away. If sprint 1 needs a fix after this sprint starts, both sprints touch the same app and the conflict is real; confirm sprint 1 is closed before `/sprint-start 2`.
