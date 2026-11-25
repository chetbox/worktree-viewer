#!/bin/bash
# Set as claudeCode.claudeProcessWrapper in the embedded VS Code only (vscode-data/data/Machine/settings.json).
# The extension calls: wrapper <bundled-claude> <args...>. Adds app-only settings (the "!cmd" hook).
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ "$1" == */claude && -x "$1" ]]; then bin=$1; shift
else bin=$(ls -d "$dir"/vscode-data/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | tail -1); fi
settings=$(jq -cn --arg c "$dir/bang-shell.sh" '{hooks:{UserPromptSubmit:[{hooks:[{type:"command",command:$c,timeout:70}]}]}}')
exec "${bin:-claude}" --settings "$settings" "$@"
