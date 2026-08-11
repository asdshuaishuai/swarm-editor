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

## Code Intelligence Findings

- JetBrains' Kotlin LSP work treats diagnostics as precise ranges with source metadata, not line-only messages. Swarm now preserves start/end line and character positions, diagnostic source, and diagnostic code end to end.
- Problems navigation should separate severity filtering from document structure. Error, warning, and information filters remain compact toolbar state rather than changing the primary editor tabs.
- Semantic token range requests, implementation navigation, and configurable inlay hints are suitable future additions to the existing `SourceCodeIntelligence` boundary; they should extend the current in-process service rather than create another transport layer.
- Koog's graph and tracing concepts are useful references for run metadata and observability, but Pi remains the only agent runtime. No Koog execution engine or competing agent abstraction is introduced.
- JetBrains Markdown remains a candidate parser for richer Markdown structure and preview fidelity, provided it can be integrated without pulling IntelliJ Platform runtime dependencies into the desktop package.

## Markdown Findings

- `JetBrains/markdown` is a standalone multiplatform parser, so Markdown structure can use the official AST without embedding IntelliJ Platform or Swing editor internals.
- The editor uses the GFM flavour for tables, task lists, autolinks, and other repository-oriented syntax. Parser construction passes an explicit `CancellationToken`, matching the current `0.7.8` API rather than relying on deprecated convenience overloads.
- Markdown, HTML, and JSON keep source and rendered modes. Markdown additionally supports a JetBrains-style split workspace with a draggable divider, bounded pane proportions, and double-click reset.
- The parser also exposes streaming/incremental primitives. These are reserved for a later large-document pass; the current outline/folding path stays deterministic and side-effect free.

## Navigation Findings

- IntelliJ keeps editor-tab order separate from recently used file order. Swarm mirrors that behavior: selecting a tab does not move it, while an independent MRU list records active files.
- `Ctrl/Cmd+E` opens a compact Recent Files popup from any primary workspace. Search matches both file name and path, and Up/Down/Enter/Escape provide a complete keyboard path.
- The popup reuses semantic file icons, dirty-state markers, the current-file badge, and platform-specific shortcut labels instead of introducing a second navigation visual language.

## Search Everywhere Findings

- IntelliJ Search Everywhere is contributor-based rather than a single monolithic filter. Swarm now follows that boundary with separate file, current-document symbol, action, recent-file, and Pi command result sources.
- Blank searches prioritize recent files and common actions. Typed searches rank exact and prefix file-name matches before general path matches, then merge symbols and actions into grouped results.
- File contribution respects IDE-style excluded roots by omitting generated output and dependency directories such as `build`, `dist`, `node_modules`, `out`, and `target`.
- Action matching includes both localized labels and stable action IDs. File rows carry semantic file-type icons and parent paths; symbol rows carry kind, container, source path, and line.
- Search Everywhere remains available through `Ctrl/Cmd+K` and now also through the JetBrains-style double-Shift gesture. Workspace-wide symbols are intentionally deferred until the LSP boundary exposes a real workspace-symbol request.

## Navigation History Findings

- IntelliJ models navigation history separately from tabs and recent files. Swarm now keeps an immutable current location, back stack, and forward stack with file and optional source-line information.
- New navigation appends the prior location and clears the forward stack. Back and forward navigation move locations between stacks without recording duplicate history entries.
- Fixed editor-toolbar actions expose availability through disabled state, while `Ctrl/Cmd+Alt+Left/Right` and Search Everywhere actions provide equivalent keyboard access.
- Reloading a saved file does not create navigation history. The current implementation records file, symbol, definition, and explicit line navigation; passive caret movement remains future editor-integration work.
