# Demo scripts (each video at most 60 seconds)

Run locally with `npm run build && npm run start`, or on the deployed URL. Every screen carries "Not legal advice".

## Demo video: what a user sees
| Seconds | Do | Say |
|---|---|---|
| 0–8 | Open the page. | "Type an address, pick a date, and Ordinal shows which rental rules apply there and the exact sentence of law behind each answer." |
| 8–20 | Search `SHERMAN GROVE`, pick A0107 (Los Angeles, built 1978). | "This building was built in 1978. Los Angeles rent stabilization covers buildings with a certificate of occupancy on or before October 1, 1978. A year alone cannot settle that, so the answer is unknown, and it says why. The state rent cap is unknown too, because it yields to the local rule." |
| 20–30 | Search `Bailey`, pick A0065 (mailing city Dorchester). | "The mailing city says Dorchester. The legal city is Boston, resolved with the Census Geocoder, so Boston's rules apply." |
| 30–45 | Search `CLINTON`, pick A0002 (Hoboken). Press 2027-07-02. | "Hoboken banned algorithmic rent-setting. New Jersey's statewide act is enacted but not yet effective; move the date past July 1, 2027 and it applies. Its text bars conflicting local ordinances, so both carry a conflict flag for human review." |
| 45–55 | Open "What is changing". | "The five official change cases, run by the same engine: 250 California addresses change for AB 325, the Massachusetts bills stay pending, the struck ballot question affects nobody." |
| 55–60 | Open one card's source link. | "Every answer links to its source and retrieval date." |

## Tech video: how it is produced
| Seconds | Do | Say |
|---|---|---|
| 0–10 | Terminal: `npm run ordinal -- demo`. | "The whole pipeline, replayed from the committed store with no model call: 66 documents, every rule with a quote found character for character in its source." |
| 10–25 | Show `store/rules.jsonl` for one rule, then the same quote in the source text file. | "A language model proposes structured rules. Code then checks each quote against the file, checks how each date is worded, and merges documents about the same law. The model never decides whether a rule applies." |
| 25–40 | Terminal: `rehearsal/run.sh rehearsal/synthetic_cambridge_2.txt 2027-04-02`. | "A law it has never seen: one command. It reads the jurisdiction, the category, the effective date written as 'the seventh month following passage', and the unit and age conditions, then lists the 48 Cambridge addresses that change. No code was edited." |
| 40–52 | Open "How it was produced" in the app; show the selfcheck. | "Selfcheck fails the build if a quote stops matching its source, a pending bill shows as in force, or two exports differ by a byte." |
| 52–60 | Show `out/` and `python3 scripts/verify-submission.py`. | "Three submission files, verified by an independent script against the official schema." |

## If the hour-16 document arrives
`npm run ordinal -- ingest PATH --case T6 && npm run ordinal -- demo`, then record the tech video's middle section on the real file. `--case T6` writes the change case for the new document (default date against the day after its effective date), so `changes.json` gains a T6 entry with no hand-edited JSON. Text, PDF, Word and HTML are accepted.

## Before recording
Seeded browser tab, terminal font large, `npm run ordinal -- demo` already run once (warm disk cache). Never show a fixture as live: the extraction replay says "replayed from cache" on screen.
