// Shared by components/board.tsx and components/claim-form.tsx so the two
// surfaces can't drift on what "Free" or "$19.99" means.
export function formatPriceCents(cents: number): string {
  if (cents === 0) {
    return "Free";
  }
  return `$${(cents / 100).toFixed(2)}`;
}
