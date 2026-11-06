// The con status sheet: For sale, Trade only, Sold, with a check on where the slab is now.
// For sale and Trade only apply at once; Sold asks for the price first. Used by the con quick add
// (from the vault or after a scan) and by a long press on a con row.

import { router } from 'expo-router';
import { CON_STATUS_LABEL, conStatusOf, conTabFor, planPatch, type ConStatus } from '../lib/conStatus';
import { useVault } from '../store/vault';
import type { Card } from '../types';
import { openSlabMenu, type MenuItem } from './menu/Menu';

/** Back to the con screen, on the tab the slab now lives on. */
export function backToCon(s: ConStatus) {
  router.dismissTo({ pathname: '/con', params: { tab: conTabFor(s), at: String(Date.now()) } });
}

/** `replace` swaps the current screen (the camera) for the Sold screen instead of stacking on it. */
export function setConStatus(card: Card, next: ConStatus, opts: { replace?: boolean } = {}) {
  if (next === 'sold') {
    if (opts.replace) router.replace(`/con/sold/${card.id}`);
    else router.push(`/con/sold/${card.id}`);
    return;
  }
  if (next === 'hold') useVault.getState().update(card.id, { plan: 'hold' });
  else useVault.getState().update(card.id, planPatch(next));
  backToCon(next);
}

export function openConStatusMenu(card: Card) {
  const now = conStatusOf(card);
  const item = (s: ConStatus): MenuItem => ({
    label: CON_STATUS_LABEL[s],
    selected: now === s,
    onPress: () => setConStatus(card, s),
  });
  const items: MenuItem[][] = [[item('sale'), item('trade'), item('sold')]];
  // A slab already on the table can go back to holds from here.
  if (now === 'sale' || now === 'trade') {
    items.push([{ label: 'Take off the table', onPress: () => setConStatus(card, 'hold') }]);
  }
  openSlabMenu(card, items);
}
