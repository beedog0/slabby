// Con status changes outside the table sheet: the long-press sheet on a con row, and getting back
// to con mode from the scanner on the tab the slab went to.

import { router } from 'expo-router';
import { CON_STATUSES, CON_STATUS_LABEL, conStatusOf, conTabFor, planPatch, type ConStatus } from '../lib/conStatus';
import { useVault } from '../store/vault';
import type { Card } from '../types';
import { openSlabMenu } from './menu/Menu';

/** Back to the con screen, on the tab the slab now lives on, with that row flashed. */
export function backToCon(s: ConStatus, id?: string) {
  router.dismissTo({ pathname: '/con', params: { tab: conTabFor(s), flash: id ?? '', at: String(Date.now()) } });
}

/** Long-press on a con row: Hold, For sale, Trade only, Sold. Sold hands off for the price. */
export function openConStatusMenu(card: Card, opts: { onChanged: (s: ConStatus) => void; onSold: () => void }) {
  const now = conStatusOf(card);
  openSlabMenu(
    card,
    CON_STATUSES.map((s) => ({
      label: CON_STATUS_LABEL[s],
      selected: now === s,
      onPress: () => {
        if (s === 'sold') return opts.onSold();
        if (s === now) return;
        useVault.getState().update(card.id, planPatch(s));
        opts.onChanged(s);
      },
    })),
  );
}
