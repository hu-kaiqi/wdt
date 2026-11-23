const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const appDir = path.join(__dirname, '..');
const PORT = 9222;

async function run() {
  console.log('Starting Electron with CDP on port', PORT);
  const child = spawn(electronBin, [appDir, `--remote-debugging-port=${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => process.stdout.write(`[electron] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[electron err] ${d}`));

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await r.json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) { targets = [page]; break; }
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 300));
  }

  if (!targets || !targets.length) {
    console.error('Failed to reach Electron CDP page target');
    child.kill();
    process.exit(1);
  }

  const page = targets[0];
  console.log('Connected to page:', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      const ex = r.result.exceptionDetails;
      return { error: (ex.exception && (ex.exception.description || ex.exception.value)) || ex.text };
    }
    return { value: r.result && r.result.result && r.result.result.value };
  };

  const capture = async (filename) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(appDir, filename), Buffer.from(shot.result.data, 'base64'));
    console.log('Saved screenshot:', filename);
  };

  // 等待渲染进程完成初始化
  await new Promise((res) => setTimeout(res, 2200));

  // 1. 检查是否有未捕获异常
  const errors = await evalExpr('window.__errors');
  console.log('window.__errors:', errors.value);

  // 2. 表现模式检查并截图
  await evalExpr(`window.__wdt.setMilkdownContent("# 标题一\\n\\n这是 Word 2010 皮肤的 Markdown 编辑器。\\n\\n- 项目符号列表 1\\n- 项目符号列表 2\\n\\n> 这是引用段落。\\n")`);
  await new Promise((res) => setTimeout(res, 600));
  await capture('verify-presentation.png');

  // 3. 切换到半表现模式 (hybrid) 检查是否崩溃
  console.log('Switching to hybrid mode...');
  const switchRes = await evalExpr('window.__wdt.switchMode("hybrid")');
  console.log('switchMode("hybrid") result:', switchRes);
  await new Promise((res) => setTimeout(res, 800));

  const decorsRes = await evalExpr('window.__diag.decors()');
  console.log('__diag.decors():', decorsRes.value);

  const errorsHybrid = await evalExpr('window.__errors');
  console.log('window.__errors after hybrid:', errorsHybrid.value);

  await capture('verify-hybrid.png');

  // 4. 切换到代码模式 (source) 检查并截图
  console.log('Switching to source mode...');
  await evalExpr('window.__wdt.switchMode("source")');
  await new Promise((res) => setTimeout(res, 600));
  await capture('verify-source.png');

  // 5. 切换回表现模式
  console.log('Switching back to presentation mode...');
  await evalExpr('window.__wdt.switchMode("presentation")');
  await new Promise((res) => setTimeout(res, 600));

  ws.close();
  child.kill();
  console.log('Verification finished successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Verify script error:', err);
  process.exit(1);
});
