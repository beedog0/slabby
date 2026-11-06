// Mirrors the Supabase schema in supabase/migrations. Money is always integer cents.

export type Grader = 'psa' | 'bgs' | 'cgc' | 'raw';
export type Game = 'pokemon' | 'onepiece' | 'riftbound';
export type Plan = 'hold' | 'sell' | 'trade';
export type CardStatus = 'owned' | 'sold';

export type Card = {
  id: string;
  /** Missing on cards saved before other games existed: those are Pokémon. */
  game?: Game;
  certNumber: string | null;
  grader: Grader;
  grade: number | null;
  name: string;
  setName: string | null;
  setCode: string | null;
  number: string | null;
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
