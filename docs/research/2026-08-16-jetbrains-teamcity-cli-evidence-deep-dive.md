# JetBrains TeamCity CLI 只读证据边界深挖（2026-08-16）

## 固定来源

- `JetBrains/teamcity-cli`：`d8eff9844666f3deb75f172aa303aa5903e4b9d3`
- Client：<https://github.com/JetBrains/teamcity-cli/blob/d8eff9844666f3deb75f172aa303aa5903e4b9d3/api/client.go>
- Error contract：<https://github.com/JetBrains/teamcity-cli/blob/d8eff9844666f3deb75f172aa303aa5903e4b9d3/api/errors.go>
- Error parsing：<https://github.com/JetBrains/teamcity-cli/blob/d8eff9844666f3deb75f172aa303aa5903e4b9d3/api/errors_parse.go>
- Agent Skill：<https://github.com/JetBrains/teamcity-cli/blob/d8eff9844666f3deb75f172aa303aa5903e4b9d3/skills/teamcity-cli/SKILL.md>

## 源码结论

`Client.ReadOnly` 会阻止所有非 GET 请求；这是执行器策略，不是 prompt 建议。调试输出会脱敏 Authorization、Cookie 与额外 headers。普通请求可有墙钟 timeout，而流式日志/产物必须由 request context 单独限时。

错误契约将 auth、permission、not found、network、read-only、validation 和 internal 分类；非 2xx body 读取最多 1 MiB，保留的 raw body 最多 1 KiB，最终展示 excerpt 最多 512 bytes 且移除控制字符。Agent skill 进一步要求先用只读 list/log/tree/tests 建立失败原因，再触发构建；CLI 的 JSON field selection 限制下游读取字段。

## Swarm 映射

未来 TeamCity read-only adapter 应默认只支持构建、日志、测试、队列等 GET evidence，并保存：server identity、请求字段摘要、远端 run ID、分支、输出 hash、truncated 和 typed failure category。令牌、raw response 和日志只能以有界且脱敏的 evidence 进入系统。

写入/启动/取消/agent terminal 保持独立 capability，并要求显式 admission；不通过复用 read-only adapter 或将 `TEAMCITY_RO` 类环境变量当作唯一控制。当前没有 CI adapter，因此不添加 HTTP transport 或 token storage。
