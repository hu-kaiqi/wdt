// wdt v0.1 渲染进程
// 皮：Word 2010 风格（Ribbon/皮肤/快捷键表/浮动粘贴选项卡）
// 芯：Typora 式 Markdown，三种模式：
//   presentation 表现模式（Milkdown 富文本，输入不解析 MD——** 就是两个星号）
//   hybrid      半表现模式（CM6 + 非焦点块 markdown-it 渲染，MarkText 路线）
//   source      代码模式（CM6 纯源码）
import { Editor, rootCtx, editorViewCtx, parserCtx, serializerCtx, prosePluginsCtx } from "@milkdown/kit/core";
import { EditorState as PMState, Plugin, PluginKey, TextSelection, AllSelection } from "@milkdown/kit/prose/state";
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
         wrapInHeadingCommand, turnIntoTextCommand, wrapInBulletListCommand,
         wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand,
         toggleLinkCommand, insertHrCommand, insertImageCommand } from "@milkdown/kit/preset/commonmark";
import { gfm, insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { undo as pmUndo, redo as pmRedo } from "@milkdown/kit/prose/history";
import { callCommand } from "@milkdown/kit/utils";

import { EditorView, Decoration, WidgetType, keymap, lineNumbers,
         highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState, Compartment, StateField } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history as cmHistory, undo as cmUndo, redo as cmRedo, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, indentUnit, bracketMatching, HighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";

import MarkdownIt from "markdown-it";
import TurndownService from "turndown";

// 自测错误收集（CDP 读 window.__errors）
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message) + "\n" + (e.error && e.error.stack || "")));
window.addEventListener("unhandledrejection", (e) => window.__errors.push("REJ: " + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

// ProseMirror 基础编辑区样式（光标/选区/表格手柄）
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/gapcursor/style/gapcursor.css";

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: false });
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

// ============ 状态 ============
let mode = "presentation"; // presentation | hybrid | source
let filePath = null;
let dirty = false;
let docSeed = ""; // 空白文档起步（Word 手感）
let ribbonCollapsed = false;

// ============ Ribbon 图标定义（Word 2010 矢量近似） ============
const ICONS = {
  paste: `<svg viewBox="0 0 32 32" width="28" height="28">
    <rect x="7" y="6" width="18" height="23" rx="2" fill="#d2a658" stroke="#a0742b" stroke-width="1"/>
    <rect x="9" y="8" width="14" height="19" rx="1" fill="#ffffff" stroke="#c0c0c0" stroke-width="0.5"/>
    <line x1="11" y1="12" x2="21" y2="12" stroke="#4a86d0" stroke-width="1.2"/>
    <line x1="11" y1="16" x2="21" y2="16" stroke="#8cb4e2" stroke-width="1"/>
    <line x1="11" y1="20" x2="19" y2="20" stroke="#8cb4e2" stroke-width="1"/>
    <line x1="11" y1="24" x2="17" y2="24" stroke="#8cb4e2" stroke-width="1"/>
    <rect x="12" y="3" width="8" height="4.5" rx="1" fill="#e8c050" stroke="#b08a1a" stroke-width="1"/>
    <circle cx="16" cy="5.2" r="1.2" fill="#50350a"/>
  </svg>`,
  bulletList: `<svg viewBox="0 0 16 16" width="14" height="14">
    <circle cx="3" cy="4" r="1.5" fill="#1f4e79"/>
    <line x1="7" y1="4" x2="14" y2="4" stroke="#1f4e79" stroke-width="1.5"/>
    <circle cx="3" cy="8" r="1.5" fill="#1f4e79"/>
    <line x1="7" y1="8" x2="14" y2="8" stroke="#1f4e79" stroke-width="1.5"/>
    <circle cx="3" cy="12" r="1.5" fill="#1f4e79"/>
    <line x1="7" y1="12" x2="14" y2="12" stroke="#1f4e79" stroke-width="1.5"/>
  </svg>`,
  orderedList: `<svg viewBox="0 0 16 16" width="14" height="14">
    <text x="1" y="5.5" font-size="6" font-family="'Segoe UI', sans-serif" font-weight="bold" fill="#1f4e79">1.</text>
    <line x1="7" y1="4" x2="14" y2="4" stroke="#1f4e79" stroke-width="1.5"/>
    <text x="1" y="9.5" font-size="6" font-family="'Segoe UI', sans-serif" font-weight="bold" fill="#1f4e79">2.</text>
    <line x1="7" y1="8" x2="14" y2="8" stroke="#1f4e79" stroke-width="1.5"/>
    <text x="1" y="13.5" font-size="6" font-family="'Segoe UI', sans-serif" font-weight="bold" fill="#1f4e79">3.</text>
    <line x1="7" y1="12" x2="14" y2="12" stroke="#1f4e79" stroke-width="1.5"/>
  </svg>`,
  alignLeft: `<svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="2" y1="3" x2="14" y2="3" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="6.5" x2="10" y2="6.5" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="10" x2="14" y2="10" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="13.5" x2="8" y2="13.5" stroke="#1f4e79" stroke-width="1.4"/>
  </svg>`,
  alignCenter: `<svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="2" y1="3" x2="14" y2="3" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="4" y1="6.5" x2="12" y2="6.5" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="10" x2="14" y2="10" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="5" y1="13.5" x2="11" y2="13.5" stroke="#1f4e79" stroke-width="1.4"/>
  </svg>`,
  alignRight: `<svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="2" y1="3" x2="14" y2="3" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="6" y1="6.5" x2="14" y2="6.5" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="10" x2="14" y2="10" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="8" y1="13.5" x2="14" y2="13.5" stroke="#1f4e79" stroke-width="1.4"/>
  </svg>`,
  justify: `<svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="2" y1="3" x2="14" y2="3" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="10" x2="14" y2="10" stroke="#1f4e79" stroke-width="1.4"/>
    <line x1="2" y1="13.5" x2="14" y2="13.5" stroke="#1f4e79" stroke-width="1.4"/>
  </svg>`,
};

// ============ Ribbon 定义（Word 2010 布局，数据驱动） ============
const RIBBON = [
  { id: "home", label: "开始", groups: [
    { name: "剪贴板", layout: [
      [ { id: "paste", svg: ICONS.paste, text: "粘贴", big: true, cmd: "paste" },
        { stack: [
          { id: "cut", glyph: "✂", text: "剪切", cmd: "cut" },
          { id: "copy", glyph: "📄", text: "复制", cmd: "copy" },
          { id: "brush", glyph: "🖌", text: "格式刷", stub: true },
        ]} ],
    ]},
    { name: "字体", layout: [
      [ { select: "font", title: "字体" },
        { select: "size", title: "字号" },
        { id: "fontGrow", glyph: "A^", cmd: "fontGrow", title: "增大字号", stub: true },
        { id: "fontShrink", glyph: "Av", cmd: "fontShrink", title: "减小字号", stub: true },
        { id: "clearFormat", glyph: "A̸", cmd: "clearFormat", title: "清除所有格式" } ],
      [ { id: "bold", glyph: "B", cmd: "bold", title: "加粗 (Ctrl+B)", style: "font-weight:700;font-family:'Times New Roman',serif;" },
        { id: "italic", glyph: "I", cmd: "italic", title: "斜体 (Ctrl+I)", style: "font-style:italic;font-family:'Times New Roman',serif;" },
        { id: "underline", glyph: "U̲", cmd: "underline", title: "下划线 (Markdown扩展/占位)", stub: true },
        { id: "strike", glyph: "abc", cmd: "strike", title: "删除线", style: "text-decoration:line-through;" },
        { id: "subscript", glyph: "x₂", cmd: "subscript", title: "下标 (占位)", stub: true },
        { id: "superscript", glyph: "x²", cmd: "superscript", title: "上标 (占位)", stub: true },
        { id: "code", glyph: "</>", cmd: "inlineCode", title: "行内代码" },
        { sep: true },
        { id: "fontColor", glyph: "A", cmd: "fontColor", title: "字体颜色 (占位)", stub: true, style: "border-bottom: 3px solid #c00000; font-weight:700;" } ],
    ]},
    { name: "段落", layout: [
      [ { id: "ul", svg: ICONS.bulletList, cmd: "bulletList", title: "项目符号 (Ctrl+Shift+L)" },
        { id: "ol", svg: ICONS.orderedList, cmd: "orderedList", title: "编号" },
        { id: "multilist", glyph: "1.a▾", stub: true, title: "多级列表 (占位)" },
        { id: "outdent", glyph: "⇤", stub: true, title: "减少缩进量" },
        { id: "indent", glyph: "⇥", stub: true, title: "增加缩进量" } ],
      [ { id: "alignLeft", svg: ICONS.alignLeft, stub: true, title: "左对齐" },
        { id: "alignCenter", svg: ICONS.alignCenter, stub: true, title: "居中" },
        { id: "alignRight", svg: ICONS.alignRight, stub: true, title: "右对齐" },
        { id: "justify", svg: ICONS.justify, stub: true, title: "两端对齐" },
        { sep: true },
        { id: "quote", glyph: "❝", cmd: "quote", title: "引用" },
        { id: "hr", glyph: "―", cmd: "hr", title: "水平线 (Ctrl+Enter)" } ],
    ]},
    { name: "样式", styles: [
      { id: "normal", name: "正文", cmd: "normalPara", cls: "sc-dim", title: "正文 (Ctrl+Shift+N)" },
      { id: "nospacing", name: "无间隔", cmd: "normalPara", cls: "sc-a3", title: "无间隔（映射正文）" },
      { id: "h1", name: "标题 1", cmd: "h1", cls: "sc-a1", title: "标题 1 (Alt+Ctrl+1)" },
      { id: "h2", name: "标题 2", cmd: "h2", cls: "sc-a2", title: "标题 2 (Alt+Ctrl+2)" },
      { id: "h3", name: "标题 3", cmd: "h3", cls: "sc-a2", title: "标题 3 (Alt+Ctrl+3)" },
      { id: "subtitle", name: "副标题", cmd: "h2", cls: "sc-a3", title: "副标题（映射 H2）" },
    ]},
    { name: "编辑", layout: [
      [ { stack: [
          { id: "find", glyph: "🔍", text: "查找 ▾", stub: true, title: "查找 (Ctrl+F)" },
          { id: "replace", glyph: "ab", text: "替换", stub: true, title: "替换 (Ctrl+H)" },
          { id: "select", glyph: "➤", text: "选择 ▾", stub: true, title: "选择" },
        ]} ],
    ]},
  ]},
  { id: "insert", label: "插入", groups: [
    { name: "表格和插图", items: [
      { id: "table", glyph: "▦", text: "表格", big: true, cmd: "table" },
      { id: "image", glyph: "🖼", text: "图片", big: true, cmd: "image" },
      { id: "link", glyph: "🔗", text: "链接", big: true, cmd: "link", title: "链接 (Ctrl+K)" },
    ]},
    { name: "代码", items: [
      { id: "codeblock", glyph: "{ }", text: "代码块", big: true, cmd: "codeBlock" },
    ]},
    { name: "页", items: [
      { id: "pagebreak", glyph: "⤓", text: "分割线", big: true, cmd: "hr", title: "分割线（Markdown 水平线）" },
    ]},
    { name: "页眉和页脚", items: [
      { id: "header", glyph: "🗏", text: "页眉", big: true, stub: true, title: "Markdown 无页眉——占位" },
      { id: "footer", glyph: "🗛", text: "页脚", big: true, stub: true },
    ]},
  ]},
  { id: "layout", label: "页面布局", groups: [
    { name: "页面设置", items: [
      { id: "margins", glyph: "🗘", text: "页边距", stub: true },
      { id: "size", glyph: "▭", text: "纸张大小", stub: true },
    ]},
    { name: "稿纸", items: [
      { id: "grid", glyph: "#", text: "稿纸设置", stub: true },
    ]},
  ]},
  { id: "refs", label: "引用", groups: [
    { name: "目录", items: [
      { id: "toc", glyph: "☰", text: "目录", cmd: "toc", title: "插入 [TOC] 标记" },
    ]},
    { name: "脚注", items: [
      { id: "footnote", glyph: "¹", text: "插入脚注", stub: true },
    ]},
  ]},
  { id: "mail", label: "邮件", groups: [
    { name: "开始邮件合并", items: [
      { id: "mm", glyph: "✉", text: "开始邮件合并", stub: true, big: true },
    ]},
  ]},
  { id: "review", label: "审阅", groups: [
    { name: "校对", items: [
      { id: "spell", glyph: "✓", text: "拼写和语法", stub: true, big: true },
    ]},
    { name: "批注", items: [
      { id: "comment", glyph: "💬", text: "新建批注", stub: true, big: true },
    ]},
  ]},
  { id: "view", label: "视图", groups: [
    { name: "文档视图", items: [
      { id: "v-presentation", glyph: "🗔", text: "表现模式", big: true, viewMode: "presentation", title: "富文本视图：输入不自动转换 Markdown" },
      { id: "v-hybrid", glyph: "📖", text: "半表现模式", big: true, viewMode: "hybrid", title: "Typora 式：实时渲染" },
      { id: "v-source", glyph: "✎", text: "代码模式", big: true, viewMode: "source", title: "纯 Markdown 源码" },
    ]},
    { name: "显示", items: [
      { id: "ruler", glyph: "📏", text: "标尺", stub: true },
      { id: "nav", glyph: "⇉", text: "导航窗格", stub: true },
    ]},
  ]},
];

// ============ Ribbon 渲染 ============
const tabsEl = document.getElementById("ribbon-tabs");
const bodyEl = document.getElementById("ribbon-body");
let activeTab = "home";

function renderRibbonTabs() {
  tabsEl.innerHTML = "";
  for (const tab of RIBBON) {
    const d = document.createElement("div");
    d.className = "rtab" + (tab.id === activeTab ? " active" : "");
    d.textContent = tab.label;
    d.onclick = () => {
      if (ribbonCollapsed) {
        ribbonCollapsed = false;
        bodyEl.classList.add("show");
      }
      activeTab = tab.id;
      renderRibbonTabs();
      renderRibbonBody();
    };
    tabsEl.appendChild(d);
  }
}

function makeRibbonBtn(it) {
  if (it.sep) {
    const s = document.createElement("div");
    s.className = "rsep-v";
    return s;
  }
  if (it.stack) {
    const st = document.createElement("div");
    st.className = "rstack";
    for (const sub of it.stack) st.appendChild(makeRibbonBtn(sub));
    return st;
  }
  if (it.select) {
    const sel = document.createElement("select");
    sel.className = "rsel";
    sel.title = it.title || "";
    if (it.select === "font") {
      for (const f of ["宋体", "微软雅黑", "Calibri", "Consolas"]) {
        sel.add(new Option(f, f, false, f === "宋体"));
      }
    } else {
      for (const s of ["五号", "小四", "四号", "三号"]) {
        sel.add(new Option(s, s, false, s === "五号"));
      }
    }
    sel.onchange = () => toast("字体/字号设置（占位）");
    return sel;
  }
  const b = document.createElement("button");
  b.className = "rbtn" + (it.big ? " rbtn-big" : "") + (it.text ? " rbtn-with-text" : "");
  if (it.style) b.style.cssText = it.style;
  b.title = it.title || it.text || "";

  let iconHtml = "";
  if (it.svg) iconHtml = `<span class="rb-glyph">${it.svg}</span>`;
  else if (it.glyph) iconHtml = `<span class="rb-glyph">${it.glyph}</span>`;

  b.innerHTML = iconHtml + (it.text ? `<span class="rb-text">${it.text}</span>` : "");

  if (it.stub) {
    b.onclick = () => toast(`「${it.text || it.title}」：Word 占位功能`);
    b.style.opacity = ".65";
  } else if (it.viewMode) {
    b.dataset.viewmode = it.viewMode;
    b.onclick = () => switchMode(it.viewMode);
  } else if (it.cmd) {
    b.dataset.cmd = it.cmd; // 供下拉选择器锚定
    b.onclick = () => exec(it.cmd);
  }
  return b;
}

function renderRibbonBody() {
  const tab = RIBBON.find((t) => t.id === activeTab);
  bodyEl.innerHTML = "";
  for (const g of tab.groups) {
    const gd = document.createElement("div");
    gd.className = "rgroup";
    const content = document.createElement("div");
    content.className = "rgroup-content";
    if (g.layout) {
      for (const row of g.layout) {
        const rd = document.createElement("div");
        rd.className = "rgroup-row";
        for (const it of row) rd.appendChild(makeRibbonBtn(it));
        content.appendChild(rd);
      }
    } else if (g.items) {
      const rd = document.createElement("div");
      rd.className = "rgroup-row";
      for (const it of g.items) rd.appendChild(makeRibbonBtn(it));
      content.appendChild(rd);
    }
    if (g.styles) {
      const box = document.createElement("div");
      box.className = "styles-box";
      const row = document.createElement("div");
      row.className = "styles-row";
      for (const s of g.styles) {
        const c = document.createElement("div");
        c.className = "style-card"; // 不再默认选中"正文"（常驻橙框观感差）
        c.dataset.styleid = s.id;
        c.title = s.title || s.name;
        c.innerHTML = `<span class="${s.cls}">AaBbCc</span><span class="sc-name">${s.name}</span>`;
        c.onclick = () => {
          document.querySelectorAll(".style-card").forEach((x) => x.classList.remove("on"));
          c.classList.add("on");
          exec(s.cmd);
        };
        row.appendChild(c);
      }
      const nav = document.createElement("div");
      nav.className = "styles-nav";
      nav.innerHTML = `<button class="st-up" title="上一行">▲</button><button class="st-down" title="下一行">▼</button>`;
      // 样式库滚动（上一行/下一行）
      const scrollStyles = (dir) => {
        const box = nav.closest(".styles-box");
        const row = box && box.querySelector(".styles-row");
        if (row) row.scrollBy({ top: dir * 52, behavior: "smooth" });
      };
      nav.querySelector(".st-up").onclick = () => scrollStyles(-1);
      nav.querySelector(".st-down").onclick = () => scrollStyles(1);
      const cs = document.createElement("div");
      cs.className = "change-style";
      cs.title = "更改样式";
      cs.innerHTML = `<span class="cs-glyph">Aa</span><span class="cs-text">更改样式</span>`;
      cs.onclick = () => toast("更改样式：Word 样式集（占位）");
      box.appendChild(row);
      box.appendChild(nav);
      box.appendChild(cs);
      content.appendChild(box);
    }
    gd.appendChild(content);
    const name = document.createElement("div");
    name.className = "rgroup-name";
    name.textContent = g.name;
    gd.appendChild(name);
    bodyEl.appendChild(gd);
  }
  if (!ribbonCollapsed) bodyEl.classList.add("show");
  syncModeUi();
}

// ============ 文件菜单（Backstage 视图） ============
const backstage = document.getElementById("backstage");
const bsTitle = document.getElementById("bs-title");
const bsBody = document.getElementById("bs-body");
// 最近文件记录（localStorage 持久化）
function getRecents() { try { return JSON.parse(localStorage.getItem("wdt-recents") || "[]"); } catch { return []; } }
function pushRecent(p) {
  let r = getRecents().filter((x) => x !== p);
  r.unshift(p);
  r = r.slice(0, 8);
  localStorage.setItem("wdt-recents", JSON.stringify(r));
}
const FILE_SVG = `<svg viewBox="0 0 24 24"><path d="M6 2h9l4 4v16H6z" fill="#fff" stroke="#7f9fc4" stroke-width="1.6"/><path d="M9 2v4h4" fill="none" stroke="#7f9fc4" stroke-width="1.4"/><path d="M9 12h7M9 16h7" stroke="#b8cde4" stroke-width="1.6"/></svg>`;
const DIR_SVG = `<svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v12H3z" fill="#ffd97a" stroke="#d99a1f" stroke-width="1.4"/></svg>`;

function getPinned() { try { return JSON.parse(localStorage.getItem("wdt-pinned") || "[]"); } catch { return []; } }
function togglePinned(p) {
  let pin = getPinned();
  pin = pin.includes(p) ? pin.filter((x) => x !== p) : [p, ...pin].slice(0, 6);
  localStorage.setItem("wdt-pinned", JSON.stringify(pin));
}
const PIN_SVG_ON = `<svg viewBox="0 0 16 16" class="pin on" title="取消固定"><path d="M9.5 1l5.5 5.5-2 2-1-1-3.2 3.2.3 2.8-1.3 1.3-2.4-2.4L2 15l-.9-.9 3.6-3.4L2.3 8.3l1.3-1.3 2.8.3L9.6 4l-1-1z" fill="#e8963d"/></svg>`;
const PIN_SVG_OFF = `<svg viewBox="0 0 16 16" class="pin" title="固定"><path d="M9.5 1l5.5 5.5-2 2-1-1-3.2 3.2.3 2.8-1.3 1.3-2.4-2.4L2 15l-.9-.9 3.6-3.4L2.3 8.3l1.3-1.3 2.8.3L9.6 4l-1-1z" fill="#c3cfdd"/></svg>`;

function fileRow(p, isPinned) {
  const pin = `<span class="bs-pin" data-pinned="${isPinned ? 1 : 0}" data-path="${p.replace(/"/g, "&quot;")}">${isPinned ? PIN_SVG_ON : PIN_SVG_OFF}</span>`;
  return `<div class="bs-file" data-path="${p.replace(/"/g, "&quot;")}">${pin}${FILE_SVG}<div style="min-width:0"><div class="bf-name">${p.split(/[\/]/).pop()}</div><div class="bf-path">${p}</div></div></div>`;
}

function startPageBody() {
  const pinned = getPinned();
  const recents = getRecents().filter((p) => !pinned.includes(p));
  return `<div class="bs-quick-new" id="bs-quick-new">
      <svg viewBox="0 0 24 24"><path d="M6 2h9l4 4v16H6z" fill="#fff" stroke="#7f9fc4" stroke-width="1.6"/><path d="M11 10v6M8 13h6" stroke="#2f74c4" stroke-width="2"/></svg>
      <div><div class="bf-name">新建空白文档</div><div class="bf-path">立即开始创作</div></div>
    </div>
    <div class="bs-section" style="margin-top:18px">已固定</div>
    ${pinned.length ? pinned.map((p) => fileRow(p, true)).join("") : `<div class="bs-hint">固定的文档会出现在这里（悬停文件点图钉固定）。</div>`}
    <div class="bs-section" style="margin-top:16px">最近</div>
    ${recents.length ? recents.map((p) => fileRow(p, false)).join("") : `<div class="bs-hint">最近打开的文档会出现在这里。</div>`}`;
}

function wireStartPage() {
  const qn = document.getElementById("bs-quick-new");
  if (qn) qn.onclick = () => { setDoc("", null); setDocOpen(true); hideBackstage(); toast("已新建"); };
  bsBody.querySelectorAll(".bs-file").forEach((f) => {
    f.onclick = (e) => {
      if (e.target.closest(".bs-pin")) return; // 图钉单独处理
      openFile(f.dataset.path); hideBackstage();
    };
  });
  bsBody.querySelectorAll(".bs-pin").forEach((pinEl) => {
    pinEl.onclick = (e) => {
      e.stopPropagation();
      togglePinned(pinEl.dataset.path);
      showBackstage("start"); // 刷新列表
    };
  });
}

const BS = {
  start: { title: "开始", body: "" },
  info: { title: "信息", body: "" },
  new: {
    title: "新建",
    body: `<div class="bs-new-wrap">
      <div class="bs-new-left">
        <div class="bs-section">可用模板</div>
        <div class="bs-cards" id="bs-new-cards">
          <div class="bs-card sel" data-tpl="blank"><div class="bc-ico"></div><div class="bc-name">空白文档</div></div>
          <div class="bs-card" data-tpl="blog"><div class="bc-ico"></div><div class="bc-name">博客文章</div></div>
          <div class="bs-card" data-tpl="sample"><div class="bc-ico"></div><div class="bc-name">示例模板</div></div>
        </div>
        <div class="bs-hint">提示：可直接把 .md 文件拖进窗口打开。</div>
      </div>
      <div class="bs-new-right">
        <div class="bs-section">空白文档</div>
        <div class="bs-preview"></div>
        <button class="bs-create">创建</button>
      </div>
    </div>`,
  },
  open: {
    title: "打开",
    body: `<div class="bs-cards"><div class="bs-card" id="bs-open-file" style="width:150px"><div class="bc-ico"></div><div class="bc-name">浏览…</div></div></div>
      <div class="bs-hint">支持 .md / .markdown / .txt；也可以直接拖文件进窗口。</div>`,
  },
  save: { title: "保存", body: `<div class="bs-hint">把当前文档保存到原文件。</div>` },
  saveAs: { title: "另存为", body: `<div class="bs-hint">选择位置与文件名（.md 或 .txt）。</div>` },
  print: { title: "打印", body: `<div class="bs-hint">打印当前文档（调起系统打印）。</div>` },
  export: { title: "导出", body: `<div class="bs-cards">
      <div class="bs-card" id="bs-exp-pdf" style="width:150px"><div class="bc-ico"></div><div class="bc-name">导出 PDF</div></div>
      <div class="bs-card" id="bs-exp-html" style="width:150px"><div class="bc-ico"></div><div class="bc-name">导出 HTML</div></div>
      <div class="bs-card" id="bs-exp-md" style="width:150px"><div class="bc-ico"></div><div class="bc-name">导出 Markdown</div></div>
    </div>
    <div class="bs-hint">PDF 与 HTML 导出排版一致（A4、Word 2010 默认页边距）；另存为对话框里选"PDF 文档"也可直接存 PDF。</div>` },
  options: { title: "选项", body: `<div class="bs-section">保存</div>
      <label class="opt-row"><input type="checkbox" id="opt-infer-name"> 根据文件内容推断默认文件名<span class="opt-sub">本地开源模型 Qwen2.5-0.5B（llama.cpp CPU 运行，首次推断需启动本地服务），内容不出本机</span></label>
      <div class="bs-hint">未保存的文档停止输入几秒后自动推断，首次"保存 / 另存为"时作默认文件名，对话框里随时可改；推断不可用自动回退"文档1"。模型已随软件内置（ai/ 目录）；若本机装有 Ollama 也会被优先复用。</div>
      <button class="bs-create" id="opt-test" style="width:auto;padding:6px 20px">测试推断</button>
      <div class="bs-hint" id="opt-test-out">用当前文档内容试一次，看模型返回什么名字。</div>` },
  close: { title: "关闭", body: `<div class="bs-hint">关闭当前文档。</div>` },
};
let bsPage = null;
function showBackstage(page) {
  bsPage = page;
  backstage.hidden = false;
  document.getElementById("ribbon").style.visibility = "hidden";
  document.getElementById("ribbon-body").style.visibility = "hidden";
  // 高亮当前项（所有页面统一处理，start 也不能漏）
  document.querySelectorAll(".bs-item").forEach((i) => i.classList.toggle("on", i.dataset.bs === page));
  // start = 最近文档页
  if (page === "start") {
    bsTitle.textContent = "开始";
    bsBody.innerHTML = startPageBody();
    wireStartPage();
    return;
  }
  // info = 动态文档信息
  if (page === "info") {
    const md = currentMd();
    const cjk = (md.match(/[一-鿿]/g) || []).length;
    const words = (md.replace(/[一-鿿]/g, " ").match(/[A-Za-z0-9_'-]+/g) || []).length;
    BS.info.body = `<table class="bs-info">
      <tr><td>文件名</td><td>${filePath ? filePath.split(/[\\/]/).pop() : "文档1（未保存）"}</td></tr>
      <tr><td>位置</td><td>${filePath || "—"}</td></tr>
      <tr><td>字数</td><td>${cjk + words}</td></tr>
      <tr><td>字符数</td><td>${md.length}</td></tr>
      <tr><td>当前模式</td><td>${MODE_LABEL[mode]}</td></tr>
    </table>`;
  }
  bsTitle.textContent = BS[page] ? BS[page].title : page;
  bsBody.innerHTML = BS[page] ? BS[page].body : "";
  // 页内动作
  document.querySelectorAll("#bs-new-cards .bs-card").forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll("#bs-new-cards .bs-card").forEach((x) => x.classList.remove("sel"));
      c.classList.add("sel");
      const sec = document.querySelector(".bs-new-right .bs-section");
      if (sec) sec.textContent = c.querySelector(".bc-name").textContent;
    };
  });
  const create = document.querySelector(".bs-create");
  if (create) create.onclick = () => {
    const sel = document.querySelector("#bs-new-cards .bs-card.sel");
    const tpl = sel ? sel.dataset.tpl : "blank";
    const seed = tpl === "blank" ? "" :
      tpl === "blog" ? "# 博客标题\n\n正文……\n" :
      tpl === "sample" ? "# 示例\n\n- 条目一\n- 条目二\n" : "";
    setDoc(seed, null);
    setDocOpen(true);
    hideBackstage();
    toast("已新建");
  };
  const openf = document.getElementById("bs-open-file");
  if (openf) openf.onclick = () => { openFile(); hideBackstage(); };
  const expPdf = document.getElementById("bs-exp-pdf");
  if (expPdf) expPdf.onclick = () => { exportAs("pdf"); hideBackstage(); };
  const expHtml = document.getElementById("bs-exp-html");
  if (expHtml) expHtml.onclick = () => { exportAs("html"); hideBackstage(); };
  const expMd = document.getElementById("bs-exp-md");
  if (expMd) expMd.onclick = () => { exportAs("md"); hideBackstage(); };
  // 选项页：推断文件名开关 + 测试
  const optChk = document.getElementById("opt-infer-name");
  if (optChk) {
    optChk.checked = inferNamePrefOn();
    optChk.onchange = () => {
      localStorage.setItem("wdt-pref-infer-name", optChk.checked ? "1" : "0");
      if (optChk.checked) scheduleInfer(true);
      toast(optChk.checked ? "已开启：推断默认文件名" : "已关闭：推断默认文件名");
    };
    const testBtn = document.getElementById("opt-test");
    const testOut = document.getElementById("opt-test-out");
    if (testBtn) testBtn.onclick = async () => {
      testOut.textContent = "推断中…（本地模型，首次较慢）";
      const md = currentMd();
      const r = await window.wdt.aiInfer(md.trim().slice(0, 1500));
      testOut.textContent = r && r.name ? `当前文档推断结果：「${r.name}」` : `不可用：${(r && r.error) || "未知原因"}`;
    };
  }
}
function hideBackstage() {
  backstage.hidden = true;
  document.getElementById("ribbon").style.visibility = "";
  document.getElementById("ribbon-body").style.visibility = "";
  bsPage = null;
}
// 导出排版模板（HTML 与 PDF 共用一份——PDF 内核就是"打印到 PDF"，打的就是这份 HTML）
function buildExportHtml(title) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Calibri,"Microsoft YaHei",sans-serif;max-width:800px;margin:0 auto;padding:0;line-height:1.7;color:#222}
h1{color:#365f91}h2,h3{color:#4f81bd}table{border-collapse:collapse}th,td{border:1px solid #92b0d7;padding:5px 12px}th{background:#ebf3fb}
blockquote{border-left:4px solid #b8cce4;margin:8px 0;padding:2px 14px;color:#555;background:#f4f8fc}
code{background:#eef2f7;border:1px solid #d8e1ec;border-radius:3px;padding:0 4px}pre{background:#f6f8fa;border:1px solid #d8e1ec;border-radius:4px;padding:10px 12px;overflow:auto}
img{max-width:100%}</style>
</head><body>${mdit.render(currentMd())}</body></html>`;
}
// 导出：PDF = 隐藏窗口 printToPDF；HTML = 渲染结果另存；MD = 源码另存
async function exportAs(kind) {
  const base = (filePath ? filePath.replace(/\.[^.]*$/, "") : (suggestedName || "文档1"));
  if (kind === "md") { filePath = null; await saveAs(); return; }
  if (kind === "pdf") {
    toast("正在生成 PDF…");
    const r = await window.wdt.exportPdf({ html: buildExportHtml(base), defaultName: base + ".pdf" });
    if (r && r.error) toast("导出 PDF 失败：" + r.error);
    else if (r && r.ok) toast("已导出 PDF：" + r.path.split(/[\\/]/).pop());
    return;
  }
  const p = await window.wdt.saveDialog(base + ".html");
  if (!p) return;
  const r = await window.wdt.writeFile(p.endsWith(".html") ? p : p + ".html", buildExportHtml(base));
  if (r.error) toast("导出失败：" + r.error); else toast("已导出 HTML");
}
document.getElementById("file-tab").onclick = () => (backstage.hidden ? showBackstage("start") : hideBackstage());
document.getElementById("bs-back").onclick = () => hideBackstage();
// 注意只绑带 data-bs 的项——返回按钮（.bs-item.bs-back）没有 data-bs，
// 混进来会在 hideBackstage 后把 Backstage 重新打开（返回失灵的根因）
document.querySelectorAll(".bs-item[data-bs]").forEach((i) => i.addEventListener("click", () => {
  const p = i.dataset.bs;
  showBackstage(p);
  if (p === "save") { save(); }
  else if (p === "saveAs") { saveAs(); setTimeout(hideBackstage, 300); }
  else if (p === "print") { window.print(); }
  else if (p === "close") { closeDoc(); }
}));
// Esc 关闭 Backstage
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !backstage.hidden) { e.preventDefault(); hideBackstage(); }
});
document.getElementById("btn-collapse").onclick = () => {
  ribbonCollapsed = !ribbonCollapsed;
  applyRibbonLayout();
};

// 按窗口宽度自动调整 Ribbon：窄→紧凑单行(可横滚)，再窄→折叠成一条
function applyRibbonLayout() {
  const w = window.innerWidth;
  bodyEl.classList.toggle("collapsed", ribbonCollapsed);
  bodyEl.classList.toggle("compact", !ribbonCollapsed && w < 980);
  bodyEl.classList.toggle("show", !ribbonCollapsed);
  // 折叠态给一个"展开"入口
  let cb = document.getElementById("ribbon-expand");
  if (ribbonCollapsed && !cb) {
    cb = document.createElement("button");
    cb.id = "ribbon-expand";
    cb.className = "ribbon-collapse-btn";
    cb.innerHTML = `<span class="cc-glyph">A</span>样式 ▾`;
    cb.onclick = () => { ribbonCollapsed = false; applyRibbonLayout(); };
    bodyEl.appendChild(cb);
  } else if (!ribbonCollapsed && cb) {
    cb.remove();
  }
}
window.addEventListener("resize", applyRibbonLayout);
document.getElementById("btn-help").onclick = () => toast("wdt —— Word 2010 皮肤 + Typora Markdown 内核");

// 自绘标题行：窗口控制 + 快速访问工具栏
document.getElementById("wc-min").onclick = () => window.wdt.winMin();
document.getElementById("wc-max").onclick = () => window.wdt.winMax();
document.getElementById("wc-close").onclick = () => window.wdt.winClose();
document.getElementById("qat-save").onclick = () => save();
document.getElementById("qat-undo").onclick = () => exec("undo");
document.getElementById("qat-redo").onclick = () => exec("redo");

// 简易 toast
let toastTimer = null;
function toast(msg) {
  let t = document.getElementById("wdt-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "wdt-toast";
    t.style.cssText = "position:fixed;right:16px;bottom:34px;background:#fffbe6;border:1px solid #e3a536;color:#5a4a1a;padding:8px 14px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.25);z-index:999;font-size:12px;transition:opacity .4s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 1800);
}

// ============ Milkdown（仅表现模式；半表现改走 CM6 块渲染，见下） ============
// 表现模式：剥 inputrules（Word 式，打 ** 就是字面星号）
let milkEditor = null;   // 表现模式
let milkReady = false;
let suppressDirty = false;
let countTimer = null;

async function buildMilkdown(rootId, { stripRules }) {
  const ed = await Editor.make()
    .config((ctx) => { ctx.set(rootCtx, rootId); })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated(() => {
        if (!suppressDirty) markDirty();
        clearTimeout(countTimer);
        countTimer = setTimeout(updateCount, 300);
      });
    })
    .create();
  if (stripRules) stripInputRulesOf(ed);
  return ed;
}
function stripInputRulesOf(ed) {
  try {
    const ctx = ed.ctx;
    const view = ctx.get(editorViewCtx);
    const kept = view.state.plugins.filter((p) => {
      if (p.spec && p.spec.isInputRules) return false;
      if (p.key && /inputrules/i.test(p.key)) return false;
      return true;
    });
    view.updateState(view.state.reconfigure({ plugins: kept }));
  } catch (err) {
    console.warn("stripInputRules failed, keep inputrules:", err);
  }
}
async function initMilkdown() {
  milkEditor = await buildMilkdown("#milkdown-host", { stripRules: true });   // 表现
  if (docSeed) setMilkdownContent(docSeed, milkEditor);
  milkReady = true;
  const v = milkView(); if (v) v.focus();
}
function milkView() { return milkEditor ? milkEditor.ctx.get(editorViewCtx) : null; }
// 统一设置编辑器内容：ed 为 "hybrid"/"source" 走 CM6 视图，否则（Milkdown 编辑器或省略）走 PM
function setMilkdownContent(md, ed) {
  if (ed === "hybrid") { cmReplaceAllTo(hybridView, md); return; }
  if (ed === "source") { cmReplaceAllTo(cmView, md); return; }
  if (ed === undefined) ed = milkEditor;
  if (!ed || !ed.ctx) { console.warn("setMilkdownContent: editor not ready"); return; }
  const ctx = ed.ctx;
  const view = ctx.get(editorViewCtx);
  const doc = ctx.get(parserCtx)(md);
  suppressDirty = true;
  try {
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr);
  } finally { suppressDirty = false; }
}
function milkdownToMd(ed = milkEditor) {
  const ctx = ed.ctx;
  const view = ctx.get(editorViewCtx);
  return ctx.get(serializerCtx)(view.state.doc);
}

// ============ 编辑宿主 ============
const milkHost = document.getElementById("milkdown-host");     // 表现（PM）
const hybridHost = document.getElementById("milkdown-host-h"); // 半表现（CM6 块渲染，复用旧宿主 id）
const cmHost = document.getElementById("cm-host");             // 源码（CM6）

// ============ 半表现：CM6 + markdown-it 块渲染（MarkText 路线） ============
// 底层是 markdown 文本；非焦点块用 markdown-it 渲染成富文本 widget，焦点块显示原始源码。
const HYBRID_FONT = '400 14.5px Calibri, "Microsoft YaHei", SimSun, sans-serif';
const _mctx = document.createElement("canvas").getContext("2d");
const _htmlCache = new Map(); // text -> html，避免每次按键全量 mdit.render

function renderMd(text) {
  let h = _htmlCache.get(text);
  if (h === undefined) {
    try { h = mdit.render(text); } catch { h = ""; }
    if (_htmlCache.size > 2000) _htmlCache.clear();
    _htmlCache.set(text, h);
  }
  return h;
}

// 渲染块 widget：带上 from/to/view，点它=把光标设进该块→该块转为显示源码
class BlockWidget extends WidgetType {
  constructor(html, from, to, view) { super(); this.html = html; this.from = from; this.to = to; this.view = view; }
  eq(other) { return other.html === this.html && other.from === this.from && other.to === this.to; }
  ignoreEvent() { return true; } // 让 CM6 完全忽略来自该 DOM 的事件（我们自行处理 mousedown）
  toDOM() {
    const d = document.createElement("div");
    d.className = "md-render";
    d.innerHTML = this.html;
    d.addEventListener("mousedown", (e) => onRenderBlockMouseDown(e, this));
    return d;
  }
}

// 把渲染块上的点击坐标映射成源文档位置（行按渲染行高估、列按字宽二分）
function caretPosInBlock(view, dom, from, to, clientX, clientY) {
  const { state } = view;
  const firstLine = state.doc.lineAt(from);
  const lastLine = state.doc.lineAt(to);
  const lineCount = lastLine.number - firstLine.number + 1;
  const rect = dom.getBoundingClientRect();
  const cs = getComputedStyle(dom);
  const lh = parseFloat(cs.lineHeight) || view.defaultLineHeight || 24;
  let row = Math.floor((clientY - rect.top) / lh);
  row = Math.max(0, Math.min(lineCount - 1, row));
  const line = state.doc.line(firstLine.number + row);
  const text = line.text, x0 = rect.left;
  _mctx.font = HYBRID_FONT;
  if (clientX <= x0) return line.from;
  if (clientX >= x0 + _mctx.measureText(text).width) return line.to;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x0 + _mctx.measureText(text.slice(0, mid)).width < clientX) lo = mid + 1; else hi = mid;
  }
  return line.from + lo;
}

function onRenderBlockMouseDown(e, w) {
  if (e.button !== 0) return;
  e.preventDefault();      // 不启动原生选区
  e.stopPropagation();      // 挡住 CM6 自己的 mousedown
  const view = w.view || hybridView;
  const pos = caretPosInBlock(view, e.currentTarget, w.from, w.to, e.clientX, e.clientY);
  view.focus();
  view.dispatch({ selection: { anchor: pos, head: pos } });
  // selectionSet → blockDecorField 重建 → 该块不再 replace → 同段文本变普通源码行
}

// 块切分：按空行分块；围栏代码块整块（校验闭合）；松散列表/多段引用不切块
function mdBlocksOf(doc) {
  const blocks = [];
  const n = doc.lines;
  let start = null, lines = [], inFence = false, fenceMarker = "";
  const isList = (t) => /^\s{0,3}([-*+]|\d+[.)])\s/.test(t);
  const isQuote = (t) => /^\s{0,3}>/.test(t);
  const sameFamily = (a, b) => (a && b) && ((isList(a) && isList(b)) || (isQuote(a) && isQuote(b)));
  const flush = (endLine) => {
    if (start !== null && endLine >= start) {
      blocks.push({ from: doc.line(start).from, to: doc.line(endLine).to, text: lines.join("\n") });
    }
    start = null; lines = [];
  };
  for (let ln = 1; ln <= n; ln++) {
    const t = doc.line(ln).text;
    const fm = t.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fm) {
      if (inFence) {
        if (fm[1][0] === fenceMarker[0] && fm[1].length >= fenceMarker.length && fm[2].trim() === "") {
          lines.push(t); flush(ln); inFence = false;
        } else lines.push(t); // 块内的同类围栏，继续
        continue;
      }
      flush(ln - 1); inFence = true; fenceMarker = fm[1]; start = ln; lines = [t];
      continue;
    }
    if (inFence) { lines.push(t); continue; }
    if (t.trim() === "") {
      let m = ln; while (m + 1 <= n && doc.line(m + 1).text.trim() === "") m++; // 跳过连续空行
      const next = m + 1 <= n ? doc.line(m + 1).text : null;
      const prev = lines.length ? lines[lines.length - 1] : null;
      if (start !== null && sameFamily(prev, next)) {
        for (let k = ln; k <= m; k++) lines.push(doc.line(k).text); // 松散列表/多段引用并入同块
        continue;
      }
      flush(ln - 1);
      continue;
    }
    if (start === null) { start = ln; lines = [t]; } else lines.push(t);
  }
  flush(n);
  return blocks;
}

// 从 state 计算块装饰（非焦点块渲染、焦点块留源码）。
// 关键：块装饰必须经 StateField + EditorView.decorations facet 提供，
// 不能走 ViewPlugin 的 decorations 字段——CM6 会抛 "Block decorations may not be specified via plugins"。
function buildBlockDecors(state) {
  const { doc, selection } = state;
  if (doc.lines > 3000) return Decoration.none; // 大文档退化为纯源码
  const builder = [];
  const sel = selection.main;
  for (const b of mdBlocksOf(doc)) {
    // 焦点块（光标/选区涉及）保持源码（不装饰）；其余渲染（去掉备份的 +1：否则段末回车会让上段裸显源码）
    if (sel.from <= b.to && sel.to >= b.from) continue;
    const html = renderMd(b.text);
    if (!html.trim()) continue;
    builder.push(Decoration.replace({ widget: new BlockWidget(html, b.from, b.to), block: true }).range(b.from, b.to));
  }
  // block 装饰必须显式 sort=true，否则 RangeSetBuilder 崩（startSide undefined）
  return builder.length ? Decoration.set(builder, true) : Decoration.none;
}

const blockDecorField = StateField.define({
  create: (state) => buildBlockDecors(state),
  update: (_prev, tr) => buildBlockDecors(tr.state),
  provide: (f) => EditorView.decorations.from(f),
});

// ---------- 代码模式语法高亮（从 npj 搬来：N++ 配色，刻意不含 strong/emphasis 规则，
//  所以 **加粗** / *斜体* 只着色不真的加粗斜体——代码模式就是纯 md 源码，不做任何渲染） ----------
const nppHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#0000FF" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#008000" },
  { tag: [t.string, t.special(t.string)], color: "#808000" },
  { tag: t.number, color: "#FF8000" },
  { tag: [t.tagName], color: "#0000FF" },
  { tag: [t.attributeName], color: "#800080" },
  { tag: t.heading, color: "#0000FF", fontWeight: "bold" },
  { tag: t.link, color: "#0000FF", textDecoration: "underline" },
]);

// ============ CM6 视图工厂（source 纯源码 / hybrid 块渲染） ============
function createCmView(host, { hybrid }) {
  const base = [
    cmHistory(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    indentOnInput(),
    indentUnit.of("    "), // 与 npj 一致：Tab=4 空格
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
  const exts = hybrid ? [
    ...base,
    EditorView.lineWrapping,
    blockDecorField,
    EditorView.theme({
      "&": { backgroundColor: "transparent", fontSize: "14.5px", lineHeight: "1.65" },
      ".cm-content": { fontFamily: HYBRID_FONT, padding: "0", caretColor: "#000" },
      ".cm-cursor": { borderLeftColor: "#000" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#C0E2F1" },
    }),
  ] : [
    // ===== 代码模式：对齐 npj 的 md 编辑体验（纯源码，零渲染；**不加粗**） =====
    ...base,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorState.allowMultipleSelections.of(true),
    syntaxHighlighting(nppHighlight),
    keymap.of([...closeBracketsKeymap]),
    EditorView.theme({
      "&": { backgroundColor: "transparent", color: "#000", fontSize: "13px", lineHeight: "1.6" },
      ".cm-content": { fontFamily: '"Courier New", "Microsoft YaHei", monospace', padding: "0", caretColor: "#000" },
      ".cm-gutters": { backgroundColor: "#E8E8E8", color: "#707070", border: "none", fontSize: "11px" },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 4px 0 3px" },
      ".cm-activeLine": { backgroundColor: "rgba(255,255,150,0.40)" },       // npj 黄底当前行
      ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,150,0.40)" }, // 行号 gutter 同步高亮（行号背景色不同）
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#C0E2F1" },
      ".cm-cursor": { borderLeftColor: "#000" },
      ".cm-selectionMatch": { backgroundColor: "rgba(100,160,255,0.35)" },
    }),
  ];
  return new EditorView({ parent: host, state: EditorState.create({ doc: docSeed, extensions: exts }) });
}

const cmView = createCmView(cmHost, { hybrid: false });        // 源码
const hybridView = createCmView(hybridHost, { hybrid: true }); // 半表现

// ============ 跨模式编辑器辅助 ============
function activeCmView() { return mode === "hybrid" ? hybridView : cmView; }
function activeEditor() {
  if (mode === "presentation") { const v = milkView(); return v ? { kind: "pm", view: v } : null; }
  const v = activeCmView();
  return v ? { kind: "cm", view: v } : null;
}
// dirty + 字数跟踪：包住 CM6 视图的 dispatch（selection-only 不触发）
function trackCmDirty(view) {
  view.dispatch = ((orig) => function (tr) {
    orig.call(this, tr);
    const changes = Array.isArray(tr) ? tr.filter((t) => t.changes && !t.changes.empty) : (tr.changes && !tr.changes.empty ? [tr] : []);
    if (changes.length && !suppressDirty) markDirty();
    if (changes.length) updateCount();
  })(view.dispatch);
}
trackCmDirty(cmView);
trackCmDirty(hybridView);
// 全量替换某 CM6 视图内容（不标脏）
function cmReplaceAllTo(view, md) {
  suppressDirty = true;
  try {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: md } });
  } finally { suppressDirty = false; }
}
function cmReplaceAll(md) { cmReplaceAllTo(cmView, md); }

// ============ 模式切换 ============
const MODE_LABEL = { presentation: "表现模式", hybrid: "半表现模式", source: "代码模式" };
function currentMd() {
  if (mode === "presentation") return milkReady ? milkdownToMd(milkEditor) : docSeed;
  if (mode === "hybrid") return hybridView.state.doc.toString();
  return cmView.state.doc.toString();
}

function switchMode(next) {
  if (next === mode) return;
  const md = currentMd();
  mode = next;
  milkHost.classList.toggle("show", next === "presentation");
  hybridHost.classList.toggle("show", next === "hybrid");
  cmHost.classList.toggle("show", next === "source");
  if (next === "presentation") {
    setMilkdownContent(md, milkEditor);
    const v = milkView(); if (v) v.focus();
  } else if (next === "hybrid") {
    cmReplaceAllTo(hybridView, md);
    hybridView.focus();
  } else {
    cmReplaceAll(md);
    cmView.focus();
  }
  syncModeUi();
  updateCount();
  toast(`已切换至：${MODE_LABEL[next] || next}`);
}

function syncModeUi() {
  document.querySelectorAll(".st-vbtn").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  document.querySelectorAll("#ribbon-body [data-viewmode]").forEach((b) => {
    b.classList.toggle("on", b.dataset.viewmode === mode);
  });
}

document.querySelectorAll(".st-vbtn").forEach((b) => b.addEventListener("click", () => {
  switchMode(b.dataset.mode);
}));

// 状态栏缩放条
let paperZoom = 100;
function applyZoom(z) {
  paperZoom = Math.max(50, Math.min(200, z));
  document.getElementById("paper").style.zoom = paperZoom / 100;
  document.getElementById("st-zoom-pct").textContent = paperZoom + "%";
  document.getElementById("zoom-slider").style.left = ((paperZoom - 50) / 150) * 78 + "%";
}
document.getElementById("zoom-in").addEventListener("click", () => applyZoom(paperZoom + 10));
document.getElementById("zoom-out").addEventListener("click", () => applyZoom(paperZoom - 10));
document.getElementById("zoom-track").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  applyZoom(50 + Math.round(((e.clientX - rect.left) / rect.width) * 150 / 10) * 10);
});
// Ctrl+滚轮缩放（Word 2010 行为；拦掉 Chromium 默认整页缩放）
document.getElementById("editor-wrap").addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  applyZoom(paperZoom + (e.deltaY < 0 ? 10 : -10));
}, { passive: false });

// ============ 命令执行器 ============
function exec(cmd) {
  if (cmd === "copy" || cmd === "cut") {
    document.execCommand(cmd === "copy" ? "copy" : "cut");
    return;
  }
  if (cmd === "paste") { doPaste(); return; }
  if (mode === "presentation") execMilk(cmd);
  else execCm(cmd);
}

// 粘贴统一流程
async function doPaste() {
  const { text, html } = await window.wdt.clipRead();
  let inserted;
  if (html && html.includes("<")) inserted = turndown.turndown(stripClipHtml(html));
  else inserted = text || "";
  const mdFallback = text || inserted;
  insertMd(inserted);
  const coords = caretScreenPos();
  setTimeout(() => showPasteOpt(coords.x, coords.y, {
    kind: "paste",
    apply: async (fmt) => {
      const clip = await window.wdt.clipRead();
      let md;
      if (fmt === "advanced") md = (clip.html && clip.html.includes("<")) ? turndown.turndown(stripClipHtml(clip.html)) : clip.text;
      else md = mdFallback;
      if (mode === "presentation") execMilk("undo");
      else cmUndo(activeCmView());
      insertMd(md);
      toast(fmt === "advanced" ? "已粘贴为保留源格式" : "已粘贴为纯文本格式");
    },
  }), 60);
}

function execMilk(cmd) {
  const ctx = milkEditor.ctx;
  const call = (c, payload) => milkEditor.action(callCommand(c.key, payload));
  switch (cmd) {
    case "bold": call(toggleStrongCommand); break;
    case "italic": call(toggleEmphasisCommand); break;
    case "strike": call(toggleStrikethroughCommand); break;
    case "inlineCode": call(toggleInlineCodeCommand); break;
    case "clearFormat": {
      const view = milkView();
      if (view) {
        const { state } = view;
        const { from, to } = state.selection;
        if (from < to) {
          const text = state.doc.textBetween(from, to);
          view.dispatch(state.tr.insertText(text, from, to));
        }
      }
      break;
    }
    case "h1": case "h2": case "h3": call(wrapInHeadingCommand, Number(cmd[1])); break;
    case "normalPara": call(turnIntoTextCommand); break;
    case "bulletList": call(wrapInBulletListCommand); break;
    case "orderedList": call(wrapInOrderedListCommand); break;
    case "quote": call(wrapInBlockquoteCommand); break;
    case "codeBlock": call(createCodeBlockCommand); break;
    case "hr": call(insertHrCommand); break;
    case "table": {
      // Word 式：从"表格"按钮正下方弹出网格选择器（不是插入点）
      const btn = document.querySelector('#ribbon-body [data-cmd="table"], .rbtn[title*="表格"]');
      const anchor = btn || document.querySelector('.rgroup .rbtn-big');
      const r = anchor ? anchor.getBoundingClientRect() : { left: 80, bottom: 60 };
      showTablePicker(r.left, r.bottom + 6, (rows, cols) => {
        call(insertTableCommand, { row: rows, col: cols });
        toast(`已插入 ${rows}×${cols} 表格`);
      });
      break;
    }
    case "link": {
      const url = prompt("链接地址：", "https://");
      if (url) call(toggleLinkCommand, { href: url });
      break;
    }
    case "image": {
      const url = prompt("图片地址：", "");
      if (url) call(insertImageCommand, { src: url, alt: "图片" });
      break;
    }
    case "toc": {
      const view = milkView();
      if (view) view.dispatch(view.state.tr.insertText("[TOC]\n\n"));
      break;
    }
    case "undo": {
      const v = milkView();
      if (v) pmUndo(v.state, v.dispatch);
      break;
    }
    case "redo": {
      const v = milkView();
      if (v) pmRedo(v.state, v.dispatch);
      break;
    }
    default: toast(`命令 ${cmd} 待实现`);
  }
  milkView()?.focus();
}

function execCm(cmd) {
  const view = activeCmView();
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  const lineText = line.text;
  const replaceLine = (text) => view.dispatch({ changes: { from: line.from, to: line.to, insert: text }, selection: { anchor: line.from + Math.min(text.length, sel.head - line.from) } });
  const wrapSel = (l, r) => {
    if (sel.empty()) { view.dispatch({ changes: { from: sel.head, insert: l + r }, selection: { anchor: sel.head + l.length } }); }
    else {
      const text = state.sliceDoc(sel.from, sel.to);
      const isWrapped = text.startsWith(l) && text.endsWith(r);
      view.dispatch(isWrapped
        ? { changes: { from: sel.from, to: sel.to, insert: text.slice(l.length, -r.length) } }
        : { changes: { from: sel.from, to: sel.to, insert: l + text + r } });
    }
  };
  const wantOf = (c) => ({ h1: "# ", h2: "## ", h3: "### " }[c] || "");
  const togglePrefix = (prefix) => {
    const has = lineText.startsWith(prefix);
    if (cmd.startsWith("h")) {
      const cur = lineText.match(/^#{1,6}\s+/);
      replaceLine(cur && cur[0] === wantOf(cmd) && lineText.startsWith(prefix)
        ? lineText.replace(/^#{1,6}\s+/, "")
        : prefix + lineText.replace(/^#{1,6}\s+/, ""));
    } else if (has) replaceLine(lineText.slice(prefix.length));
    else replaceLine(prefix + lineText);
  };
  switch (cmd) {
    case "bold": wrapSel("**", "**"); break;
    case "italic": wrapSel("*", "*"); break;
    case "strike": wrapSel("~~", "~~"); break;
    case "inlineCode": wrapSel("`", "`"); break;
    case "clearFormat": {
      if (!sel.empty) {
        let t = state.sliceDoc(sel.from, sel.to);
        t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/~~(.+?)~~/g, "$1").replace(/`(.+?)`/g, "$1");
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: t } });
      }
      break;
    }
    case "h1": togglePrefix("# "); break;
    case "h2": togglePrefix("## "); break;
    case "h3": togglePrefix("### "); break;
    case "normalPara": replaceLine(lineText.replace(/^#{1,6}\s+/, "").replace(/^>\s+/, "")); break;
    case "bulletList": togglePrefix("- "); break;
    case "orderedList": togglePrefix("1. "); break;
    case "quote": togglePrefix("> "); break;
    case "codeBlock": {
      const text = sel.empty ? "" : state.sliceDoc(sel.from, sel.to);
      const insert = "```\n" + text + "\n```\n";
      view.dispatch(sel.empty
        ? { changes: { from: line.from, insert }, selection: { anchor: line.from + 4 } }
        : { changes: { from: sel.from, to: sel.to, insert } });
      break;
    }
    case "hr": view.dispatch({ changes: { from: line.from, insert: "---\n" } }); break;
    case "table": {
      const btn = document.querySelector('#ribbon-body [data-cmd="table"]');
      const r = btn ? btn.getBoundingClientRect() : { left: 80, bottom: 60 };
      showTablePicker(r.left, r.bottom + 6, (rows, cols) => {
        const v = activeCmView();                 // 回调运行时重读（避免闭包里的旧 state/sel）
        const cur = v.state.selection.main;
        const line = v.state.doc.lineAt(cur.head);
        v.dispatch({ changes: { from: line.from, to: line.to, insert: line.text + tableMd(rows, cols) } });
        v.focus();
        toast(`已插入 ${rows}×${cols} 表格`);
      });
      break;
    }
    case "link": {
      const url = prompt("链接地址：", "https://");
      if (url) {
        const text = sel.empty ? url : state.sliceDoc(sel.from, sel.to);
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${text}](${url})` } });
      }
      break;
    }
    case "image": {
      const url = prompt("图片地址：", "");
      if (url) view.dispatch({ changes: { from: line.from, insert: `![图片](${url})\n` } });
      break;
    }
    case "toc": view.dispatch({ changes: { from: line.from, insert: "[TOC]\n\n" } }); break;
    case "undo": cmUndo(view); break;
    case "redo": cmRedo(view); break;
    default: toast(`命令 ${cmd} 待实现`);
  }
  view.focus();
}

// ============ Word 2010 快捷键表 ============
window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  let cmd = null, stop = true;
  if (alt && ctrl && ["1", "2", "3"].includes(e.key)) cmd = "h" + e.key;         // Alt+Ctrl+1/2/3
  else if (ctrl && shift && k === "n") cmd = "normalPara";                       // Ctrl+Shift+N
  else if (ctrl && shift && k === "l") cmd = "bulletList";                       // Ctrl+Shift+L
  else if (ctrl && !shift && k === "b") cmd = "bold";
  else if (ctrl && !shift && k === "i") cmd = "italic";
  else if (ctrl && !shift && k === "u") { toast("Markdown 扩展下划线占位"); return; }
  else if (ctrl && !shift && k === "k") cmd = "link";
  else if (ctrl && e.key === "Enter") cmd = "hr";                                // Ctrl+Enter 分页->水平线
  else if (ctrl && k === "s") { shift ? saveAs() : save(); return; }             // Ctrl+S / Ctrl+Shift+S
  else if (e.key === "F12") { saveAs(); return; }                                // Word 的 F12
  else if (ctrl && k === "o") { openFile(); return; }
  else if (ctrl && (k === "z") && !shift) { exec("undo"); }
  else if ((ctrl && k === "y") || (ctrl && shift && k === "z")) exec("redo");
  else if (ctrl && k === "f") { toast("查找功能占位"); return; }
  else if (ctrl && k === "h") { toast("替换功能占位"); return; }
  else stop = false;
  if (cmd) { e.preventDefault(); exec(cmd); }
  else if (stop) e.preventDefault();
});

// ============ 复制 / 粘贴浮动选项卡（Word 2010 式） ============
const po = document.getElementById("paste-opt");
const poMenu = document.getElementById("po-menu");
const poBtn = document.getElementById("po-btn");
let poTimer = null;
let poAction = null; // { kind: 'copy'|'paste', apply(format) }

function showPasteOpt(x, y, action) {
  poAction = action;
  po.hidden = false;
  poMenu.hidden = true;
  po.style.left = Math.min(x, window.innerWidth - 270) + "px";
  po.style.top = Math.max(0, y) + "px";
  clearTimeout(poTimer);
  poTimer = setTimeout(hidePasteOpt, 4500);
}
function hidePasteOpt() { po.hidden = true; poMenu.hidden = true; poAction = null; }
poBtn.addEventListener("click", () => { poMenu.hidden = !poMenu.hidden; clearTimeout(poTimer); });
document.getElementById("po-adv").addEventListener("click", () => { poAction?.apply("advanced"); hidePasteOpt(); });
document.getElementById("po-merge").addEventListener("click", () => { toast("合并格式：保持目标段落格式"); hidePasteOpt(); });
document.getElementById("po-md").addEventListener("click", () => { poAction?.apply("md"); hidePasteOpt(); });
document.getElementById("po-default").addEventListener("click", () => { toast("设置默认粘贴：默认保留源格式"); hidePasteOpt(); });

// 选区 md（跨模式）
function selectionMd() {
  if (mode === "presentation") {
    const view = milkView();
    if (!view) return "";
    const { from, to } = view.state.selection;
    if (from === to) return "";
    const slice = view.state.doc.slice(from, to);
    return milkEditor.ctx.get(serializerCtx)(slice);
  }
  const cm = activeCmView();
  const sel = cm.state.selection.main;
  return cm.state.sliceDoc(sel.from, sel.to);
}
function insertMd(md) {
  if (mode === "presentation") {
    const ctx = milkEditor.ctx; const view = milkView();
    if (!view) return;
    const doc = ctx.get(parserCtx)(md);
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.replaceWith(from, to, doc.content));
  } else {
    const cm = activeCmView();
    const sel = cm.state.selection.main;
    cm.dispatch({ changes: { from: sel.from, to: sel.to, insert: md } });
  }
}

// 复制事件：支持复制为富文本 / Markdown 格式
document.addEventListener("copy", (e) => {
  const md = selectionMd();
  if (!md) return;
  const coords = caretScreenPos();
  setTimeout(() => showPasteOpt(coords.x, coords.y, {
    kind: "copy",
    apply: (fmt) => {
      if (fmt === "advanced") window.wdt.clipWrite(md, `<div>${mdit.render(md)}</div>`);
      else window.wdt.clipWrite(md, undefined);
      toast(fmt === "advanced" ? "已复制为源格式" : "已复制为纯文本格式");
    },
  }), 60);
});

// 粘贴事件：拦截默认，走统一粘贴流程
document.addEventListener("paste", (e) => {
  e.preventDefault();
  doPaste();
});

function stripClipHtml(html) {
  return html.replace(/<!--StartFragment-->|<!--EndFragment-->/g, "");
}

function caretScreenPos() {
  let x = 80, y = 140;
  try {
    if (mode === "presentation") {
      const view = milkView();
      if (view) {
        const pos = view.state.selection.to;
        const coords = view.coordsAtPos(pos);
        x = coords.left; y = coords.bottom + 4;
      }
    } else {
      const cm = activeCmView();
      const pos = cm.state.selection.main.to;
      const coords = cm.coordsAtPos(pos);
      if (coords) { x = coords.left; y = coords.bottom + 4; }
    }
  } catch { /* fallback */ }
  return { x, y };
}

// ============ 文档管理 ============
function markDirty() {
  if (!dirty) { dirty = true; refreshTitle(); }
}
function refreshTitle() {
  const name = filePath ? filePath.split(/[\\/]/).pop() : "文档1";
  document.getElementById("title-text").textContent = `${name} - wdt`;
  window.wdt.setTitle(`${name} - wdt`);
}
function updateCount() {
  const md = currentMd();
  const cjk = (md.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (md.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9_'-]+/g) || []).length;
  document.getElementById("st-count").textContent = `字数: ${cjk + words}`;
  scheduleInfer();
}

// ============ 推断默认文件名（本地 Ollama/Qwen2.5-0.5B，选项页开关） ============
let suggestedName = null; // 未保存文档的推断文件名；首次保存后自然失效（filePath 一旦有了就不再用）
let inferTimer = null, inferBusy = false, inferHash = "";
function inferNamePrefOn() { try { return localStorage.getItem("wdt-pref-infer-name") === "1"; } catch { return false; } }
// 停止输入 2.5s 后推断一次；同一内容不重跑；失败静默——保存对话框永远有"文档1"兜底
function scheduleInfer(force) {
  if (!inferNamePrefOn() || filePath || !docOpen) return;
  const md = currentMd();
  if (!md || md.trim().length < 30) return;
  clearTimeout(inferTimer);
  inferTimer = setTimeout(runInfer, force ? 0 : 2500);
}
async function runInfer() {
  if (inferBusy) { scheduleInfer(); return; }
  const head = currentMd().trim().slice(0, 1500);
  if (!head || head === inferHash) return;
  inferHash = head; inferBusy = true;
  try {
    const r = await window.wdt.aiInfer(head);
    if (r && r.name && !filePath) suggestedName = r.name; // 推断期间已保存则丢弃
  } catch { /* 静默降级 */ } finally { inferBusy = false; }
}

async function openFile(p) {
  if (!p) p = await window.wdt.openDialog();
  if (!p) return;
  const r = await window.wdt.readFile(p);
  if (r.error) { toast("打开失败：" + r.error); return; }
  setDoc(r.content, p);
  setDocOpen(true);
  pushRecent(p);
  toast("已打开 " + p.split(/[\\/]/).pop());
}
// 统一设置文档内容（三模式同步）
function setDoc(md, path) {
  filePath = path || null;
  dirty = false;
  suggestedName = null; inferHash = ""; // 换文档后旧推断作废
  docSeed = md;
  if (milkReady) setMilkdownContent(md, milkEditor);
  cmReplaceAllTo(hybridView, md);
  cmReplaceAllTo(cmView, md);
  refreshTitle(); updateCount();
  const ed = activeEditor();
  ed && ed.view.focus();
}
// 无文档状态：关闭后编辑区纯灰（Ribbon 保留，无纸张无内容 —— 用户指定）
let docOpen = false;
function setDocOpen(v) {
  docOpen = v;
  document.getElementById("paper").style.visibility = v ? "" : "hidden";
}

// 三按钮确认（保存/不保存/取消）——window.confirm 只有两键
function confirmCloseDlg() {
  return new Promise((resolve) => {
    let dlg = document.getElementById("quit-dlg");
    if (!dlg) {
      dlg = document.createElement("div");
      dlg.id = "quit-dlg";
      dlg.innerHTML = `<div class="qd-box">
        <div class="qd-title">wdt</div>
        <div class="qd-body">是否将更改保存到 文档？</div>
        <div class="qd-btns">
          <button id="qd-cancel">取消</button>
          <button id="qd-nosave">不保存(N)</button>
          <button id="qd-save">保存(S)</button>
        </div>
      </div>`;
      document.body.appendChild(dlg);
    }
    dlg.hidden = false;
    const done = (v) => { dlg.hidden = true; resolve(v); };
    dlg.querySelector("#qd-save").onclick = () => done("save");
    dlg.querySelector("#qd-nosave").onclick = () => done("nosave");
    dlg.querySelector("#qd-cancel").onclick = () => done("cancel");
  });
}

async function closeDoc() {
  // 关闭 = 关闭文档；有修改时三选（保存/不保存/取消）；之后编辑区纯灰（用户指定的空壳状态）
  if (dirty) {
    const r = await confirmCloseDlg();
    if (r === "cancel") return;
    if (r === "save") await save();
  }
  setDoc("", null);
  setDocOpen(false);
  hideBackstage();
  toast("已关闭");
}
async function save() {
  if (!filePath) return saveAs();
  const r = await window.wdt.writeFile(filePath, currentMd());
  if (r.error) { toast("保存失败：" + r.error); return; }
  dirty = false; refreshTitle(); toast("已保存");
}
async function saveAs() {
  // 未保存过：默认名 = 本地模型推断的（可改）；再兜底"文档1"
  const defName = filePath ? filePath.split(/[\\/]/).pop()
    : (suggestedName ? suggestedName.replace(/[\\/:*?"<>|]/g, "") + ".md" : "文档1.md");
  const p = await window.wdt.saveDialog(defName);
  if (!p) return;
  // 选了 PDF 文档类型 = 直接把当前文档打印成 PDF（Word 行为：不切换当前文档）
  if (p.toLowerCase().endsWith(".pdf")) {
    toast("正在生成 PDF…");
    const base = filePath ? filePath.replace(/\.[^.]*$/, "") : (suggestedName || "文档1");
    const r = await window.wdt.exportPdf({ html: buildExportHtml(base), outPath: p });
    if (r && r.error) toast("导出 PDF 失败：" + r.error);
    else if (r && r.ok) toast("已另存为 PDF：" + r.path.split(/[\\/]/).pop());
    return;
  }
  filePath = p;
  await save();
}
// 拖拽打开 .md
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.path) openFile(f.path);
});

let quitting = false;
async function beforeQuit() {
  if (quitting) return;
  if (!dirty) { quitting = true; window.wdt.forceQuit(); return; }
  const r = await window.wdt.confirmUnsaved();
  if (r === 2) return;
  if (r === 0) await save();
  quitting = true;
  window.wdt.forceQuit();
}

window.wdt.onAction((a) => {
  if (a.type === "openPaths" && a.paths[0]) {
    window.wdt.readFile(a.paths[0]).then((r) => {
      if (!r.error) { setDoc(r.content, a.paths[0]); pushRecent(a.paths[0]); }
    });
  } else if (a.type === "beforeQuit") beforeQuit();
});


// ============ 表格选择器（Word 式：悬浮/按下拖选行×列，松开插入） ============
const tablePicker = document.getElementById("table-picker");
const TP_ROWS = 5, TP_COLS = 8;
let tpR = 0, tpC = 0, tpCallback = null, tpDragging = false;
let tpGridEl = null, tpLabelEl = null;
let lastPX = -1, lastPY = -1; // 全局鼠标坐标，用于"默认选中鼠标下方那个格"
document.addEventListener("pointermove", (e) => { lastPX = e.clientX; lastPY = e.clientY; }, { passive: true });

// 网格只建一次，之后只切 class（避免每帧 innerHTML 重建导致 e.target 失效）
function buildTablePickerOnce() {
  if (tpGridEl) return;
  const grid = document.createElement("div");
  grid.className = "tp-grid";
  for (let r = 0; r < TP_ROWS; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "tp-row";
    for (let c = 0; c < TP_COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "tp-cell";
      cell.dataset.r = r; cell.dataset.c = c;
      rowEl.appendChild(cell);
    }
    grid.appendChild(rowEl);
  }
  tablePicker.innerHTML = "";
  tablePicker.appendChild(grid);
  const label = document.createElement("div");
  label.className = "tp-label";
  tablePicker.appendChild(label);
  tpGridEl = grid; tpLabelEl = label;
}
// 按几何算 r/c（1基）；鼠标在网格外 → 0×0（不依赖 e.target，捕获后 e.target 是 picker 本身）
function tpCellFromPoint(x, y) {
  const rect = tpGridEl.getBoundingClientRect();
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return { r: 0, c: 0 };
  const rowW = tpGridEl.firstChild.getBoundingClientRect().width;
  const pitchX = rowW / TP_COLS, pitchY = rect.height / TP_ROWS;
  let c = Math.floor((x - rect.left) / pitchX);
  let r = Math.floor((y - rect.top) / pitchY);
  r = Math.max(0, Math.min(TP_ROWS - 1, r));
  c = Math.max(0, Math.min(TP_COLS - 1, c));
  return { r: r + 1, c: c + 1 };
}
function tpPaint() {
  tpGridEl.querySelectorAll(".tp-cell").forEach((el) => {
    el.classList.toggle("sel", Number(el.dataset.r) < tpR && Number(el.dataset.c) < tpC);
  });
  tpLabelEl.textContent = `${tpR}×${tpC} 表格`;
}
function showTablePicker(x, y, cb) {
  tpCallback = cb; tpDragging = false;
  buildTablePickerOnce();
  tablePicker.hidden = false;
  // 先显示再测宽高，避免超出右/下边界
  tablePicker.style.left = "0px"; tablePicker.style.top = "0px";
  const w = tablePicker.offsetWidth || 230, h = tablePicker.offsetHeight || 200;
  tablePicker.style.left = Math.max(6, Math.min(x, window.innerWidth - w - 6)) + "px";
  tablePicker.style.top = Math.max(6, Math.min(y, window.innerHeight - h - 6)) + "px";
  // 默认 = 鼠标下方那个格；鼠标不在网格内则 0×0
  const init = lastPX >= 0 ? tpCellFromPoint(lastPX, lastPY) : { r: 0, c: 0 };
  tpR = init.r; tpC = init.c;
  tpPaint();
}
function hideTablePicker() { tablePicker.hidden = true; tpCallback = null; tpDragging = false; }
// 关键：picker 事件在「捕获阶段」处理并停止冒泡，否则 document 的 pointerdown 会先把 picker 关掉
tablePicker.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (tablePicker.setPointerCapture) { try { tablePicker.setPointerCapture(e.pointerId); } catch {} }
  tpDragging = true;
  const cell = tpCellFromPoint(e.clientX, e.clientY);
  tpR = cell.r; tpC = cell.c; tpPaint();
}, true);
// 悬浮预览 + 拖选：一律按几何更新（不再判断 tpDragging）
tablePicker.addEventListener("pointermove", (e) => {
  const cell = tpCellFromPoint(e.clientX, e.clientY);
  tpR = cell.r; tpC = cell.c; tpPaint();
}, true);
// 鼠标移出网格（非拖选中）→ 归零
tablePicker.addEventListener("pointerleave", () => {
  if (tpDragging) return;
  tpR = 0; tpC = 0; tpPaint();
}, true);
const tpEnd = (e) => {
  if (!tpDragging) return;
  tpDragging = false;
  if (tablePicker.releasePointerCapture) { try { tablePicker.releasePointerCapture(e.pointerId); } catch {} }
  const cell = tpCellFromPoint(e.clientX, e.clientY);
  const cb = tpCallback; hideTablePicker();
  if (cell.r > 0 && cell.c > 0) cb && cb(cell.r, cell.c); // 0×0（移出网格松开）不插
};
tablePicker.addEventListener("pointerup", tpEnd, true);
tablePicker.addEventListener("pointercancel", tpEnd, true);
tablePicker.addEventListener("lostpointercapture", tpEnd, true);
document.addEventListener("pointerdown", (e) => {
  if (!tablePicker.hidden && !e.target.closest("#table-picker")) hideTablePicker();
}, true);
function tableMd(rows, cols) {
  const head = "| " + Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(" | ") + " |";
  const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const body = Array.from({ length: Math.max(0, rows - 1) }, () =>
    "| " + Array.from({ length: cols }, () => "").join(" | ") + " |");
  return "\n" + [head, sep, ...body].join("\n") + "\n\n";
}

// ============ 编辑光标与边距行选（Word 体验） ============
const editorWrap = document.getElementById("editor-wrap");
const PAPER_LEFT_PAD = 80, PAPER_TOP_PAD = 64;

// 统一 posAtCoords：CM6 用 {x,y} 且返回数字；PM 用 {left,top} 且返回 {pos,inside}
function posFromCoords(view, kind, clientX, clientY) {
  try {
    if (kind === "cm") { const p = view.posAtCoords({ x: clientX, y: clientY }); return p == null ? null : p; }
    const r = view.posAtCoords({ left: clientX, top: clientY });
    return r ? r.pos : null;
  } catch { return null; }
}

// 点纸面空白处：把光标放到"离点击最近的合法位置"（下方→文末、右侧→行尾）
function placeCaretAt(clientX, clientY) {
  const ed = activeEditor(); if (!ed) return false;
  const { view } = ed;
  view.focus();
  const rect = view.dom.getBoundingClientRect();
  const inside = clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right;
  let pos = inside ? posFromCoords(view, ed.kind, clientX, clientY) : null;
  if (pos == null) {
    const size = ed.kind === "cm" ? view.state.doc.length : view.state.doc.content.size;
    if (clientY >= rect.bottom) pos = size;                    // 最后一行下方 → 文末
    else if (clientX >= rect.right) {                           // 某行右侧空白 → 该行行尾
      pos = posFromCoords(view, ed.kind, rect.right - 1, Math.max(clientY, rect.top + 1));
      if (pos == null) pos = size;
    } else if (clientY <= rect.top) pos = 0;
    else {
      pos = posFromCoords(view, ed.kind, rect.left + 1, clientY);
      if (pos == null) pos = 0;
    }
  }
  if (ed.kind === "cm") {
    view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: false });
  } else {
    const sel = TextSelection.near(view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size))));
    view.dispatch(view.state.tr.setSelection(sel));
  }
  return true;
}

// 三击选全文
function selectWholeDocument() {
  const ed = activeEditor();
  if (!ed) return;
  if (ed.kind === "cm") ed.view.dispatch({ selection: { anchor: 0, head: ed.view.state.doc.length } });
  else ed.view.dispatch(ed.view.state.tr.setSelection(AllSelection.create(ed.view.state.doc)));
}

// 左边距行选：单击选行 / 双击选段 / 三击选全文（PM 与 CM6 分流，修 lineAt bug）
editorWrap.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const paperEl = document.getElementById("paper");
  const pr = paperEl.getBoundingClientRect();
  if (!e.target.closest("#paper") || (e.clientX - pr.left) >= PAPER_LEFT_PAD) return;
  e.preventDefault();
  const now = performance.now();
  const clicks = (now - (editorWrap._lastClick || 0)) < 450 ? (editorWrap._clicks || 0) + 1 : 1;
  editorWrap._lastClick = now; editorWrap._clicks = clicks;
  setTimeout(() => { editorWrap._clicks = 0; }, 500);
  if (clicks >= 3) { selectWholeDocument(); return; }
  const ed = activeEditor(); if (!ed) return;
  const probeX = pr.left + PAPER_LEFT_PAD, probeY = e.clientY;
  if (ed.kind === "cm") {
    const p = posFromCoords(ed.view, "cm", probeX, probeY); if (p == null) return;
    const { doc } = ed.view.state;
    const line = doc.lineAt(p);
    if (clicks >= 2) { // 选段：向上下扩展到空行边界
      let from = line.from, to = line.to;
      while (from > 0 && doc.lineAt(from - 1).text.trim() !== "") from = doc.lineAt(from - 1).from;
      while (to < doc.length && doc.lineAt(to + 1).text.trim() !== "") to = doc.lineAt(to + 1).to;
      ed.view.dispatch({ selection: { anchor: from, head: to } });
    } else {
      ed.view.dispatch({ selection: { anchor: line.from, head: line.to } });
    }
    ed.view.focus();
  } else {
    const r = posFromCoords(ed.view, "pm", probeX, probeY); if (r == null) return;
    const { state } = ed.view;
    const $pos = state.doc.resolve(Math.min(r, state.doc.content.size));
    const depth = Math.max(1, $pos.depth); // depth 0 = 顶层间隙，退化为选顶层块
    const from = clicks >= 2 ? $pos.before(1) : $pos.before(depth); // 双击=顶层块(整段/整表)，单击=最内层块
    const to = clicks >= 2 ? $pos.after(1) : $pos.after(depth);
    ed.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    ed.view.focus();
  }
});

// 点纸面空白处放置光标（命中正文/浮层/左边距则交还对应处理器）
// 注意：这里判的是"真正内容层" .ProseMirror/.cm-content，不是包裹层 .milkdown/.cm-editor——
// 后者有 min-height 会铺满纸面，点其空白处若早退就会"光标不知去哪"（PM/CM 都不处理）。
document.getElementById("paper").addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest("#table-picker, #paste-opt, #backstage, .ProseMirror, .cm-content")) return;
  const pr = document.getElementById("paper").getBoundingClientRect();
  if ((e.clientX - pr.left) < PAPER_LEFT_PAD) return; // 左边距交给行选处理器
  e.preventDefault();
  placeCaretAt(e.clientX, e.clientY);
});

// ============ 启动 ============
window.__wdt = {
  switchMode, exec, currentMd, insertMd, confirmCloseDlg, closeDoc,
  get mode() { return mode; },
  get dirty() { return dirty; },
  // 测试用：按当前模式写入对应编辑器（"presentation"/"hybrid"/"source"）
  setMilkdownContent: (md, ed) => setMilkdownContent(md, ed),
  get suggestedName() { return suggestedName; }, // 推断文件名（自检用）
  inferNow: () => runInfer(),
  buildExportHtml: (title) => buildExportHtml(title),
};
window.__diag = {
  mditRender: (s) => { try { return mdit.render(s); } catch (e) { return "MDIT ERR: " + e.message; } },
  blocks: (which) => mdBlocksOf((which === "source" ? cmView : hybridView).state.doc).map((b) => b.text.slice(0, 14)),
  sel: () => JSON.stringify((mode === "source" ? cmView : hybridView).state.selection.main),
  decors: () => {
    try {
      const d = buildBlockDecors(hybridView.state);
      return d ? "built, size=" + d.size : "NONE";
    } catch (e) {
      return "BUILD ERR: " + e.message + " | " + String(e.stack).split("\n")[1];
    }
  },
  milkMd: () => { try { return currentMd().slice(0, 40); } catch (e) { return "ERR " + e.message; } },
  hybridMd: () => { try { return hybridView.state.doc.toString().slice(0, 40); } catch (e) { return "ERR " + e.message; } },
};

renderRibbonTabs();
renderRibbonBody();
setDocOpen(true); // 启动即空白文档（纸面可见）
milkHost.classList.add("show");
initMilkdown().then(() => { refreshTitle(); updateCount(); });
syncModeUi();
