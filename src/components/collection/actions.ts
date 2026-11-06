// What tapping and long-pressing a slab does in the shelf and grid. Defaults: tap opens detail.

import type { CardRow } from '../../pricing/portfolio';

export type SlabActions = {
  onPress?: (row: CardRow) => void;
  onLongPress?: (row: CardRow) => void;
  /** While arranging: the slab picked first. Every other slab dims until the second tap. */
  selectedId?: string | null;
  /** The pinned favorite, marked with a pushpin. */
  pinnedId?: string | null;
};

export const dimmed = (a: SlabActions | undefined, r: CardRow) => !!a?.selectedId && a.selectedId !== r.card.id;
