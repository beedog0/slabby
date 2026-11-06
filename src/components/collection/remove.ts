// Removing slabs is the one thing on home that can't be taken back, so it always asks first.
// The question comes up in the same themed sheet as the … menu; Cancel is the quiet way out.

import { gradeLabel, rowTitle } from '../../lib/format';
import { useDisplay } from '../../store/display';
import { useVault } from '../../store/vault';
import type { Card } from '../../types';
import { openMenu } from '../menu/Menu';

/** Ask, then remove. `then` runs just before the slabs go (leave select mode, or the card page). */
export function confirmRemove(cards: Card[], then?: () => void) {
  if (!cards.length) return;
  const one = cards.length === 1 ? cards[0] : null;
  const label = one ? 'Remove from vault' : `Remove ${cards.length} slabs`;
  openMenu({
    card: one ?? undefined,
    title: one ? `Remove ${rowTitle(one)}?` : `Remove ${cards.length} slabs?`,
    subtitle: one
      ? `${gradeLabel(one.grader, one.grade, one.condition)} · what you paid goes with it`
      : 'What you paid for them goes with them.',
    items: [{ label, onPress: () => removeSlabs(cards.map((c) => c.id), then) }],
  });
}

export function removeSlabs(ids: string[], then?: () => void) {
  const display = useDisplay.getState();
  if (display.pinnedId && ids.includes(display.pinnedId)) display.setPinned(null);
  if (display.order.some((id) => ids.includes(id))) display.setOrder(display.order.filter((id) => !ids.includes(id)));
  then?.();
  useVault.getState().remove(ids);
}
