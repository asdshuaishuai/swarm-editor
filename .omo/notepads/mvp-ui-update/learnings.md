# MVP UI Update Learnings

## Task 9: Backend DTO Extension + GitService + ProjectService

### Key Decisions
- Backend routes use `@Serializable` data classes instead of `mapOf()` for responses — kotlinx.serialization cannot handle heterogeneous Map values (mixing String/Int)
- `GitService` and `ProjectService` take `File(projectDir)` constructor parameter
- Project root auto-detection: walks up from CWD to find `.git` directory, falls back to CWD
- `ProjectService` excludes: `.git`, `build`, `node_modules`, `.gradle`, `.idea`, `.omo` and all dotfiles

### API Endpoints Added
- `GET /api/git/status` → `GitStatusResponse(branch, ahead, behind, staged, modified, untracked)`
- `GET /api/project/tree` → `ProjectTreeResponse(tree: FileNodeResponse)`

### DTOs Extended (ApiClient.kt)
- `AgentDto`: added `description: String`, `stats: AgentStatsDto(tasks, successRate, avgLatency)`
- `McpServerDto`: added `tools: List<McpToolDto>`, `downloads`, `rating`, `ratingCount`, `published`, `updated`, `repository`, `categories`, `agents`
- New DTOs: `AgentStatsDto`, `McpToolDto(name, description, params)`, `McpToolParamDto(name, required)`, `GitStatusDto`, `GitStatusResponse`, `FileNodeDto`, `ProjectTreeResponse`

### Backend DTO Pattern
- Backend has its own `@Serializable` response DTOs (`GitStatusResponse`, `FileNodeResponse`, `ProjectTreeResponse`) in route files
- Desktop `ApiClient.kt` has matching DTOs for deserialization
- Both use `ignoreUnknownKeys = true` in JSON config, so extra fields are safe

### Build Verification
- `./gradlew :backend:build` — PASS
- `./gradlew :desktopApp:build` — PASS
- Live curl test: `GET /api/git/status` returns 200 with real git data
- Live curl test: `GET /api/project/tree` returns 200 with recursive file tree

## Task 11: Rail Navigation + Enhanced TopBar

### Key Decisions
- Rail (52dp) replaces AgentBar as leftmost column in layout
- AgentBar.kt file preserved but no longer imported in App.kt
- Layout structure: Column(TopBar → Row(Rail | SessionPanel | Row(CenterView | RightPanel)) → StatusBar)
- TopBar spans full width (outside the main Row), not inside the center Column
- This avoids the previous nested Column for center area, simplifying the layout

### EnhancedTopBar
- Conic gradient logo drawn with Canvas `drawArc` — multiple arc segments with different colors (no true conic gradient in Compose)
- Agent avatar stack uses overlapping offset to create "stacked" visual
- Project switcher hardcoded for now (needs GitService integration later)
- `Modifier.offset` requires explicit `import androidx.compose.foundation.layout.offset`

### RailNavigation
- 5 nav items: chat/agents/plugins/files/activity
- Active state: 2px purple left bar + Pr.copy(0.12f) bg + shadow glow
- Badge on chat icon (hardcoded 6) — red CircleShape with white text
- Bottom section: Git + Terminal buttons with border-only style
- Uses `Pr` (purple) for active state accent, matching mockup design language

### Build Verification
- `./gradlew :desktopApp:build` — PASS (fixed missing offset import)

## Task 12: Toast Notification System

### Key Decisions
- `ToastHost` positioned as overlay using `Box(fillMaxSize)` with `contentAlignment = BottomEnd`, padded bottom 40dp + right 24dp
- Toast width fixed at 260dp via Modifier.width
- Auto-dismiss: `LaunchedEffect(toast.id)` + `delay(2600)` + call `onDismiss`
- Animation: `AnimatedVisibility` with `slideInHorizontally(initialOffsetX = { it })` / `slideOutHorizontally(targetOffsetX = { it })`
- 3 types with color-coded icon circles: SUCCESS (Gn, ✓), INFO (Ac, ⓘ), ERROR (Rd, ✗)
- `FocusRequester` belongs in `androidx.compose.ui.focus` (NOT `androidx.compose.foundation.focus`)

### Build Verification
- `./gradlew :desktopApp:build` — PASS

## Task 13: Command Palette (Cmd+K)

### Key Decisions
- `CommandPalette` renders only when `isVisible = true`; full overlay: `Box(fillMaxSize)` + black 50% alpha background
- Click-on-overlay dismisses; inner modal stops propagation with `clickable(enabled = false)`
- Search input: `TextField` with transparent container, auto-focused via `FocusRequester`
- Keyboard nav: `onPreviewKeyEvent` on the modal Column handles Escape/Up/Down/Enter
- `LazyColumn` with grouped items; `animateScrollToItem(selectedIndex)` keeps selection visible
- Commands grouped: "Commands" (New Session, Open Settings), "Agents" (Configure X), "Views" (Chat/Agents/Plugins/Files/Activity)
- Command dispatch via `handleCommand` lambda in App.kt — maps command IDs to ViewModel actions
- Ctrl+K shortcut: `onPreviewKeyEvent` on root `Box` in App.kt, checks `isCtrlPressed && key == Key.K`
- `heightIn(max = 360.dp)` requires import `androidx.compose.foundation.layout.heightIn`

### App.kt Layout Change
- Root changed from `Column(fillMaxSize)` to `Box(fillMaxSize + onPreviewKeyEvent) { Column(fillMaxSize) { ... } + overlays }`
- Overlays rendered after the Column inside the Box: SettingsModal, CommandPalette, ToastHost
- This allows CommandPalette and ToastHost to overlay the entire window

### Build Verification
- `./gradlew :desktopApp:build` — PASS
