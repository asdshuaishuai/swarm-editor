# JetBrains IntelliJ Action 宿主边界深挖（2026-08-16）

## 固定来源

- 组织页：<https://github.com/orgs/JetBrains/repositories>
- `JetBrains/intellij-community`：`e2d7de6d596174ed91a7eac3677d9f87ad981047`
- Action API：<https://github.com/JetBrains/intellij-community/blob/e2d7de6d596174ed91a7eac3677d9f87ad981047/platform/editor-ui-api/src/com/intellij/openapi/actionSystem/AnAction.java>
- Update thread：<https://github.com/JetBrains/intellij-community/blob/e2d7de6d596174ed91a7eac3677d9f87ad981047/platform/editor-ui-api/src/com/intellij/openapi/actionSystem/ActionUpdateThread.java>
- Document commit gate：<https://github.com/JetBrains/intellij-community/blob/e2d7de6d596174ed91a7eac3677d9f87ad981047/platform/platform-api/src/com/intellij/openapi/actionSystem/PerformWithDocumentsCommitted.java>

## 源码结论

`AnAction` 把 `update`（可用性与 presentation）和 `actionPerformed`（实际执行）分开。每个展示位置持有独立 presentation；因此同一动作可以同时出现在工具栏、菜单和 popup 中，而不是由单一 UI 状态控制。

Action 更新显式声明线程：`BGT` 是推荐值，提供应用级读访问，但要求不能直接访问 Swing hierarchy，且读到的模型必须支持并发更新；`EDT` 只允许 UI 数据，不能读取 PSI/VFS/project model。需要对文档语义产生动作时，`PerformWithDocumentsCommitted` 可先提交全部 documents。

## 对 Swarm 的映射

未来 IDE semantic bridge 应暴露受控 capability，而不是将 IntelliJ/Psi 对象交给 Pi：

```text
IDE capability
  availability query (read-only, cancellable, background-safe)
  action execution (explicit admission, document/workspace revision precondition)
  evidence reference (before/after revision, diagnostics, result)
```

每次执行都应重新确认 workspace 与文档状态，避免 Agent 根据已过期的 availability 结果应用修改。查询结果与执行结果必须区分：前者可以进入受限 `ContextEvidence`，后者进入工具审计和 Delivery evidence。

当前 Swarm 是 Compose Desktop + Kotlin 进程内服务，不是 IntelliJ 插件。故不添加 IntelliJ SDK、PSI bridge 或 HTTP transport；该模型只约束未来原生 IDE integration 的所有权、线程和写前状态检查。
