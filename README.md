# wdt

[![License: AGPL v3 or later](https://img.shields.io/badge/License-AGPL%20v3%2B-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/release-v0.2.0-blue.svg)](https://github.com/hu-kaiqi/wdt/releases)

**[简体中文](#简体中文)** ｜ **[English (US)](#english-us)**

---

# 简体中文

皮是 Word 2010（Ribbon 八选项卡、自绘 2010 标题行、浅色启动画面、Word 式快捷键表），
芯是 Typora 式 Markdown 编辑：**表现 / 半表现 / 代码**三模式一键切换。
Electron 45 + Milkdown（表现层）+ CodeMirror 6（代码层）+ markdown-it（块渲染），界面中英双语。

> 独立复刻项目，与 Microsoft / Typora 无关联；Word、Microsoft 是 Microsoft 的商标。

## 截图

| 表现模式 | 半表现模式 | 代码模式 |
|---|---|---|
| ![presentation](screenshots/presentation.png) | ![hybrid](screenshots/hybrid.png) | ![source](screenshots/source.png) |

## 三模式

1. **表现**（Milkdown）：所见即所得，输入即解析；复制/粘贴后弹 Word 式浮动选项卡（高级文本格式 / MD 格式）
2. **半表现**（MarkText 路线）：底层是 Markdown 源码，非焦点块用 `Decoration.replace` 渲染成成品，点渲染块即聚焦转源码
3. **代码**：CM6 源码模式，配色/当前行/行号 gutter 与 [墨码 moma](https://github.com/hu-kaiqi/moma) 同款

Ribbon：开始/插入/页面布局/引用/邮件/审阅/视图/文件 八选项卡 + QAT；插入表格为 Word 式拖选网格。
快捷键对齐 Word 2010（Alt+Ctrl+1/2/3 标题、Ctrl+Shift+N/L、F12 另存…）。

## 功能

- 导出 HTML / **PDF**（A4 + Word 2010 默认页边距，打印内核）；另存对话框直接选 PDF 类型
- **本地大模型推断文件名**（可选）：未保存文档停输入 2.5s 后台推断，首次另存时作默认名。纯本地（Ollama 优先，自带 llama.cpp + Qwen2.5-0.5B 兜底），内容不出本机——**模型不随安装包分发**，见下
- **中英双语界面**（文件▸选项▸语言，即切即生效），en-US 对齐 Word 2010 官方英文术语

## 下载安装

到 [Releases](https://github.com/hu-kaiqi/wdt/releases) 下载（挂在 Release Assets）：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `wdt-Setup-<版本>.exe` | NSIS 向导式安装 |
| Linux (amd64) | `wdt_<版本>_amd64.deb` | `sudo dpkg -i wdt_...deb` |

SHA256 见 Release 说明。**未签名**，SmartScreen 可能提示。

### AI 推断文件名的运行时（可选）

安装包不含模型（体积考虑）。两种启用方式：

1. 本机已装 **Ollama** 且 `ollama pull qwen2.5:0.5b` ——自动优先复用
2. 按 [ai/README.md](ai/README.md) 的来源与 sha256 重建 `ai/llamacpp/` + `ai/models/`（llama.cpp b12535 CPU 版 + Qwen2.5-0.5B-Instruct Q4_K_M GGUF，约 530MB；Linux/mac 换对应平台包，模型通用）

没有运行时该功能静默失败，不影响其它功能。

## 从源码构建

```bash
git clone https://github.com/hu-kaiqi/wdt.git
cd wdt
npm install
npm run build-renderer   # esbuild 打包渲染层
npm start                # 开发模式

npm run dist             # Windows NSIS Setup.exe（经 dist-app 混淆产物）
npm run dist:linux       # linux-unpacked/，再 python scripts/build-deb.py release <版本>

node scripts/verify.js   # CDP 三模式回归自测（__errors 必须为空）
```

架构：`launcher.cpp` / `launcher-linux.cpp`（g++ 引导，TDM-GCC 4.9.2 `-std=c++14`）→ Electron（main.js 对话框/PDF 导出/AI 拉起 + preload 安全桥 + 渲染层 Ribbon/Backstage/三模式编辑器）。

## 已知局限

- 安装包未签名；Ribbon 为高保真近似复刻（非逐像素）
- 半表现模式的块级反渲染以块为单位，行内混排以源码呈现
- AI 推断受 0.5B 模型能力所限，偶有整句输出（已做句读截断兜底）

## 许可证

代码以 [AGPL-3.0-or-later](LICENSE) 发布。复刻的是交互与外观事实，不含任何 Microsoft / Typora / MarkText 代码。
依赖：Electron（MIT）、CodeMirror 6（MIT）、Milkdown（MPL-2.0）、markdown-it（MIT）、turndown（MIT）。

---

# English (US)

**wdt** is a Markdown editor wearing a Word 2010 suit: a Ribbon interface (eight tabs, custom-drawn 2010 title bar, light splash screen, Word-style shortcut table) over a Typora-style core with **three one-click editing modes — presentation / hybrid / source**. Electron 45 + Milkdown (presentation layer) + CodeMirror 6 (source layer) + markdown-it (block rendering), with a bilingual UI.

> An independent replication project, not affiliated with Microsoft or Typora; Word and Microsoft are trademarks of Microsoft.

## Screenshots

| Presentation | Hybrid | Source |
|---|---|---|
| ![presentation](screenshots/presentation.png) | ![hybrid](screenshots/hybrid.png) | ![source](screenshots/source.png) |

## Three modes

1. **Presentation** (Milkdown): WYSIWYG, parsed as you type; copy/paste pops a Word-style floating mini-tab (advanced text formatting / Markdown formatting)
2. **Hybrid** (MarkText approach): the document is Markdown source underneath; non-focused blocks are rendered via `Decoration.replace` widgets, and clicking a rendered block turns it back into source
3. **Source**: CM6 plain source mode with the same colors/current-line/gutter as [moma](https://github.com/hu-kaiqi/moma)

Ribbon: Home / Insert / Page Layout / References / Mailings / Review / View / File — eight tabs + QAT; table insertion uses the Word drag-grid. Shortcuts match Word 2010 (Alt+Ctrl+1/2/3 headings, Ctrl+Shift+N/L, F12 Save As…).

## Features

- Export to HTML / **PDF** (A4 + Word 2010 default margins, print-to-PDF core); the Save As dialog offers a PDF type directly
- **Local-LLM filename suggestion** (optional): after 2.5 s of inactivity on an unsaved document, a background pass suggests a filename used as the default on first Save As. Fully local (Ollama first, bundled llama.cpp + Qwen2.5-0.5B as fallback); nothing leaves your machine — **the model is not distributed with the installer**, see below
- **Bilingual UI** (File ▸ Options ▸ Language, applied instantly), with en-US aligned to official Word 2010 English terminology

## Download

Grab installers from [Releases](https://github.com/hu-kaiqi/wdt/releases) (attached as Release assets):

| Platform | File | Notes |
|---|---|---|
| Windows | `wdt-Setup-<version>.exe` | NSIS wizard installer |
| Linux (amd64) | `wdt_<version>_amd64.deb` | `sudo dpkg -i wdt_...deb` |

SHA256 checksums are in the release notes. **Unsigned**; SmartScreen may warn.

### AI filename-inference runtime (optional)

The installer ships without the model (size reasons). Two ways to enable:

1. Install **Ollama** locally and `ollama pull qwen2.5:0.5b` — it is used automatically first
2. Rebuild `ai/llamacpp/` + `ai/models/` from the sources and SHA256 table in [ai/README.md](ai/README.md) (llama.cpp b12535 CPU build + Qwen2.5-0.5B-Instruct Q4_K_M GGUF, ~530 MB; on Linux/macOS swap in the matching platform build — the model works everywhere)

Without a runtime the feature fails silently; everything else keeps working.

## Build from source

```bash
git clone https://github.com/hu-kaiqi/wdt.git
cd wdt
npm install
npm run build-renderer   # esbuild bundle
npm start                # dev mode

npm run dist             # Windows NSIS Setup.exe (via the dist-app obfuscated output)
npm run dist:linux       # linux-unpacked/, then: python scripts/build-deb.py release <version>

node scripts/verify.js   # CDP three-mode regression check (__errors must be empty)
```

Architecture: `launcher.cpp` / `launcher-linux.cpp` (g++ launchers, TDM-GCC 4.9.2, `-std=c++14`) → Electron (main.js: dialogs / PDF export / AI lifecycle + preload security bridge + renderer with Ribbon/Backstage/three-mode editors).

## Known limitations

- Installers are unsigned; the Ribbon is a high-fidelity approximation (not pixel-perfect)
- Hybrid mode re-renders at block granularity; inline mixes stay as source
- The 0.5B model occasionally ignores length instructions (mitigated by sentence-boundary truncation)

## License

Code is released under [AGPL-3.0-or-later](LICENSE). What is replicated is interaction and look-and-feel facts; no Microsoft / Typora / MarkText code is included. Dependencies: Electron (MIT), CodeMirror 6 (MIT), Milkdown (MPL-2.0), markdown-it (MIT), turndown (MIT).
