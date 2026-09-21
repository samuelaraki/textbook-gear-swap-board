---
id: 3
title: "Claim an item with a secret link"
epic: "Swap Board v1"
status: done
created: 2026-09-21T20:45:38+00:00
---

# Master Controller Sprint Definition — Sprint 3

**Epic:** Swap Board v1 — a public board where anyone can post a textbook or piece of gear for sale and the poster can mark it claimed when it's gone.
**Sprint Objective:** Give the poster a secret link at post time, and one button behind it that marks their item claimed.

### Context

This is the last sprint in Swap Board v1 and the one that delivers the button. Sprints 1 and 2 built everything under it: a deployed app with a proven database connection, an `items` table whose `claim_token` column has been populated with 128 bits of CSPRNG entropy since the first row, and a board that renders. Nothing in this sprint requires a migration or a schema change — the column has been sitting there unused on purpose, so that this sprint is a feature sprint rather than a data-model sprint.

The single most consequential line here is the one that changes sprint 2's rule. Sprint 2 stated, absolutely and with no exception, that `claim_token` never leaves the database. That was deliberate: a flat invariant is trivial for QA1 to audit, because any occurrence anywhere is a defect with nothing to reason about. This sprint carves exactly one hole in it — the `POST /api/items` response — and the whole security posture of the feature is that the hole stays exactly that size. Every acceptance criterion below that mentions the token is really checking the same thing: that the exception is one path wide.

### Requirements

1. **`POST /api/items` returns `claim_token` in its response, and that is the only path in the system that ever does.** Sprint 2's invariant otherwise stands unchanged: the token must still never appear in any `GET` response, in the board's HTML, in any client payload rendered for a visitor who did not just post, in any log line, or in any error message.

2. **After a successful post, the UI displays the claim link and tells the user plainly that it will not be shown again.** The link must be selectable and copyable as text — not only a clickable anchor, since the entire value of the link is that the poster keeps a copy of it somewhere. The warning is part of the requirement, not decoration: a secret shown once with no indication that it is a secret shown once is a support burden by design.

3. **A claim page at a token-bearing route** (`/claim/<token>` or equivalent) that looks the item up **by token**, not by id-plus-token. Looking up by id first and comparing the token afterward creates a path where a wrong token and a real id can be distinguished from a wrong id — see requirement 5.

4. **The claim page shows the item and one button** that marks it claimed. No edit fields, no delete, no unclaim.

5. **An invalid, unknown, or malformed token is indistinguishable from a valid token for an item that does not exist.** Both produce the same generic "not found" response, with the same status code and the same body. Nothing in the response, the status, or the timing may reveal whether a given item id exists or whether a token was close to correct. This is what stops the claim URL space from being probed.

6. **Marking an item claimed requires the token, is a write, and is idempotent.** Clicking the button twice, or replaying the request, leaves the item claimed and does not error. The write must not be reachable by a `GET` — a claim must never fire from a link preview, a prefetch, or a crawler following the URL.

7. **Claiming is one-way.** There is no unclaim path, in the API or the UI.

8. **The board renders claimed items as visibly claimed**, and they remain on the board rather than disappearing. A claimed item's contact email remains visible. Claimed state must be distinguishable **without relying on color alone** — a text label, strikethrough, or equivalent — so it reads correctly for a colorblind viewer and in a screenshot.

9. **The claim page must not leak its own URL onward.** It sends `X-Robots-Tag: noindex` (or an equivalent meta directive) so the token never enters a search index, and `Referrer-Policy: no-referrer` so the token is not transmitted in a `Referer` header by any outbound navigation. A secret carried in a URL path is the accepted trade-off of this design; these two headers are the mitigations that make it acceptable.

10. **A database failure on the claim page surfaces as an error, never as "not found."** This is sprint 2's Requirement 11 in its third and most dangerous location. Requirement 5 deliberately makes "not found" the answer to every invalid token — which means an unreachable database, if its error falls through to the same generic response, tells a poster holding a perfectly valid link that their item does not exist. The two cases must be distinguishable **to the user**, while requirement 5's indistinguishability between bad-token and no-such-item is preserved. No failure response may contain a connection string, host, credential, or driver stack trace.

11. **The claim confirmation is reflected on the board.** After claiming, the board shows that item as claimed to a different visitor on their next load, with no rebuild — the same cold-client property sprint 2 required of newly posted items.

### Acceptance Criteria

**QA1 (static audit — reads the diff, never a browser):**

- Req 1: The central check of this sprint. Enumerate every path that emits item data and confirm exactly one — the `POST /api/items` success response — includes `claim_token`. Confirm the board query and the claim page's own rendering both still exclude it; a claim page that ships the token into client-side props is a leak even though the viewer already has it in their URL, because it widens the hole beyond one path. Confirm no `SELECT *` feeds a response, and no logger receives a whole item object.
- Req 3/5: Read the lookup. Confirm it queries by token. Confirm every failure mode — unknown token, malformed token, valid token on a deleted row — returns an identical status and body, constructed in one place rather than assembled separately per branch. Separate branches producing "the same" response by coincidence is a defect waiting to drift apart; say so if that's what the code does.
- Req 6: Confirm the claim write is not reachable via `GET`. Confirm the update is idempotent at the database level — a conditional update or an unconditional set, not a read-then-write that could double-apply or clobber. Confirm the token is verified server-side on the write itself, not only when rendering the page that holds the button.
- Req 7: Confirm no route, handler, or client call sets `claimed` back to false.
- Req 9: Confirm both headers are actually emitted for the claim route. Header presence is a static fact; that they arrive is LiveQA's.
- Req 10: Trace the claim page's catch path. Confirm a thrown database error cannot fall through into the generic not-found response from requirement 5. This is the one place in this sprint where two requirements pull against each other, and the code has to satisfy both — check it deliberately rather than confirming each in isolation.
- Req 8: Confirm claimed state is conveyed by something other than color alone.
- Sprint-file re-read: per `qa1.md`, re-read this file immediately before recording the verdict.

**LiveQA (live test against the deployed URL, after Pipeman has pushed):**

- Req 1/2: Post an item on the live URL. Capture the returned token. Confirm the claim link is displayed and that its text is copyable. Then fetch the board API and the board HTML as a **different, cold client** and search both for that exact token value — zero occurrences required.
- Req 3/4/6: Open the claim link, click the button, confirm the item is marked claimed. Click again (or replay the request) and confirm it stays claimed with no error.
- Req 5: Request the claim route with a made-up token, a malformed token, and a token that is one character off from the real one. Confirm all three return **byte-identical** responses and the same status. Compare the bodies directly rather than eyeballing that both "look like a 404."
- Req 6: Confirm the claim write cannot be triggered by a `GET` to the claim URL — loading the page must not claim the item. Post a fresh item, load its claim page, and confirm it is still unclaimed before any button is pressed.
- Req 9: Check response headers on the claim route for `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. Observed on the wire, not inferred from source.
- Req 8/11: After claiming, load the board as a cold client that has never seen the page and confirm the item reads as claimed without a redeploy. Confirm the claimed indicator survives being read without color.
- Req 10: **Force a real database failure against the claim page and observe it.** Use the technique that worked twice on this project — a preview deployment with `DATABASE_URL` and `POSTGRES_URL` pointed at an unreachable host, never production. Confirm a valid claim URL under a dead database produces an **error state, not "not found"**, and that nothing leaks. This environment is known obtainable here: sprints 1 and 2 both cleared the equivalent criterion this way, and sprint 1's own record states plainly that a permission denial is *not* the "environment cannot be obtained" case. If it is blocked again, record exactly what was attempted and what blocked it, and name what would clear it — a bare assertion of untestability is not an acceptable outcome for this criterion.

### Out of Scope

- **Unclaim, edit, and delete.** Permanently out under "one list, one form, one button," not deferred. Requirement 7 states the one-way rule so it cannot be softened during the build.
- **Emailing the claim link to the poster.** The link is displayed once, as requirement 2 specifies. Sending mail means a mail provider, deliverability, bounce handling, and an address we have not verified belongs to the sender — a separate decision, not a convenience to fold in here.
- **Recovering a lost claim link.** There is no recovery path by design; the token is the only credential. If this proves to be a real support burden on a real board, that is evidence for a future decision, not a reason to weaken the token now.
- **Expiring or rotating tokens.**
- **Rate limiting on the claim endpoint.** Still out, consistent with sprint 2. Requirement 5's indistinguishable responses and 128 bits of entropy are what make the URL space impractical to probe; a rate limit would be defense in depth against a threat this board does not yet face.
- **Moderation, or any way to remove a posted item.** Explicitly unresolved rather than silently skipped — see the risk below. This is a decision owed before the board is shown to real users, and it is not this sprint's to make.
- **Clearing the LiveQA test data currently on the production board.** A one-time `DELETE` against Neon, outside the app, and still awaiting a decision.

### Dependencies

- **Blocks:** Nothing. This completes Swap Board v1.
- **Blocked by:** Sprint 2, which is closed — both gates PASS, completed 2026-09-21. The `claim_token` column, its CSPRNG generation, and the board are all live on commit `d06253a`.
- **External:** The Neon database and the Vercel deploy from `main`, both known working. **Requirement 10's live criterion needs a preview deployment with a poisoned database variable.** This has been the one recurring friction point in every sprint of this epic — it blocked sprint 1 at Req 7 and sprint 2 at Req 11, both times on a Claude Code auto-mode classifier denial reading a non-production `vercel deploy` as `[Production Deploy]`, and both times it was cleared by someone outside LiveQA's session standing the preview up. Expect to need it a third time; arranging it before the live test starts will save a round.

### Team Assignments

- **Dev Team 1:** All of it. Requirements 1–11.
- **Dev Team 2:** Not assigned. This sprint edits the same API surface and the same board page as sprint 2 did, and it is the only sprint in flight. Nothing here is independently parallelizable, and splitting one sprint across both teams is not what Dev Team 2 is for.

### Risks & Mitigations

- **The token exception grows beyond one path.** — The defining risk of this sprint. Sprint 2's invariant was written exception-free precisely so this sprint's single carve-out would be conspicuous. QA1 enumerates every emitting path rather than checking that the intended one is correct, and LiveQA hunts a known token value from a cold client.
- **Requirement 5 and requirement 10 pull against each other.** — Making every invalid token look identical is exactly what makes a database error look like a valid link gone bad. Satisfying one by breaking the other is the most likely way this sprint ships a subtle defect, so both QA1 and LiveQA check them together rather than separately, and the QA1 criterion says so explicitly.
- **A claim fires from a prefetch, crawler, or link preview.** — A `GET` that mutates is the classic form of this bug, and a claim URL pasted into a chat app is exactly the situation that triggers it. Requirement 6 forbids it and LiveQA tests it directly by loading the page and confirming the item is still unclaimed.
- **The token leaks through a search index or a `Referer` header.** — Requirement 9's two headers, verified on the wire rather than in source.
- **The preview-deployment permission denial blocks Req 10 for a third time.** — Named in Dependencies with the full history so it can be arranged up front instead of discovered at the gate. It has never once been an unobtainable environment on this project, and the criterion says so to foreclose the shortcut.
- **The board still has no way to remove anything.** — Out of scope here and genuinely unresolved. A public, unauthenticated board with no delete path and no moderation now has a permanent one-way claim flow on top of it. This is the last sprint in v1, so it is also the last chance to make that decision before v1 is a finished thing shown to people. Flagged here so closing this sprint does not quietly close the question with it.
