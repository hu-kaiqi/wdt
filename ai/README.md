# wdt/ai — 本地推断运行时（随软件内置，内容不出本机）

用途：选项页"根据文件内容推断默认文件名"的本地大模型。**两个目录都不入版本库**（合计 ~530MB），换机按下表重建。

| 内容 | 来源 | 校验 |
|---|---|---|
| `llamacpp/`（llama.cpp b12535 CPU x64，64MB） | `https://github.com/ggml-org/llama.cpp/releases/download/b12535/llama-b12535-bin-win-cpu-x64.zip` 解压 | llama-server.exe --version = build 12535 |
| `models/qwen2.5-0.5b-instruct-q4_k_m.gguf`（469MB） | `https://modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_k_m.gguf` | sha256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` |

- 运行方式：主进程按需拉起 `llamacpp/llama-server.exe -m models/… --host 127.0.0.1 --port 18899 -c 2048 -t 4`，健康检查就绪后由 `scripts/infer_name.py` 调 `/v1/chat/completions`；退出随应用一起杀。
- 若用户自装了 Ollama（11434 端口），`infer_name.py` 会优先复用它（模型 `qwen2.5:0.5b`），llama-server 作兜底。
- Linux/mac：llamacpp 换对应平台的 llama.cpp 发行包即可，模型与脚本通用。
