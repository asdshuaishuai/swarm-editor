# JetBrains Open-Source UI Patterns

## Sources Reviewed

- `JetBrains/intellij-community`, especially `platform/jewel`, IntelliJ Platform UI infrastructure, tool windows, trees, actions, and VCS surfaces.
- `JetBrains/jewel`, the archived standalone Compose implementation now maintained inside `intellij-community`.
- IntelliJ Platform SDK UI Guidelines for dialogs, lists, trees, tool windows, speed search, and action placement.
- `JetBrains/compose-multiplatform` for desktop focus, keyboard, scrolling, and native window behavior.

## Principles Adopted

1. **State defines appearance.** Controls derive visuals from enabled, focused, hovered, pressed, selected, and active-window states. Color is not used as decoration; it communicates selection, focus, severity, or status.
2. **Desktop density is intentional.** Tool-window rows stay near 28–32dp, two-line navigation rows near 38–42dp, icon actions near 26dp, and headers near 34–42dp.
3. **Structure beats cards.** Trees, tables, grouped lists, separators, and fixed action bars replace nested rounded cards. Border radius remains small and local to interactive selection or input focus.
4. **Keyboard navigation is first-class.** Search, selection, confirmation, cancellation, and tool-window actions must work without the mouse. Project navigation uses on-demand Speed Search rather than a permanently visible filter.
5. **Dialog actions do not scroll away.** Configuration dialogs use a fixed title bar, independently scrolling content, and a fixed footer. Destructive actions stay left; cancel and primary confirmation stay right.
6. **Progressive disclosure reduces noise.** Toolbars expose common actions directly and defer uncommon actions to menus or contextual surfaces. Secondary descriptions appear only where they resolve ambiguity.

## Swarm Editor Mapping

- `IdeToolWindowHeader`, `IdeActionButton`, and `IdeListRow` model compact tool-window behavior.
- `IdeDialogShell` provides the shared DialogWrapper-style structure.
- Project search appears through the toolbar or `Ctrl/Cmd+F`, and closes with `Esc`.
- Main-agent configuration only selects the primary model; dynamic subagent policy remains runtime-owned.
- MCP configuration keeps protocol, environment, tools, authorization, and persistence behavior while adopting fixed actions and compact rows.

## Deliberate Differences

Swarm Editor does not embed IntelliJ Swing or copy IntelliJ Platform internals. The application remains Compose Desktop with direct in-process Kotlin services. Jewel patterns are reimplemented as a small local design layer so packaging, startup time, and backend boundaries remain predictable.
