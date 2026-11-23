// wdt v0.1 — Electron 主进程
// 皮：Word 2010 风格（自绘近似皮肤：启动画面/Ribbon/状态栏）
// 芯：Typora 式 Markdown 编辑（三种模式：表现/半表现/代码）
const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win = null;
let splash = null;

function extractOpenPaths(argv) {
  const out = [];
  for (const a of argv) {
    if (!a || a.startsWith('-')) continue;
    if (a === __dirname || a.endsWith('electron.exe')) continue;
    try { if (fs.statSync(a).isFile()) out.push(a); } catch { /* ignore */ }
  }
  return out;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const paths = extractOpenPaths(argv);
    if (paths.length) win.webContents.send('action', { type: 'openPaths', paths });
  });
}

// ---------- Word 2010 式启动画面（无边框，深蓝渐变，主窗口就绪后淡出） ----------
function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 300,
    frame: false, resizable: false, transparent: false,
    show: true, center: true, skipTaskbar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
}

// ---------- 主窗口（frame:false，标题行由渲染层自绘——Word 2010 标题融进 Ribbon） ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1160, height: 800,
    minWidth: 900,   // Word 2010 做法：窗口有最小宽度，再窄也不会裁切内容
    minHeight: 520,
    show: false,
    frame: false,
    icon: path.join(__dirname, 'icon.ico'), // 四格蓝图标（与启动画面一致）
    backgroundColor: '#dce6f4',
    title: '文档1 - wdt',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null); // Word 2010 无传统菜单栏，菜单栏被 Ribbon 取代
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('page-title-updated', (e) => e.preventDefault()); // 标题由渲染进程管理
  // 渲染进程 console 转发到主进程 stdout（自测用）
  win.webContents.on('console-message', (_e, _lvl, msg, _line, src) => {
    console.log('[renderer]', msg, src || '');
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', details.reason, details.exitCode);
  });

  win.webContents.once('did-finish-load', () => {
    // 启动画面停留一下再淡出（Word 2010 手感：约 1.2s）
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) { splash.close(); splash = null; }
      win.show();
      const paths = extractOpenPaths(process.argv);
      if (paths.length) win.webContents.send('action', { type: 'openPaths', paths });
    }, 1200);
  });
  win.on('close', (e) => {
    if (!win._forceClose) { e.preventDefault(); win.webContents.send('action', { type: 'beforeQuit' }); }
  });
}

// ---------- 文件与剪贴板 IPC ----------
ipcMain.handle('dialog:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '打开',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown 文档', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save', async (e, defaultName) => {
  const r = await dialog.showSaveDialog(win, {
    title: '另存为',
    defaultPath: defaultName || '文档1.md',
    filters: [
      { name: 'Markdown (*.md)', extensions: ['md'] },
      { name: '文本文件 (*.txt)', extensions: ['txt'] },
      { name: 'PDF 文档 (*.pdf)', extensions: ['pdf'] }, // 选它 = 直接出 PDF（渲染层分流）
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (r.canceled) return null;
  // 自动追加扩展名：没写后缀或后缀不在允许列表时补 .md
  let p = r.filePath;
  const ext = (p.split('.').pop() || '').toLowerCase();
  if (!['md', 'txt', 'pdf'].includes(ext)) p += '.md';
  return p;
});
ipcMain.handle('file:read', (e, p) => {
  try { return { path: p, content: fs.readFileSync(p, 'utf8') }; }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('file:write', (e, p, content) => {
  try { fs.writeFileSync(p, content, 'utf8'); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

// ---------- 导出 PDF（内核：隐藏窗口 printToPDF，A4 + Word 2010 默认页边距） ----------
// {html, outPath?}：outPath 已给（另存为选了 .pdf）就不再弹对话框
ipcMain.handle('export:pdf', async (e, { html, defaultName, outPath }) => {
  try {
    let p = outPath || null;
    if (!p) {
      const r = await dialog.showSaveDialog(win, {
        title: '导出 PDF',
        defaultPath: defaultName || '文档1.pdf',
        filters: [{ name: 'PDF 文档 (*.pdf)', extensions: ['pdf'] }],
      });
      if (r.canceled) return { canceled: true };
      p = r.filePath.toLowerCase().endsWith('.pdf') ? r.filePath : r.filePath + '.pdf';
    }
    // 临时 HTML → 隐藏窗口加载 → printToPDF → 写盘 → 清理
    const tmp = path.join(app.getPath('temp'), `wdt-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const pw = new BrowserWindow({ show: false, webPreferences: {} });
    try {
      await pw.loadFile(tmp);
      const buf = await pw.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 1, bottom: 1, left: 1.25, right: 1.25 }, // 英寸：Word 2010 默认（上下2.54/左右3.18cm）
      });
      fs.writeFileSync(p, buf);
      return { ok: true, path: p };
    } finally {
      pw.destroy();
      try { fs.unlinkSync(tmp); } catch { /* 临时文件删不掉无所谓 */ }
    }
  } catch (err) { return { error: err.message }; }
});

// ---------- 根据内容推断默认文件名（Python + 本地开源大模型） ----------
// 推理服务按需拉起：自带 llama-server（ai/llamacpp + Qwen2.5-0.5B GGUF，纯 CPU），
// 已有 Ollama 在跑则 python 端优先用它。首次拉起等健康检查，模型加载 <1s。
let aiProc = null;
function aiServerReady() {
  return fetch('http://127.0.0.1:18899/health', { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok).catch(() => false);
}
async function ensureAiServer() {
  if (await aiServerReady()) return true;            // 已在跑（或用户自启的）
  const exe = path.join(__dirname, 'ai', 'llamacpp', 'llama-server.exe');
  const model = path.join(__dirname, 'ai', 'models', 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  if (!fs.existsSync(exe) || !fs.existsSync(model)) return false; // 没带模型，python 端自会报因
  if (aiProc) { try { aiProc.kill(); } catch {} aiProc = null; }
  aiProc = spawn(exe, ['-m', model, '--host', '127.0.0.1', '--port', '18899', '-c', '2048', '-t', '4'],
    { cwd: path.join(__dirname, 'ai'), windowsHide: true, stdio: 'ignore' });
  aiProc.on('exit', () => { aiProc = null; });
  for (let i = 0; i < 60; i++) {                     // 最多等 30s
    await new Promise((r) => setTimeout(r, 500));
    if (await aiServerReady()) return true;
    if (!aiProc) return false;                       // 拉起即退（端口被占等）
  }
  return false;
}
app.on('will-quit', () => { if (aiProc) { try { aiProc.kill(); } catch {} } });
ipcMain.handle('ai:inferName', async (e, text) => {
  await ensureAiServer();
  const script = path.join(__dirname, 'scripts', 'infer_name.py');
  const candidates = process.platform === 'win32'
    ? [['py', ['-3', script]], ['python', [script]]]
    : [['python3', [script]]];
  let lastErr = 'no python';
  for (const [cmd, args] of candidates) {
    try { return await runInfer(cmd, args, String(text || '')); }
    catch (err) { lastErr = err && err.message ? err.message : String(err); }
  }
  return { error: lastErr.slice(0, 160) };
});
function runInfer(cmd, args, text) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', errS = '', done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => { try { p.kill(); } catch {} finish(reject, new Error('推断超时')); }, 75000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { errS += d; });
    p.on('error', (er) => finish(reject, er)); // 命令不存在 → 试下一个候选
    p.on('close', () => {
      const line = (out.trim().split('\n').pop() || '').trim();
      try { finish(resolve, JSON.parse(line)); }
      catch { finish(reject, new Error(errS.trim().slice(0, 120) || 'python 输出不是 JSON')); }
    });
    p.stdin.write(text, 'utf8');
    p.stdin.end();
  });
}
ipcMain.handle('app:setTitle', (e, t) => { if (win) win.setTitle(t); });
ipcMain.handle('app:confirmUnsaved', async () => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['保存(S)', '不保存(N)', '取消'], defaultId: 0, cancelId: 2,
    message: '是否将更改保存到 文档1？',
  });
  return r.response;
});
ipcMain.on('app:forceQuit', () => { if (win) { win._forceClose = true; win.close(); } });

// 自绘标题栏的窗口控制
ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:maximize', () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => { if (win) win.close(); }); // 走 close 事件 → beforeQuit 确认流程

// 剪贴板（富文本 HTML 与纯文本双通道，供"复制为高级文本格式/复制为MD格式"）
ipcMain.handle('clip:write', (e, { text, html }) => {
  clipboard.write({ text: text || '', html: html || undefined });
  return { ok: true };
});
ipcMain.handle('clip:read', () => ({
  text: clipboard.readText(),
  html: clipboard.readHTML(),
}));

app.whenReady().then(() => {
  createSplash();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
