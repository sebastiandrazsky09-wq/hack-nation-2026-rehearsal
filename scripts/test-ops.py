#!/usr/bin/env python3
"""Disposable-repo check of explicit integration bases and path rejection; no model/API calls."""
import importlib.util, json, pathlib, shutil, subprocess, tempfile
source = pathlib.Path(__file__).resolve().parent / 'ops.py'
with tempfile.TemporaryDirectory(prefix='ops-test-') as directory:
    root = pathlib.Path(directory) / 'repo'; (root / 'scripts').mkdir(parents=True)
    shutil.copy2(source, root / 'scripts/ops.py')
    (root / '.gitignore').write_text('.ops/\n')
    (root / 'src/components').mkdir(parents=True)
    (root / 'src/components/base.txt').write_text('base\n')
    def git(*args, cwd=root): return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    git('init', '-b', 'main'); git('config', 'user.name', 'Local test'); git('config', 'user.email', 'test@example.invalid')
    git('add', '.'); git('commit', '-m', 'base'); git('switch', '-c', 'integration')
    (root / 'src/components/base.txt').write_text('new integration\n'); git('add', '.'); git('commit', '-m', 'new base')
    current = git('rev-parse', 'HEAD')
    subprocess.run(['python3', 'scripts/ops.py', 'task', 'fe-test', 'frontend', 'test ownership'], cwd=root, check=True, capture_output=True)
    data = json.loads((root / '.ops/tasks/fe-test.json').read_text()); worker = pathlib.Path(data['path'])
    assert data['base'] == current and git('rev-parse', 'HEAD', cwd=worker) == current
    (worker / 'src/components/new.txt').write_text('owned\n'); git('add', '.', cwd=worker); git('commit', '-m', 'owned', cwd=worker)
    spec = importlib.util.spec_from_file_location('ops', root / 'scripts/ops.py'); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    assert module.check_owned(data) == ['src/components/new.txt']
    (worker / 'package.json').write_text('{}\n'); git('add', '.', cwd=worker); git('commit', '-m', 'out of scope', cwd=worker)
    try: module.check_owned(data)
    except RuntimeError as error: assert 'Ownership violation' in str(error)
    else: raise AssertionError('Out-of-owner file was accepted')
    git('worktree', 'remove', str(worker))
print('Explicit current integration base and ownership rejection passed in a disposable repo.')
