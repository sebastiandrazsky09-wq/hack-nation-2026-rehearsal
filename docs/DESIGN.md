# Ordinal design system

Not shipped to the browser. Describes the interface as built.

## Thesis
A point-in-time view of the law at one address. A judge has under a minute; the page must say what applies here, on this day, why, and what moves when the day moves. The category default (a search box over a stack of badge-and-text cards) is what this replaces.

The product's world is American statute research: citators that mark a law's status with a shape and a colour, annotated codes where the statute's own words sit beside notes about them, point-in-time views of legislation, and the assessor's property record. From that world the interface takes four things and nothing else: type, palette, density, and one signature move. Layout, navigation and controls stay standard.

## Signature move
Every rule is a line in time; the query date is a needle across all of them. A line starts with a tick where the source states an effective date, and with an open ring where it states none. A dashed lead-in runs from enactment to effect. A pending bill is dashed throughout. Where the needle meets a line, the mark shows the answer at this address on that day. Moving the needle re-asks the engine; answers that change are marked with what they were.

## Type
- **Libre Franklin** for everything Ordinal says: navigation, labels, answers, explanations, data. Weights 400, 500, 600, 700. Tabular numerals wherever dates or counts align.
- **Libre Caslon Text**, roman, only for text copied word for word from a source. Serif means "the law's own words"; nothing else is set in it.
- Fixed rem scale, ratio about 1.15: 12, 13, 15 (body), 17, 20, 24, 30. Body line height 1.5; headings 1.2; quoted law 17px on 1.6.
- No capitals for labels, no label above a heading, no italics for emphasis.

## Colour
Restrained, with colour doing jobs: the shell, the state of each answer, the needle.

| Name | Hex | Job |
|---|---|---|
| Bluebook navy | `#10213F` | Top bar, needle, primary button, focus |
| Ink | `#131C2B` | Text |
| Muted | `#55607A` | Secondary text |
| Bench | `#F2F4F8` | Query bar, time header, table heads |
| Rule line | `#D7DCE5` | Row and table separators |
| Applies | `#147A43` | In force and covers the address |
| Unknown | `#8A5700` on `#FFF3D1` | A needed fact is missing |
| Superseded | `#5A6577` | Covered, another rule governs |
| Not yet effective | `#1E5FD0` | Enacted, starts later |
| Pending | `#7446B8` | A bill or proposal, not law |
| Conflict | `#B3261E` | Flagged for human review |
| Link | `#1447B8` | Always underlined |

Every state has a shape as well as a colour: disc (applies), triangle (unknown), barred ring (superseded), ring (not yet effective), dashed ring (pending), flag (conflict).

## Space, shape, depth
- 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Page width 1200, gutters 24 (16 on phones).
- Rows and tables, not cards. Radius 3px on controls and tags, none on rows.
- One-pixel rule lines. Shadow only on the address suggestions and under the pinned time header.

## Icons
Authored SVG signal marks, 16px, one stroke weight. Lucide for search, link, chevron and external link at the same size and weight.

## Hierarchy
1. The answer sentence for this address and day.
2. Rule rows: signal, title, what the law requires, where it comes from, its line in time.
3. Evidence on demand: why, the quoted sentence, citation, source and retrieval date, conditions.

## Interaction
- Address: search field with suggestions; arrow keys move, Enter chooses, Escape closes. Four examples when nothing is chosen.
- Date: the needle (a native range input), a date field for exact entry, and one button per change-case date. All three set the same value.
- Rows expand in place; "Expand all evidence" opens every row. Result counts filter the list.
- Address, date and tab live in the URL.

## Motion
Answers to actions only. The needle follows the date with no easing, so it never lags a drag. A row whose answer changed is tinted once for 900ms and keeps a "was …" note. Rows dim only if a new date takes longer than about a tenth of a second to load. Nothing animates on load. Reduced-motion users get none of it.

## Responsive
Below 960px the time column is replaced by a sentence per rule ("takes effect 1 Jul 2027"); the needle gives way to the date field and case dates. Controls stack. Wide tables scroll inside their own frame; the page never scrolls sideways.

## States
Empty: what the product does and four real examples. Loading: placeholder rows, or the previous day's rows dimmed while the new day loads. Error: what failed and what to do. Unknown: the missing fact named in words. Conflict: a flag on the row and the reason. Low confidence: a mark beside the legal city and the reason.
