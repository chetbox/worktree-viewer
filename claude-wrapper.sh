#!/bin/bash
# Set as claudeCode.claudeProcessWrapper in the embedded VS Code only (vscode-data/data/Machine/settings.json).
# The extension calls: wrapper <bundled-claude> <args...>. Adds app-only settings (the "!cmd" hook).
if [[ "$1" == */claude && -x "$1" ]]; then bin=$1; shift
else bin=$(ls -d /Users/chetan/Code/worktree-viewer/vscode-data/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | tail -1); fi
exec "${bin:-claude}" --settings /Users/chetan/Code/worktree-viewer/claude-settings.json "$@"
