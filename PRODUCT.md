# PRODUCT — screens, flows, and phases

## The core moment

Bryan is at Collect-A-Con with a stack of slabs. Someone picks one up and says "what do you want for this?" Before he answers, he needs three numbers: his ask, the lowest he'll take, and what the market says. Slabby exists so that moment is a glance, not a Collectr scroll.

The same works in reverse at a dealer's table: target price and the most he'll pay.

## Screens (build in this order)

| # | Screen | Route | One thing it does | Reference |
| --- | --- | --- | --- | --- |
| 1 | Vault | `/` | Slab hero, vault value, "Start con mode", holds list | 01-vault.png |
| 2 | Scan | `/scan` | Camera decodes PSA QR → cert sheet → "Add to vault" | 02-scan.png |
| 3 | Slab detail | `/card/[id]` | Slab, value vs paid, 90-day chart, "More stats", comps row | 03-slab-detail.png |
| 4 | More stats | `/card/[id]/stats` | Stat lines with one-word verdicts and one-line context | 04-more-stats.png |
| 5 | Con mode | `/con` | Sold today, floor total, for-sale list with sparkline, ask and floor per card | 05-con-mode.png |
| 6 | Offer | `/con/offer/[id]` | Type their offer → verdict vs floor → Counter / Take | 06-offer.png |
| 7 | Before the table | `/con/table/[id]` | Selling: ask + walk-away. Buying: target + max. Price line. Per-card override | 07-before-the-table.png |
| 8 | Pricing rules | `/settings/pricing` | Default percentages, never-sell-at-a-loss, comp sources, rounding | 08-pricing-rules.png |

## Flows

**Add a slab**: Vault → scan icon → camera → QR decoded on device → cert number → cache check → PSA lookup on miss → sheet shows card, grade, pop, market, "what you paid", Hold/Sell → Add to vault → Slab detail.

**Sell at a con**: Vault → Start con mode → list of everything marked for sale with ask and floor → tap a card → Before the table (ask, walk-away) → "Got an offer" → type the number → Counter or Take → marked Sold with the price → con summary updates.

**Buy at a con**: Con mode → scan the dealer's slab → Before the table flips to Buying → target and max from rules → decide.

**Change a rule**: Pricing rules → adjust a percentage → every ask and floor recalculates → per-card overrides are kept.

## Stats and verdicts (More stats)

Each stat line is: name, value, one-word verdict (colored), a small graphic, one sentence of context. Verdicts compare this card to other cards of the same grade from the same set over 90 days.

| Stat | Source | Verdict scale |
| --- | --- | --- |
| Population | PSA pop report (not the public API) | Low / Average / High |
| Monthly sales | eBay sold count, 30d | Liquid / Slow / Stale |
| Price spread | eBay sold low–high, 30d | Tight / Fair / Wide |
| Gem rate | PSA 10 pop ÷ total graded | Low / Average / High |
| Raw vs graded | PSA 10 price ÷ raw NM | Healthy / Thin |
| Trend | 90-day slope | Rising / Flat / Falling |

An overall pill (Strong hold / Fair / Sell candidate) summarizes the lines. The rule set lives in `src/pricing/verdicts.ts` and is documented there.

## Phases

**Phase 1 — con-weekend MVP (first)**
Vault with mock data → Pricing rules → Con mode list → Before the table → Offer → Supabase persistence → PSA scan → eBay sold comps. Slab is a static PNG hero (frame 18) with the label drawn in Skia. No turntable yet.

**Phase 2 — the render**
Blender shell turntable, gyro tilt, drag-to-spin on detail, share card export, 90-day chart with real history.

**Phase 3 — stats and buying**
More stats with verdicts, pop data source, Buying mode, trade-only state, BGS/CGC manual add.

## Not building

Marketplace listings, in-app payments, social feed, Android, OCR of labels, raw-card condition grading.
