# Slabby 2.0

A vault for graded Pokémon cards that tells you, before you walk up to a table, what to ask and the lowest you'll take. Read `CLAUDE.md` first, then `PRODUCT.md`, `DESIGN.md`, `TECH.md`, and `SLAB_ASSET_BRIEF.md`. Approved screens are in `reference-screens/`.

## Run

```bash
npm install
npm start          # Expo dev server; press i for the iOS simulator, w for web
npm test           # pricing engine unit tests
npm run typecheck
```

Every screen renders from `src/mocks/` with no network. `scripts/gen-mocks.js` regenerates the mock vault and 90-day price series.

## Layout

| Path | What |
| --- | --- |
| `app/` | Expo Router routes |
| `src/theme/tokens.ts` | Colors, type, spacing, shadows from DESIGN.md |
| `src/pricing/rules.ts` | Ask, floor, buy target, buy max, offer verdict, eBay net. Pure, tested |
| `src/pricing/portfolio.ts` | Per-row and vault-level derived numbers |
| `src/services/comps.ts` | Price reads (mock now, `price_daily` later) |
| `src/store/` | Zustand stores, persisted locally |
| `supabase/migrations/` | Schema and row-level security |
