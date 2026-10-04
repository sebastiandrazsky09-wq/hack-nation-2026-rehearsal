# Visual passes on the gate screens (lead)

Screenshots are under `.ops/redesign/` (not committed): `gate-before-*` (production and the earlier local build), `gate-pass1-*`, `gate-pass2-*`, `gate-pass3-*`. Each pass rendered real states picked through the API by attribute (`.ops/sweep.mjs`), at 1440x900 and 390x844, pass 3 also at 1024x768.

## Pass 1, function: input, decision, reason, evidence within five seconds
Seen on the worker's first build: input and decision read at once, but the sentence that proves the decision sat four sections down, below the fold. The BLOCK sentence said "a rule ... prohibit". A REQUIRE listed its duties twice (determining table and "Before proceeding") and did not show the limit the request stayed within. A REVIEW repeated the engine's long explanation in two sections. The action select cut its own label off. Change points were eight full-width buttons. On the phone the nav cut "Law changes" mid-word.
Fixed: one determining row per rule, carrying the quoted sentence and its source link, so the first viewport answers what, where, when, decision, why and which source. Sentences agree in number. Satisfied limits are listed for REQUIRE and PASS. Review points are grouped under the rule's name. Short action labels in the select with the full definition under it. Change points are a compact dated schedule. Short nav labels on phones, full names kept as the accessible names.

## Pass 2, hierarchy and density
Seen: "prohibits this action" said three times in one row (title, detail, effect). "No known coverage gap" in every summary and again in Coverage. A fact input offered for a fact no rule asked for. Columns shifted between states.
Fixed: the detail line stays only where it carries a figure. The coverage sentence stays in the summary only for PASS (where it bounds the claim) and inside a known gap. A fact input appears only where the gate asks for that fact, marked "needed for this check". Change points run in date order down the columns. The decision word is the only element above 20px.

## Pass 3, product specificity and residue
Seen: fixed column widths crushed the rule column to one word per line at 1024px. The phone Portfolio's number field collapsed. Forbidden-list sweep of the stylesheets: two gradients (the open start of an undated rule line and its legend) and three shadows outside the system's two.
Fixed: the proving quote has its own full-width row under its rule. Number field height restored. The undated line now starts with an open ring instead of a fade; the slider thumb and tracking dots lost their shadows. Stylesheets now contain no gradient, blur or glass, no animation other than the two 900 ms change tints, and the two shadows `docs/DESIGN.md` allows.
With the name removed the screens still read as this product: a decision word, the statute's own sentence in a serif, a per-rule trace, and a dated schedule of when the answer changes.

## State sweep
`.ops/sweep.mjs` renders nineteen states at three sizes (default, BLOCK, conditional REVIEW, PASS before a law takes effect, known-gap REVIEW, conflict, missing fact, fact supplied, amount lowered to REQUIRE, a limit that cannot be computed, unknown property, portfolio at two dates and with a parameter, record, changes, system). No horizontal overflow and no console error in any of them.
