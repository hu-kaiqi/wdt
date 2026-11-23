// wdt 语言加载器：主进程 require，渲染层经 esbuild 打包 import，两侧共用一份。
// 两包都进 bundle，运行时可切换（setLang 后重绘 UI，不 reload 窗口）。
const zhCN = require('./zh-CN.js');
const enUS = require('./en-US.js');

const PACKS = { 'zh-CN': zhCN, 'en-US': enUS };
const FALLBACK = 'zh-CN';
let current = FALLBACK;

function normalize(lang) {
  return PACKS[lang] ? lang : FALLBACK;
}

function setLang(lang) {
  current = normalize(lang);
  return current;
}

function getLang() {
  return current;
}

// t(key, params?)：查当前语言包；缺键回退 zh-CN；再缺返回键名本身（便于发现漏项）。
// params 用 {name} 占位：t('toast.opened', { name: 'a.md' })
function t(key, params) {
  const pack = PACKS[current];
  let s = pack && Object.prototype.hasOwnProperty.call(pack, key) ? pack[key]
    : (zhCN[key] != null ? zhCN[key] : key);
  if (params) {
    s = String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  }
  return s;
}

module.exports = { t, setLang, getLang, LANGS: Object.keys(PACKS) };
