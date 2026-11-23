// wdt 发布混淆：main.js / preload.js / renderer/bundle.js → dist-app/
// javascript-obfuscator 深度混淆：控制流扁平化 + RC4 字符串阵列 + 死代码注入 + 自我防御
// （自墨码 scripts/obfuscate.js 移植，选项一致；源码在仓，混淆只为发布产物）
// 注意：renderer bundle 含 Milkdown/ProseMirror（4MB+），直接混淆会性能爆炸；
// 先用 esbuild --minify 压到 ~1.5MB 再混淆（语义等价，产物更小更快）。
const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');
const esbuild = require('esbuild');

const opts = () => ({
  compact: true,
  // 控制流扁平化：把顺序逻辑打散成乱序 switch 跳转表
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  // 死代码注入：混入永不执行的假分支
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.35,
  // 标识符十六进制化：_0x1a2b3c
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  // 自我防御：格式化/美化代码后即失效
  selfDefending: true,
  simplify: true,
  // 字符串全部进 RC4 加密阵列
  splitStrings: true,
  splitStringsChunkLength: 6,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  // 保守项：不动对象键（CodeMirror/Milkdown 依赖键序/枚举）
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
});

const files = [
  ['main.js', 'dist-app/main.js'],
  ['preload.js', 'dist-app/preload.js'],
  ['renderer/bundle.js', 'dist-app/renderer/bundle.js'],
];

fs.rmSync('dist-app', { recursive: true, force: true });
fs.mkdirSync('dist-app/renderer', { recursive: true });
for (const f of ['index.html', 'splash.html', 'style.css', 'bundle.css']) {
  fs.copyFileSync(`renderer/${f}`, `dist-app/renderer/${f}`);
}
fs.mkdirSync('dist-app/locales', { recursive: true });
fs.copyFileSync('locales/zh-CN.js', 'dist-app/locales/zh-CN.js');
fs.copyFileSync('locales/en-US.js', 'dist-app/locales/en-US.js');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync('dist-app/package.json',
  JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: 'main.js' }, null, 2));

for (const [src, dst] of files) {
  let code = fs.readFileSync(src, 'utf8');
  // renderer bundle 过大：先 minify 再混淆（语义等价，产物更小更快）
  if (src === 'renderer/bundle.js') {
    code = esbuild.transformSync(code, { minify: true, loader: 'js' }).code;
    console.log(`minified bundle: ${(code.length / 1024).toFixed(0)}KB`);
  }
  const out = JavaScriptObfuscator.obfuscate(code, opts()).getObfuscatedCode();
  fs.writeFileSync(dst, out);
  console.log(`obfuscated ${src} -> ${dst} ${(out.length / 1024).toFixed(0)}KB`);
}
console.log('done: dist-app/ ready for electron-builder');
