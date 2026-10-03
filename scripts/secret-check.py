#!/usr/bin/env python3
"""Fast local guard, not a replacement for gitleaks on the release history."""
import pathlib, re, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[1]
git = subprocess.run(['git', 'ls-files', '-z'], cwd=root, capture_output=True)
paths = [root / p for p in git.stdout.decode().split('\0') if p] if git.returncode == 0 else [p for p in root.rglob('*') if p.is_file() and not any(x in p.parts for x in ('node_modules', '.next', '.ops', 'test-results', 'backups'))]
patterns = [re.compile(r'sk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}'), re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'), re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]
errors = []
for path in paths:
    rel = path.relative_to(root).as_posix()
    if rel.startswith('.env') and rel != '.env.example':
        if git.returncode == 0: errors.append(rel + ': tracked environment file')
        continue
    if not path.is_file() or path.stat().st_size > 2000000: continue
    body = path.read_text(errors='ignore')
    if any(p.search(body) for p in patterns): errors.append(rel + ': possible credential (value redacted)')
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('Basic secret guard passed; run gitleaks git --redact before publication.')
