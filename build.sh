#!/bin/bash

# Swarm Editor 编译脚本
# 用于构建完整的应用程序

set -e

echo "=========================================="
echo "Swarm Editor 编译脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${YELLOW}[1/4] 检查系统依赖...${NC}"

# 检查 Go
if ! command -v go &> /dev/null; then
    echo -e "${RED}错误: Go 未安装${NC}"
    echo "请安装 Go: https://go.dev/doc/install"
    exit 1
fi
echo -e "${GREEN}✓ Go $(go version | awk '{print $3}')${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: Node.js 未安装${NC}"
    echo "请安装 Node.js: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# 检查 Rust (可选，用于 Tauri)
if command -v rustc &> /dev/null; then
    echo -e "${GREEN}✓ Rust $(rustc --version)${NC}"
    HAS_RUST=true
else
    echo -e "${YELLOW}⚠ Rust 未安装 (Tauri 桌面应用需要)${NC}"
    HAS_RUST=false
fi

echo ""
echo -e "${YELLOW}[2/4] 构建 Go 后端...${NC}"
cd "$SCRIPT_DIR"

# 构建 Go 二进制文件
echo "编译 swarm-editor..."
go build -o bin/swarm-editor ./cmd/swarm-editor

echo "编译 swarm-agent..."
go build -o bin/swarm-agent ./cmd/swarm-agent

echo -e "${GREEN}✓ Go 后端构建完成${NC}"
ls -la bin/

echo ""
echo -e "${YELLOW}[3/4] 构建 UI 前端...${NC}"
cd "$SCRIPT_DIR/ui"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "安装 npm 依赖..."
    npm install
fi

# 构建前端
echo "构建前端..."
npm run build

echo -e "${GREEN}✓ UI 前端构建完成${NC}"
ls -la dist/

echo ""
echo -e "${YELLOW}[4/4] 构建 Tauri 桌面应用 (可选)...${NC}"

if [ "$HAS_RUST" = true ]; then
    # 检查 webkit2gtk (Linux)
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
            echo -e "${YELLOW}⚠ webkit2gtk-4.1 未安装${NC}"
            echo "在 Fedora 上安装: sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel"
            echo "在 Ubuntu 上安装: sudo apt install libwebkit2gtk-4.1-dev libssl-dev libcurl4-openssl-dev libappindicator3-dev librsvg2-dev"
            echo ""
            echo -e "${YELLOW}跳过 Tauri 构建${NC}"
        else
            echo "构建 Tauri 应用..."
            cd "$SCRIPT_DIR/ui"
            npm run tauri build -- --bundles appimage
            echo -e "${GREEN}✓ Tauri 应用构建完成${NC}"
            ls -la src-tauri/target/release/bundle/
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "构建 Tauri 应用 (macOS)..."
        cd "$SCRIPT_DIR/ui"
        npm run tauri build
        echo -e "${GREEN}✓ Tauri 应用构建完成${NC}"
    else
        echo -e "${YELLOW}⚠ 未知操作系统，跳过 Tauri 构建${NC}"
    fi
else
    echo -e "${YELLOW}跳过 Tauri 构建 (Rust 未安装)${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}构建完成!${NC}"
echo "=========================================="
echo ""
echo "产物位置:"
echo "  - Go 后端: $SCRIPT_DIR/bin/"
echo "  - UI 前端: $SCRIPT_DIR/ui/dist/"
if [ "$HAS_RUST" = true ] && pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo "  - Tauri 应用: $SCRIPT_DIR/ui/src-tauri/target/release/bundle/"
fi
echo ""
echo "运行方式:"
echo "  1. 启动后端: ./bin/swarm-editor"
echo "  2. 访问前端: 在浏览器中打开 ui/dist/index.html"
echo ""
