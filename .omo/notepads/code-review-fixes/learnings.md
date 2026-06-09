# Code Review Fixes — Learnings

## [2026-06-10] Task 1
- Added @Volatile to closed field in AcpConnection.kt
- Added exception logging to gracefulShutdown catch block
- Build status: PASS
## [2026-06-10] Task 2
- Removed destructive directory cleanup from SkillService.syncSkillsToAgent()
- Replaced hardcoded path with ConfigPaths.SWARM_EDITOR_DIR
- Build status: PASS
## [2026-06-10] Task 3
- Added skillsRootPath parameter to SkillService constructor (with default = ConfigPaths.SWARM_EDITOR_DIR)
- Updated SkillServiceTest to inject temp dirs via constructor instead of System.setProperty("user.home")
- Removed all System.setProperty/restore boilerplate from 3 sync tests
- Test status: PASS

## [2026-06-10] Task 4
- Added TODO comments to AgentDetectResult, ConfigFieldMeta, ConfigFieldType
- Build status: PASS
