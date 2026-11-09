# Scan backtest

Measures how well and how fast the scan screen identifies cards, off the phone, with the app's
own code: the Vision text reader and card finder (`modules/label-reader/ios/CardFinder.swift`,
compiled into a Mac command), the parsers (`src/services/photoScan.ts`, `cardScan.ts`) and the
art matcher (`src/services/artMatch.ts` against the live `match_card_art`).

Runs on a Mac with internet (the cloud sandbox can't reach TCGCSV, TCGplayer's CDN or eBay).

```sh
# 1. A set: ~6 random sets × 3 cards from each of Pokémon EN, Pokémon JP, One Piece, Riftbound,
#    their catalog images, and up to 2 real eBay seller photos per card.
node scripts/backtest/build-set.mjs ~/slabby-backtest --sets 6 --per-set 3 --ebay 2

# 2. The scanner as a Mac command, then synthetic phone photos from the catalog images
#    (perspective, blur, white balance, glare, a toploader on every third).
swiftc -O modules/label-reader/ios/CardFinder.swift scripts/backtest/main.swift -o /tmp/slabby-scan
/tmp/slabby-scan synth ~/slabby-backtest

# 3. Read every photo the way Photo mode does (text, card finding, enlarged pieces), with timings.
/tmp/slabby-scan read ~/slabby-backtest/ebay  > ~/slabby-backtest/reads-ebay.jsonl
/tmp/slabby-scan read ~/slabby-backtest/synth > ~/slabby-backtest/reads-synth.jsonl

# 4. Score: what the app would answer for each photo. Needs the art fingerprints filled
#    (select * from art_status()) and the app's public Supabase URL and anon key (.env).
set -a; source .env; set +a
for r in ebay synth; do
  BACKTEST_DIR=~/slabby-backtest BACKTEST_READS=~/slabby-backtest/reads-$r.jsonl npx jest scripts/backtest
done
```

Each run writes `reads-*.jsonl.report.md`: right without asking (by number, by art, by the closer
look), in a pick list, wrong, missed; art top-1/top-5; time to answer p50/p90; and the art
distance of the right card vs the nearest wrong one, which is what `ART_SURE` / `ART_GAP` in
`src/services/artMatch.ts` are tuned from. Your own photos work too: put them in a folder named
`<productId>-<anything>.jpg` with the cards in `truth.json`.

The eBay photos are matched to cards by listing title (name and number), so a few may be a
different print of the same card; the scorer counts the same name and number as right.
