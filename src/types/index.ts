// Mirrors the Supabase schema in supabase/migrations. Money is always integer cents.

export type Grader = 'psa' | 'bgs' | 'cgc' | 'raw';
export type Game = 'pokemon' | 'onepiece' | 'riftbound';
export type Plan = 'hold' | 'sell' | 'trade';
export type CardStatus = 'owned' | 'sold';

export type Card = {
  id: string;
  /** Missing on cards saved before other games existed: those are Pokémon. See src/lib/games.ts. */
  game?: Game;
  certNumber: string | null;
  grader: Grader;
  grade: number | null;
  name: string;
  setName: string | null;
  setCode: string | null;
  number: string | null;
  /** PSA's Variety line: "PARALLEL", "MANGA", "SPECIAL ART RARE". One Piece and Riftbound reuse a
   *  card number across printings, so for them it is part of the card's identity. */
  variety?: string | null;
  language: string;
  year: number | null;
  imageFrontUrl: string | null;
  /** Placeholder art color until card photos are wired up. */
  artColor?: string;
  /** Raw cards only, e.g. "near mint". */
  condition?: string;
  paidCents: number | null;
  paidAt: string | null;
  plan: Plan;
  floorOverrideCents: number | null;
  askOverrideCents: number | null;
  status: CardStatus;
  soldCents: number | null;
  soldAt: string | null;
  soldWhere: string | null;
  createdAt: string;
};

export type PriceDaily = {
  cardKey: string;
  day: string;
  marketCents: number;
  lowCents: number;
  highCents: number;
  sales30d: number;
};

export type PricingRules = {
  askPct: number;
  floorPct: number;
  neverBelowPaid: boolean;
  buyTargetPct: number;
  buyMaxPct: number;
  roundToCents: number;
  gradedSource: 'ebay_sold';
  rawSource: 'tcgplayer_market';
};

export const DEFAULT_RULES: PricingRules = {
  askPct: 10,
  floorPct: -5,
  neverBelowPaid: true,
  buyTargetPct: -15,
  buyMaxPct: -5,
  roundToCents: 500,
  gradedSource: 'ebay_sold',
  rawSource: 'tcgplayer_market',
};

/** One sold listing (sales table, 0008). Only on PokemonPriceTracker's Business plan. */
export type Sale = {
  source: string; // 'ebay' | 'fanatics'
  listingId: string;
  soldDay: string; // "YYYY-MM-DD"
  soldAt: string | null;
  priceCents: number;
  kind: 'auction' | 'bin' | 'offer' | null;
  url: string | null;
};

/** One day with sales (sales_daily, 0008): count and average sold price. */
export type SalesDay = { day: string; sales: number; avgCents: number };

/** Recent sales for a card: individual listings when we have them, else daily averages. */
export type SalesResult = { kind: 'sales'; rows: Sale[] } | { kind: 'daily'; rows: SalesDay[] } | { kind: 'none' };
