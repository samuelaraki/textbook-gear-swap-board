---
id: 4
title: "Poster-initiated post removal"
epic: "Swap Board v1.1 — launch readiness"
status: in_progress
created: 2026-09-21T21:43:39+00:00
---

# Master Controller Sprint Definition — Sprint 4

**Epic:** Swap Board v1.1 — launch readiness. The two things that must be true before this board is shared campus-wide.
**Sprint Objective:** Let a poster permanently remove their own post, and their email with it, using the claim link they already hold.

### Context

V1 shipped a public board where anyone can post an email address and nobody can ever take one down. Marking an item claimed does not cover this — sprint 3's Requirement 8 deliberately keeps claimed items on the board with the contact email still visible, which is right for a swap board and wrong for someone who posted by mistake. With this board about to go campus-wide, "I put my email on a public page and I can't get it off" stops being a rough edge and becomes the thing you get asked about.

The reason this is a small sprint rather than a large one is that the hard part is already built. Sprint 3's claim page authenticates the poster with a 128-bit token, looks up by token, returns byte-identical responses for every failure, refuses to mutate on `GET`, and sends `noindex` and `no-referrer`. A removal button reuses every one of those properties unchanged. This sprint adds a button, a query, and a confirmation step — and deliberately does not add a new security model, a new route shape, or a new failure response.

### Requirements

1. **A removal action on the existing claim route, authorized by the same token, that performs a hard delete.** The row is removed from `items` entirely. A soft-delete flag is not acceptable here: the entire purpose is getting an email address off a public page, and a hidden row still holding that address does not achieve it.

2. **A "Remove this post" control on the claim page**, alongside the existing claim button. The board itself still has no removal control — only the token holder's page does.

3. **Removal requires an explicit confirmation step before it executes.** This is the only irreversible, destructive action in the product and it sits one click from a button people will click for an entirely different reason. A distinct confirm — a second click, a typed confirmation, or an interstitial — is required; a single click must never destroy the row.

4. **Removal is not reachable by `GET`.** Same rule and same reason as sprint 3's Requirement 6: a claim URL pasted into a chat app gets fetched by link previewers and crawlers, and a `GET` that deletes would destroy posts on sight.

5. **After removal, the claim link returns the identical generic not-found response that any invalid token returns.** No new response shape, no "this post was deleted" message — that message would confirm to a probe that a token was once valid, which is exactly what sprint 3's Requirement 5 exists to prevent. Deletion making the link indistinguishable from a bad token is the correct and simplest behavior.

6. **Removal works on both claimed and unclaimed items.** A poster who marked something claimed and then wants their email gone is the most likely real user of this feature.

7. **The removed item disappears from the board for a cold client on the next load**, with no redeploy — the same property sprints 2 and 3 required of new posts and claimed state.

8. **A database failure during removal surfaces as an error, never as a success and never as "not found."** Fourth appearance of the same lesson, and the most consequential one yet: telling a user their post was removed when the delete did not commit leaves their email on a public board while they believe it is gone. No failure response may contain a connection string, host, credential, or driver stack trace.

9. **A committed runbook at `docs/runbook-remove-item.md`** documenting how the operator removes any post directly, with the exact SQL, how to identify the right row, and an explicit warning that it is irreversible. This is the deliberate alternative to an admin UI — an admin endpoint on this app would be the highest-value attack surface it owns, guarding against a threat a board this size does not face. The runbook is the moderation story for now; it is not a placeholder for a panel.

### Acceptance Criteria

**QA1 (static audit — reads the diff, never a browser):**

- Req 1: Confirm the delete is a real `DELETE` against the row, not an `UPDATE` setting a flag. Confirm nothing retains the email elsewhere — no audit table, no log line capturing the deleted row, no soft-delete column.
- Req 1/4: Confirm the removal handler verifies the token server-side on the write itself, not only when rendering the page holding the button. Confirm it is not wired to `GET`.
- Req 3: Confirm the confirmation step is enforced such that a single request cannot both request and perform the deletion without the user having confirmed. A confirm implemented only as a client-side `confirm()` dialog with an unguarded endpoint behind it does not satisfy this — say so if that is what the code does.
- Req 5: Confirm the post-deletion response is produced by the **same code path** that produces sprint 3's not-found, not a separate branch that happens to look similar. Two branches that must stay byte-identical will drift.
- Req 8: Trace the failure path. Confirm a thrown database error cannot reach the success response, and cannot fall through to the generic not-found. Confirm the delete's success is determined by the driver's reported row count or equivalent, not assumed because no exception was raised.
- Req 9: Confirm the runbook exists, contains runnable SQL, and its warning is present.
- Confirm sprint 3's existing guarantees are intact: `claim_token` still appears on no path but `POST /api/items`, and the claim route still sends `noindex` and `no-referrer`.
- Re-read this sprint file immediately before recording the verdict, per `qa1.md`.

**LiveQA (live test against the deployed URL, after Pipeman has pushed):**

- Req 1/2/3/6: Post an item, capture the claim link. Remove it through the UI and confirm the confirmation step is actually required — attempt the removal request **without** having confirmed and verify it does not delete. Repeat the whole flow on an item that was claimed first.
- Req 4: Load the claim page with a plain `GET`, including a `HEAD` request and a request with a link-previewer `User-Agent`, and confirm the item still exists afterward.
- Req 5: After removing an item, request its claim URL and compare the response **byte-for-byte** against the response for a made-up token. They must be identical in status, body, and any body-revealing headers. Compare directly rather than judging that both look like a 404.
- Req 7: Confirm the item is gone from the board for a client that has never loaded the page, with no redeploy.
- Req 1: Confirm via direct read-only SQL against Neon that the row is actually absent, not merely hidden. This is the only criterion that can distinguish a hard delete from a filtered soft delete, and the requirement turns on exactly that distinction.
- Req 8: **Force a real database failure against the removal path and observe it.** Preview deployment with `DATABASE_URL`/`POSTGRES_URL` pointed at an unreachable host, never production — the technique that cleared the equivalent criterion in sprints 1, 2, and 3. Confirm the user is told the removal failed, is not told it succeeded, and is not told the post does not exist. If blocked, record what was attempted and what would clear it; this environment has been obtained three times on this project and a bare assertion of untestability is not an acceptable outcome.

### Out of Scope

- **An admin or moderation UI.** Deliberately declined, not deferred — requirement 9's runbook is the decision, not a stopgap. Revisit only with real traffic and a real incident to design against.
- **Edit.** Still permanently out. Remove-and-repost is the path.
- **Undo, or any recovery of a removed post.** Hard delete means hard delete; requirement 3's confirmation is the protection.
- **Rate limiting the claim or removal endpoint.** Sprint 5 owns rate limiting and scopes it to `POST /api/items` only. Brute-forcing a 128-bit token is impractical, so the removal endpoint does not need it.
- **Notifying anyone that a post was removed.** No mail provider in this project; see sprint 3's Out of Scope.
- **Clearing the existing LiveQA test rows from production.** A one-time operational `DELETE`, not a code change — requirement 9's runbook is what makes it a documented action rather than an improvised one.

### Dependencies

- **Blocks:** Nothing. Sprint 5 runs in parallel and is independent.
- **Blocked by:** Sprint 3 (closed). Its claim route, token lookup, and not-found response are what this sprint extends.
- **External:** Neon and the Vercel deploy from `main`. **Requirement 8's live criterion needs a preview deployment with a poisoned database variable** — the recurring friction point in every sprint of this project, blocked three times by a Claude Code auto-mode classifier reading a non-production `vercel deploy` as `[Production Deploy]`, and cleared three times by someone outside LiveQA's session standing it up. Arrange it before the live test starts.
- **Parallel-work boundary:** this sprint **owns `lib/items.ts` and `app/claim/**`**. It must not touch `app/api/items/route.ts` or `app/page.tsx`, which belong to sprint 5.

### Team Assignments

- **Dev Team 1:** All of it. Requirements 1–9. Works in the primary checkout.
- **Dev Team 2:** Not assigned here — Dev Team 2 owns sprint 5, running at the same time, in its own worktree via `/sprint-worktree 5`. The split is genuinely independent and the ownership line is drawn by file: sprint 4 owns `lib/items.ts` and `app/claim/**`; sprint 5 owns `app/api/items/route.ts`, `app/page.tsx`, and any new rate-limit module. Neither sprint needs a schema change to a table the other reads. If either team finds it needs a file the other owns, stop and flag it rather than editing across the line.

### Risks & Mitigations

- **A success message when the delete did not commit.** — The worst outcome in this sprint: the user believes their email is off a public board and it is not. Requirement 8 states it, QA1 checks that success is determined by reported rows rather than absence of an exception, and LiveQA forces a real failure.
- **A soft delete shipped as a hard delete.** — Visually identical on the board and completely different for the person whose address it is. LiveQA checks the row's absence with direct SQL, which is the only check that can tell them apart.
- **The post-deletion response drifts from the generic not-found.** — QA1 checks they share a code path rather than merely matching today; LiveQA compares them byte-for-byte.
- **A link previewer deletes a post.** — Requirement 4, tested with a real `HEAD` request and a previewer `User-Agent` rather than only a browser `GET`.
- **Accidental destruction from a misclick.** — Requirement 3, and QA1 explicitly checks the confirmation is not merely a client-side dialog in front of an unguarded endpoint.
- **Two sprints in flight touching one small app.** — Ownership drawn by file path above, and Dev Team 2 in a separate worktree, which is what actually prevented collisions on this framework rather than overlap checks alone.
