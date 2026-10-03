#!/usr/bin/env python3
"""Small task/worktree queue. Never pushes or deploys. Permissions are CLI permissions, not directory ACLs."""
import argparse, datetime, json, os, pathlib, re, shutil, signal, socket, subprocess, sys, tempfile, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
# Must describe the --allowedTools list in task_run exactly: a worker session cannot approve anything outside it.
COMMANDS = ('\nPermitted shell commands, and only these: npm run <script>; npm test -- <path>; playwright-cli <args>; git status; git diff; git log; git rev-parse; git add; git commit; rg; ls. '
            'Piping their output to head or tail is fine. Not permitted, and denied with no way to approve: npx, node, python, vitest or playwright invoked directly, heredoc/cat/sed file writes, and any other git subcommand. '
            'Create and edit files with the Write and Edit tools. Run one unit test file with npm test -- <path>. A denied command is not a blocker: switch to a permitted form and continue. '
            'Do not pass -q to git commit; read the implementation SHA with git rev-parse HEAD.')
STATE = ROOT / '.ops'
OWNERS = {
    'frontend': ['src/components/', 'src/app/globals.css', 'tests/e2e/'],
    'core': ['src/server/', 'src/app/api/', 'tests/unit/'],
    'research': ['docs/research/', 'docs/DEMO.md'],
    'qa': ['tests/', 'evals/cases.jsonl']
}
def run(args, cwd=ROOT, capture=False):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=capture)
def git(*args, cwd=ROOT): return run(['git', *args], cwd, True).stdout.strip()
def load(task): return json.loads((STATE / 'tasks' / (task + '.json')).read_text())
def save(task, data): (STATE / 'tasks' / (task + '.json')).write_text(json.dumps(data, indent=2) + '\n')
def task_path(data): return pathlib.Path(data['path'])
def clean(cwd):
    if git('status', '--porcelain', cwd=cwd): raise RuntimeError('Checkout must be clean before this operation')
def task_new(args):
    if not re.fullmatch(r'[a-z][a-z0-9-]{1,40}', args.id): raise RuntimeError('Use a short lowercase task ID')
    STATE.mkdir(exist_ok=True); (STATE / 'tasks').mkdir(exist_ok=True); (STATE / 'logs').mkdir(exist_ok=True)
    if (STATE / 'tasks' / (args.id + '.json')).exists(): raise RuntimeError('Task already exists')
    clean(ROOT)
    base = git('rev-parse', 'integration')
    path = ROOT.parent / ('work-' + args.id)
    run(['git', 'worktree', 'add', '-b', 'task/' + args.id, str(path), base])
    data = {'id': args.id, 'role': args.role, 'goal': args.goal, 'base': base, 'path': str(path), 'branch': 'task/' + args.id,
            'allowed': OWNERS[args.role] + ['docs/handoffs/' + args.id + '.md'],
            'acceptance': ['npm run check', 'Report manual or browser evidence for this task; do not claim unrun checks.'],
            'deadline_minutes': 12 if args.role == 'qa' else 25 if args.role == 'research' else 45, 'status': 'created', 'attempt': 1}
    save(args.id, data)
    print(json.dumps(data, indent=2)); print('Review the acceptance list in .ops/tasks/' + args.id + '.json, then: python3 scripts/ops.py run ' + args.id)
def missing_evidence(data):
    """An exit code is a process result. A writer has returned only with a new commit, a committed handoff, and a clean worktree."""
    gaps = []
    if git('rev-parse', data['branch']) == data.get('start_head', data['base']): gaps.append('no new commit on ' + data['branch'])
    handoff = 'docs/handoffs/' + data['id'] + '.md'
    if subprocess.run(['git', 'cat-file', '-e', data['branch'] + ':' + handoff], cwd=ROOT, capture_output=True).returncode: gaps.append('no committed ' + handoff)
    if git('status', '--porcelain', cwd=task_path(data)): gaps.append('uncommitted files left in worktree')
    return gaps
def task_retry(args):
    data = load(args.id); path = task_path(data); attempt = data.get('attempt', 1)
    if data['status'] not in ('blocked', 'returned'): raise RuntimeError('Only a blocked or returned task can be reissued')
    target = git('rev-parse', 'integration'); head = git('rev-parse', data['branch'])
    if args.fresh:
        # No --force: git refuses while the worktree holds uncommitted work. Prior commits stay on a renamed branch.
        try: run(['git', 'worktree', 'remove', str(path)], capture=True)
        except subprocess.CalledProcessError: raise RuntimeError('Worktree has uncommitted work; commit, move, or delete it before retry --fresh: ' + str(path))
        run(['git', 'branch', '-m', data['branch'], data['branch'] + '-attempt' + str(attempt)])
        run(['git', 'worktree', 'add', '-b', data['branch'], str(path), target])
    else:
        # Keep prior commits and uncommitted files, replayed onto current integration.
        try: run(['git', 'rebase', '--autostash', '--onto', target, data['base']], cwd=path, capture=True)
        except subprocess.CalledProcessError:
            subprocess.run(['git', 'rebase', '--abort'], cwd=path, capture_output=True)
            raise RuntimeError('Prior work does not apply to current integration. Inspect ' + str(path) + ' or reissue with: retry ' + args.id + ' --fresh')
    log = STATE / 'logs' / (args.id + '.jsonl'); kept = args.id + '.attempt' + str(attempt) + '.jsonl'
    if log.exists(): log.rename(STATE / 'logs' / kept)
    data.setdefault('attempts', []).append({'attempt': attempt, 'base': data['base'], 'head': head, 'status': data['status'], 'log': kept,
                                           **{k: data[k] for k in ('exit_code', 'missing', 'started', 'finished') if k in data}})
    for key in ('exit_code', 'missing', 'started', 'finished', 'pid', 'start_head', 'e2e_port'): data.pop(key, None)
    data.update(status='created', attempt=attempt + 1, base=target); save(args.id, data)
    print(f'{args.id}: attempt {attempt + 1} on {target}; prior log kept as {kept}. Review .ops/tasks/{args.id}.json, then: python3 scripts/ops.py run {args.id}')
def task_run(args):
    data = load(args.id); path = task_path(data)
    if data['status'] != 'created': raise RuntimeError('Only a newly created task can start; reissue a blocked or returned task with: retry ' + args.id)
    active = []
    for p in (STATE / 'tasks').glob('*.json'):
        d = json.loads(p.read_text())
        if d['status'] == 'running': active.append(d)
    if len(active) >= 3: raise RuntimeError('Three workers already active; the fourth slot is reserved for lead')
    if data['role'] in ('frontend', 'core') and sum(x['role'] in ('frontend', 'core') for x in active) >= 2:
        raise RuntimeError('Two implementation writers already active')
    run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=path)
    # .env.local is intentionally NOT copied to worker worktrees. Mocked/replay checks do not need credentials.
    # A free port per task, so two worktrees can run browser checks at once. The lead gate keeps the default.
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    data.update(start_head=git('rev-parse', data['branch']), e2e_port=port)
    prompt = json.dumps(data, indent=2) + '\nRead AGENTS.md and docs/CONTROL.md. Implement only the goal and allowed paths. Do not change dependencies, shared contracts, migrations, git configuration, or other worktrees. No push, deployment, external messages or purchases. Use replay/mocks for tests. Stop after 10 minutes without an observable advance and report the exact blocker. Write docs/handoffs/' + args.id + '.md with tested behavior, commands actually run, risks, and commit SHA. Commit only owned changes on your task branch. Do not call the task complete solely because tests are green.' + COMMANDS
    prompt += f' Port {port} is reserved for this task: npm run test:e2e already uses it. A manual dev server must use npm run dev -- --port {port} and be stopped before npm run test:e2e.'
    if data.get('attempt', 1) > 1: prompt += f' This is attempt {data["attempt"]}. Commits and uncommitted files already in this worktree are unreviewed prior work: verify them before relying on them. A new commit is required.'
    env = dict(os.environ)
    for key in ('ANTHROPIC_API_KEY', 'OPENAI_API_KEY'): env.pop(key, None)
    env['APP_MODE'] = 'replay'
    env['PLAYWRIGHT_CLI_SESSION'] = data['id']
    env['E2E_PORT'] = str(port)
    if data['role'] == 'qa':
        prompt = json.dumps(data, indent=2) + '\nRead-only independent review. Read AGENTS.md, CONTROL, contracts, and the code. Do not edit or commit. Return prioritized reproducible findings with file/line, observed evidence, actual checks, and limits. Treat the task as a review, not an instruction to implement its goal. Do not infer correctness from a green test suite. Your output is captured in the lead task log.'
        command = ['codex', 'exec', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="high"', '-s', 'read-only', '-C', str(path), '--json', prompt]
        if env.get('HACK_REVIEW_BILLING') == 'api':
            if not env.get('OPENAI_REVIEW_API_KEY'): raise RuntimeError('API review mode requires a separate OPENAI_REVIEW_API_KEY')
            command[2:2] = ['-c', 'model_provider="hackathon-api"', '-c', 'model_providers.hackathon-api.name="OpenAI review reserve"',
                            '-c', 'model_providers.hackathon-api.base_url="https://api.openai.com/v1"',
                            '-c', 'model_providers.hackathon-api.env_key="OPENAI_REVIEW_API_KEY"',
                            '-c', 'model_providers.hackathon-api.wire_api="responses"',
                            '-c', 'model_providers.hackathon-api.requires_openai_auth=false']
    else:
        env.pop('OPENAI_REVIEW_API_KEY', None)
        # Put the positional prompt before variadic --allowedTools, so it cannot be consumed as another tool name.
        command = ['claude', '-p', prompt + '\nClose your named Playwright session and temporary dev server before returning.', '--model', 'claude-sonnet-5-5', '--effort', 'medium', '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--output-format', 'stream-json', '--verbose',
                   '--allowedTools', 'Read,Write,Edit,Glob,Grep,WebFetch,' + ('WebSearch,' if data['role'] == 'research' else '') + 'Bash(npm run *),Bash(npm test*),Bash(playwright-cli *),Bash(git status*),Bash(git diff*),Bash(git log*),Bash(git rev-parse*),Bash(git add*),Bash(git commit*),Bash(rg *),Bash(ls *)']
    logpath = STATE / 'logs' / (args.id + '.jsonl')
    started = time.time(); data.update(status='running', started=started); save(args.id, data)
    with logpath.open('w') as output:
        proc = subprocess.Popen(command, cwd=path, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        data['pid'] = proc.pid; save(args.id, data)
        try: code = proc.wait(timeout=data['deadline_minutes'] * 60)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try: proc.wait(timeout=10)
            except subprocess.TimeoutExpired: os.killpg(proc.pid, signal.SIGKILL); proc.wait()
            code = 124
        # Stop any ordinary child dev/test process left in this task's process group.
        try: os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    missing = missing_evidence(data) if code == 0 and data['role'] != 'qa' else []
    data.update(status='returned' if code == 0 and not missing else 'blocked', exit_code=code, missing=missing, finished=time.time()); save(args.id, data)
    if missing: print(f'{args.id}: exit 0 without completion evidence: ' + '; '.join(missing), file=sys.stderr)
    print(f'{args.id}: {data["status"]}; inspect {logpath}. No automatic integration occurred.')
def check_owned(data):
    files = git('diff', '--name-only', data['base'], data['branch']).splitlines()
    if not files: raise RuntimeError('Task branch has no changes')
    bad = [p for p in files if not any(p == a or (a.endswith('/') and p.startswith(a)) for a in data['allowed'])]
    if bad: raise RuntimeError('Ownership violation: ' + ', '.join(bad))
    return files
def task_merge(args):
    data = load(args.id)
    if data['status'] not in ('returned', 'ready'): raise RuntimeError('Inspect the handoff; only returned/ready work can be integrated')
    clean(ROOT); clean(task_path(data)); files = check_owned(data)
    if git('branch', '--show-current') != 'integration': raise RuntimeError('Lead checkout must be on integration')
    lock = STATE / 'integration.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600); os.close(fd)
    candidate = pathlib.Path(tempfile.mkdtemp(prefix='candidate-')); candidate.rmdir(); integrated = False
    try:
        original = git('rev-parse', 'integration')
        run(['git', 'merge-base', '--is-ancestor', data['base'], data['branch']])
        run(['git', 'worktree', 'add', '--detach', str(candidate), original])
        commits = git('rev-list', '--reverse', data['base'] + '..' + data['branch']).splitlines()
        run(['git', 'cherry-pick', *commits], cwd=candidate)
        run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=candidate)
        for command in (['npm', 'run', 'check'], ['npm', 'run', 'build'], ['npm', 'run', 'test:e2e']): run(command, cwd=candidate)
        if git('rev-parse', 'integration') != original: raise RuntimeError('Integration moved while checking; rerun from the new base')
        run(['git', 'merge', '--ff-only', git('rev-parse', 'HEAD', cwd=candidate)])
        data.update(status='integrated', integrated=time.time()); save(args.id, data); integrated = True
        print('Integrated: ' + ', '.join(files))
    finally:
        # Only this run's own temporary candidate is removed, and only after it was integrated. A failed candidate is retained for inspection.
        if integrated: subprocess.run(['git', 'worktree', 'remove', '--force', str(candidate)], cwd=ROOT, capture_output=True)
        if candidate.exists(): print('Candidate retained at ' + str(candidate) + '; remove with git worktree remove after inspection')
        lock.unlink(missing_ok=True)
def status(args):
    if not (STATE / 'tasks').exists(): print('No dispatched tasks'); return
    for path in sorted((STATE / 'tasks').glob('*.json')):
        d = json.loads(path.read_text()); elapsed = int((time.time() - d.get('started', time.time())) / 60)
        log = STATE / 'logs' / (d['id'] + '.jsonl')
        idle = int((time.time() - log.stat().st_mtime) / 60) if log.exists() else 0
        attention = ' CHECK' if d['status'] == 'running' and idle >= 10 else ''
        note = '  MISSING: ' + '; '.join(d['missing']) if d.get('missing') else ''
        print(f'{d["id"]:<22} {d["role"]:<10} {d["status"]:<12} #{d.get("attempt", 1)} {elapsed:>3}m idle:{idle:>2}m{attention}  {d["path"]}{note}')
def main():
    parser = argparse.ArgumentParser(); sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('task'); p.add_argument('id'); p.add_argument('role', choices=OWNERS); p.add_argument('goal')
    for name in ('run', 'merge'): p = sub.add_parser(name); p.add_argument('id')
    p = sub.add_parser('retry'); p.add_argument('id'); p.add_argument('--fresh', action='store_true', help='discard the worktree and restart from integration; prior commits stay on task/ID-attemptN')
    sub.add_parser('status')
    args = parser.parse_args(); {'task': task_new, 'run': task_run, 'retry': task_retry, 'merge': task_merge, 'status': status}[args.command](args)
if __name__ == '__main__':
    try: main()
    except (RuntimeError, subprocess.CalledProcessError, FileExistsError) as error: print(str(error), file=sys.stderr); sys.exit(1)
