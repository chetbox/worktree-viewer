const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  scan: () => ipcRenderer.invoke('scan'),
});
contextBridge.exposeInMainWorld('wt', {
  add: repo => ipcRenderer.invoke('wt:add', repo),
  pr: (repo, n, branch) => ipcRenderer.invoke('wt:pr', repo, n, branch),
  remove: (repo, p, pids, force) => ipcRenderer.invoke('wt:remove', repo, p, pids, force),
});
