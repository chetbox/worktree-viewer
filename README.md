# worktree-viewer

A macOS desktop app for juggling git worktrees and the Claude Code sessions running in them.

It scans your code folders for git repos and lists every worktree and open pull request. Click one to open it in an embedded VS Code with the Claude Code extension.

- See which worktrees have a `claude` process running in them.
- Create a worktree on a new, randomly named branch with one click.
- Check out a pull request into its own worktree (uses `gh pr checkout`).
- Remove a worktree. This also stops any Claude sessions running in it.
- Type `!<command>` in a Claude prompt to run a shell command in that worktree and see the output.

## Requirements

- macOS (it uses `pgrep` and `lsof` to find Claude sessions)
- [Node.js](https://nodejs.org/) and npm
- `git`
- [VS Code](https://code.visualstudio.com/) with the `code` command on your `PATH` (in VS Code, run **Shell Command: Install 'code' command in PATH**)
- [GitHub CLI](https://cli.github.com/) (`gh`), signed in with `gh auth login`, to list and check out PRs
- `jq`, used by the Claude wrapper and the `!command` hook

## Getting started

```sh
git clone https://github.com/chetbox/worktree-viewer
cd worktree-viewer
npm install
npm start
```

The first launch takes a while. `code serve-web` downloads the VS Code server, and then the app installs the Claude Code extension into `vscode-data/` in this folder.

### Choosing which folders to scan

By default the app looks for repos up to 3 levels deep under `~/Code`. To scan other folders, pass them as arguments:

```sh
npm start -- ~/work ~/projects
```

or set `WT_ROOTS` to a colon-separated list:

```sh
WT_ROOTS=~/work:~/projects npm start
```

## Working on this app

To edit this app while you use it, run a second copy that reloads when you save:

```sh
npm run dev
```

Your normal window stays as it is, so your Claude sessions keep running. Check your changes in the "Worktrees (dev)" window.

The dev window works on your real worktrees, so "Remove" really removes them.

## Where worktrees go

New worktrees are created next to the repo, in a `<repo>-worktrees` folder:

```
~/Code/my-app
~/Code/my-app-worktrees/brave-otter
~/Code/my-app-worktrees/fix-login-bug
```

## Security notes

- The embedded VS Code server listens on `127.0.0.1:8765` **without a connection token**. Any process on your machine can connect to it.
- Workspace trust is turned off in the embedded VS Code so the Claude Code extension can run.
- The `!command` hook runs whatever you type in a shell. It applies only to Claude sessions started from this app.
