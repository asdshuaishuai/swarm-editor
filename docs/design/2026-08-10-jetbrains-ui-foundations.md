# JetBrains UI Foundations

Swarm Editor uses JetBrains open-source projects as behavioral references while remaining a standalone Compose Desktop application. The goal is not to imitate screenshots; it is to reuse the interaction grammar that makes IntelliJ-based IDEs efficient.

## Primary References

- [JetBrains Jewel](https://github.com/JetBrains/jewel) defines desktop-oriented Compose components and IntelliJ New UI styling. Its `TabStyle`, `SimpleListItem`, icon action buttons, and lazy-tree metrics informed the local component layer.
- [IntelliJ Platform](https://github.com/JetBrains/intellij-community) is the source of current Jewel development, tool-window behavior, action-system conventions, and editor chrome.
- [`plugins/git4idea`](https://github.com/JetBrains/intellij-community/tree/master/plugins/git4idea) and [`platform/vcs-impl`](https://github.com/JetBrains/intellij-community/tree/master/platform/vcs-impl) guide the Changes/Commit workflow.

## Local Adaptation

`desktopApp/.../ui/common/JetBrainsUi.kt` provides a small compatibility-free layer instead of importing the complete IntelliJ Platform or an unstable Jewel binary. It standardizes:

- 28 dp list rows and 26 dp icon actions;
- flat hover and selection backgrounds;
- underline-based tool-window tabs;
- compact section headers with disclosure controls;
- neutral chrome with semantic color reserved for status and actions.

The Git tool window groups staged, unstaged, and untracked files, keeps index and working-tree diffs separate, opens diffs in the existing side drawer, and exposes an index-only commit area. `Ctrl+Enter` and `Cmd+Enter` submit a valid commit.

## Integration Rules

- Keep UI-to-backend calls in-process; do not introduce HTTP or WebSocket transport.
- Prefer shared IDE metrics over feature-local dimensions.
- Preserve keyboard navigation, focus indication, and stable selection state.
- Use JetBrains assets only when licensing and packaging are explicit. Current code adapts public interaction patterns without copying source or icons.
- Do not add the full IntelliJ Platform merely for visual parity; reuse focused components or algorithms when they materially improve IDE behavior.
