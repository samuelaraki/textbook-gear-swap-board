# Runbook: remove a post directly (operator action)

This is the moderation path for this board. There is no admin UI and no
admin API endpoint, by deliberate decision (sprint 4's Out of Scope) —
an admin endpoint on this app would be the highest-value attack surface
it owns, defending against a threat a board this size does not face.
An operator with access to the Neon database performs removal directly
via SQL instead.

**This is irreversible.** `DELETE` here is a real, permanent removal —
there is no soft-delete flag, no audit table, and no undo. Confirm you
have the right row before running step 2. If you are not certain, stop
and re-check step 1 rather than guessing.

## 1. Identify the row

Connect to the production Neon database (`DATABASE_URL` is in the
Vercel project's Environment Variables; `vercel env pull .env.local`
from a linked checkout pulls it locally for `psql`/a Postgres client).

Find the item by whatever detail was reported — title, email, or an
approximate post time:

```sql
SELECT id, title, price_cents, email, claimed, created_at
FROM items
WHERE email ILIKE '%example.com%'
   OR title ILIKE '%some keyword%'
ORDER BY created_at DESC;
```

Confirm the `id` you intend to remove against that row's `title`,
`email`, and `created_at` before proceeding to step 2. Do not run step
2 against more than one row at a time.

## 2. Remove it

```sql
DELETE FROM items WHERE id = 123;  -- the id confirmed in step 1
```

Deliberately keyed on `id`, not `claim_token`: an operator performing a
moderation removal does not have, and should not need, the poster's
claim token. This is a separate path from the poster's own removal
(`app/claim/[token]/route.ts`), which is keyed on the token and is what
a poster uses to remove their own post — this runbook is for the case
where the poster doesn't or can't.

## 3. Confirm

```sql
SELECT id FROM items WHERE id = 123;
```

Zero rows confirms the removal actually took effect.
