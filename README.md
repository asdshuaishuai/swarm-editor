# Swarm Editor

多 Agent 协调桌面客户端 — Kotlin/JVM 全栈 MVP。

## 技术栈

| 层 | 技术 |
|---|------|
| 构建 | Gradle 8.x + Kotlin DSL + Version Catalog |
| 后端 | Ktor Server 3.1 (CIO) |
| 前端 | Compose Desktop 1.7 |
| ACP | `com.agentclientprotocol:acp:0.13.1` |
| MCP | `io.modelcontextprotocol:kotlin-sdk-client:0.4.0` |
| Koog | `ai.koog:koog-agents:0.7.3` |
| 序列化 | kotlinx.serialization 1.8 |
| 协程 | kotlinx.coroutines 1.10 |

## 项目结构

```
common/          # 共享数据模型与协议定义
backend/         # Ktor 后端服务 (ACP/MCP/Agent/Session)
desktopApp/      # Compose Desktop 前端
```

## 运行

```bash
# 启动后端
./gradlew :backend:run

# 启动桌面客户端
./gradlew :desktopApp:run

# 构建全部
./gradlew build

# 运行测试
./gradlew test
```
