package com.swarmeditor.backend

import com.swarmeditor.backend.agent.AgentRegistry
import com.swarmeditor.backend.activity.ActivityStore
import com.swarmeditor.backend.capability.CapabilityRegistry
import com.swarmeditor.backend.delivery.DeliveryRecordStore
import com.swarmeditor.backend.mcp.McpStore
import com.swarmeditor.backend.mcp.UserMcpScanner
import com.swarmeditor.backend.model.ModelRegistry
import com.swarmeditor.backend.lsp.LspService
import com.swarmeditor.backend.lsp.KotlinLspRuntimeManager
import com.swarmeditor.backend.pi.PiRuntimeDistribution
import com.swarmeditor.backend.pi.PiMcpExtensionInstaller
import com.swarmeditor.backend.pi.PiNativeAgentBootstrap
import com.swarmeditor.backend.pi.PiRuntimeManager
import com.swarmeditor.backend.pi.PiRuntimePaths
import com.swarmeditor.backend.pi.PiToolBrokerFactory
import com.swarmeditor.backend.pi.FilePiToolAuditStore
import com.swarmeditor.backend.pi.BubblewrapPiToolBrokerFactory
import com.swarmeditor.backend.pi.FallbackPiToolBrokerFactory
import com.swarmeditor.backend.pi.WasmPluginCapabilityExecutor
import com.swarmeditor.backend.pi.WasmPiToolBrokerFactory
import com.swarmeditor.backend.pi.WasmPluginRegistry
import com.swarmeditor.backend.pi.WasmtimeRuntimeManager
import com.swarmeditor.backend.service.AgentService
import com.swarmeditor.backend.service.ConversationService
import com.swarmeditor.backend.service.GitService
import com.swarmeditor.backend.service.KotlinLspRuntimeService
import com.swarmeditor.backend.service.McpService
import com.swarmeditor.backend.service.ModelService
import com.swarmeditor.backend.service.ProjectService
import com.swarmeditor.backend.service.ReviewService
import com.swarmeditor.backend.service.SessionService
import com.swarmeditor.backend.service.SkillService
import com.swarmeditor.backend.service.SwarmService
import com.swarmeditor.backend.service.SwarmEvolutionService
import com.swarmeditor.backend.service.WasmPluginService
import com.swarmeditor.backend.service.WorkspaceService
import com.swarmeditor.backend.spec.ProjectSpecContextFormatter
import com.swarmeditor.backend.spec.ProjectSpecGraphScanner
import com.swarmeditor.backend.session.SessionStore
import com.swarmeditor.backend.skill.SkillScanner
import com.swarmeditor.backend.skill.SkillStore
import com.swarmeditor.backend.review.ReviewPackageStore
import com.swarmeditor.backend.skill.ProjectSkillScanner
import com.swarmeditor.backend.skill.ProjectSkillTrustStore
import com.swarmeditor.backend.workspace.WorkspaceStore
import com.swarmeditor.backend.swarm.PiSwarmTaskExecutor
import com.swarmeditor.backend.swarm.PiSwarmPlanner
import com.swarmeditor.backend.swarm.PiSwarmExperienceLearner
import com.swarmeditor.backend.swarm.SwarmScheduler
import com.swarmeditor.backend.swarm.SwarmExperienceStore
import com.swarmeditor.backend.swarm.UtilityAwareSwarmExperienceSelector
import com.swarmeditor.backend.swarm.SwarmEvolutionStore
import com.swarmeditor.backend.swarm.PiSwarmSkillCandidateGenerator
import com.swarmeditor.backend.swarm.SwarmCounterfactualReplayFactory
import com.swarmeditor.backend.swarm.GitContentAddressedSnapshotter
import com.swarmeditor.backend.swarm.GitDependencyAwareSwarmTaskBaseRevisionResolver
import com.swarmeditor.backend.swarm.EvidenceDrivenSwarmRoutingChallengePlanner
import com.swarmeditor.backend.swarm.EvidenceDrivenSwarmRepositoryLocalizer
import com.swarmeditor.backend.swarm.EvidenceDrivenSwarmRoutingEvaluationCasePlanner
import com.swarmeditor.backend.swarm.SwarmStore
import com.swarmeditor.backend.swarm.SwarmEvidenceStore
import com.swarmeditor.backend.swarm.EvidenceBackedSwarmTaskVerifier
import com.swarmeditor.backend.swarm.GitSwarmTaskWorkspaceManager
import com.swarmeditor.backend.swarm.GitSwarmWorkspaceDeltaCapturer
import com.swarmeditor.backend.swarm.GitSwarmArtifactIntegrator
import com.swarmeditor.common.config.ConfigPaths
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

val projectRoot: File = resolveProjectRoot(
    explicitRoot = System.getProperty(PROJECT_ROOT_PROPERTY),
    userDirectory = System.getProperty("user.dir"),
)

val piDistribution = PiRuntimeDistribution(projectRoot)
val agentRegistry = AgentRegistry()
val modelRegistry = ModelRegistry()
val sessionStore = SessionStore(File(ConfigPaths.SESSIONS_DIR))
val activityStore = ActivityStore(File(ConfigPaths.ACTIVITY_JSON))
val reviewPackageStore = ReviewPackageStore(File(ConfigPaths.REVIEW_PACKAGES_JSON))
val reviewService = ReviewService(reviewPackageStore, activityStore)
val deliveryRecordStore = DeliveryRecordStore(File(ConfigPaths.DELIVERY_RECORDS_JSON))
val capabilityRegistry = CapabilityRegistry()
val workspaceStore = WorkspaceStore(File(ConfigPaths.PROJECT_WORKSPACES_JSON))
val workspaceService = WorkspaceService(workspaceStore, File(ConfigPaths.PROJECT_WORKSPACES_DIR))
val mcpStore = McpStore(File(ConfigPaths.MCP_SERVERS_JSON))
val userMcpScanner = UserMcpScanner()
val skillStore = SkillStore(File(ConfigPaths.SKILLS_JSON))
val skillScanner = SkillScanner()
val projectSkillScanner = ProjectSkillScanner()
val projectSkillTrustStore = ProjectSkillTrustStore(File(ConfigPaths.PROJECT_SKILL_TRUST_JSON))
val projectSpecGraphScanner = ProjectSpecGraphScanner()
val projectSpecContextFormatter = ProjectSpecContextFormatter()
val piToolAuditStore = FilePiToolAuditStore(File(ConfigPaths.PI_TOOL_AUDIT_DIR))
val wasmPluginRegistry = WasmPluginRegistry(File(ConfigPaths.WASM_PLUGINS_DIR))
val wasmtimeRuntimeManager = WasmtimeRuntimeManager(File(ConfigPaths.WASMTIME_RUNTIME_DIR))
val wasmPluginExecutor = WasmPluginCapabilityExecutor(
    registry = wasmPluginRegistry,
    sandboxProvider = wasmtimeRuntimeManager::sandboxOrNull,
    runtimeStatusProvider = wasmtimeRuntimeManager::inspect,
)
val wasmPluginService = WasmPluginService(
    registry = wasmPluginRegistry,
    runtimeManager = wasmtimeRuntimeManager,
    pluginDirectory = File(ConfigPaths.WASM_PLUGINS_DIR),
)
val configuredPiToolBrokerFactory: PiToolBrokerFactory? =
    BubblewrapPiToolBrokerFactory.fromEnvironment(
        environment = System.getenv(),
        auditStore = piToolAuditStore,
        wasmExecutor = wasmPluginExecutor,
    )
val wasmPiToolBrokerFactory = WasmPiToolBrokerFactory(wasmPluginExecutor, piToolAuditStore)
val piToolBrokerFactory = FallbackPiToolBrokerFactory(configuredPiToolBrokerFactory, wasmPiToolBrokerFactory)
private val piNativeAgentBootstrap = PiNativeAgentBootstrap()
val skillService: SkillService by lazy {
    SkillService(
        skillStore,
        skillScanner,
        projectRoot = projectRoot,
        projectScanner = projectSkillScanner,
        projectTrustStore = projectSkillTrustStore,
        auditActivity = activityStore::append,
        agentIdsProvider = { agentRegistry.getAllConfigs().map { it.id } },
        invalidateAgentRuntime = { agentId -> piRuntimeManager.closeAgent(agentId) },
        invalidateAllRuntimes = { piRuntimeManager.closeAll() }
    )
}
val piRuntimeManager: PiRuntimeManager by lazy {
    PiRuntimeManager(
        piDistribution,
        projectRoot,
        defaultWorkingDirectoryProvider = { workspaceService.currentWorkspaceDirectory(projectRoot) },
        toolBrokerFactory = piToolBrokerFactory,
        prepareAgent = { config ->
            val agentDirectory = PiRuntimePaths.agentDirectory(config.id)
            piNativeAgentBootstrap.syncMissingConfiguration(agentDirectory)
            PiMcpExtensionInstaller.install(agentDirectory)
            skillService.syncSkillsToPi(config.id)
        }
    )
}

val modelService: ModelService by lazy {
    ModelService(modelRegistry, invalidateRuntimes = piRuntimeManager::closeAll)
}
val agentService: AgentService by lazy {
    AgentService(agentRegistry, piRuntimeManager, modelService = modelService)
}
val sessionService = SessionService(sessionStore)
val mcpService = McpService(
    mcpStore,
    userScanner = userMcpScanner,
    invalidateAllRuntimes = { piRuntimeManager.closeAll() }
)
val gitService = GitService(
    projectRoot,
    projectDirProvider = { workspaceService.currentWorkspaceDirectory(projectRoot) },
)
val kotlinLspRuntimeManager = KotlinLspRuntimeManager(File(ConfigPaths.KOTLIN_LSP_RUNTIME_DIR))
val lspService = LspService(
    projectRoot = projectRoot,
    managedCommandProvider = { spec ->
        if (spec.id == "kotlin") kotlinLspRuntimeManager.managedCommandOrNull(projectRoot) else null
    },
)
val kotlinLspRuntimeService = KotlinLspRuntimeService(
    runtimeManager = kotlinLspRuntimeManager,
    lspService = lspService,
    projectRoot = projectRoot,
    runtimeDirectory = File(ConfigPaths.KOTLIN_LSP_RUNTIME_DIR),
)
val projectService = ProjectService(
    projectRoot,
    lspService,
    projectSpecGraphScanner,
    projectDirProvider = { workspaceService.currentWorkspaceDirectory(projectRoot) },
)
val conversationService = ConversationService(
    sessionService,
    agentService,
    piRuntimeManager,
    activityStore,
    projectSpecContext = {
        projectSpecContextFormatter.format(
            projectSpecGraphScanner.scan(workspaceService.currentWorkspaceDirectory(projectRoot))
        )
    },
    projectContextEvidence = { query ->
        projectService.collectContextEvidence(
            query = query,
            maxResults = 50,
            maxSearchMatches = 50,
            broadRetryBudget = 1,
        )
    },
)
val swarmStore = SwarmStore(File(ConfigPaths.SWARM_RUNS_DIR))
val swarmEvidenceStore = SwarmEvidenceStore(File(ConfigPaths.SWARM_EVIDENCE_DIR))
val swarmTaskVerifier by lazy {
    EvidenceBackedSwarmTaskVerifier(evidenceStore = swarmEvidenceStore)
}
val swarmTaskWorkspaceManager by lazy {
    GitSwarmTaskWorkspaceManager(
        repositoryRoot = projectRoot,
        worktreeRoot = File(ConfigPaths.SWARM_TASK_WORKTREES_DIR),
    )
}
val swarmWorkspaceDeltaCapturer by lazy {
    GitSwarmWorkspaceDeltaCapturer(
        indexRoot = File(ConfigPaths.SWARM_TASK_INDEXES_DIR),
        evidenceStore = swarmEvidenceStore,
    )
}
val swarmTaskBaseRevisionResolver by lazy {
    GitDependencyAwareSwarmTaskBaseRevisionResolver(
        repositoryRoot = projectRoot,
        evidenceStore = swarmEvidenceStore,
    )
}
val swarmRepositorySnapshotter by lazy {
    GitContentAddressedSnapshotter(
        repositoryRoot = projectRoot,
        indexRoot = File(ConfigPaths.SWARM_EVALUATION_INDEXES_DIR),
    )
}
val swarmArtifactIntegrator by lazy {
    GitSwarmArtifactIntegrator(
        repositoryRoot = projectRoot,
        evidenceStore = swarmEvidenceStore,
        repositorySnapshotter = swarmRepositorySnapshotter,
    )
}
val swarmExperienceStore = SwarmExperienceStore(File(ConfigPaths.SWARM_EXPERIENCES_JSON))
val swarmEvolutionStore = SwarmEvolutionStore(File(ConfigPaths.SWARM_EVOLUTION_JSON))
val swarmExperienceSelector by lazy {
    UtilityAwareSwarmExperienceSelector(swarmExperienceStore, swarmEvolutionStore)
}
private val swarmScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
val swarmScheduler: SwarmScheduler by lazy {
    SwarmScheduler(
        store = swarmStore,
        executor = PiSwarmTaskExecutor(
            sessions = piRuntimeManager,
            workspaceManager = swarmTaskWorkspaceManager,
            workspaceDeltaCapturer = swarmWorkspaceDeltaCapturer,
            baseRevisionResolver = swarmTaskBaseRevisionResolver,
            taskVerifier = swarmTaskVerifier,
            agentResolver = com.swarmeditor.backend.swarm.SwarmAgentResolver { run, task ->
                val demand = com.swarmeditor.backend.swarm.SwarmModelDemandAssessor.assess(run, task)
                val allocation = agentService.acquireDynamicAgent(task, demand)
                com.swarmeditor.backend.swarm.SwarmAgentAllocation(
                    config = allocation.config,
                    isCurrent = allocation.isCurrent,
                    modelDemand = allocation.modelDemand,
                    modelSelectionReason = allocation.modelSelectionReason,
                    releaseAllocation = allocation::release,
                )
            },
            experienceProvider = { run, task ->
                val selection = swarmExperienceSelector.select(
                    query = "${run.objective} ${task.title} ${task.prompt}",
                    role = task.role,
                    limit = 6,
                )
                com.swarmeditor.backend.swarm.SwarmTaskExperienceContext(
                    experiences = selection.selected,
                    routingDecisions = selection.decisions,
                )
            },
        ),
        scope = swarmScope,
        learner = PiSwarmExperienceLearner(
            sessions = piRuntimeManager,
            store = swarmExperienceStore,
            availableAgents = agentService::getLaunchableConfigs,
            isConfigCurrent = agentService::isLaunchConfigCurrent,
        ),
    )
}
val swarmService: SwarmService by lazy {
    SwarmService(
        store = swarmStore,
        scheduler = swarmScheduler,
        agentService = agentService,
        planner = PiSwarmPlanner(
            sessions = piRuntimeManager,
            isConfigCurrent = agentService::isLaunchConfigCurrent,
        ),
        experienceStore = swarmExperienceStore,
        experienceSelector = swarmExperienceSelector,
        repositoryLocalizer = EvidenceDrivenSwarmRepositoryLocalizer(
            repositoryRoot = projectRoot,
            sourceIntelligence = lspService,
        ),
        repositorySnapshotProvider = { swarmRepositorySnapshotter.snapshot() },
        artifactIntegrator = swarmArtifactIntegrator,
        deliveryRecordStore = deliveryRecordStore,
        deliveryProjectPathProvider = { projectRoot.canonicalPath },
        capabilityRegistry = capabilityRegistry,
        dynamicAgentLimitProvider = {
            agentService.getConfig(AgentRegistry.DEFAULT_AGENT_ID)?.maxDynamicSubagents
                ?: AgentRegistry.defaultConfig().maxDynamicSubagents
        },
    )
}
val swarmEvolutionService: SwarmEvolutionService by lazy {
    SwarmEvolutionService(
        evolutionStore = swarmEvolutionStore,
        experienceStore = swarmExperienceStore,
        candidateGenerator = PiSwarmSkillCandidateGenerator(
            sessions = piRuntimeManager,
            experienceStore = swarmExperienceStore,
            evolutionStore = swarmEvolutionStore,
            availableAgents = agentService::getLaunchableConfigs,
            isConfigCurrent = agentService::isLaunchConfigCurrent,
        ),
        counterfactualReplayer = SwarmCounterfactualReplayFactory.fromEnvironment(
            repositoryRoot = projectRoot,
            worktreeRoot = File(ConfigPaths.SWARM_EVALUATION_WORKTREES_DIR),
            experienceStore = swarmExperienceStore,
            evolutionStore = swarmEvolutionStore,
        ),
        repositorySnapshotter = swarmRepositorySnapshotter,
        routingChallengePlanner = EvidenceDrivenSwarmRoutingChallengePlanner(
            runStore = swarmStore,
            experienceStore = swarmExperienceStore,
            evolutionStore = swarmEvolutionStore,
        ),
        routingEvaluationCasePlanner = EvidenceDrivenSwarmRoutingEvaluationCasePlanner(
            runStore = swarmStore,
        ),
    )
}

private val initialized = AtomicBoolean()
private val shutdownMutex = Mutex()

suspend fun initializeBackendServices() {
    if (!initialized.compareAndSet(false, true)) return
    try {
        workspaceService.list(projectRoot)
        PiMcpExtensionInstaller.install()
        modelService.init()
        agentService.init()
        sessionService.init()
        activityStore.load()
        deliveryRecordStore.load()
        activityStore.seedFromSessions(sessionService.sessions.value)
        mcpService.init()
        skillService.init()
        wasmPluginService.init()
        kotlinLspRuntimeService.init()
        swarmExperienceStore.load()
        swarmEvolutionService.init()
        swarmService.init()
        Runtime.getRuntime().addShutdownHook(Thread {
            runBlocking { shutdownBackendServices() }
        })
    } catch (error: Throwable) {
        initialized.set(false)
        throw error
    }
}

suspend fun shutdownBackendServices() {
    shutdownMutex.withLock {
        shutdownResources(
            cancelSwarm = swarmScheduler::shutdown,
            cancelSwarmScope = swarmScope::cancel,
            closeLsp = lspService::close,
            shutdownPi = piRuntimeManager::shutdown,
        )
    }
}

internal suspend fun shutdownResources(
    cancelSwarm: suspend () -> Unit,
    cancelSwarmScope: () -> Unit,
    closeLsp: suspend () -> Unit,
    shutdownPi: suspend () -> Unit,
) {
    val failures = withContext(NonCancellable) {
        buildList {
            suspend fun attempt(action: suspend () -> Unit) {
                try {
                    action()
                } catch (error: Throwable) {
                    add(error)
                }
            }

            attempt(cancelSwarm)
            attempt { cancelSwarmScope() }
            attempt(closeLsp)
            attempt(shutdownPi)
        }
    }

    failures.firstOrNull()?.let { firstFailure ->
        failures.drop(1).forEach(firstFailure::addSuppressed)
        throw firstFailure
    }
}
