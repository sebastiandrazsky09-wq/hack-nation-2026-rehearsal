#!/usr/bin/env python3
import datetime, pathlib, shutil, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'backups' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
out.mkdir(parents=True)
for path in ('docs/DEMO.md', 'docs/CONTROL.md', 'src/server/fixtures.ts', 'evals/cases.jsonl'):
    source = root / path
    if source.exists():
        target = out / path; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(source, target)
result = subprocess.run(['git', 'bundle', 'create', str(out / 'source.bundle'), '--all'], cwd=root)
(out / 'README.txt').write_text('Source/fixture backup. No credentials, cloud database snapshot, video, or deployed binary included. Store the real-run recording separately. Git bundle status: ' + str(result.returncode) + '\n')
print(out)
