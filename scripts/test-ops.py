#!/usr/bin/env python3
"""Disposable-repo check of the task queue: bases, ownership, completion evidence, reissue, ports, candidate cleanup.
The claude and npm executables are replaced by local stubs; no model/API calls and no network."""
import importlib.util, json, os, pathlib, shutil, subprocess, tempfile
source = pathlib.Path(__file__).resolve().parent / 'ops.py'
# The stub worker prints its arguments and port to the task log, then acts out one scripted outcome.
CLAUDE = '''#!/bin/bash
printf 'ARGS %s\\n' "$*"; echo "E2E_PORT=$E2E_PORT"
id="$PLAYWRIGHT_CLI_SESSION"
commit() { git add -A && git commit -q -m "$1"; }
case "$FAKE_WORKER" in
  noop) ;;
  draft) echo draft > src/components/draft-$id.txt ;;
  commit) echo work > src/components/work-$id.txt; commit work ;;
  full) echo work > src/components/done-$id.txt; commit work; mkdir -p docs/handoffs; echo handoff > docs/handoffs/$id.md; commit handoff ;;
  fail) exit 3 ;;
esac
'''
NPM = '#!/bin/bash\n[ -n "$FAKE_NPM_FAIL" ] && [ "$1" = run ] && exit 1\nexit 0\n'
with tempfile.TemporaryDirectory(prefix='ops-test-') as directory:
    root = pathlib.Path(directory) / 'repo'; (root / 'scripts').mkdir(parents=True)
    stubs = pathlib.Path(directory) / 'bin'; stubs.mkdir()
    for name, body in (('claude', CLAUDE), ('npm', NPM)): (stubs / name).write_text(body); (stubs / name).chmod(0o755)
    shutil.copy2(source, root / 'scripts/ops.py')
    (root / '.gitignore').write_text('.ops/\n__pycache__/\n')
    (root / 'src/components').mkdir(parents=True)
    (root / 'src/components/base.txt').write_text('base\n')
    def git(*args, cwd=root): return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    def ops(*args, worker='noop', ok=True, npm_fail=False):
        env = {**os.environ, 'PATH': str(stubs) + os.pathsep + os.environ['PATH'], 'FAKE_WORKER': worker}
        if npm_fail: env['FAKE_NPM_FAIL'] = '1'
        result = subprocess.run(['python3', 'scripts/ops.py', *args], cwd=root, capture_output=True, text=True, env=env)
        assert (result.returncode == 0) == ok, (args, result.stdout, result.stderr)
        return result.stdout + result.stderr
    def state(task): return json.loads((root / '.ops/tasks' / (task + '.json')).read_text())
    def log(name): return (root / '.ops/logs' / name).read_text()
    def advance(name):
        (root / name).write_text(name + '\n'); git('add', '.'); git('commit', '-m', 'lead: ' + name); return git('rev-parse', 'HEAD')
    def candidates(): return [line for line in git('worktree', 'list').splitlines() if 'candidate-' in line]
    git('init', '-b', 'main'); git('config', 'user.name', 'Local test'); git('config', 'user.email', 'test@example.invalid')
    git('add', '.'); git('commit', '-m', 'base'); git('switch', '-c', 'integration')
    (root / 'src/components/base.txt').write_text('new integration\n'); git('add', '.'); git('commit', '-m', 'new base')
    current = git('rev-parse', 'HEAD')

    # Explicit base and ownership rejection.
    ops('task', 'fe-test', 'frontend', 'test ownership')
    data = state('fe-test'); worker = pathlib.Path(data['path'])
    assert data['base'] == current and git('rev-parse', 'HEAD', cwd=worker) == current and data['attempt'] == 1
    (worker / 'src/components/new.txt').write_text('owned\n'); git('add', '.', cwd=worker); git('commit', '-m', 'owned', cwd=worker)
    spec = importlib.util.spec_from_file_location('ops', root / 'scripts/ops.py'); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    assert module.check_owned(data) == ['src/components/new.txt']
    (worker / 'package.json').write_text('{}\n'); git('add', '.', cwd=worker); git('commit', '-m', 'out of scope', cwd=worker)
    try: module.check_owned(data)
    except RuntimeError as error: assert 'Ownership violation' in str(error)
    else: raise AssertionError('Out-of-owner file was accepted')
    git('worktree', 'remove', str(worker))

    # P0-1/P0-4: the worker prompt names the permitted command forms and the allowlist carries the read-only git commands.
    ops('task', 'a-noop', 'core', 'exit zero with nothing')
    out = ops('run', 'a-noop', worker='noop'); sent = log('a-noop.jsonl')
    for text in ('Permitted shell commands, and only these', 'npm test -- <path>', 'Not permitted', 'npx', 'A denied command is not a blocker'): assert text in sent, text
    for tool in ('Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git rev-parse*)'): assert tool in sent, tool
    for tool in ('Bash(npx', 'Bash(node', 'Bash(python', 'Bash(git push', 'Bash(git *)'): assert tool not in sent, tool
    # The prompt must not promise a command the allowlist lacks: every "git X" / "npm X" form it names is allowed.
    for form, tool in (('git log', 'Bash(git log*)'), ('git rev-parse', 'Bash(git rev-parse*)'), ('npm run <script>', 'Bash(npm run *)'), ('npm test -- <path>', 'Bash(npm test*)'), ('playwright-cli <args>', 'Bash(playwright-cli *)')):
        assert form in module.COMMANDS and tool in sent, form

    # P0-2: exit 0 is not a return without a new commit, a committed handoff, and a clean worktree.
    a = state('a-noop')
    assert a['exit_code'] == 0 and a['status'] == 'blocked' and 'exit 0 without completion evidence' in out
    assert any('no new commit' in gap for gap in a['missing']) and any('docs/handoffs/a-noop.md' in gap for gap in a['missing'])
    ops('merge', 'a-noop', ok=False)
    ops('task', 'b-draft', 'frontend', 'leave an uncommitted draft'); ops('run', 'b-draft', worker='draft'); b = state('b-draft')
    assert b['status'] == 'blocked' and any('uncommitted' in gap for gap in b['missing'])
    ops('task', 'c-commit', 'frontend', 'commit without a handoff'); ops('run', 'c-commit', worker='commit'); c = state('c-commit')
    assert c['status'] == 'blocked' and c['missing'] == ['no committed docs/handoffs/c-commit.md']
    ops('task', 'd-fail', 'frontend', 'non-zero exit'); ops('run', 'd-fail', worker='fail'); d = state('d-fail')
    assert d['status'] == 'blocked' and d['exit_code'] == 3 and d['missing'] == []
    ops('task', 'e-full', 'frontend', 'complete work'); ops('run', 'e-full', worker='full'); e = state('e-full')
    assert e['status'] == 'returned' and e['missing'] == []
    listing = ops('status'); assert 'MISSING: no new commit' in listing

    # P1-5: each run gets its own port, passed to the worker environment and named in its prompt.
    ports = {task: state(task)['e2e_port'] for task in ('a-noop', 'b-draft', 'c-commit', 'e-full')}
    assert len(set(ports.values())) == 4 and all(isinstance(p, int) and p != 3100 for p in ports.values())
    assert f'E2E_PORT={ports["a-noop"]}' in sent and f'--port {ports["a-noop"]}' in sent

    # P0-3: reissue keeps uncommitted work and prior commits, moves to current integration, keeps the old log, counts attempts.
    ops('run', 'a-noop', ok=False); ops('retry', 'e-full-missing', ok=False)
    moved = advance('lead-1.txt')
    first_log = log('b-draft.jsonl')
    ops('retry', 'b-draft'); b = state('b-draft'); draft = pathlib.Path(b['path'])
    assert b['status'] == 'created' and b['attempt'] == 2 and b['base'] == moved and git('rev-parse', 'HEAD', cwd=draft) == moved
    assert (draft / 'src/components/draft-b-draft.txt').read_text() == 'draft\n'
    assert b['attempts'] == [{'attempt': 1, 'base': current, 'head': current, 'status': 'blocked', 'log': 'b-draft.attempt1.jsonl',
                              'exit_code': 0, 'missing': b['attempts'][0]['missing'], 'started': b['attempts'][0]['started'], 'finished': b['attempts'][0]['finished']}]
    assert log('b-draft.attempt1.jsonl') == first_log and not (root / '.ops/logs/b-draft.jsonl').exists()
    for key in ('exit_code', 'missing', 'pid', 'started'): assert key not in b, key
    ops('run', 'b-draft', worker='full'); b = state('b-draft')
    assert b['status'] == 'returned' and 'This is attempt 2' in log('b-draft.jsonl') and log('b-draft.attempt1.jsonl') == first_log
    assert 'src/components/draft-b-draft.txt' in git('diff', '--name-only', moved, 'task/b-draft')
    # Prior commits are replayed onto the new base.
    ops('retry', 'c-commit'); c = state('c-commit')
    assert c['base'] == moved and git('rev-list', '--count', moved + '..task/c-commit') == '1'
    assert git('diff', '--name-only', moved, 'task/c-commit') == 'src/components/work-c-commit.txt'
    # A second attempt that adds nothing is still blocked, even though the branch already holds an earlier commit.
    ops('run', 'c-commit', worker='noop'); c = state('c-commit')
    assert c['status'] == 'blocked' and any('no new commit' in gap for gap in c['missing'])
    ops('retry', 'c-commit'); assert state('c-commit')['attempt'] == 3 and (root / '.ops/logs/c-commit.attempt2.jsonl').exists()
    # Work that conflicts with integration is refused and left untouched.
    (root / 'src/components/work-c-commit.txt').write_text('lead version\n'); conflict = advance('lead-2.txt')
    ops('run', 'c-commit', worker='noop'); before = git('rev-parse', 'task/c-commit')
    assert 'retry c-commit --fresh' in ops('retry', 'c-commit', ok=False)
    assert git('rev-parse', 'task/c-commit') == before and state('c-commit')['attempt'] == 3 and state('c-commit')['status'] == 'blocked'
    assert not git('status', '--porcelain', cwd=pathlib.Path(c['path']))
    # --fresh restarts from integration and keeps the old commits on a renamed branch.
    ops('retry', 'c-commit', '--fresh'); c = state('c-commit')
    assert c['attempt'] == 4 and c['base'] == conflict and git('rev-parse', 'task/c-commit') == conflict and git('rev-parse', 'task/c-commit-attempt3') == before
    # --fresh never discards uncommitted work.
    ops('task', 'f-dirty', 'frontend', 'dirty'); ops('run', 'f-dirty', worker='draft')
    assert 'uncommitted work' in ops('retry', 'f-dirty', '--fresh', ok=False)
    assert (pathlib.Path(state('f-dirty')['path']) / 'src/components/draft-f-dirty.txt').exists() and state('f-dirty')['attempt'] == 1
    # Only blocked or returned tasks are reissued.
    ops('task', 'g-new', 'frontend', 'never started'); ops('retry', 'g-new', ok=False)

    # P1-6: a failed candidate is retained; a successful one is removed; task worktrees are never touched.
    assert 'Candidate retained' in ops('merge', 'e-full', ok=False, npm_fail=True)
    kept = candidates(); assert len(kept) == 1 and state('e-full')['status'] == 'returned' and not (root / '.ops/integration.lock').exists()
    assert 'Integrated' in ops('merge', 'e-full')
    assert candidates() == kept and state('e-full')['status'] == 'integrated' and pathlib.Path(e['path']).exists()
    assert (root / 'src/components/done-e-full.txt').exists() and (root / 'docs/handoffs/e-full.md').exists()
    ops('retry', 'e-full', ok=False)
    # The reissued task integrates on top of the moved branch.
    assert 'Integrated' in ops('merge', 'b-draft') and candidates() == kept
    for task in ('b-draft', 'c-commit', 'f-dirty', 'a-noop'): assert pathlib.Path(state(task)['path']).exists(), task
print('Queue checks passed in a disposable repo: base, ownership, command prompt, completion evidence, reissue, ports, candidate cleanup.')
