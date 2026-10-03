#!/usr/bin/env python3
"""Independent check of the three submission files against the official pack. Shares no code with the pipeline."""
import csv, glob, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'out'
PACK = ROOT / 'official/pack'
problems = []
def bad(msg): problems.append(msg)

schema = json.loads((PACK / 'schema/rule_record.schema.json').read_text())
rules_doc = json.loads((OUT / 'rules.json').read_text())
lookups_doc = json.loads((OUT / 'lookups.json').read_text())
changes = json.loads((OUT / 'changes.json').read_text())
rules = rules_doc.get('rules') if isinstance(rules_doc, dict) else None
if not isinstance(rules, list): bad('rules.json is not {"rules": [...]}'); rules = []

# 1. every record against the official schema (hand-rolled draft 2020-12 subset: required, enum, type, pattern, minLength, min/max, items)
def typed(value, t):
    types = t if isinstance(t, list) else [t]
    ok = {'string': isinstance(value, str), 'null': value is None, 'object': isinstance(value, dict), 'array': isinstance(value, list),
          'boolean': isinstance(value, bool), 'number': isinstance(value, (int, float)) and not isinstance(value, bool)}
    return any(ok.get(x, False) for x in types)
for r in rules:
    rid = r.get('team_rule_id', '?')
    for key in schema['required']:
        if key not in r: bad(f'{rid}: missing required {key}')
    for key, value in r.items():
        spec = schema['properties'].get(key)
        if spec is None: bad(f'{rid}: key {key} is not in the official schema'); continue
        if 'enum' in spec and value not in spec['enum']: bad(f'{rid}: {key}={value!r} not in {spec["enum"]}')
        if 'type' in spec and not typed(value, spec['type']): bad(f'{rid}: {key} has the wrong type')
        if isinstance(value, str):
            if 'pattern' in spec and not re.search(spec['pattern'], value): bad(f'{rid}: {key}={value!r} does not match {spec["pattern"]}')
            if len(value) < spec.get('minLength', 0): bad(f'{rid}: {key} shorter than {spec["minLength"]}')
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if 'minimum' in spec and value < spec['minimum'] or 'maximum' in spec and value > spec['maximum']: bad(f'{rid}: {key} out of range')
        if isinstance(value, list) and 'items' in spec and not all(typed(v, spec['items'].get('type', 'string')) for v in value): bad(f'{rid}: {key} items have the wrong type')
ids = [r.get('team_rule_id') for r in rules]
if len(ids) != len(set(ids)): bad('duplicate team_rule_id')
for r in rules:
    for other in r.get('overrides', []):
        if other not in ids: bad(f'{r["team_rule_id"]}: overrides unknown rule {other}')

# 2. every quote is a literal substring of the file its source_doc_id names; URL and document agree
def source_text(doc_id):
    for pattern in (f'official/pack/corpus/text/{doc_id}.txt', f'supplemental/text/{doc_id}.txt', f'store/ingested/{doc_id}_*'):
        hits = sorted(glob.glob(str(ROOT / pattern)))
        if hits: return pathlib.Path(hits[0]).read_text(encoding='utf-8'), hits[0]
    return None, None
origin = {'official': 0, 'supplemental': 0, 'ingested': 0}
for r in rules:
    text, path = source_text(r.get('source_doc_id') or '')
    if text is None: bad(f'{r["team_rule_id"]}: no source file for {r.get("source_doc_id")}'); continue
    origin['official' if '/official/' in path else 'supplemental' if '/supplemental/' in path else 'ingested'] += 1
    if r['quoted_span'] not in text: bad(f'{r["team_rule_id"]}: quoted_span is not a literal substring of {pathlib.Path(path).name}')
    head = re.search(r'^SOURCE:[ \t]*(\S+)', text[:2000], re.M)
    if head and not head.group(1).startswith('ingested:') and head.group(1) != r['source_url']: bad(f'{r["team_rule_id"]}: source_url differs from the file header')

# 3. lookups: all 500 addresses, exact row shape, known rules, legal results
addresses = [row['address_id'] for row in csv.DictReader(open(PACK / 'data/sample_addresses.csv', encoding='utf-8-sig'))]
lookups = lookups_doc.get('lookups', {})
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(lookups_doc.get('as_of', ''))): bad('lookups.json has no as_of date')
if set(lookups) != set(addresses): bad(f'lookups cover {len(lookups)} ids, expected the {len(addresses)} sample addresses (missing {len(set(addresses) - set(lookups))}, extra {len(set(lookups) - set(addresses))})')
status = {r['team_rule_id']: r['status'] for r in rules}
RESULTS = {'applies', 'unknown', 'superseded', 'not_yet_effective', 'pending'}
rows = 0; counts = {}
for address, entries in lookups.items():
    seen = set()
    for row in entries:
        rows += 1; counts[row.get('result')] = counts.get(row.get('result'), 0) + 1
        if set(row) != {'team_rule_id', 'result', 'explanation', 'conflict_flag'}: bad(f'{address}: row keys {sorted(row)}')
        rid = row.get('team_rule_id')
        if rid not in status: bad(f'{address}: unknown rule {rid}'); continue
        if rid in seen: bad(f'{address}: rule {rid} listed twice')
        seen.add(rid)
        if row.get('result') not in RESULTS: bad(f'{address}: result {row.get("result")!r}')
        if not isinstance(row.get('conflict_flag'), bool) or not isinstance(row.get('explanation'), str) or not row['explanation'].strip(): bad(f'{address}/{rid}: bad conflict_flag or empty explanation')
        s = status[rid]; res = row.get('result')
        if s in ('pending', 'failed') and res in ('applies', 'unknown', 'superseded'): bad(f'{address}/{rid}: {s} rule reported as {res}')
        if res == 'applies' and s != 'in_force': bad(f'{address}/{rid}: applies but status is {s}')
        if res == 'pending' and s != 'pending' or res == 'not_yet_effective' and s != 'not_yet_effective': bad(f'{address}/{rid}: result {res} but status is {s}')

# 4. changes: the official test ids, the three keys, sorted known addresses, flagged subset of the sample
tests = [t['test_id'] for t in json.loads((PACK / 'dev/change_tests.json').read_text())]
for t in tests:
    if t not in changes: bad(f'changes.json lacks {t}'); continue
    c = changes[t]
    if set(c) != {'affected_address_ids', 'conflict_flag_address_ids', 'notes'}: bad(f'{t}: keys {sorted(c)}')
    for key in ('affected_address_ids', 'conflict_flag_address_ids'):
        v = c.get(key, [])
        if v != sorted(set(v)): bad(f'{t}: {key} not sorted or has duplicates')
        if not set(v) <= set(addresses): bad(f'{t}: {key} has ids outside the sample')

print(json.dumps({'rules': len(rules), 'quote_sources': origin, 'lookup_addresses': len(lookups), 'lookup_rows': rows, 'results': counts,
                  'changes': {t: [len(changes[t]['affected_address_ids']), len(changes[t]['conflict_flag_address_ids'])] for t in tests if t in changes}, 'problems': len(problems)}, indent=1))
for p in problems[:40]: print('PROBLEM', p)
sys.exit(1 if problems else 0)
