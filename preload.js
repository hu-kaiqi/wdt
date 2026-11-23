// wdt 预加载：安全 API 桥
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wdt', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  saveDialog: (name) => ipcRenderer.invoke('dialog:save', name),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, c) => ipcRenderer.invoke('file:write', p, c),
  setTitle: (t) => ipcRenderer.invoke('app:setTitle', t),
  confirmUnsaved: () => ipcRenderer.invoke('app:confirmUnsaved'),
  forceQuit: () => ipcRenderer.send('app:forceQuit'),
  winMin: () => ipcRenderer.send('win:minimize'),
  winMax: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  clipWrite: (text, html) => ipcRenderer.invoke('clip:write', { text, html }),
  clipRead: () => ipcRenderer.invoke('clip:read'),
  exportPdf: ({ html, defaultName, outPath }) => ipcRenderer.invoke('export:pdf', { html, defaultName, outPath }),
  aiInfer: (text) => ipcRenderer.invoke('ai:inferName', text),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  onLangChanged: (cb) => ipcRenderer.on('lang:changed', (e, lang) => cb(lang)),
  platform: process.platform,
  onAction: (cb) => ipcRenderer.on('action', (e, a) => cb(a)),
});
