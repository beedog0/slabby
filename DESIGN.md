# DESIGN — tokens and rules

Taste references: Apple, Nothing, Daisy. Minimal but intentional. The slab is the only object with depth; everything else is type and hairlines.

## Color

| Token | Value | Use |
| --- | --- | --- |
| canvas | #FFFFFF | Page background, always |
| well | #F2F2F4 | Segmented controls, input fields, keypad background |
| ink | #0A0A0A | Text, primary buttons |
| secondary | #6E6E73 | Secondary text, labels |
| hairline | #E5E5EA | Dividers (1 px, inset to the text edge, never full-bleed) |
| gain | #1D9A5B | Positive numbers only |
| loss | #D9372B | Negative numbers, walk-away price |
| con | #B8650A text, #FFB020 dot/fill | Con mode indicator and the offer price line only |
| psaRed | #D01C2A | The grade "10" on a PSA label, nowhere else |

Rules: one accent (black). No gradients on UI. Green and red appear on numbers, never on buttons or backgrounds. Dark mode is deferred; when it comes, con mode may go true black.

## Type

Inter Tight for display and numbers, Inter for body. In the native build, SF Pro with `tabular-nums` is acceptable for both. All numerals tabular.

| Role | Size / weight / tracking | Example |
| --- | --- | --- |
| displayXL | 72 / 600 / -0.04em | Ask price on Before the table |
| displayL | 64 / 600 / -0.04em | Offer input |
| displayM | 48 / 600 / -0.035em | Vault value |
| displayS | 34 / 600 / -0.03em | Card value, con cash |
| title | 28 / 600 / -0.02em | Card name on detail |
| section | 20 / 600 / -0.02em | Section headings, app name |
| rowPrice | 22 / 600 / -0.02em | Ask in con mode rows |
| numberM | 17 / 600 | Row prices |
| body | 17 / 500 | Row titles |
| text | 15 / 400 | Body copy, row text |
| secondary | 13 / 400 | Secondary lines |
| caption | 12 / 400 | Price-line labels |

No tier below 12. Sentence case everywhere. No letter-spaced uppercase.

## Spacing and shape

- Base 4. Scale: 4, 8, 12, 16, 20, 32, 48.
- Page gutter 20. Section gap 32. Row heights: 64 (vault), 72–76 (con mode).
- Radii: 0 on rows, 14 on buttons and fields, 28 on sheets, 9 on segmented controls.
- Buttons: 52 tall, full width, black with white 17/600 text. One per screen.
- Touch targets ≥ 44.
- Elevation: none on UI. The only shadows in the app belong to the slab and to card thumbnails (`0 1px 3px rgba(0,0,0,0.18)`).

## The price line (signature component)

A 2 px rule with ticks. Used on Slab detail, Before the table, and Offer at the same size, and as a 56×24 sparkline-width variant in rows.

- Rule: hairline color; the filled portion (paid → current) is ink.
- Ticks: paid (ink, 2×10), floor (loss color, 2×14), market (secondary, 2×10), high comp (hairline, 2×10).
- Current/offer: a 12–14 px filled dot.
- Labels: caption size, name in secondary over its price in ink 600, under their ticks; the floor (and buying max) label uses loss color. Every marker shows its price. When two labels would touch, one moves above the line rather than being dropped; markers at the same price share one label ("Paid · Floor"). The dot's own label (Ask, Target, Sold) always stays under the line.
- High comp is not on Before the table; it lives on Slab detail.

## Sparklines

56×24, stroke 1.5, round caps. Color by 30-day trend: gain if up more than 3%, loss if down more than 3%, secondary otherwise.

## The slab on screen

- Vault hero: 190×292 pt, rotateY −7°, rotateX +3°, centered, 24 pt under the header. No backdrop. Ambient shadow fades out before the value number.
- Detail hero: 190×292 pt, same pose, drag to spin, gyro tilt ±10°.
- Row thumbnail: 36×50 pt, frame 18, contact shadow only.
- Shadows: contact `0 1px 2px rgba(0,0,0,0.14)` + `0 0 0 0.5px rgba(0,0,0,0.06)`; ambient `0 28px 48px -20px rgba(0,0,0,0.28)`.
- Raw cards: no slab, drawn in a penny sleeve at the same card scale.

## Motion

- Vault value and offer verdict: per-digit vertical roll, 320 ms spring. Nothing else animates on load.
- Entering con mode: 200 ms crossfade, light haptic.
- Offer dot crossing the floor tick: haptic detent; crossing paid: heavier detent.
- Scan success: the slab fades in from an outline.

## Copy

Short, specific, plain. "Up $640 this month", "Walk away under", "Keeps $50 · eBay nets $242 after fees". No exclamation marks, no "Great!", no empty-state jokes.
