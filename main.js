const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');

const PORT = 8765;
const ROOTS = (process.argv.slice(2).filter(a => !a.startsWith('-') && a !== '.').length
  ? process.argv.slice(2).filter(a => !a.startsWith('-') && a !== '.')
  : (process.env.WT_ROOTS || path.join(os.homedir(), 'Code')).split(':'));

const run = (cmd, args, opts = {}) => new Promise(r =>
  execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (e, out) => r(e ? '' : out)));

// Find git repos up to depth 3 under each root
function findRepos(dir, depth = 0, acc = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  if (ents.some(e => e.name === '.git' && e.isDirectory())) { acc.push(dir); }
  if (depth >= 3) return acc;
  for (const e of ents) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    findRepos(path.join(dir, e.name), depth + 1, acc);
  return acc;
}

async function worktrees(repo) {
  const out = await run('git', ['-C', repo, 'worktree', 'list', '--porcelain']);
  return out.split('\n\n').filter(Boolean).map(b => {
    const w = {};
    for (const l of b.split('\n')) {
      const [k, ...v] = l.split(' ');
      if (k === 'worktree') w.path = v.join(' ');
      else if (k === 'branch') w.branch = v.join(' ').replace('refs/heads/', '');
      else if (k === 'detached') w.branch = '(detached)';
      else if (k === 'bare') w.bare = true;
    }
    return w;
  }).filter(w => w.path && !w.bare);
}

async function claudeSessions() {
  const pids = (await run('pgrep', ['-x', 'claude'])).split('\n').filter(Boolean);
  if (!pids.length) return [];
  const out = await run('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn']);
  const res = []; let pid;
  for (const l of out.split('\n')) {
    if (l[0] === 'p') pid = l.slice(1);
    else if (l[0] === 'n') res.push({ pid, cwd: l.slice(1) });
  }
  return res;
}

ipcMain.on('app-dir', e => { e.returnValue = __dirname; });
ipcMain.handle('scan', async () => {
  const repos = [...new Set(ROOTS.flatMap(r => findRepos(r)))];
  const ext = await claudeSessions();
  const seen = new Set(), groups = [];
  for (const repo of repos) {
    const wts = (await worktrees(repo)).filter(w => !seen.has(w.path));
    wts.forEach(w => seen.add(w.path));
    if (!wts.length) continue;
    wts.forEach((w, i) => w.main = i === 0);
    for (const w of wts) w.claude = ext.filter(s => s.cwd === w.path || s.cwd.startsWith(w.path + '/')).map(s => s.pid);
    const prs = prsFor(repo).map(pr => ({ ...pr, wt: wts.find(w => w.branch === pr.headRefName)?.path }));
    groups.push({ repo, worktrees: wts, prs });
  }
  groups.sort((a, b) => b.worktrees.some(w => w.claude.length) - a.worktrees.some(w => w.claude.length));
  // Claude sessions not matched to any listed worktree
  const matched = new Set(groups.flatMap(g => g.worktrees.flatMap(w => w.claude)));
  return { roots: ROOTS, home: os.homedir(), groups, orphans: ext.filter(s => !matched.has(s.pid)), port: PORT };
});

// ---- Open GitHub PRs (cached; refreshed in the background, at most once a minute per repo) ----
const prCache = new Map();
function prsFor(repo) {
  let c = prCache.get(repo);
  if (!c) prCache.set(repo, c = { t: 0, prs: [] });
  if (!c.busy && Date.now() - c.t > 60000) {
    c.busy = true;
    (async () => {
      const remote = await run('git', ['-C', repo, 'remote', 'get-url', 'origin']);
      if (remote.includes('github.com')) {
        const out = await run('gh', ['pr', 'list', '--limit', '50', '--json', 'number,title,headRefName,isDraft,author'], { cwd: repo });
        try { c.prs = JSON.parse(out).map(p => ({ ...p, author: p.author?.login })); } catch {}
      }
      c.t = Date.now(); c.busy = false;
    })();
  }
  return c.prs;
}

// ---- Worktree add/remove ----
const ADJ = ['happy','brave','calm','eager','fuzzy','gentle','jolly','lucky','mellow','nimble','plucky','quiet','sunny','swift','witty','zesty','cosy','bright','bouncy','merry'];
const NOUN = ['otter','badger','falcon','panda','heron','walrus','fox','koala','lemur','puffin','gecko','marmot','beaver','robin','tapir','yak','newt','owl','seal','wombat'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const git = (args) => new Promise(r => execFile('git', args, (e, out, err) => r({ ok: !e, out, err: err || (e && e.message) })));

ipcMain.handle('wt:add', async (_, repo) => {
  let name, dir;
  do { name = `${pick(ADJ)}-${pick(NOUN)}`; dir = path.join(path.dirname(repo), path.basename(repo) + '-worktrees', name); }
  while (fs.existsSync(dir));
  const r = await git(['-C', repo, 'worktree', 'add', '-b', name, dir]);
  return r.ok ? { ok: true, path: dir } : r;
});

// Check out a PR's branch as a new worktree (one worktree per branch).
ipcMain.handle('wt:pr', async (_, repo, number, branch) => {
  const base = path.join(path.dirname(repo), path.basename(repo) + '-worktrees');
  let dir = path.join(base, branch.replace(/[^\w.-]+/g, '-'));
  if (fs.existsSync(dir)) dir += '-pr' + number;
  const r = await git(['-C', repo, 'worktree', 'add', '--detach', dir]);
  if (!r.ok) return r;
  const c = await new Promise(res => execFile('gh', ['pr', 'checkout', String(number)], { cwd: dir },
    (e, out, err) => res({ ok: !e, err: err || (e && e.message) })));
  if (!c.ok) { await git(['-C', repo, 'worktree', 'remove', '--force', dir]); return c; }
  return { ok: true, path: dir };
});

ipcMain.handle('wt:remove', async (_, repo, wtPath, extPids, force) => {
  // stop Claude sessions running in this worktree
  for (const pid of extPids || []) { try { process.kill(+pid, 'SIGTERM'); } catch {} }
  const r = await git(['-C', repo, 'worktree', 'remove', ...(force ? ['--force'] : []), wtPath]);
  return r;
});

// Install the Claude Code extension into the embedded VS Code server if missing
const DATA = path.join(__dirname, 'vscode-data');
function ensureExtension() {
  const extDir = path.join(DATA, 'extensions');
  if (fs.existsSync(extDir) && fs.readdirSync(extDir).some(n => n.startsWith('anthropic.claude-code'))) return;
  const base = path.join(os.homedir(), '.vscode/cli/serve-web');
  let dirs = []; try { dirs = fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'bin/code-server'))); } catch {}
  if (!dirs.length) return setTimeout(ensureExtension, 5000); // server still downloading
  const bin = path.join(base, dirs.sort((a, b) => fs.statSync(path.join(base, b)).mtimeMs - fs.statSync(path.join(base, a)).mtimeMs)[0], 'bin/code-server');
  execFile(bin, ['--server-data-dir', DATA, '--extensions-dir', extDir, '--install-extension', 'anthropic.claude-code'], { env: childEnv() },
    (e, out, err) => console.log('claude-code extension install:', e ? err : 'ok'));
}

// Env for the embedded VS Code server (and so its terminals/extensions): drop vars leaked
// from Electron, npm/npx, and any parent Claude session.
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(ELECTRON_|CHROME_|npm_|CLAUDE)/i.test(k) && !['NODE', 'NODE_OPTIONS', 'NODE_ENV', 'INIT_CWD'].includes(k)));

let server;
function startServer() {
  ensureExtension();
  server = spawn('code', ['serve-web', '--without-connection-token', '--accept-server-license-terms',
    '--host', '127.0.0.1', '--server-data-dir', DATA, '--port', String(PORT)], { stdio: 'inherit', env: childEnv() });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'; // VS Code web picks its default theme from prefers-color-scheme
  startServer();
  const win = new BrowserWindow({ width: 1500, height: 950, title: 'Worktrees',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true } });
  win.loadFile('index.html');
  if (process.env.WT_SHOT) { // debug: click first worktree, then screenshot
    setTimeout(() => win.webContents.executeJavaScript(process.env.WT_JS || "document.querySelector('[data-new]').click()"), 4000);
    setTimeout(async () => { if (process.env.WT_JS2) console.log('JS2>', await win.webContents.executeJavaScript(process.env.WT_JS2));
      fs.writeFileSync(process.env.WT_SHOT, (await win.capturePage()).toPNG()); app.quit(); }, +(process.env.WT_WAIT || 25000));
  }
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => server && server.kill());
