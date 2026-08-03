#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STATIC_ONLY=false
if [[ "${1:-}" == "--static-only" ]]; then
    STATIC_ONLY=true
elif [[ $# -gt 0 ]]; then
    echo "Usage: ./scripts/verify-pages-readiness.sh [--static-only]" >&2
    exit 2
fi

PI_VERSION=$(node -p "require('./pi-0.83.0/packages/coding-agent/package.json').version")
[[ "$PI_VERSION" == "0.83.0" ]] || {
    echo "Unexpected vendored Pi version: $PI_VERSION" >&2
    exit 1
}
grep -Fq "Pi $PI_VERSION" site/index.html || {
    echo "GitHub Pages does not publish the vendored Pi version $PI_VERSION" >&2
    exit 1
}

for forbidden in \
    "Pi 0.80.10" \
    "LSP connected" \
    "关键路径、SCC" \
    "graph · 12 ms" \
    "git worktree · 31 ms" \
    "4 / 6 checks" \
    "+142"; do
    if grep -Fq "$forbidden" site/index.html; then
        echo "Unsupported Pages readiness claim remains: $forbidden" >&2
        exit 1
    fi
done

for required in \
    "Managed LSP + JVM fallback" \
    "JetBrains Kotlin LSP 262.9593.0" \
    "真实 stdio 初始化成功" \
    "文档符号、诊断与行级导航" \
    "模型池与主 Agent 双重并发上限" \
    "释放租约并记录实际模型" \
    "Bubblewrap + Managed Wasmtime" \
    "Wasmtime 47.0.2" \
    "Tarjan SCC 折叠循环依赖簇" \
    "下游覆盖、桥接中心性" \
    "Pages 部署必须先通过完整测试与构建门禁"; do
    grep -Fq "$required" site/index.html || {
        echo "Required Pages readiness statement is missing: $required" >&2
        exit 1
    }
done

for bilingual_hook in \
    'data-language="zh-CN"' \
    'data-language="en"' \
    'data-i18n="hero.lead"' \
    'data-i18n-content="meta.description"'; do
    grep -Fq "$bilingual_hook" site/index.html || {
        echo "Required bilingual Pages hook is missing: $bilingual_hook" >&2
        exit 1
    }
done

for english_copy in \
    "Move agents beyond chat" \
    "A complete engineering loop" \
    "Pages deployment must pass the complete test and build gate"; do
    grep -Fq "$english_copy" site/app.js || {
        echo "Required English Pages copy is missing: $english_copy" >&2
        exit 1
    }
done

node --check site/app.js

git diff --check

if [[ "$STATIC_ONLY" == false ]]; then
    ./scripts/fast-build.sh verify
fi

echo "GitHub Pages readiness gate passed for Pi $PI_VERSION."
