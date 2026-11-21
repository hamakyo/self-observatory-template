# Observatory Cream Design

A restrained visual and verbal language for Self Observatory.

`self-observatory` uses this design system defined in `design/tokens.json`.

The objective is not to make output look "designed".
It is to remove everything that does not need to be there.

## Principles

### 1. Restraint over decoration

Prefer whitespace, proportion, typography, and composition over ornament.

Do not add visual elements merely to make empty space feel occupied.
Whitespace is intentional.

### 2. Cream Palette

Use the Cream palette as the default visual language.

| Token | Hex | Role |
| --- | --- | --- |
| Cream | `#FBF8F1` | Primary background |
| Ink | `#272626` | Primary text / strong contrast |
| Charcoal | `#49494B` | Secondary dark / illustration |
| Yellow | `#FADB6E` | Sparse accent |
| Blush | `#FBD8CB` | Sparse secondary accent |

Cream, Ink, and Charcoal should dominate.

Yellow and Blush are accents, not large-area decoration.

### 3. Typography

Use Helvetica Neue.

Preferred stack:

`"Helvetica Neue", Helvetica, Arial, sans-serif`

Do not use serif typefaces.

Typography should create hierarchy through size, weight, spacing, and placement before introducing decoration.

### 4. No AI Slop

Generated content should not advertise the fact that it was generated.

Avoid recurring visual clichés associated with generic AI-generated design:

- excessive gradients
- glow effects
- unnecessary drop shadows
- glassmorphism used as decoration
- neon blue/purple "AI" aesthetics
- excessive rounded cards
- decorative particles
- fake depth without functional purpose
- filling whitespace merely because it exists

Flat color, strong typography, clear geometry, and whitespace are preferred.

### 5. No AI-copy clichés

Avoid slogan structures that sound generically machine-generated.

Especially avoid constructions such as:

- 「AIが、未来を変える。」
- 「技術を、もっと身近に。」
- 「仕事に、新しい可能性を。」
- 「○○を、△△へ。」
- 「○○が、△△。」

Do not insert Japanese commas merely for dramatic rhythm.

Prefer direct statements with concrete meaning.

### 6. Content before style

The design should make the idea easier to understand.

If removing an effect, decoration, sentence, or element does not reduce understanding, removing it is usually preferable.

## Scope

This design language is the default, not an absolute constraint.

Individual projects may intentionally diverge when their context requires it. Such divergence should be deliberate rather than accidental.


## Self Observatory

The future Self Observatory GUI follows this design language by default.

Its visuals may be information-dense, but density must come from meaningful relationships rather than decoration. Graphs, timelines, diff views, review decay, and semantic maps should use the Cream palette as the base system and reserve Yellow / Blush for sparse semantic state or selection.

Avoid falling back to the conventional dark navy / neon blue / purple “AI dashboard” aesthetic. The interface should feel like an observatory, archive, and instrument panel expressed through this visual language.
