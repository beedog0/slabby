# SLAB ASSET BRIEF — Blender

One Blender model of a PSA-style slab, rendered once as a transparent shell and composited with each card's photo and label data in the app. The real cert, grade and barcode are drawn from PSA's data, never baked into the render.

## The object

A faithful PSA-proportion slab, thin case, square-ish corners. It is the user's slab, not a Slabby-branded one.

| Part | Spec |
| --- | --- |
| Outer size | 83.9 × 134.6 mm (aspect 0.646); model at real scale |
| Corner radius | 1.5 mm |
| Case thickness | 8 mm total; two halves with a 0.1 mm seam at mid-depth |
| Edge bevel | 0.3 mm, all outer edges |
| Frame inset | 3.5 mm from outer edge to label pocket and card window |
| Label pocket | 18.5 mm tall, full inner width, flush with the front face |
| Card window | Starts 2 mm below the label; rebate 0.25 mm deeper than the label pocket |
| Grade well | Grade column of the label pocket 0.25 mm deeper, so the numeral sits in its own shallow well |

Label layout (left block, hairline, right block):

| Field | Size | Note |
| --- | --- | --- |
| Set and year | 11 pt caps, medium | 2023 POKEMON JPN SV2a |
| Card name and number | 11 pt, semibold | MEW ex #205 |
| Cert number | 10 pt, 55% opacity | from PSA data |
| Barcode | one small Code-128, bottom-left | no QR in the render |
| Grade descriptor | 8 pt tracked caps | GEM MT, MINT, NM-MT |
| Grade numeral | 34 pt Inter Tight bold | black for every grade, 10 included (label frame is red #D01C2A) |

The label is drawn in the app from data, so the render ships with an empty label pocket.

## Other companies and raw cards

| Case | Label | Grade mark | Geometry |
| --- | --- | --- | --- |
| PSA | White paper, black text | Red numeral for 10 | Base model |
| BGS | Black label, white text | Gold/silver/black pip by 9.5 / 10 / Pristine | Case 2 mm thicker |
| CGC | Blue-to-white label | Blue numeral | Base model |

Raw card: no slab. Bare card in a penny sleeve, faint matte sheen, no shadow lip, same card scale as the slabbed card.

## Camera, pose and lighting

Camera 85 mm perspective, slab ~70% of frame height. Yaw −7°, pitch +3°, roll 0. World plain white, strength 0.3.

| Light | Shape | Position | Power | Temp |
| --- | --- | --- | --- | --- |
| Key | 2 × 2 m area | 45° left, 40° up | 250 W | 5500 K |
| Fill | 3 × 3 m area | 30° right, level | 60 W | 5500 K |
| Rim | 0.3 × 2 m strip | behind and above | 400 W | 6000 K |
| Reflector | 4 × 4 m white plane | 0.3 m above | passive | — |

## Materials

| Surface | Shader | Values |
| --- | --- | --- |
| Acrylic case | Principled | Transmission 1.0, IOR 1.49, Roughness 0.03, Bevel node 0.3 mm |
| Seam | Geometry | 0.1 mm gap between halves |
| Label paper | Principled | Roughness 0.65, Specular 0.3 |
| Label red | Shader color | #D01C2A on the shader, not baked |
| Card paper | Principled | Roughness 0.55, Specular 0.25 |
| Card foil (holo only) | Second Glossy layer | Roughness 0.15, Anisotropic 0.6, Facing weight into a hue ramp |

Card face and label are placeholders in Blender (neutral grey, empty white pocket).

## Render and export

Cycles, 512 samples, OpenImageDenoise, AgX, film transparent, 16-bit PNG with alpha.

| Output | Size | Use |
| --- | --- | --- |
| Hero turntable | 36 frames, yaw −17° to +3°, 1536 × 2352 each | Vault, detail (gyro/drag), share card |
| Hero static | Frame 18 | Fallback, first paint, Phase 1 |
| Thumbnail | 240 × 368, frame 18 | Rows |
| Masks | Per frame: label pocket and card window, 8-bit PNG | Where the app draws label and photo |
| UV map | 4 corner points per mask per frame, JSON | Perspective-correct compositing |

Ship as one WebP sprite sheet per size (~2.5 MB hero set), bundled with the app.

## Do not carry over from the CSS mock

- The white band across the card art; glare belongs on the case, clipped by the frame
- The grey radial stage; the canvas is white
- The fixed rainbow gradient on the card; foil only on foil cards, driven by the turntable
- The drawn label border; the edge comes from the paper slot
- The 6 px card drop shadow inside the case; use a 0.5 px contact shadow
- The checker QR and random barcode bars
- Blue and orange rim glows
