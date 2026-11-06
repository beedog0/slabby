// Removing slabs happens right away (Bryan didn't want a confirm step); a bar at the bottom offers
// Undo for a few seconds, which puts the slabs back where they were, pin and shelf order included.

import { useDisplay } from '../../store/display';
import { useVault } from '../../store/vault';
import type { Card } from '../../types';
import { showUndo } from '../UndoBar';

/** Remove now, offer Undo. `then` runs just before the slabs go (leave select mode, or the card page). */
export function removeWithUndo(cards: Card[], then?: () => void) {
  if (!cards.length) return;
  const restore = removeSlabs(cards.map((c) => c.id), then);
  showUndo(cards.length === 1 ? 'Removed from vault' : `Removed ${cards.length} slabs`, restore);
}

/** Remove slabs, unpin and unorder them. Returns a function that puts everything back. */
export function removeSlabs(ids: string[], then?: () => void): () => void {
  const display = useDisplay.getState();
  const vault = useVault.getState();
  const before = { cards: vault.cards, pinnedId: display.pinnedId, order: display.order };
  if (display.pinnedId && ids.includes(display.pinnedId)) display.setPinned(null);
  if (display.order.some((id) => ids.includes(id))) display.setOrder(display.order.filter((id) => !ids.includes(id)));
  then?.();
  vault.remove(ids);

  return () => {
    const v = useVault.getState();
    const gone = new Map(before.cards.filter((c) => ids.includes(c.id)).map((c) => [c.id, c]));
    const now = new Set(v.cards.map((c) => c.id));
    // Back in their old places; anything added since keeps its spot at the front.
    const added = v.cards.filter((c) => !before.cards.some((b) => b.id === c.id));
    const kept = before.cards.filter((c) => now.has(c.id) || gone.has(c.id)).map((c) => (now.has(c.id) ? v.cards.find((x) => x.id === c.id)! : c));
    useVault.setState({ cards: [...added, ...kept] });
    v.clearRemoved(ids);
    const d = useDisplay.getState();
    if (before.pinnedId && ids.includes(before.pinnedId) && !d.pinnedId) d.setPinned(before.pinnedId);
    if (before.order.some((id) => ids.includes(id))) d.setOrder(before.order.filter((id) => now.has(id) || gone.has(id)));
  };
}
