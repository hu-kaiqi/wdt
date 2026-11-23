#!/usr/bin/env python3
# wdt · 根据文档内容推断默认文件名（本地开源大模型，内容不出本机）
#
# 用法：echo "文档内容" | py -3 scripts/infer_name.py
#   stdin  = Markdown 正文（主进程截前 1500 字喂进来）
#   stdout = 一行 JSON：{"name": "推断的文件名"} 或 {"error": "原因"}
#
# 双后端（自动探测，先 Ollama 后 llama-server）：
#   1) Ollama      http://127.0.0.1:11434/api/generate      （用户自己装的）
#   2) llama-server http://127.0.0.1:18899/v1/chat/completions
#      —— wdt 自带（targets/wdt/ai/llamacpp + Qwen2.5-0.5B-Instruct GGUF，
#         主进程按需拉起，模型 q4_k_m 量化，纯 CPU 跑）
# 纯标准库（urllib），零 pip 依赖——"调包"的部分是模型本体，已下载到本机 ai/models/。
import json
import re
import sys
import urllib.request
import urllib.error

PROMPT = """给下面的文档起一个文件名（不含扩展名）。
要求：与文档语言一致（中文文档起中文名，英文文档起英文名）；中文不超过16个字，英文3~6个单词；概括主题；不要引号、不要标点结尾、不要解释、不要扩展名。只输出文件名本身。

文档：
"""


def sanitize(raw: str) -> str:
    """模型输出 → 合法文件名：去 <think>/代码围栏/引号/非法字符，压缩空白，限长。"""
    s = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()
    s = re.sub(r"```[a-z]*\n?|```", "", s).strip()
    s = s.strip().strip('"').strip("'").strip("“”‘’").strip()
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "", s)
    s = re.sub(r"\s+", " ", s).strip()
    # 句读截断：0.5B 小模型常无视字数要求输出整句，只取第一段就够当文件名
    s = re.split(r"[，。,；;．.!！?？]", s)[0].strip()
    s = s.rstrip("。，,.;；.！!？? ")
    return s[:40]


def post(url: str, payload: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def try_ollama(text: str) -> str:
    d = post("http://127.0.0.1:11434/api/generate", {
        "model": "qwen2.5:0.5b", "prompt": PROMPT + text, "stream": False,
        "options": {"temperature": 0.3, "num_predict": 64},
    }, timeout=60)
    return sanitize(d.get("response", ""))


def try_llama_server(text: str) -> str:
    d = post("http://127.0.0.1:18899/v1/chat/completions", {
        "messages": [{"role": "user", "content": PROMPT + text}],
        "max_tokens": 64, "temperature": 0.3,
    }, timeout=90)
    return sanitize(d["choices"][0]["message"]["content"])


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台 GBK 防崩
    except AttributeError:
        pass
    text = sys.stdin.buffer.read().decode("utf-8", "replace").strip()
    if not text:
        print(json.dumps({"error": "empty"}, ensure_ascii=False))
        return
    body = text[:1500]
    errors = []
    for fn, label in ((try_ollama, "Ollama"), (try_llama_server, "llama-server")):
        try:
            name = fn(body)
            if name:
                print(json.dumps({"name": name}, ensure_ascii=False))
                return
            errors.append(f"{label}: 输出为空")
        except Exception as e:
            errors.append(f"{label}: {str(e)[:80]}")
    print(json.dumps({"error": "；".join(errors)[:200]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
