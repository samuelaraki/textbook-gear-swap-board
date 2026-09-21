"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import type { CreatedItem, Item } from "@/lib/items";
import { formatPriceCents } from "@/lib/format";
import { HONEYPOT_FIELD_NAME } from "@/lib/spam-guard";

// Sprint 5, Req 5: off-screen positioning, not display:none/visibility:hidden
// and not a bare type="hidden". A naive bot's generic form-filler targets
// any present, normally-typed input regardless of computed style — the
// point is that the field still looks fillable to that kind of scraper.
// Combined with aria-hidden and tabIndex={-1} below, it is simultaneously
// invisible, untabbable, and unannounced for every real (human, keyboard,
// or screen-reader) user.
const honeypotStyle: CSSProperties = {
  position: "absolute",
  left: "-9999px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
};

interface BoardProps {
  initialItems: Item[];
  initialLoadError: boolean;
}

export function Board({ initialItems, initialLoadError }: BoardProps) {
  const [items, setItems] = useState<Item[]>(initialItems);
  // The server render's own failure (if any) is fixed at load time — this
  // component doesn't retry loading on its own, so there's nothing to set
  // it back to false for. A future POST failure is reported separately,
  // in formError below, not folded into this flag.
  const [loadError] = useState(initialLoadError);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState("");
  // Sprint 5, Req 5: never rendered visibly, never focusable, never
  // announced — see honeypotStyle above. A real browser submits this
  // empty because a real user never sees or reaches it; only something
  // filling in every input it finds in the DOM will populate it.
  const [honeypot, setHoneypot] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sprint 3, Req 2: the claim link is shown exactly once, right after a
  // successful post, and lives only in this component's own in-memory
  // state — never persisted, never refetched, never part of `items`. It
  // disappears on refresh because the server has nothing left to re-emit
  // it from (sprint 2's invariant, minus this one response).
  const [justPostedClaimUrl, setJustPostedClaimUrl] = useState<string | null>(
    null
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setJustPostedClaimUrl(null);
    setCopyStatus("idle");
    setSubmitting(true);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          // Sent as-typed (a string) when non-empty, so the server's own
          // parsing/validation is the single source of truth on what
          // counts as a valid price — this client never decides that on
          // its own, per sprint 2 Req 6.
          price: price.trim() === "" ? null : price,
          email,
          [HONEYPOT_FIELD_NAME]: honeypot,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Sprint 2, Req 9: on validation failure, the user's typed input
        // is left exactly as it is — nothing here clears title/price/email.
        setFormError(
          typeof data?.error === "string" ? data.error : "Something went wrong."
        );
        return;
      }

      // Sprint 3, Req 1: strip claimToken off before this item ever
      // touches `items` — the list state (and everything rendered from
      // it) must stay exactly as safe as an Item the board loaded from
      // GET, never carrying the one field a CreatedItem has that Item
      // doesn't.
      const createdItem = data.item as CreatedItem;
      const { claimToken, ...safeItem } = createdItem;
      setItems((previous) => [safeItem as Item, ...previous]);
      setJustPostedClaimUrl(`${window.location.origin}/claim/${claimToken}`);

      setTitle("");
      setPrice("");
      setEmail("");
      setHoneypot("");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyClaimUrl() {
    if (!justPostedClaimUrl) return;
    try {
      await navigator.clipboard.writeText(justPostedClaimUrl);
      setCopyStatus("copied");
    } catch {
      // Clipboard access can be denied/unavailable — the text field below
      // is still selectable and copyable by hand either way (Req 2), so
      // this failing is a convenience loss, not a requirement failure.
      setCopyStatus("failed");
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="item-title">Title</label>
          <br />
          <input
            id="item-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </div>
        <div>
          <label htmlFor="item-price">Price (USD)</label>
          <br />
          <input
            id="item-price"
            name="price"
            type="number"
            min={0}
            max={100000}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="item-email">Email</label>
          <br />
          <input
            id="item-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        {/* Sprint 5, Req 5: the honeypot field. No <label>, aria-hidden so
            assistive tech skips it entirely, tabIndex={-1} so keyboard
            users can never tab into it, and off-screen styling (above) so
            it is never visible — a real user cannot fill this in. */}
        <input
          type="text"
          name={HONEYPOT_FIELD_NAME}
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          style={honeypotStyle}
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="off"
        />
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Posting..." : "Post item"}
        </button>
      </form>

      {justPostedClaimUrl && (
        // Req 2: a secret shown once, with an explicit statement that it
        // is shown once, and selectable/copyable as text — not only a
        // clickable link, since the point is the poster keeps a copy.
        <div role="status">
          <p>
            <strong>Save this link now — it will not be shown again.</strong>{" "}
            Anyone who has it can mark this item claimed.
          </p>
          <input
            type="text"
            readOnly
            value={justPostedClaimUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={handleCopyClaimUrl}>
            Copy link
          </button>
          {copyStatus === "copied" && <span> Copied.</span>}
          {copyStatus === "failed" && (
            <span> Could not copy automatically — select the text above.</span>
          )}
        </div>
      )}

      <hr />

      {loadError ? (
        // Sprint 2, Req 11: a database failure must surface as a visible
        // error state, never as an empty list a visitor can't distinguish
        // from "no items have been posted yet."
        <p role="alert">
          Could not load the board right now. Please try again later.
        </p>
      ) : items.length === 0 ? (
        <p>No items yet — be the first to post!</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {/* Sprint 2, Req 10: title/email reach the DOM as plain text
                  through JSX interpolation — never dangerouslySetInnerHTML
                  — so a title containing markup displays as literal
                  characters. */}
              <strong
                style={item.claimed ? { textDecoration: "line-through" } : undefined}
              >
                {item.title}
              </strong>{" "}
              {/* Sprint 3, Req 8: claimed state is a text label, not a
                  color — reads correctly for a colorblind viewer and in a
                  black-and-white screenshot. The strikethrough above is a
                  second, redundant cue, not the only one. */}
              {item.claimed && <span>(Claimed)</span>} —{" "}
              {formatPriceCents(item.priceCents)} —{" "}
              <a href={`mailto:${item.email}`}>{item.email}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
