import { listItems, type Item } from "@/lib/items";
import { Board } from "@/components/board";

// Req 8: same footgun as sprint 1's /api/health, second location — without
// this, the board (and the list of items baked into its HTML) can be
// statically rendered/cached at build time, and a newly posted item would
// never appear for a visitor served that frozen page.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let items: Item[] = [];
  let loadError = false;

  try {
    items = await listItems();
  } catch (error) {
    // Req 11: a database failure is reported as failure, never rendered as
    // an indistinguishable empty board. Full detail stays server-side.
    console.error("[page] failed to load items:", error);
    loadError = true;
  }

  return (
    <main>
      <h1>Textbook &amp; Gear Swap Board</h1>
      <Board initialItems={items} initialLoadError={loadError} />
    </main>
  );
}
