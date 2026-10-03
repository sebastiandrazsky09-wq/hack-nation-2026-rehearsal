#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
command -v tmux >/dev/null || { echo 'Install tmux first: brew install tmux'; exit 1; }
if tmux has-session -t hack 2>/dev/null; then exec tmux attach -t hack; fi
tmux new-session -d -s hack -n CONTROL -c "$task_root"
tmux split-window -v -t hack:CONTROL -c "$task_root" -l 12
tmux new-window -t hack -n BUILD -c "$task_root"
tmux split-window -h -t hack:BUILD -c "$task_root"
tmux new-window -t hack -n PROOF -c "$task_root"
tmux split-window -h -t hack:PROOF -c "$task_root"
tmux set-option -t hack mouse on
tmux select-window -t hack:CONTROL
exec tmux attach -t hack
