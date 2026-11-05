# TECH — stack, data model, services, pricing engine

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK (latest), React Native, TypeScript, Expo Router | Matches existing Slabby; fast iteration |
| State | Zustand + TanStack Query | Local-first vault, cached server reads |
| Backend | Supabase: Postgres, Auth (Apple sign-in), Storage, Edge Functions | Already in use |
| Camera / QR | expo-camera (barcode scanner) | On-device QR decode, no network |
| Slab rendering | @shopify/react-native-skia | Composite shell frame + card photo + label text on the GPU |
| Motion | react-native-reanimated, expo-haptics, expo-sensors (gyro) | Digit rolls, detents, tilt |
| Charts | Skia paths (own code) | No chart library; 90-day line and sparklines are a few paths |
| Images | expo-image with disk cache, blurhash | Fast thumbnails |

## Data model (Supabase)

```sql
-- users: Supabase auth

create table slabs (   -- named cards in the original spec; renamed because Slabby 1.0 already owns cards
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  cert_number text,                 -- PSA cert, null for raw
  grader text check (grader in ('psa','bgs','cgc','raw')) not null default 'psa',
  grade numeric(3,1),               -- 10, 9.5, null for raw
  name text not null,               -- "Mew ex"
  set_name text,                    -- "151"
  set_code text,                    -- "SV2a"
  number text,                      -- "205"
  language text default 'en',
  year int,
  image_front_url text,
  image_back_url text,
  paid_cents int,
  paid_at date,
  plan text check (plan in ('hold','sell','trade')) default 'hold',
  floor_override_cents int,         -- per-card override of the rule
  ask_override_cents int,
  status text check (status in ('owned','sold')) default 'owned',
  sold_cents int,
  sold_at timestamptz,
  sold_where text,                  -- "Collect-A-Con Nov 2026"
  created_at timestamptz default now()
);

create table cert_cache (            -- shared across all users
  cert_number text primary key,
  grader text not null,
  payload jsonb not null,           -- raw PSA response
  fetched_at timestamptz default now()
);

create table price_points (          -- one row per comp observed
  id bigserial primary key,
  card_key text not null,           -- "psa:10:SV2a:205:ja" — identity independent of the user's copy
  source text check (source in ('ebay_sold','tcgplayer_market')) not null,
  price_cents int not null,
  observed_at timestamptz not null,
  listing_id text,
  unique (source, listing_id)
);

create table price_daily (           -- materialized by an edge function nightly
  card_key text not null,
  day date not null,
  market_cents int,                 -- median of ebay_sold trailing 30d
  low_cents int, high_cents int,
  sales_30d int,
  primary key (card_key, day)
);

create table pricing_rules (
  user_id uuid primary key references auth.users,
  ask_pct numeric default 10,       -- market +10%
  floor_pct numeric default -5,     -- 30d low −5%
  never_below_paid boolean default true,
  buy_target_pct numeric default -15,
  buy_max_pct numeric default -5,
  round_to_cents int default 500,
  graded_source text default 'ebay_sold',
  raw_source text default 'tcgplayer_market'
);

create table con_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  started_at timestamptz default now(),
  ended_at timestamptz
);
```

`card_key` is how two users holding the same card share price history. Build it from grader, grade, set code, number, and language.

## Services

### `services/psa.ts` — cert lookup, cache-first

1. Decode the QR on device. PSA label QRs encode a URL ending in the cert number; parse it with a regex, never navigate to it.
2. `select payload from cert_cache where cert_number = $1`. Hit → return.
3. Miss → `GET https://api.psacard.com/publicapi/cert/GetByCertNumber/{cert}` with `Authorization: bearer <token>` from an Edge Function (the token never ships in the app). Insert into `cert_cache`. Return.
4. The free key is reported at about 100 calls/day (HTTP 429 past it; no rate-limit headers). Count calls in the Edge Function and queue overflow for the next day with a "pending" state on the card. Confirm the limit on registration; paid tiers exist.
5. Population fields come back null on the public API. Pop is a separate source (Phase 3).

### `services/comps.ts` — price comps

> **Decision (2026-11-05):** comps come from the PokemonPriceTracker API (Bryan's API-plan key, 20k credits/day) instead of a direct eBay integration. Graded = eBay + Fanatics Collect sold per grade, as daily `{average, count}`; raw = TCGplayer market daily. It does not return individual listings, so `comps-nightly` writes `price_daily` directly (median and 10th/90th percentile of the trailing 30 days, weighted by sale count) and `price_points` stays unused for now. Cards map to TCGplayer product ids once via `card-match` into `card_refs`. Key: `PPT_API_KEY` Edge Function secret.


- Graded: eBay sold listings for the card_key over 30 days. Use the eBay Browse/Marketplace Insights API where access is granted; otherwise a scheduled scraper in an Edge Function with a 24 h cache. Store every sale as a `price_points` row. Market = median; low/high = 10th/90th percentile to drop outliers.
- Raw: TCGplayer market price via their API or the pokemontcg.io proxy. One row per day.
- Nightly Edge Function materializes `price_daily`. Screens read `price_daily`, never `price_points`.
- Comps never run on the scan path. Scan returns in one PSA round-trip; prices fill in when ready.

### `pricing/rules.ts` — pure functions, unit-tested

```ts
type Inputs = { marketCents: number; low30Cents: number; paidCents?: number; rules: PricingRules; overrides?: { floor?: number; ask?: number } };

export function ask(i: Inputs): number      // overrides.ask ?? round(market × (1 + ask_pct/100))
export function floor(i: Inputs): number    // overrides.floor ?? max(round(low30 × (1 + floor_pct/100)), never_below_paid ? paid : 0)
export function buyTarget(i: Inputs): number// round(market × (1 + buy_target_pct/100))
export function buyMax(i: Inputs): number   // round(market × (1 + buy_max_pct/100))
export function verdict(offerCents: number, i: Inputs): { kind: 'take' | 'counter' | 'pass'; delta: number; counterAt: number }
export function ebayNet(priceCents: number): number // price − 13.25% FVF − $0.30 − shipping estimate
```

Rounding: to `round_to_cents`, half-up. Floor can never exceed ask; if a rule produces that, floor = ask.

### `pricing/verdicts.ts` — stat verdicts

Thresholds per stat, compared within the same set and grade over 90 days. Each returns `{ label, tone: 'good' | 'neutral' | 'bad', sentence }`. Sentences are templated from numbers, not freeform.

## Slab rendering (Phase 2; Phase 1 uses one static frame)

- Assets bundled: `slab/psa/frames.webp` (36-frame sprite sheet, 1536×2352 per frame), `slab/psa/masks.webp` (label + window masks per frame), `slab/psa/uv.json` (4 corner points per mask per frame), plus BGS and CGC skins.
- Skia pipeline per draw: draw the shell frame → draw the card photo transformed into the window quad → draw the label (text + barcode) into the label quad → draw the shell's top-layer specular pass. All GPU, one frame.
- Frame index from gyro (±10° → frames 0–35) or drag. Rest frame 18.
- Thumbnails: pre-composited once per card at 240×368 and cached to disk.

## Security and keys

PSA token, eBay keys, TCGplayer keys live in Supabase Edge Function secrets only. Row-level security on every table keyed by `user_id`; `cert_cache`, `price_points`, `price_daily` are readable by all authenticated users, writable only by Edge Functions.

## Folder layout

```
app/                 Expo Router routes (see PRODUCT.md table)
src/theme/tokens.ts  colors, type, spacing from DESIGN.md
src/components/      PriceLine, Sparkline, SlabView, Row, Button, Segmented, Keypad
src/pricing/         rules.ts, verdicts.ts, __tests__/
src/services/        psa.ts, comps.ts, supabase.ts
src/store/           vault.ts, con.ts, rules.ts
src/mocks/           cards.json, prices.json
assets/slab/         frames, masks, uv
supabase/            migrations/, functions/ (psa-lookup, comps-nightly)
```
