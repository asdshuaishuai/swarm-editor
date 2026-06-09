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

## Task 15: Plugin Center View (MCP/Skill Detail Pages)

### Key Decisions
- `PluginCenterView` uses sealed `PluginItem` (Mcp/Skill) to unify list display — single grid handles both types
- List↔Detail state managed by `mutableStateOf<PluginItem?>` — null = list, non-null = detail view
- Sub-tab toggle (MCP/Skills) uses `PluginSubTab` enum with `Row` of clickable `Text` composable
- `LazyVerticalGrid` with `GridCells.Adaptive(minSize = 360.dp)` for responsive card grid
- Search filtering applied client-side before grid rendering
- `@OptIn(ExperimentalLayoutApi::class)` required for `FlowRow` in category filter chips
- `TextFieldValue` (not plain `String`) used for search to track cursor position

### PluginTile Design
- Colored accent bar (4dp height) at top — color derived from name hash via `TileAccents` palette
- 42px icon box with first letter + accent background (0.15f alpha)
- Description: `maxLines = 2, overflow = TextOverflow.Ellipsis` per spec
- Bottom stats row: downloads (⬇), rating (★), tools count (🔧), active status chip
- `StatusChip` extracted as reusable composable — `clip(RoundedCornerShape(4.dp)).background(color.copy(alpha = 0.12f)).padding(...)`

### McpDetailView Design
- 84px icon in hero section with `RoundedCornerShape(16.dp)`
- Action buttons: restart (Ac), copy config (Tx2), uninstall (Rd) — placeholder click handlers
- Tab system: Row of clickable Column headers with 2dp Ac underline for active tab
- Side panel (220dp width) only shown on Details tab — contains identifier, type, categories, authorized agents
- Tools tab: card-style rows with name + description + params list + "req" badge for required params
- Config tab: command display + env vars table with key/value columns
- `mutableIntStateOf` (not `mutableStateOf<Int>`) for tab index to avoid boxing

### SkillDetailView Design
- Same hero/tab structure as McpDetailView but simpler
- Structure tab: simulated directory tree from `skill.path.split("/")` with `├──`/`└──` prefixes
- Agents tab: linked agent cards + stat blocks (placeholder values "—")
- Usage tab: quick reference info table + compatible agents chips

### Import Gotchas
- `GridCells` requires `import androidx.compose.foundation.lazy.grid.GridCells`
- `LazyVerticalGrid` requires `import androidx.compose.foundation.lazy.grid.LazyVerticalGrid`
- `items` for grid requires `import androidx.compose.foundation.lazy.grid.items` (different from `LazyColumn` items!)
- `FlowRow` requires `import androidx.compose.foundation.layout.ExperimentalLayoutApi` + `import androidx.compose.foundation.layout.FlowRow`
- `OutlinedTextField` requires `import androidx.compose.material3.OutlinedTextField` + `import androidx.compose.material3.OutlinedTextFieldDefaults`
- `KeyboardOptions` requires `import androidx.compose.foundation.text.KeyboardOptions`
- `KeyboardType` requires `import androidx.compose.ui.text.input.KeyboardType`
- `TextFieldValue` requires `import androidx.compose.ui.text.input.TextFieldValue`
- `TextRange` requires `import androidx.compose.ui.text.TextRange`
- Gradle daemon can cache stale errors — use `--no-daemon` or `clean` if errors seem wrong

### Build Verification
- `./gradlew --no-daemon :desktopApp:clean :desktopApp:build` — PASS

## Task 16: Chat Enhancements (ToolCard + CodeCard + ThinkingIndicator)

### Key Decisions
- New directory `ui/chat/` created for chat-specific reusable components
- `ToolCardData` and `CodeCardData` data classes defined in their respective files (not in SessionViewModel)
- `UiMessage` extended with default-empty `toolCards`, `codeCards`, `isThinking`, `role` fields — backward compatible (all existing call sites still work without changes)
- `ToolCard` uses `AnimatedVisibility(expandVertically/shrinkVertically)` for smooth expand/collapse
- `CodeCard` syntax highlighting uses `buildAnnotatedString` + `withStyle(SpanStyle)` — regex-based tokenization for keywords (Pr), function names before `(` (Ac), quoted strings (Gn)
- `ThinkingIndicator` uses `Animatable(0.3f)` with `tween(600ms)` for smooth opacity cycling, 3 dots with 200ms stagger via `delay(index * 200L)` in LaunchedEffect
- Role tag: small chip with `copy(alpha = 0.12f)` background — "AGENT" uses Ac color, "REVIEWING" uses Pr color

### ToolCard Design
- Gradient background: `Brush.verticalGradient(Bg3 → Bg2)` with `RoundedCornerShape(10.dp)` + Bd border
- Header: Row with icon + title + duration + collapse arrow (▶/▼), clickable toggles expanded state
- Expanded body: monospace output in Surface2 background
- Result line: pill badge (GnD/RdD bg) with ✓ OK / ✗ FAIL + duration text
- Default state: first card expanded (`remember { mutableStateOf(defaultExpanded) }`)

### CodeCard Design
- File header: file icon + extension badge (Ac color with 0.12f bg) + filename + diff stats (+N/-N) + copy button
- Diff lines: line number (Tx3, right-aligned monospace) + content with syntax highlighting
- Diff coloring: ADD lines get GnD bg, DEL lines get RdD bg + Rd text, CONTEXT lines transparent
- Line number width auto-calculated from max line number digit count

### ChatArea Modifications
- `isSending` indicator changed from plain "思考中..." Text to `ThinkingIndicator` component
- `AssistantMessage` signature extended with `toolCards`, `codeCards`, `isThinking`, `role` params
- Role tag rendered as colored chip above message text
- ToolCards rendered after text (first expanded by default via `forEachIndexed`)
- CodeCards rendered after ToolCards
- Activities rendered last (unchanged position)

### Pre-existing Issue Found
- RightPanel.kt had broken `weight()` calls from Task 14/15 changes — restored original to fix build
- Previous agent added `ColumnScope` import but `Modifier.weight()` extension resolution failed

### Build Verification
- `./gradlew :desktopApp:build` — PASS

## Task 17: Wire AgentOrchestrationView + PluginCenterView into App.kt

### Key Decisions
- `AgentOrchestrationView` takes `agents: List<AgentDto>`, `onConfigClick`, `onAddAgent`, `modifier`
- `PluginCenterView` takes `mcpServers: List<McpServerDto>`, `skills: List<SkillDto>`, `modifier`
- Passed `emptyList()` for agents since `AgentOrchestrationView` has built-in demo data (it renders demo agents when `agents.isEmpty()`)
- `mcpServers` and `skills` StateFlows already collected in App.kt — passed directly to `PluginCenterView`
- `AgentDto` imported from `com.swarmeditor.desktop.api.AgentDto` for the lambda type inference
- "files" and "activity" branches left as placeholder `Box` + `Text` (Wave 3)
- No unused import cleanup needed — `Box`, `Text`, `Alignment`, `fontSize` still used by remaining placeholders

### Imports Added
- `com.swarmeditor.desktop.ui.agents.AgentOrchestrationView`
- `com.swarmeditor.desktop.ui.plugins.PluginCenterView`
- `com.swarmeditor.desktop.api.AgentDto`

### Type Mismatch Handling
- `agentVm.agents` returns `List<AgentInfo>`, not `List<AgentDto>` — resolved by passing `emptyList()` so view uses demo data
- `onConfigClick: (AgentDto) -> Unit` maps to `mainVm.showAgentConfigDialog(it.config.id)` — safe because `AgentDto.config.id` exists and lambda only called when real data present

### Build Verification
- `./gradlew :desktopApp:build` — PASS

## Task 17b: RightPanel Rewrite (变更/检查/日志 Tabs)

### Key Decisions
- Complete rewrite of RightPanel.kt from 134 lines to 677 lines
- Replaced old tabs (mcp/skills/diff) with new tabs: 变更(changes) / 检查(inspector) / 日志(log)
- `gitStatus: GitStatusDto = GitStatusDto()` parameter added with default value — backward compatible with App.kt call site
- Tab header uses active indicator: Ac color text + 2dp underline box below text
- `ColumnScope` extension functions required for tab composables that use `Modifier.weight(1f)` — they're called inside RightPanel's Column
- Accept/reject state uses `mutableStateMapOf<String, String?>()` — maps file path to "accepted"|"rejected"|null
- Rejected files rendered with `Modifier.alpha(0.5f)`
- Diff preview uses `AnimatedVisibility(expandVertically/shrinkVertically)` for smooth expand/collapse
- Extension chips colored by type: .kt/.json=Gd, .md=Tx, .toml/.yaml=Ac
- Session stats grid: 2×2 layout with `StatCell` composable (Token/工具调用/耗时/成本) — placeholder values
- Log tab filter chips: 全部/MCP/文件 — client-side filtering on `type` field
- Timeline entries: colored dots (mcp=Gn, file=Pr, cmd=Ac), timestamp + actor + action + detail

### Import Gotchas
- `Color` must be explicitly imported (`import androidx.compose.ui.graphics.Color`) when used as return type of helper functions or for `Color.Transparent`
- `ColumnScope` extension required for composables using `Modifier.weight()` inside a Column — `private fun ColumnScope.ChangesTab(...)`
- `mutableStateMapOf` requires `import androidx.compose.runtime.mutableStateMapOf`
- `AnimatedVisibility`, `expandVertically`, `shrinkVertically` require animation imports

### Backward Compatibility
- App.kt call site: `RightPanel(selectedAgent, currentTab, onTabChange, mcpServers, skills, modifier)` — unchanged, `gitStatus` defaults
- Tab IDs changed: old "mcp"/"skills"/"diff" → new "changes"/"inspector"/"log"
- App.kt `rightTab` defaults to "mcp" — will show empty `when` branch until user clicks new tabs (harmless)

### Build Verification
- `./gradlew :desktopApp:build` — PASS
