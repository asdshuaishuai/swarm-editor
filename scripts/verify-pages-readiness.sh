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
    "LSP + JVM fallback" \
    "文档符号、诊断与行级导航" \
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

git diff --check

if [[ "$STATIC_ONLY" == false ]]; then
    ./scripts/fast-build.sh verify
fi

echo "GitHub Pages readiness gate passed for Pi $PI_VERSION."
