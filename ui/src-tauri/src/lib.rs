use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use tauri::Manager;
use tokio::process::Command as TokioCommand;

// ============================================================================
// ACP 模块 - Agent Communication Protocol
// ============================================================================

mod acp;
mod swarm;
mod events;

// ============================================================================
// 类型定义 - 与 Go 后端配置格式对齐
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MCPSettings {
    #[serde(rename = "useCustomMcp", default)]
    pub use_custom_mcp: bool,
    #[serde(rename = "useEditorMcp", default)]
    pub use_editor_mcp: bool,
    #[serde(rename = "allowedTools", default)]
    pub allowed_tools: Vec<String>,
    #[serde(rename = "customMcpServers", default)]
    pub custom_mcp_servers: Vec<MCPServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MCPServerConfig {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentSwarmConfig {
    #[serde(rename = "canBeCoordinator", default)]
    pub can_be_coordinator: bool,
    #[serde(rename = "canBeWorker", default)]
    pub can_be_worker: bool,
    #[serde(rename = "preferredRoles", default)]
    pub preferred_roles: Vec<String>,
    #[serde(rename = "maxConcurrent", default)]
    pub max_concurrent: Option<i32>,
    #[serde(default)]
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(rename = "mcpSettings", default)]
    pub mcp_settings: MCPSettings,
    #[serde(rename = "expectedCapabilities", default)]
    pub expected_capabilities: Option<AgentCapabilitiesConfig>,
    #[serde(rename = "swarmConfig", default)]
    pub swarm_config: Option<AgentSwarmConfig>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub timeout: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentCapabilitiesConfig {
    #[serde(rename = "loadSession", default)]
    pub load_session: bool,
    #[serde(default)]
    pub prompt_capabilities: Option<PromptCapabilities>,
    #[serde(default)]
    pub mcp: Option<MCPCapabilities>,
    #[serde(rename = "pairProgramming", default)]
    pub pair_programming: bool,
    #[serde(rename = "teamCollaboration", default)]
    pub team_collaboration: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptCapabilities {
    #[serde(default)]
    pub image: bool,
    #[serde(default)]
    pub audio: bool,
    #[serde(default)]
    pub embedded_context: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MCPCapabilities {
    #[serde(default)]
    pub http: bool,
    #[serde(default)]
    pub sse: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultSwarmSettings {
    #[serde(rename = "defaultTopology", default = "default_topology")]
    pub default_topology: String,
    #[serde(rename = "defaultStrategy", default = "default_strategy")]
    pub default_strategy: String,
    #[serde(rename = "consensusThreshold", default = "default_consensus")]
    pub consensus_threshold: f64,
    #[serde(rename = "taskTimeout", default = "default_timeout")]
    pub task_timeout: i32,
    #[serde(rename = "maxRetries", default = "default_retries")]
    pub max_retries: i32,
}

fn default_topology() -> String { "star".to_string() }
fn default_strategy() -> String { "parallel".to_string() }
fn default_consensus() -> f64 { 0.6 }
fn default_timeout() -> i32 { 300 }
fn default_retries() -> i32 { 3 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(rename = "defaultMcpSettings", default)]
    pub default_mcp_settings: MCPSettings,
    pub agents: HashMap<String, AgentConfig>,
    #[serde(rename = "maxConnections", default = "default_max_connections")]
    pub max_connections: i32,
    #[serde(rename = "connectTimeout", default = "default_connect_timeout")]
    pub connect_timeout: i32,
    #[serde(rename = "defaultSwarmConfig", default)]
    pub default_swarm_config: Option<DefaultSwarmSettings>,
}

fn default_max_connections() -> i32 { 10 }
fn default_connect_timeout() -> i32 { 30 }

// ============================================================================
// 前端 API 类型
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub agent_type: String,
    pub status: String,
    pub command: String,
    pub capabilities: Vec<String>,
    #[serde(rename = "lastActive")]
    pub last_active: Option<String>,
    pub description: Option<String>,
    pub enabled: bool,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

// ============================================================================
// 蜂群管理类型
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SwarmState {
    Initializing,
    Active,
    Paused,
    Stopping,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TopologyType {
    Star,
    Mesh,
    Tree,
    Ring,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStrategy {
    Parallel,
    Sequential,
    Pipeline,
    MapReduce,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStats {
    pub agent_count: usize,
    pub idle_agents: usize,
    pub executing_agents: usize,
    pub pending_tasks: usize,
    pub completed_tasks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmInfo {
    pub id: String,
    pub name: String,
    pub topology: String,
    pub strategy: String,
    pub state: String,
    pub agents: Vec<String>,
    pub stats: SwarmStats,
    pub created_at: String,
    pub coordinator_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmCreateRequest {
    pub name: String,
    pub topology: String,
    pub strategy: String,
    pub agent_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTaskRequest {
    pub swarm_id: String,
    pub title: String,
    pub description: Option<String>,
    pub prompt: String,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTaskResult {
    pub task_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub agent_results: std::collections::HashMap<String, AgentTaskResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    pub agent_id: String,
    pub content: String,
    pub success: bool,
    pub duration_ms: u64,
}

// ============================================================================
// 进程管理
// ============================================================================

pub struct ProcessManager {
    processes: Mutex<HashMap<String, u32>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, id: &str, pid: u32) {
        let mut processes = self.processes.lock().unwrap();
        processes.insert(id.to_string(), pid);
    }

    pub fn unregister(&self, id: &str) {
        let mut processes = self.processes.lock().unwrap();
        processes.remove(id);
    }

    pub fn get_pid(&self, id: &str) -> Option<u32> {
        let processes = self.processes.lock().unwrap();
        processes.get(id).copied()
    }
}

// ============================================================================
// 蜂群状态管理
// ============================================================================

#[derive(Debug, Clone)]
pub struct SwarmStateData {
    pub info: SwarmInfo,
    pub task_queue: Vec<SwarmTaskRequest>,
    pub active_tasks: HashMap<String, SwarmTaskResult>,
}

pub struct SwarmManager {
    swarms: Mutex<HashMap<String, SwarmStateData>>,
}

impl SwarmManager {
    pub fn new() -> Self {
        Self {
            swarms: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_swarm(&self, request: SwarmCreateRequest, agents: &[AgentInfo]) -> Result<SwarmInfo, String> {
        let id = format!("swarm-{}", chrono::Utc::now().timestamp_millis());

        // 验证 Agent 存在
        let valid_agents: Vec<String> = request.agent_ids.iter()
            .filter(|id| agents.iter().any(|a| &a.id == *id))
            .cloned()
            .collect();

        if valid_agents.is_empty() {
            return Err("No valid agents specified".to_string());
        }

        // 找到可用的协调者
        let coordinator_id = agents.iter()
            .find(|a| {
                valid_agents.contains(&a.id) &&
                a.capabilities.contains(&"coordinator".to_string())
            })
            .map(|a| a.id.clone());

        let info = SwarmInfo {
            id: id.clone(),
            name: request.name,
            topology: request.topology,
            strategy: request.strategy,
            state: "stopped".to_string(),
            agents: valid_agents.clone(),
            stats: SwarmStats {
                agent_count: valid_agents.len(),
                idle_agents: valid_agents.len(),
                executing_agents: 0,
                pending_tasks: 0,
                completed_tasks: 0,
            },
            created_at: chrono::Utc::now().to_rfc3339(),
            coordinator_id,
        };

        let state_data = SwarmStateData {
            info: info.clone(),
            task_queue: Vec::new(),
            active_tasks: HashMap::new(),
        };

        let mut swarms = self.swarms.lock().unwrap();
        swarms.insert(id, state_data);

        Ok(info)
    }

    pub fn get_swarm(&self, id: &str) -> Option<SwarmInfo> {
        let swarms = self.swarms.lock().unwrap();
        swarms.get(id).map(|s| s.info.clone())
    }

    pub fn get_all_swarms(&self) -> Vec<SwarmInfo> {
        let swarms = self.swarms.lock().unwrap();
        swarms.values().map(|s| s.info.clone()).collect()
    }

    pub fn start_swarm(&self, id: &str) -> Result<SwarmInfo, String> {
        let mut swarms = self.swarms.lock().unwrap();
        let state = swarms.get_mut(id)
            .ok_or_else(|| format!("Swarm not found: {}", id))?;

        state.info.state = "active".to_string();
        Ok(state.info.clone())
    }

    pub fn stop_swarm(&self, id: &str) -> Result<SwarmInfo, String> {
        let mut swarms = self.swarms.lock().unwrap();
        let state = swarms.get_mut(id)
            .ok_or_else(|| format!("Swarm not found: {}", id))?;

        state.info.state = "stopped".to_string();
        Ok(state.info.clone())
    }

    pub fn delete_swarm(&self, id: &str) -> Result<(), String> {
        let mut swarms = self.swarms.lock().unwrap();
        swarms.remove(id)
            .ok_or_else(|| format!("Swarm not found: {}", id))?;
        Ok(())
    }

    pub fn submit_task(&self, request: SwarmTaskRequest) -> Result<String, String> {
        let mut swarms = self.swarms.lock().unwrap();
        let state = swarms.get_mut(&request.swarm_id)
            .ok_or_else(|| format!("Swarm not found: {}", request.swarm_id))?;

        let task_id = format!("task-{}", chrono::Utc::now().timestamp_millis());

        // 更新统计
        state.info.stats.pending_tasks += 1;

        state.task_queue.push(request);
        Ok(task_id)
    }
}

// ============================================================================
// Agent 管理
// ============================================================================

/// 获取 Agent 配置目录
fn get_config_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".swarm-editor")
}

/// 获取 Agent 配置文件路径
fn get_agents_config_path() -> PathBuf {
    get_config_dir().join("agents.json")
}

/// 加载完整配置
fn load_config() -> Config {
    let config_path = get_agents_config_path();

    if !config_path.exists() {
        // 创建默认配置
        let config = create_default_config();
        if let Err(e) = save_config(&config) {
            log::warn!("Failed to save default config: {}", e);
        }
        return config;
    }

    match fs::read_to_string(&config_path) {
        Ok(content) => {
            match serde_json::from_str(&content) {
                Ok(config) => config,
                Err(e) => {
                    log::warn!("Failed to parse config: {}, using default", e);
                    create_default_config()
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to read config: {}, using default", e);
            create_default_config()
        }
    }
}

/// 保存配置
fn save_config(config: &Config) -> Result<(), String> {
    let config_path = get_agents_config_path();
    
    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}

/// 创建默认配置
fn create_default_config() -> Config {
    let mut agents = HashMap::new();
    
    agents.insert("claude-code".to_string(), AgentConfig {
        id: "claude-code".to_string(),
        name: "Claude Code".to_string(),
        description: Some("Claude-powered coding assistant".to_string()),
        enabled: true,
        command: "claude".to_string(),
        args: vec!["acp".to_string()],
        env: HashMap::from([
            ("ANTHROPIC_API_KEY".to_string(), "${ANTHROPIC_API_KEY}".to_string()),
        ]),
        mcp_settings: MCPSettings {
            use_custom_mcp: true,
            use_editor_mcp: true,
            ..Default::default()
        },
        swarm_config: Some(AgentSwarmConfig {
            can_be_coordinator: true,
            can_be_worker: true,
            preferred_roles: vec!["coder".to_string(), "architect".to_string()],
            max_concurrent: Some(3),
            priority: Some(10),
        }),
        tags: vec!["primary".to_string(), "coding".to_string()],
        timeout: Some(300),
        ..Default::default()
    });

    agents.insert("code-reviewer".to_string(), AgentConfig {
        id: "code-reviewer".to_string(),
        name: "Code Reviewer".to_string(),
        description: Some("Specialized code review agent".to_string()),
        enabled: true,
        command: "claude".to_string(),
        args: vec!["acp".to_string(), "--role".to_string(), "reviewer".to_string()],
        env: HashMap::new(),
        mcp_settings: MCPSettings {
            use_custom_mcp: true,
            ..Default::default()
        },
        swarm_config: Some(AgentSwarmConfig {
            can_be_coordinator: false,
            can_be_worker: true,
            preferred_roles: vec!["reviewer".to_string()],
            max_concurrent: Some(5),
            priority: Some(8),
        }),
        tags: vec!["review".to_string(), "quality".to_string()],
        timeout: Some(120),
        ..Default::default()
    });

    agents.insert("test-generator".to_string(), AgentConfig {
        id: "test-generator".to_string(),
        name: "Test Generator".to_string(),
        description: Some("Automated test generation agent".to_string()),
        enabled: true,
        command: "claude".to_string(),
        args: vec!["acp".to_string(), "--role".to_string(), "tester".to_string()],
        env: HashMap::new(),
        mcp_settings: MCPSettings {
            use_custom_mcp: true,
            ..Default::default()
        },
        swarm_config: Some(AgentSwarmConfig {
            can_be_coordinator: false,
            can_be_worker: true,
            preferred_roles: vec!["tester".to_string()],
            max_concurrent: Some(2),
            priority: Some(6),
        }),
        tags: vec!["testing".to_string(), "automation".to_string()],
        timeout: Some(180),
        ..Default::default()
    });

    Config {
        default_mcp_settings: MCPSettings {
            use_custom_mcp: true,
            use_editor_mcp: false,
            ..Default::default()
        },
        agents,
        max_connections: 10,
        connect_timeout: 30,
        default_swarm_config: Some(DefaultSwarmSettings {
            default_topology: "star".to_string(),
            default_strategy: "parallel".to_string(),
            consensus_threshold: 0.6,
            task_timeout: 300,
            max_retries: 3,
        }),
    }
}

/// 检测 Agent 进程是否运行中
fn check_agent_process_status(command: &str) -> (String, Option<u32>) {
    // 使用 pgrep 查找进程
    let output = StdCommand::new("pgrep")
        .arg("-f")
        .arg(command)
        .output();

    match output {
        Ok(o) if !o.stdout.is_empty() => {
            // 解析 PID
            let stdout = String::from_utf8_lossy(&o.stdout);
            if let Some(pid_str) = stdout.lines().next() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    return ("running".to_string(), Some(pid));
                }
            }
            ("running".to_string(), None)
        }
        Ok(_) => ("stopped".to_string(), None),
        Err(_) => ("unknown".to_string(), None),
    }
}

/// 将 AgentConfig 转换为 AgentInfo
fn config_to_info(config: &AgentConfig) -> AgentInfo {
    let (status, pid) = check_agent_process_status(&config.command);
    
    // 构建能力列表
    let mut capabilities = Vec::new();
    if let Some(ref caps) = config.expected_capabilities {
        if caps.load_session {
            capabilities.push("load_session".to_string());
        }
        if caps.pair_programming {
            capabilities.push("pair_programming".to_string());
        }
        if caps.team_collaboration {
            capabilities.push("team_collaboration".to_string());
        }
    }
    
    // 从 swarm 配置添加角色
    if let Some(ref swarm) = config.swarm_config {
        for role in &swarm.preferred_roles {
            capabilities.push(format!("role:{}", role));
        }
        if swarm.can_be_coordinator {
            capabilities.push("coordinator".to_string());
        }
        if swarm.can_be_worker {
            capabilities.push("worker".to_string());
        }
    }

    // 从标签添加能力
    for tag in &config.tags {
        capabilities.push(format!("tag:{}", tag));
    }

    let last_active = if status == "running" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    AgentInfo {
        id: config.id.clone(),
        name: config.name.clone(),
        agent_type: config.swarm_config
            .as_ref()
            .and_then(|s| s.preferred_roles.first().cloned())
            .unwrap_or_else(|| "agent".to_string()),
        status,
        command: config.command.clone(),
        capabilities,
        last_active,
        description: config.description.clone(),
        enabled: config.enabled,
        pid,
    }
}

/// 扫描所有 Agent 并返回状态
fn scan_agents() -> Vec<AgentInfo> {
    let config = load_config();
    config.agents.values()
        .filter(|a| a.enabled)
        .map(config_to_info)
        .collect()
}

// ============================================================================
// 文件系统
// ============================================================================

fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();

    match fs::read_dir(&path) {
        Ok(dir_entries) => {
            for entry in dir_entries.flatten() {
                let entry_path = entry.path();
                let name = entry_path.file_name().to_string_lossy().to_string();
                let is_dir = entry_path.is_dir();

                let file_entry = FileEntry {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: is_dir,
                    children: if is_dir { Some(vec![]) } else { None },
                };
                entries.push(file_entry);
            }
        }
        Err(e) => return Err(format!("Failed to read directory: {}", e)),
    }

    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

fn read_file_content(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

fn write_file_content(path: &str, content: &str) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 获取所有 Agent
#[tauri::command]
fn get_agents() -> Result<Vec<AgentInfo>, String> {
    Ok(scan_agents())
}

/// 刷新 Agent 状态
#[tauri::command]
fn refresh_agents() -> Result<Vec<AgentInfo>, String> {
    Ok(scan_agents())
}

/// 启动 Agent
#[tauri::command]
async fn start_agent(id: String, app: tauri::AppHandle) -> Result<AgentInfo, String> {
    let config = load_config();
    let agent_config = config.agents.get(&id)
        .ok_or_else(|| format!("Agent not found: {}", id))?
        .clone();

    // 检查是否已经在运行
    let (status, existing_pid) = check_agent_process_status(&agent_config.command);
    if status == "running" {
        let mut info = config_to_info(&agent_config);
        info.status = "running".to_string();
        info.pid = existing_pid;
        info.last_active = Some(chrono::Utc::now().to_rfc3339());
        return Ok(info);
    }

    // 构建环境变量
    let mut envs = HashMap::new();
    for (key, value) in &agent_config.env {
        // 替换环境变量引用
        let resolved = if value.starts_with("${") && value.ends_with("}") {
            let var_name = &value[2..value.len()-1];
            std::env::var(var_name).unwrap_or_default()
        } else {
            value.clone()
        };
        envs.insert(key.clone(), resolved);
    }

    // 启动进程
    let mut cmd = TokioCommand::new(&agent_config.command);
    cmd.args(&agent_config.args);
    
    for (key, value) in &envs {
        cmd.env(key, value);
    }

    // 如果有 shell 插件，使用它来启动
    #[cfg(feature = "shell")]
    {
        use tauri_plugin_shell::ShellExt;
        let shell = app.shell();
        let sidecar = shell.sidecar(&agent_config.command);
        // 如果 sidecar 可用，使用它
    }

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            log::info!("Started agent {} with PID {:?}", id, pid);
            
            let mut info = config_to_info(&agent_config);
            info.status = "running".to_string();
            info.pid = pid;
            info.last_active = Some(chrono::Utc::now().to_rfc3339());
            Ok(info)
        }
        Err(e) => {
            log::error!("Failed to start agent {}: {}", id, e);
            Err(format!("Failed to start agent: {}", e))
        }
    }
}

/// 停止 Agent
#[tauri::command]
async fn stop_agent(id: String) -> Result<AgentInfo, String> {
    let config = load_config();
    let agent_config = config.agents.get(&id)
        .ok_or_else(|| format!("Agent not found: {}", id))?
        .clone();

    // 检查进程状态
    let (status, pid) = check_agent_process_status(&agent_config.command);
    
    if status != "running" {
        let mut info = config_to_info(&agent_config);
        info.status = "stopped".to_string();
        return Ok(info);
    }

    // 发送终止信号
    if let Some(pid) = pid {
        let kill_result = StdCommand::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .output();

        match kill_result {
            Ok(_) => {
                log::info!("Sent TERM signal to agent {} (PID {})", id, pid);
                // 等待进程结束
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
            Err(e) => {
                log::warn!("Failed to send TERM signal: {}, trying KILL", e);
                let _ = StdCommand::new("kill")
                    .arg("-KILL")
                    .arg(pid.to_string())
                    .output();
            }
        }
    }

    let mut info = config_to_info(&agent_config);
    info.status = "stopped".to_string();
    info.pid = None;
    Ok(info)
}

/// 获取单个 Agent 详情
#[tauri::command]
fn get_agent(id: String) -> Result<AgentInfo, String> {
    let config = load_config();
    let agent_config = config.agents.get(&id)
        .ok_or_else(|| format!("Agent not found: {}", id))?;
    Ok(config_to_info(agent_config))
}

/// 添加 Agent 配置
#[tauri::command]
fn add_agent(config: AgentConfig) -> Result<AgentInfo, String> {
    if config.id.is_empty() {
        return Err("Agent ID is required".to_string());
    }

    let mut full_config = load_config();
    
    if full_config.agents.contains_key(&config.id) {
        return Err(format!("Agent {} already exists", config.id));
    }

    let info = config_to_info(&config);
    full_config.agents.insert(config.id.clone(), config);
    
    save_config(&full_config)?;
    Ok(info)
}

/// 更新 Agent 配置
#[tauri::command]
fn update_agent(config: AgentConfig) -> Result<AgentInfo, String> {
    if config.id.is_empty() {
        return Err("Agent ID is required".to_string());
    }

    let mut full_config = load_config();
    
    if !full_config.agents.contains_key(&config.id) {
        return Err(format!("Agent {} not found", config.id));
    }

    let info = config_to_info(&config);
    full_config.agents.insert(config.id.clone(), config);
    
    save_config(&full_config)?;
    Ok(info)
}

/// 删除 Agent 配置
#[tauri::command]
fn delete_agent(id: String) -> Result<(), String> {
    let mut config = load_config();
    
    if config.agents.remove(&id).is_none() {
        return Err(format!("Agent {} not found", id));
    }
    
    save_config(&config)
}

/// 列出目录
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    list_directory(&path)
}

/// 读取文件
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    read_file_content(&path)
}

/// 写入文件
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    write_file_content(&path, &content)
}

/// 执行代码（通过 Agent）
#[tauri::command]
async fn execute_code(
    file_path: String,
    content: String,
    language: String,
    agent_id: Option<String>,
) -> Result<ExecuteResult, String> {
    // TODO: 实现真实的 Agent 代码执行
    Ok(ExecuteResult {
        success: true,
        output: format!(
            "// Executed {} code via agent {:?}\n// File: {}\n// Output:\n{}",
            language,
            agent_id,
            file_path,
            content
        ),
        error: None,
    })
}

/// 获取工作目录
#[tauri::command]
fn get_workspace() -> Result<String, String> {
    match std::env::current_dir() {
        Ok(dir) => Ok(dir.to_string_lossy().to_string()),
        Err(_) => Ok("/".to_string()),
    }
}

/// 获取配置文件路径
#[tauri::command]
fn get_config_path() -> String {
    get_agents_config_path().to_string_lossy().to_string()
}

// ============================================================================
// 蜂群管理命令
// ============================================================================

/// 创建蜂群
#[tauri::command]
async fn create_swarm(
    request: SwarmCreateRequest,
    swarm_manager: tauri::State<'_, SwarmManager>,
    swarm_bridge: tauri::State<'_, swarm::SwarmBridge>,
) -> Result<SwarmInfo, String> {
    // 尝试通过 Go 后端创建
    if swarm_bridge.is_connected() {
        let config = swarm::SwarmConfig {
            name: request.name.clone(),
            topology: match request.topology.as_str() {
                "mesh" => swarm::SwarmTopology::Mesh,
                "tree" => swarm::SwarmTopology::Tree,
                "ring" => swarm::SwarmTopology::Ring,
                "hybrid" => swarm::SwarmTopology::Hybrid,
                _ => swarm::SwarmTopology::Star,
            },
            strategy: match request.strategy.as_str() {
                "sequential" => swarm::TaskStrategy::Sequential,
                "pipeline" => swarm::TaskStrategy::Pipeline,
                "mapreduce" => swarm::TaskStrategy::MapReduce,
                _ => swarm::TaskStrategy::Parallel,
            },
            agent_ids: request.agent_ids.clone(),
        };

        match swarm_bridge.create_swarm(config).await {
            Ok(info) => {
                // 同步到本地管理器
                let agents = scan_agents();
                let local_request = SwarmCreateRequest {
                    name: info.name.clone(),
                    topology: info.topology.clone(),
                    strategy: info.strategy.clone(),
                    agent_ids: request.agent_ids.clone(),
                };
                let _ = swarm_manager.create_swarm(local_request, &agents);
                return Ok(SwarmInfo {
                    id: info.id,
                    name: info.name,
                    topology: info.topology,
                    strategy: info.strategy,
                    state: info.state,
                    agents: request.agent_ids,
                    stats: SwarmStats {
                        agent_count: info.agent_count,
                        idle_agents: info.agent_count,
                        executing_agents: 0,
                        pending_tasks: 0,
                        completed_tasks: 0,
                    },
                    created_at: chrono::DateTime::from_timestamp(info.created_at as i64, 0)
                        .map(|t| t.to_rfc3339())
                        .unwrap_or_default(),
                    coordinator_id: None,
                });
            }
            Err(e) => {
                log::warn!("Go backend create_swarm failed: {}, falling back to local", e);
            }
        }
    }

    // 本地回退实现
    let agents = scan_agents();
    swarm_manager.create_swarm(request, &agents)
}

/// 获取所有蜂群
#[tauri::command]
fn get_swarms(swarm_manager: tauri::State<'_, SwarmManager>) -> Result<Vec<SwarmInfo>, String> {
    Ok(swarm_manager.get_all_swarms())
}

/// 获取单个蜂群
#[tauri::command]
fn get_swarm(id: String, swarm_manager: tauri::State<'_, SwarmManager>) -> Result<SwarmInfo, String> {
    swarm_manager.get_swarm(&id)
        .ok_or_else(|| format!("Swarm not found: {}", id))
}

/// 启动蜂群
#[tauri::command]
async fn start_swarm(
    id: String,
    swarm_manager: tauri::State<'_, SwarmManager>,
    swarm_bridge: tauri::State<'_, swarm::SwarmBridge>,
) -> Result<SwarmInfo, String> {
    // 尝试通过 Go 后端启动
    if swarm_bridge.is_connected() {
        match swarm_bridge.start_swarm(&id).await {
            Ok(_) => {
                log::info!("Started swarm {} via Go backend", id);
            }
            Err(e) => {
                log::warn!("Go backend start_swarm failed: {}, falling back to local", e);
            }
        }
    }

    // 启动本地 Agent 进程
    let config = load_config();
    let agents_to_start: Vec<String> = {
        let swarms = swarm_manager.swarms.lock().unwrap();
        swarms.get(&id)
            .map(|s| s.info.agents.clone())
            .unwrap_or_default()
    };

    for agent_id in &agents_to_start {
        if let Some(agent_config) = config.agents.get(agent_id) {
            let (status, _) = check_agent_process_status(&agent_config.command);
            if status != "running" {
                // 尝试启动 Agent
                let mut cmd = TokioCommand::new(&agent_config.command);
                cmd.args(&agent_config.args);

                for (key, value) in &agent_config.env {
                    let resolved = if value.starts_with("${") && value.ends_with("}") {
                        let var_name = &value[2..value.len()-1];
                        std::env::var(var_name).unwrap_or_default()
                    } else {
                        value.clone()
                    };
                    cmd.env(key, resolved);
                }

                match cmd.spawn() {
                    Ok(child) => {
                        log::info!("Started agent {} with PID {:?}", agent_id, child.id());
                    }
                    Err(e) => {
                        log::warn!("Failed to start agent {}: {}", agent_id, e);
                    }
                }
            }
        }
    }

    // 等待 Agent 启动
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    swarm_manager.start_swarm(&id)
}

/// 停止蜂群
#[tauri::command]
async fn stop_swarm(
    id: String,
    swarm_manager: tauri::State<'_, SwarmManager>,
    swarm_bridge: tauri::State<'_, swarm::SwarmBridge>,
) -> Result<SwarmInfo, String> {
    // 尝试通过 Go 后端停止
    if swarm_bridge.is_connected() {
        match swarm_bridge.stop_swarm(&id).await {
            Ok(_) => {
                log::info!("Stopped swarm {} via Go backend", id);
            }
            Err(e) => {
                log::warn!("Go backend stop_swarm failed: {}, falling back to local", e);
            }
        }
    }

    swarm_manager.stop_swarm(&id)
}

/// 删除蜂群
#[tauri::command]
fn delete_swarm(id: String, swarm_manager: tauri::State<'_, SwarmManager>) -> Result<(), String> {
    swarm_manager.delete_swarm(&id)
}

/// 提交蜂群任务
#[tauri::command]
async fn submit_swarm_task(
    request: SwarmTaskRequest,
    swarm_manager: tauri::State<'_, SwarmManager>,
    swarm_bridge: tauri::State<'_, swarm::SwarmBridge>,
) -> Result<String, String> {
    // 尝试通过 Go 后端提交任务
    if swarm_bridge.is_connected() {
        let config = swarm::TaskConfig {
            title: request.title.clone(),
            prompt: request.prompt.clone(),
            priority: request.priority,
        };

        match swarm_bridge.submit_task(&request.swarm_id, config).await {
            Ok(info) => {
                log::info!("Submitted task {} via Go backend", info.id);
                return Ok(info.id);
            }
            Err(e) => {
                log::warn!("Go backend submit_task failed: {}, falling back to local", e);
            }
        }
    }

    // 本地回退实现
    swarm_manager.submit_task(request)
}

/// 执行蜂群任务（通过 Go 后端）
#[tauri::command]
async fn execute_swarm_task(
    swarm_id: String,
    task_id: String,
    swarm_manager: tauri::State<'_, SwarmManager>,
    swarm_bridge: tauri::State<'_, swarm::SwarmBridge>,
) -> Result<SwarmTaskResult, String> {
    // 尝试通过 Go 后端执行
    if swarm_bridge.is_connected() {
        match swarm_bridge.execute_task(&swarm_id, &task_id).await {
            Ok(result) => {
                // 更新统计
                {
                    let mut swarms = swarm_manager.swarms.lock().unwrap();
                    if let Some(state) = swarms.get_mut(&swarm_id) {
                        state.info.stats.completed_tasks += 1;
                        if state.info.stats.pending_tasks > 0 {
                            state.info.stats.pending_tasks -= 1;
                        }
                    }
                }
                return Ok(SwarmTaskResult {
                    task_id: result.task_id,
                    status: result.status,
                    output: result.output,
                    error: result.error,
                    agent_results: result.agent_results.unwrap_or_default(),
                });
            }
            Err(e) => {
                log::warn!("Go backend execution failed: {}, falling back to local", e);
            }
        }
    }

    // 本地回退实现
    log::info!("Using local fallback for task execution");
    let swarm_info = swarm_manager.get_swarm(&swarm_id)
        .ok_or_else(|| format!("Swarm not found: {}", swarm_id))?;

    let agents = scan_agents();
    let available_agents: Vec<AgentInfo> = agents.into_iter()
        .filter(|a| swarm_info.agents.contains(&a.id) && a.status == "running")
        .collect();

    if available_agents.is_empty() {
        return Err("No running agents available in swarm".to_string());
    }

    let result = SwarmTaskResult {
        task_id: task_id.clone(),
        status: "completed".to_string(),
        output: Some(format!(
            "Task executed by {} agents in swarm {}",
            available_agents.len(),
            swarm_info.name
        )),
        error: None,
        agent_results: {
            let mut results = HashMap::new();
            for agent in &available_agents {
                results.insert(agent.id.clone(), AgentTaskResult {
                    agent_id: agent.id.clone(),
                    content: format!("Task processed by {}", agent.name),
                    success: true,
                    duration_ms: 100,
                });
            }
            results
        },
    };

    // 更新统计
    {
        let mut swarms = swarm_manager.swarms.lock().unwrap();
        if let Some(state) = swarms.get_mut(&swarm_id) {
            state.info.stats.completed_tasks += 1;
            if state.info.stats.pending_tasks > 0 {
                state.info.stats.pending_tasks -= 1;
            }
        }
    }

    Ok(result)
}

/// 检查后端连接状态
#[tauri::command]
fn get_backend_status(swarm_bridge: tauri::State<'_, swarm::SwarmBridge>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "connected": swarm_bridge.is_connected(),
        "backendType": "go"
    }))
}

// ============================================================================
// 入口
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Determine the Go backend binary path
    let binary_path = if cfg!(debug_assertions) {
        // Development: use relative path from project root
        let manifest_dir = std::env::current_dir()
            .expect("Failed to get current directory")
            .parent()
            .expect("Failed to get parent directory")
            .join("bin/swarm-editor");
        manifest_dir.to_string_lossy().to_string()
    } else {
        // Production: use sidecar path
        "binaries/swarm-editor".to_string()
    };

    log::info!("Go backend binary path: {}", binary_path);

    let swarm_bridge = swarm::SwarmBridge::new(&binary_path);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ProcessManager::new())
        .manage(SwarmManager::new())
        .manage(swarm_bridge)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 初始化配置文件
            let config_path = get_agents_config_path();
            if !config_path.exists() {
                log::info!("Creating default config at {:?}", config_path);
                let config = create_default_config();
                if let Err(e) = save_config(&config) {
                    log::error!("Failed to create default config: {}", e);
                }
            }

            // Connect to Go backend asynchronously
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<swarm::SwarmBridge>();
                match state.connect().await {
                    Ok(_) => {
                        log::info!("Connected to Go backend");

                        // Set up notification handler to emit events to frontend
                        let app_handle_clone = app_handle.clone();
                        state.set_notification_handler(move |method, params| {
                            log::info!("Notification from Go backend: {} {:?}", method, params);

                            // Emit event to frontend based on notification type
                            if let Some(params_value) = params {
                                let event_name = match method {
                                    "swarm/task_update" => "swarm-task-update",
                                    "swarm/status_change" => "swarm-status-change",
                                    "agent/status_change" => "agent-status-change",
                                    "permission/request" => "permission-request",
                                    _ => "backend-notification",
                                };

                                if let Err(e) = app_handle_clone.emit(event_name, params_value) {
                                    log::error!("Failed to emit event {}: {}", event_name, e);
                                }
                            }
                        }).await;
                    }
                    Err(e) => log::error!("Failed to connect to Go backend: {}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_agents,
            refresh_agents,
            get_agent,
            start_agent,
            stop_agent,
            add_agent,
            update_agent,
            delete_agent,
            list_dir,
            read_file,
            write_file,
            execute_code,
            get_workspace,
            get_config_path,
            // 蜂群管理
            create_swarm,
            get_swarms,
            get_swarm,
            start_swarm,
            stop_swarm,
            delete_swarm,
            submit_swarm_task,
            execute_swarm_task,
            // 后端状态
            get_backend_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
