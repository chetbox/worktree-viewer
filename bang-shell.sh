#!/bin/bash
# UserPromptSubmit: "!cmd" runs cmd in the session cwd and blocks the prompt, showing output.
input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
[[ "$prompt" == '!'* ]] || exit 0
cmd="${prompt:1}"
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$cwd" ] && cd "$cwd"
out=$(timeout 60 bash -lc "$cmd" 2>&1 </dev/null); code=$?
out=$(printf '%s' "$out" | tail -c 20000)
jq -n --arg r "\$ $cmd"$'\n'"$out"$'\n'"[exit $code]" '{decision:"block",reason:$r}'
