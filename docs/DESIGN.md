# Ordinal design system

Describes the interface as built. Not shipped to the browser.

## Position
A program proposes an action; Ordinal answers. The interface is that exchange made visible, and nothing else: the request as a sentence, the decision as one word, then why, then the sentence of law that proves it. The machinery (trace, coverage, every other quote, the raw request and response) is one press away and never in the way.

The references are developer and infrastructure products, not legal software and not dashboards: Linear and Vercel for restraint and type, Stripe and Resend for showing the API beside the product, and the policy playgrounds (Cedar, OPA) as the form-heavy pattern this avoids.

## Type
- **Host Grotesk** for everything. Weights 400, 500, 600. Headings are medium, not bold, with tight tracking.
- **Geist Mono** for ids, citations, dates in lists, and payloads.
- Scale: 12.5 and 13 (labels, meta), 14 to 16 (text), 21 to 22 (summary, quote, rule title), 30 (the request sentence), 44 (page titles), 64 (portfolio counts), and the decision word, which scales with its column from 64 to 136.
- No serif. A quoted sentence of law is set in the same face, larger, behind a black rule.

## Colour
Near-monochrome. White ground, `#0a0a0a` text, `#5c5c5c` and `#737373` for secondary text, `#ebebeb` hairlines. The only colour on a page is a decision or a rule-level answer.

| Decision | Shape | Display (large type, cells) | Text (small type) |
|---|---|---|---|
| BLOCK | filled square | `#E5342B` | `#DC2626` |
| REVIEW | triangle | `#DD7A00` | `#B45309` |
| REQUIRE | list mark | `#2563EB` | `#2563EB` |
| PASS | open ring, no fill, no tick | `#16A34A` | `#15803D` |

Large type needs 3:1 and small type 4.5:1; a browser test checks both on every screen. One dark surface exists: the API panel.

## Space and shape
- Page width 1240, gutters 32 (16 on phones). On the gate screens: a 112px label gutter, a text column, and a 392px rail.
- Sections are separated by space (44 to 64px), not by boxes. Hairlines separate rows.
- Radius 8 on controls, 12 on the API panel and the missing-fact field, 2 on grid cells. One shadow in the product: the address suggestions.
- On screens 1800px and wider everything is set 12% larger, for a room.

## Check
Four steps down the left gutter: Proposed action, Decision, Why, Evidence.
- **Proposed action.** A sentence. The actor, the action, its amount, the property and the date are the controls; the connecting words are grey. Under it, what the record holds about the building.
- **Decision.** The word with its shape, then one sentence, then the decision id, ruleset and time in mono. If a fact the caller can supply is missing, its field sits directly under the decision.
- **Why.** The rules that fixed the outcome: outcome, title, jurisdiction, citation. For REQUIRE, the duties.
- **Evidence.** The quoted sentence and where it came from.
- **Over time.** The date needle and the dated points where the law changes; each is one press.
- **More.** Closed until asked for: other unresolved points, duties, the per-rule trace, coverage.
- **The API panel** beside it: the exact request, the exact response, a curl. It updates with every change.

## Portfolio
The same sentence, for every property. Four large counts, the registry as a grid of cells by legal city (the decision shapes), the change points beside it, then a sortable table.

## Record, Law changes, System
The same shell, type and colour. Rule rows on a time scale, change cases with counts by city, the compile and decision planes with counted figures.

## Interaction and motion
Every change to the sentence re-checks. A superseded request is cancelled. The decision word fades in once when it changes and says what it was. Disclosures open in place. Reduced-motion users get none of the motion.

## Accessibility
Every control has a label (visually hidden where the sentence carries the meaning), focus is always outlined, the decision is a live region, and no state is carried by colour alone.
