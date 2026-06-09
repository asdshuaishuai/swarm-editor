# MVP UI Update Learnings

## Visual System Applied

### Background Hierarchy
- Page-level: `Glass` (0xCC0a0a0f) — semi-transparent dark
- Secondary/panels: `Glass2` (0x99111118) — lighter semi-transparent
- Content areas: `Bg2` (0xFF111118) — solid dark
- Cards/items: `Glass` with `Bd` border and `RR` radius

### Card Pattern
```
.clip(RoundedCornerShape(RR))  // 8.dp
.background(Glass)
.border(1.dp, Bd, RoundedCornerShape(RR))
```

### Modal Pattern
```
.clip(RoundedCornerShape(RR2))  // 12.dp
.background(Glass)
.border(1.dp, Bd2, RoundedCornerShape(RR2))
```

### Section Labels
- 10sp, Tx3, uppercase, letterSpacing 0.8sp, SemiBold

### Input Fields
- Surface2 bg, Bd border, RR radius

### Files Modified (14 files)
1. AgentOrchestrationView — Glass bg, compact title 15sp
2. AgentCard — Glass bg, RR radius, 3dp gradient bar, compact stats
3. SwarmVisualization — unchanged (transparent canvas on Bg2 container)
4. PluginCenterView — Glass bg, compact hero, pill filter chips
5. PluginTile — Glass bg, RR radius, 3dp top accent bar
6. McpDetailView — Glass2 side panel, compact tab text
7. SkillDetailView — Same tab updates
8. FileExplorerView — Glass bg, Glass2 tree panel with Bd separator
9. FileTreeView — .kts added to Gd coloring
10. ActivityLogView — Glass bg, Glass2 sidebar with Bd separator
11. ArchiveTree — Glass selected state
12. EventTimeline — Surface2 stat chips with Bd border
13. SettingsModal — Glass modal, Glass2 sidebar/header/footer, Surface2 inputs
14. AgentConfigDialog — Glass modal, Glass2 header/footer, Surface2 inputs
