"use client";

import { useState, type FormEvent } from "react";
import type { Item } from "@/lib/items";

interface BoardProps {
  initialItems: Item[];
  initialLoadError: boolean;
}

// Req 10: price_cents of 0 renders as "Free"; anything else renders as a
// currency amount with two decimal places.
function formatPrice(cents: number): string {
  if (cents === 0) {
    return "Free";
  }
  return `$${(cents / 100).toFixed(2)}`;
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
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
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
          // its own, per Req 6.
          price: price.trim() === "" ? null : price,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Req 9: on validation failure, the user's typed input is left
        // exactly as it is — nothing here clears title/price/email.
        setFormError(
          typeof data?.error === "string" ? data.error : "Something went wrong."
        );
        return;
      }

      // Req 9: the new item appears in the list without a manual page
      // refresh — prepended locally rather than waiting on a refetch.
      setItems((previous) => [data.item as Item, ...previous]);
      setTitle("");
      setPrice("");
      setEmail("");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
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
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Posting..." : "Post item"}
        </button>
      </form>

      <hr />

      {loadError ? (
        // Req 11: a database failure must surface as a visible error state,
        // never as an empty list a visitor can't distinguish from "no items
        // have been posted yet."
        <p role="alert">
          Could not load the board right now. Please try again later.
        </p>
      ) : items.length === 0 ? (
        <p>No items yet — be the first to post!</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {/* Req 10: title/email reach the DOM as plain text through
                  JSX interpolation — never dangerouslySetInnerHTML — so a
                  title containing markup displays as literal characters. */}
              <strong>{item.title}</strong> — {formatPrice(item.priceCents)} —{" "}
              <a href={`mailto:${item.email}`}>{item.email}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
