// Sprint 2, Req 6. Runs server-side in the route handler — the API is
// publicly reachable and anyone can POST to it directly, so client-side
// checks (which may also exist for UX) can never be the only gate.
//
// Also owns the dollars -> cents conversion (Req 2): callers get back an
// integer price_cents, never a float, and never have to do the conversion
// themselves elsewhere.

export interface ValidatedItemInput {
  title: string;
  priceCents: number;
  email: string;
}

export type ValidationResult =
  | { valid: true; data: ValidatedItemInput }
  | { valid: false; message: string };

const MAX_TITLE_LENGTH = 200;
const MAX_PRICE_DOLLARS = 100_000;

// Deliberately permissive (Req 6): this address is for a human to read and
// mail, not for the system to send to, so it only needs to look plausible.
// Over-strict validation here would reject real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePrice(price: unknown): number | null {
  if (typeof price === "number") {
    return price;
  }
  if (typeof price === "string" && price.trim().length > 0) {
    return Number(price);
  }
  // Covers missing, null, empty string, and any other non-numeric shape —
  // handled uniformly as "no usable price was given" rather than as NaN,
  // so the error message stays "Price is required" instead of the more
  // confusing "Price must be a valid number."
  return null;
}

export function validateItemInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { valid: false, message: "Request body must be a JSON object." };
  }
  const { title, price, email } = input as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return { valid: false, message: "Title is required." };
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    return {
      valid: false,
      message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    };
  }

  const parsedPrice = parsePrice(price);
  if (parsedPrice === null) {
    return { valid: false, message: "Price is required." };
  }
  // Number.isFinite (unlike the global isFinite) does not coerce first, so
  // it correctly rejects NaN and +/-Infinity without also being fooled by
  // non-numeric strings that coerce to a number some other way.
  if (!Number.isFinite(parsedPrice)) {
    return { valid: false, message: "Price must be a valid number." };
  }
  if (parsedPrice < 0) {
    return { valid: false, message: "Price cannot be negative." };
  }
  if (parsedPrice > MAX_PRICE_DOLLARS) {
    return {
      valid: false,
      message: `Price cannot exceed $${MAX_PRICE_DOLLARS.toLocaleString()}.`,
    };
  }

  if (typeof email !== "string" || email.trim().length === 0) {
    return { valid: false, message: "Email is required." };
  }
  const trimmedEmail = email.trim();
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return { valid: false, message: "Email does not look like a valid address." };
  }

  return {
    valid: true,
    data: {
      title: trimmedTitle,
      // Math.round, not truncation: parsedPrice * 100 can land a hair off
      // an exact integer from binary floating-point representation (e.g.
      // 19.99 * 100 === 1998.9999999999998), and rounding to the nearest
      // integer is what recovers the correct cent value for any input
      // given to 2 decimal places.
      priceCents: Math.round(parsedPrice * 100),
      email: trimmedEmail,
    },
  };
}
