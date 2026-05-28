package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// ProviderCategory classifies provider source
type ProviderCategory string

const (
	ProviderFirstParty ProviderCategory = "first_party"
	ProviderThirdParty ProviderCategory = "third_party"
)

// ProviderPreset is a preset provider configuration
type ProviderPreset struct {
	Name         string            `json:"name"`
	Category     ProviderCategory  `json:"category"`
	Description  string            `json:"description,omitempty"`
	WebsiteURL   string            `json:"websiteUrl,omitempty"`
	EnvVars      map[string]string `json:"envVars,omitempty"`      // Claude: ANTHROPIC_* env vars
	ProviderType string            `json:"providerType,omitempty"` // Kimi: openai_responses etc.
	BaseURL      string            `json:"baseUrl,omitempty"`
	Models       []string          `json:"models,omitempty"`
}

// AgentConfigView is the UI-facing view of an agent's configuration
type AgentConfigView struct {
	AgentID    string `json:"agentId"`
	AgentName  string `json:"agentName"`
	ConfigPath string `json:"configPath"`

	// Provider selection
	ProviderCategory ProviderCategory `json:"providerCategory"`
	ProviderPreset   string           `json:"providerPreset"`
	ProviderPresets  []ProviderPreset `json:"providerPresets"`

	// Model config (structured)
	Model      string `json:"model,omitempty"`
	SmallModel string `json:"smallModel,omitempty"`
	APIKey     string `json:"apiKey,omitempty"` // masked on read
	BaseURL    string `json:"baseUrl,omitempty"`

	// Other config (raw JSON)
	Raw map[string]any `json:"raw,omitempty"`
}

// AgentConfigSync reads/writes agent config in native format
type AgentConfigSync interface {
	Read() (*AgentConfigView, error)
	Write(view *AgentConfigView) error
	GetPresets() []ProviderPreset
	ConfigPath() string
}

// GetConfigSync returns the config syncer for an agent
func GetConfigSync(agentID string) (AgentConfigSync, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}

	switch agentID {
	case "claude-code":
		return &claudeConfigSync{
			settingsPath: filepath.Join(home, ".claude", "settings.json"),
			statePath:    filepath.Join(home, ".claude.json"),
		}, nil
	case "kimi-code":
		return &kimiConfigSync{
			configPath: filepath.Join(home, ".kimi", "config.toml"),
		}, nil
	case "opencode":
		return &openCodeConfigSync{
			configPath: filepath.Join(home, ".config", "opencode", "opencode.json"),
		}, nil
	case "qwen-code":
		return &qwenConfigSync{
			configPath: filepath.Join(home, ".qwen", "settings.json"),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported agent: %s", agentID)
	}
}

// --- Claude ConfigSync ---
// Config: ~/.claude/settings.json (env vars for model) + ~/.claude.json (state/mcp)

type claudeConfigSync struct {
	settingsPath string
	statePath    string
}

func (c *claudeConfigSync) ConfigPath() string { return c.settingsPath }

func (c *claudeConfigSync) Read() (*AgentConfigView, error) {
	settings := readOrCreateJSON(c.settingsPath)
	env, _ := settings["env"].(map[string]any)

	view := &AgentConfigView{
		AgentID:          "claude-code",
		AgentName:        "Claude Code",
		ConfigPath:       c.settingsPath,
		Model:            envString(env, "ANTHROPIC_MODEL"),
		APIKey:           maskKey(envString(env, "ANTHROPIC_AUTH_TOKEN")),
		BaseURL:          envString(env, "ANTHROPIC_BASE_URL"),
		ProviderCategory: ProviderThirdParty,
	}

	// Detect provider from env
	view.ProviderCategory, view.ProviderPreset = detectClaudeProvider(env)

	// Build raw: everything except env model keys
	raw := make(map[string]any)
	for k, v := range settings {
		if k == "env" {
			// Keep non-model env vars
			envRaw := make(map[string]any)
			for ek, ev := range env {
				if !isClaudeModelKey(ek) {
					envRaw[ek] = ev
				}
			}
			if len(envRaw) > 0 {
				raw["env"] = envRaw
			}
		} else {
			raw[k] = v
		}
	}
	view.Raw = raw
	view.ProviderPresets = c.GetPresets()

	return view, nil
}

func (c *claudeConfigSync) Write(view *AgentConfigView) error {
	settings := readOrCreateJSON(c.settingsPath)

	env, _ := settings["env"].(map[string]any)
	if env == nil {
		env = make(map[string]any)
	}

	// Apply preset env vars first
	if preset := findPreset(c.GetPresets(), view.ProviderPreset); preset != nil {
		for k, v := range preset.EnvVars {
			env[k] = v
		}
	}

	// Override with explicit values
	if view.Model != "" {
		env["ANTHROPIC_MODEL"] = view.Model
	}
	if view.BaseURL != "" {
		env["ANTHROPIC_BASE_URL"] = view.BaseURL
	}
	if view.APIKey != "" && !isMasked(view.APIKey) {
		env["ANTHROPIC_AUTH_TOKEN"] = view.APIKey
	}

	settings["env"] = env

	// Merge raw fields
	mergeRawInto(settings, view.Raw)

	if !validateJSON(settings) {
		return fmt.Errorf("invalid config format")
	}

	return writeJSON(c.settingsPath, settings)
}

func (c *claudeConfigSync) GetPresets() []ProviderPreset {
	return []ProviderPreset{
		{Name: "Anthropic Official", Category: ProviderFirstParty, BaseURL: "https://api.anthropic.com",
			EnvVars: map[string]string{"ANTHROPIC_BASE_URL": "https://api.anthropic.com"},
			Models:  []string{"claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514"}},
		{Name: "XiaoMi MiMo", Category: ProviderThirdParty,
			BaseURL: "https://token-plan-sgp.xiaomimimo.com/anthropic",
			EnvVars: map[string]string{"ANTHROPIC_BASE_URL": "https://token-plan-sgp.xiaomimimo.com/anthropic"},
			Models:  []string{"mimo-v2.5-pro", "mimo-v2.5"}},
		{Name: "OpenRouter", Category: ProviderThirdParty, BaseURL: "https://openrouter.ai/api/v1",
			EnvVars: map[string]string{"ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1"}},
		{Name: "Zhipu GLM", Category: ProviderThirdParty, BaseURL: "https://open.bigmodel.cn/api/anthropic",
			EnvVars: map[string]string{"ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic"},
			Models:  []string{"glm-4.7", "glm-4.6"}},
		{Name: "DeepSeek", Category: ProviderThirdParty, BaseURL: "https://api.deepseek.com/anthropic",
			EnvVars: map[string]string{"ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic"},
			Models:  []string{"deepseek-chat", "deepseek-reasoner"}},
		{Name: "Custom", Category: ProviderThirdParty},
	}
}

// --- Kimi ConfigSync ---
// Config: ~/.kimi/config.toml (TOML format)

type kimiConfigSync struct {
	configPath string
}

func (k *kimiConfigSync) ConfigPath() string { return k.configPath }

func (k *kimiConfigSync) Read() (*AgentConfigView, error) {
	data, err := os.ReadFile(k.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &AgentConfigView{
				AgentID:          "kimi-code",
				AgentName:        "Kimi Code",
				ConfigPath:       k.configPath,
				ProviderPresets:  k.GetPresets(),
				ProviderCategory: ProviderFirstParty,
			}, nil
		}
		return nil, fmt.Errorf("failed to read kimi config: %w", err)
	}

	var cfg kimiConfig
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse kimi config: %w", err)
	}

	view := &AgentConfigView{
		AgentID:    "kimi-code",
		AgentName:  "Kimi Code",
		ConfigPath: k.configPath,
		Model:      cfg.DefaultModel,
	}

	// Find the default model's provider
	if modelDef, ok := cfg.Models[cfg.DefaultModel]; ok {
		if provDef, ok := cfg.Providers[modelDef.Provider]; ok {
			view.BaseURL = provDef.BaseURL
			view.APIKey = maskKey(provDef.APIKey)
			view.ProviderPreset = provDef.Type
			if provDef.Type == "kimi" {
				view.ProviderCategory = ProviderFirstParty
			} else {
				view.ProviderCategory = ProviderThirdParty
			}
		}
	}

	// Build raw (exclude structured fields)
	raw := make(map[string]any)
	if cfg.DefaultThinking {
		raw["default_thinking"] = true
	}
	if cfg.DefaultYolo {
		raw["default_yolo"] = true
	}
	if cfg.LoopControl.MaxStepsPerTurn > 0 {
		raw["loop_control"] = cfg.LoopControl
	}
	if cfg.Background.MaxRunningTasks > 0 {
		raw["background"] = cfg.Background
	}
	view.Raw = raw
	view.ProviderPresets = k.GetPresets()

	return view, nil
}

func (k *kimiConfigSync) Write(view *AgentConfigView) error {
	// Read existing config
	data, _ := os.ReadFile(k.configPath)
	var cfg kimiConfig
	if len(data) > 0 {
		_ = toml.Unmarshal(data, &cfg)
	}

	// Update model
	if view.Model != "" {
		cfg.DefaultModel = view.Model
	}

	// Update provider based on category
	providerName := "default"
	if view.ProviderPreset != "" {
		providerName = view.ProviderPreset
	}

	if cfg.Providers == nil {
		cfg.Providers = make(map[string]kimiProvider)
	}
	if cfg.Models == nil {
		cfg.Models = make(map[string]kimiModel)
	}

	// Determine provider type from preset
	providerType := "openai_responses"
	if view.ProviderCategory == ProviderFirstParty {
		providerType = "kimi"
	}
	if view.ProviderPreset != "" {
		if preset := findPreset(k.GetPresets(), view.ProviderPreset); preset != nil && preset.ProviderType != "" {
			providerType = preset.ProviderType
		}
	}

	prov := kimiProvider{
		Type:    providerType,
		BaseURL: view.BaseURL,
	}
	if view.APIKey != "" && !isMasked(view.APIKey) {
		prov.APIKey = view.APIKey
	}
	cfg.Providers[providerName] = prov

	// Update model definition
	cfg.Models[cfg.DefaultModel] = kimiModel{
		Provider:       providerName,
		Model:          view.Model,
		MaxContextSize: 262144,
		Capabilities:   []string{"thinking", "image_in"},
	}

	// Merge raw fields
	if rawLoop, ok := view.Raw["loop_control"]; ok {
		if lc, ok := rawLoop.(map[string]any); ok {
			if v, ok := lc["max_steps_per_turn"].(float64); ok {
				cfg.LoopControl.MaxStepsPerTurn = int(v)
			}
			if v, ok := lc["max_retries_per_step"].(float64); ok {
				cfg.LoopControl.MaxRetriesPerStep = int(v)
			}
		}
	}

	// Write TOML
	output, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal kimi config: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(k.configPath), 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	tmp := k.configPath + ".tmp"
	if err := os.WriteFile(tmp, output, 0600); err != nil {
		return fmt.Errorf("failed to write kimi config: %w", err)
	}

	return os.Rename(tmp, k.configPath)
}

func (k *kimiConfigSync) GetPresets() []ProviderPreset {
	return []ProviderPreset{
		{Name: "Kimi Code", Category: ProviderFirstParty, ProviderType: "kimi",
			BaseURL: "https://api.kimi.com/coding/v1", Models: []string{"Kimi-K2.5"}},
		{Name: "Moonshot CN", Category: ProviderFirstParty, ProviderType: "kimi",
			BaseURL: "https://api.moonshot.cn/v1", Models: []string{"moonshot-v1-auto"}},
		{Name: "Moonshot Global", Category: ProviderFirstParty, ProviderType: "kimi",
			BaseURL: "https://api.moonshot.ai/v1", Models: []string{"moonshot-v1-auto"}},
		{Name: "OpenAI Compatible", Category: ProviderThirdParty, ProviderType: "openai_responses"},
		{Name: "Anthropic Compatible", Category: ProviderThirdParty, ProviderType: "anthropic"},
		{Name: "Gemini Compatible", Category: ProviderThirdParty, ProviderType: "gemini"},
	}
}

// --- OpenCode ConfigSync ---
// Config: ~/.config/opencode/opencode.json

type openCodeConfigSync struct {
	configPath string
}

func (o *openCodeConfigSync) ConfigPath() string { return o.configPath }

func (o *openCodeConfigSync) Read() (*AgentConfigView, error) {
	raw := readOrCreateJSON(o.configPath)

	view := &AgentConfigView{
		AgentID:          "opencode",
		AgentName:        "OpenCode",
		ConfigPath:       o.configPath,
		Model:            jsonString(raw, "model"),
		SmallModel:       jsonString(raw, "small_model"),
		ProviderCategory: ProviderThirdParty,
	}

	// Extract first provider's apiKey/baseURL
	if providers, ok := raw["provider"].(map[string]any); ok {
		for _, v := range providers {
			if p, ok := v.(map[string]any); ok {
				if opts, ok := p["options"].(map[string]any); ok {
					view.APIKey = maskKey(jsonString(opts, "apiKey"))
					view.BaseURL = jsonString(opts, "baseURL")
				}
				break
			}
		}
	}

	// Raw: exclude structured fields
	view.Raw = make(map[string]any)
	for k, v := range raw {
		if k != "model" && k != "small_model" && k != "provider" {
			view.Raw[k] = v
		}
	}

	view.ProviderPresets = o.GetPresets()
	return view, nil
}

func (o *openCodeConfigSync) Write(view *AgentConfigView) error {
	raw := readOrCreateJSON(o.configPath)

	if view.Model != "" {
		raw["model"] = view.Model
	}
	if view.SmallModel != "" {
		raw["small_model"] = view.SmallModel
	}

	// Update provider apiKey/baseURL
	if view.APIKey != "" || view.BaseURL != "" {
		providers, _ := raw["provider"].(map[string]any)
		if providers == nil {
			providers = make(map[string]any)
		}
		// Find first provider and update
		for name, v := range providers {
			if p, ok := v.(map[string]any); ok {
				opts, _ := p["options"].(map[string]any)
				if opts == nil {
					opts = make(map[string]any)
				}
				if view.APIKey != "" && !isMasked(view.APIKey) {
					opts["apiKey"] = view.APIKey
				}
				if view.BaseURL != "" {
					opts["baseURL"] = view.BaseURL
				}
				p["options"] = opts
				providers[name] = p
				break
			}
		}
		raw["provider"] = providers
	}

	mergeRawInto(raw, view.Raw)

	if !validateJSON(raw) {
		return fmt.Errorf("invalid config format")
	}

	return writeJSON(o.configPath, raw)
}

func (o *openCodeConfigSync) GetPresets() []ProviderPreset {
	return []ProviderPreset{
		{Name: "Zhipu Coding Plan", Category: ProviderFirstParty,
			Models: []string{"glm-4.6", "glm-4.5-air"}},
		{Name: "Volcengine", Category: ProviderThirdParty,
			BaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"},
		{Name: "X-AIO", Category: ProviderThirdParty,
			BaseURL: "https://code-api.x-aio.com/v1"},
		{Name: "Custom", Category: ProviderThirdParty},
	}
}

// --- Qwen ConfigSync ---
// Config: ~/.qwen/settings.json

type qwenConfigSync struct {
	configPath string
}

func (q *qwenConfigSync) ConfigPath() string { return q.configPath }

func (q *qwenConfigSync) Read() (*AgentConfigView, error) {
	raw := readOrCreateJSON(q.configPath)

	modelMap, _ := raw["model"].(map[string]any)
	view := &AgentConfigView{
		AgentID:          "qwen-code",
		AgentName:        "Qwen Code",
		ConfigPath:       q.configPath,
		Model:            jsonString(modelMap, "name"),
		ProviderCategory: ProviderFirstParty,
		ProviderPreset:   "qwen-oauth",
	}

	// Raw: exclude model
	view.Raw = make(map[string]any)
	for k, v := range raw {
		if k != "model" {
			view.Raw[k] = v
		}
	}

	view.ProviderPresets = q.GetPresets()
	return view, nil
}

func (q *qwenConfigSync) Write(view *AgentConfigView) error {
	raw := readOrCreateJSON(q.configPath)

	if view.Model != "" {
		modelMap, _ := raw["model"].(map[string]any)
		if modelMap == nil {
			modelMap = make(map[string]any)
		}
		modelMap["name"] = view.Model
		raw["model"] = modelMap
	}

	mergeRawInto(raw, view.Raw)

	return writeJSON(q.configPath, raw)
}

func (q *qwenConfigSync) GetPresets() []ProviderPreset {
	return []ProviderPreset{
		{Name: "Qwen OAuth", Category: ProviderFirstParty},
		{Name: "Custom", Category: ProviderThirdParty},
	}
}

// --- Kimi TOML types ---

type kimiConfig struct {
	DefaultModel    string                   `toml:"default_model"`
	DefaultThinking bool                     `toml:"default_thinking"`
	DefaultYolo     bool                     `toml:"default_yolo"`
	DefaultEditor   string                   `toml:"default_editor"`
	Providers       map[string]kimiProvider  `toml:"providers"`
	Models          map[string]kimiModel     `toml:"models"`
	LoopControl     kimiLoopControl          `toml:"loop_control"`
	Background      kimiBackground           `toml:"background"`
}

type kimiProvider struct {
	Type    string `toml:"type"`
	BaseURL string `toml:"base_url"`
	APIKey  string `toml:"api_key"`
}

type kimiModel struct {
	Provider       string   `toml:"provider"`
	Model          string   `toml:"model"`
	MaxContextSize int      `toml:"max_context_size"`
	Capabilities   []string `toml:"capabilities"`
}

type kimiLoopControl struct {
	MaxStepsPerTurn   int `toml:"max_steps_per_turn"`
	MaxRetriesPerStep int `toml:"max_retries_per_step"`
}

type kimiBackground struct {
	MaxRunningTasks int `toml:"max_running_tasks"`
}

// --- Helpers ---

func readOrCreateJSON(path string) map[string]any {
	data, err := os.ReadFile(path)
	if err != nil {
		return make(map[string]any)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return make(map[string]any)
	}
	return raw
}

func writeJSON(path string, data map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, jsonData, 0600); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return os.Rename(tmp, path)
}

func envString(env map[string]any, key string) string {
	if v, ok := env[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func jsonString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func maskKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return "***"
	}
	return key[:4] + "***" + key[len(key)-4:]
}

func isMasked(s string) bool {
	return strings.Contains(s, "***")
}

func isClaudeModelKey(key string) bool {
	switch key {
	case "ANTHROPIC_MODEL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
		"ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
		"ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_REASONING_MODEL":
		return true
	}
	return false
}

func detectClaudeProvider(env map[string]any) (ProviderCategory, string) {
	baseURL := envString(env, "ANTHROPIC_BASE_URL")
	switch {
	case baseURL == "" || baseURL == "https://api.anthropic.com":
		return ProviderFirstParty, "Anthropic Official"
	case strings.Contains(baseURL, "openrouter"):
		return ProviderThirdParty, "OpenRouter"
	case strings.Contains(baseURL, "xiaomimimo"):
		return ProviderThirdParty, "XiaoMi MiMo"
	case strings.Contains(baseURL, "deepseek"):
		return ProviderThirdParty, "DeepSeek"
	case strings.Contains(baseURL, "bigmodel"):
		return ProviderThirdParty, "Zhipu GLM"
	default:
		return ProviderThirdParty, "Custom"
	}
}

func findPreset(presets []ProviderPreset, name string) *ProviderPreset {
	for i := range presets {
		if presets[i].Name == name {
			return &presets[i]
		}
	}
	return nil
}

func mergeRawInto(dst map[string]any, src map[string]any) {
	for k, v := range src {
		if _, exists := dst[k]; !exists {
			dst[k] = v
		}
	}
}

func validateJSON(data map[string]any) bool {
	_, err := json.Marshal(data)
	return err == nil
}
