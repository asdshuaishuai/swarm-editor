# JetBrains Skills 来源与扫描治理深挖（2026-08-16）

## 固定来源

- 组织页：<https://github.com/orgs/JetBrains/repositories>
- `JetBrains/skills`：`e0f258b5cfed145015cb3e48da9a97947f7c4ed7`
- Catalog：<https://github.com/JetBrains/skills/blob/e0f258b5cfed145015cb3e48da9a97947f7c4ed7/README.md>
- Scanner workflow：<https://github.com/JetBrains/skills/blob/e0f258b5cfed145015cb3e48da9a97947f7c4ed7/.github/workflows/skill-scanner.yml>
- Scanner launcher：<https://github.com/JetBrains/skills/blob/e0f258b5cfed145015cb3e48da9a97947f7c4ed7/.scripts/run-skill-scanner.sh>

## 源码结论

该仓库明确是来自上游 GitHub skills 的 JetBrains-filtered、JetBrains-verified snapshot，不是所有技能的作者声明。每个 `SKILL.md` 保留精确 `metadata.source` 链接，catalog 汇总上游仓库与 attribution。

治理是分层的：CI 对 push/PR 只扫描改动的 skill 目录，并只让改动技能的 error finding 阻塞；手动全仓扫描保留 inherited upstream findings 为报告而非阻塞条件。扫描脚本使用 Cisco `skill-scanner` 的 recursive、behavioral、lenient 模式，产出 Markdown 与 SARIF，CI 上传工件并在可用时提交 Code Scanning。README 同时保留免责声明，要求用户在关键环境中自行测试。

这说明 curated snapshot、扫描通过和可信执行是不同概念。来源可追溯和变更检测是最小前提，权限仍应由宿主能力系统控制。

## Swarm 映射

Swarm 已有 `SkillSource`、scope、Agent 启用范围、项目指纹信任与原子同步。本轮新增 `SkillConfig.contentFingerprint`：发现到的用户/项目 skill 会保存单技能 SHA-256 内容指纹并随配置持久化。项目整体 trust fingerprint 继续用于“当前项目技能集合是否仍被用户信任”，单技能指纹用于审计、版本变化展示和未来逐技能再准入。

未采纳：

- 不把行为扫描结果等价为自动信任。
- 不直接下载或启用远程 GitHub skill。
- 不将 Skill 指令视为 capability grant；文件/进程/网络权限仍由 `CapabilityRegistry` 与 Pi tool broker 决定。
- 不在没有独立产品需求时引入外部 scanner 运行时依赖。

后续若引入远程 curated catalog，应记录 immutable commit、上游 source URL、scanner report digest 和显式用户 admission；内容 hash 变化必须使既有 admission 失效。
