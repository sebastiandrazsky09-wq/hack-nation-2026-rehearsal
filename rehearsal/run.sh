#!/usr/bin/env bash
# Rehearse ingestion of an unseen law in a throwaway copy of the store. The real store is never touched.
# Usage: rehearsal/run.sh rehearsal/synthetic_cambridge_1.txt [case-date-after]
set -euo pipefail
doc="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; after="${2:-}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
root="$(mktemp -d -t ordinal-rehearsal)"
cp -R "$repo/official" "$repo/supplemental" "$repo/store" "$root/"
cd "$repo"
echo "== clean copy at $root; source tree: $(git status --porcelain -- src | wc -l | tr -d ' ') uncommitted source changes"
ORDINAL_ROOT="$root" npm run --silent ordinal -- ingest "$doc" > "$root/ingest.json"
python3 - "$root" "$after" <<'PY'
import json, sys, pathlib
root = pathlib.Path(sys.argv[1]); after = sys.argv[2]
rep = json.loads(root.joinpath('ingest.json').read_text()); print('ingest:', {k: rep[k] for k in ('docs_processed', 'docs_failed', 'rules_total', 'rules_unverified', 'llm_calls', 'cache_hits')})
rules = [json.loads(l) for l in root.joinpath('store/rules.jsonl').read_text().splitlines()]
new = [r for r in rules if r['source_origin'] == 'ingested' and r['source_doc_id'] not in json.loads(pathlib.Path('store/ingested/index.json').read_text() if pathlib.Path('store/ingested/index.json').exists() else '{}')]
for r in new:
    print('rule:', r['team_rule_id'], '|', r['jurisdiction'], r['category'], r['legal_status'], 'enacted', r['enacted_date'], 'effective', r['effective_date'], '| verified', r['verified'], r['verification_method'])
    print('  coverage:', json.dumps(r['coverage']['requires']), 'exempt:', json.dumps(r['coverage']['exempt_if']))
    print('  quote:', r['quoted_span'][:160].replace('\n', ' '))
case = [{'test_id': 'REHEARSAL', 'title': 'Unseen law rehearsal', 'type': 'as_of' if after else 'boundary', 'source_doc_ids': sorted({r['source_doc_id'] for r in new}), **({'as_of_before': '2026-10-01', 'as_of_after': after} if after else {'as_of': '2026-10-01'})}]
root.joinpath('store/change_cases.json').write_text(json.dumps(case))
PY
ORDINAL_ROOT="$root" npm run --silent ordinal -- export > "$root/export.json"
ORDINAL_ROOT="$root" npm run --silent ordinal -- diff > "$root/diff.json" || true
ORDINAL_ROOT="$root" npm run --silent ordinal -- selfcheck > "$root/selfcheck.json" || true
python3 - "$root" <<'PY'
import json, sys, pathlib, collections
root = pathlib.Path(sys.argv[1])
ex = json.loads(root.joinpath('export.json').read_text()); print('export:', {k: ex[k] for k in ('rules', 'rules_withheld_unverified', 'lookup_rows', 'schema_errors')})
sc = json.loads(root.joinpath('selfcheck.json').read_text()); print('selfcheck ok:', sc['ok'], sc['failures'])
ch = json.loads(root.joinpath('out/changes.json').read_text())['REHEARSAL']; stacks = json.loads(root.joinpath('store/stacks.json').read_text())
print('affected:', len(ch['affected_address_ids']), dict(collections.Counter(stacks[a]['legal_city'] for a in ch['affected_address_ids'])))
print('notes:', ch['notes'])
PY
echo "== rehearsal store left at $root"
