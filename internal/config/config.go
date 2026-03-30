// Package config provides application configuration management
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Application version constants
const (
	AppVersion    = "0.1.0"
	AppName       = "swarm-editor"
	ProtocolMinor = "1.0"
)

// AppConfig represents the main application configuration
type AppConfig struct {
	Server  ServerConfig  `yaml:"server"`
	ACP     ACPConfig     `yaml:"acp"`
	Agent   AgentConfig   `yaml:"agent"`
	Swarm   SwarmConfig   `yaml:"swarm"`
	Pair    PairConfig    `yaml:"pair"`
	Team    TeamConfig    `yaml:"team"`
	Storage StorageConfig `yaml:"storage"`
	Logging LoggingConfig `yaml:"logging"`
	UI      UIConfig      `yaml:"ui"`
}

// ServerConfig holds server configuration
type ServerConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	GRPCPort int    `yaml:"grpc_port"`
}

// ACPConfig holds ACP protocol settings
type ACPConfig struct {
	Version        string `yaml:"version"`
	Timeout        string `yaml:"timeout"`
	MaxMessageSize int    `yaml:"max_message_size"`
}

// AgentConfig holds agent defaults
type AgentConfig struct {
	DefaultType           string `yaml:"default_type"`
	MaxConcurrentSessions int    `yaml:"max_concurrent_sessions"`
	HeartbeatInterval     string `yaml:"heartbeat_interval"`
	SessionTimeout        string `yaml:"session_timeout"`
}

// SwarmConfig holds swarm orchestration settings
type SwarmConfig struct {
	DefaultTopology string          `yaml:"default_topology"`
	DefaultStrategy string          `yaml:"default_strategy"`
	MaxAgents       int             `yaml:"max_agents"`
	TaskTimeout     string          `yaml:"task_timeout"`
	Consensus       ConsensusConfig `yaml:"consensus"`
}

// ConsensusConfig holds consensus algorithm settings
type ConsensusConfig struct {
	Algorithm    string  `yaml:"algorithm"`
	Timeout      string  `yaml:"timeout"`
	MinAgreement float64 `yaml:"min_agreement"`
}

// PairConfig holds pair programming settings
type PairConfig struct {
	DefaultSessionTimeout string `yaml:"default_session_timeout"`
	RoleSwitchCooldown    string `yaml:"role_switch_cooldown"`
	MaxSuggestions        int    `yaml:"max_suggestions"`
}

// TeamConfig holds team collaboration settings
type TeamConfig struct {
	MaxTeams              int    `yaml:"max_teams"`
	MaxMembersPerTeam     int    `yaml:"max_members_per_team"`
	WorkspaceSyncInterval string `yaml:"workspace_sync_interval"`
}

// StorageConfig holds storage settings
type StorageConfig struct {
	Type   string       `yaml:"type"`
	SQLite SQLiteConfig `yaml:"sqlite"`
	Badger BadgerConfig `yaml:"badger"`
}

// SQLiteConfig holds SQLite settings
type SQLiteConfig struct {
	Path string `yaml:"path"`
}

// BadgerConfig holds BadgerDB settings
type BadgerConfig struct {
	Path string `yaml:"path"`
}

// LoggingConfig holds logging settings
type LoggingConfig struct {
	Level  string     `yaml:"level"`
	Format string     `yaml:"format"`
	Output string     `yaml:"output"`
	File   FileConfig `yaml:"file"`
}

// FileConfig holds log file settings
type FileConfig struct {
	Path       string `yaml:"path"`
	MaxSize    int    `yaml:"max_size"`
	MaxBackups int    `yaml:"max_backups"`
	MaxAge     int    `yaml:"max_age"`
}

// UIConfig holds UI settings
type UIConfig struct {
	Theme          string `yaml:"theme"`
	EditorFont     string `yaml:"editor_font"`
	EditorFontSize int    `yaml:"editor_font_size"`
	SidebarWidth   int    `yaml:"sidebar_width"`
	PanelHeight    int    `yaml:"panel_height"`
}

// DefaultConfig returns the default application configuration
func DefaultConfig() *AppConfig {
	return &AppConfig{
		Server: ServerConfig{
			Host:     "127.0.0.1",
			Port:     8080,
			GRPCPort: 9090,
		},
		ACP: ACPConfig{
			Version:        "1.0",
			Timeout:        "30s",
			MaxMessageSize: 10485760,
		},
		Agent: AgentConfig{
			DefaultType:           "coder",
			MaxConcurrentSessions: 10,
			HeartbeatInterval:     "30s",
			SessionTimeout:        "1h",
		},
		Swarm: SwarmConfig{
			DefaultTopology: "star",
			DefaultStrategy: "parallel",
			MaxAgents:       100,
			TaskTimeout:     "5m",
			Consensus: ConsensusConfig{
				Algorithm:    "simple_majority",
				Timeout:      "60s",
				MinAgreement: 0.51,
			},
		},
		Pair: PairConfig{
			DefaultSessionTimeout: "30m",
			RoleSwitchCooldown:    "5m",
			MaxSuggestions:        10,
		},
		Team: TeamConfig{
			MaxTeams:              50,
			MaxMembersPerTeam:     100,
			WorkspaceSyncInterval: "1m",
		},
		Storage: StorageConfig{
			Type: "sqlite",
			SQLite: SQLiteConfig{
				Path: "./data/swarm-editor.db",
			},
			Badger: BadgerConfig{
				Path: "./data/badger",
			},
		},
		Logging: LoggingConfig{
			Level:  "info",
			Format: "json",
			Output: "stdout",
			File: FileConfig{
				Path:       "./logs/swarm-editor.log",
				MaxSize:    100,
				MaxBackups: 5,
				MaxAge:     30,
			},
		},
		UI: UIConfig{
			Theme:          "dark",
			EditorFont:     "Fira Code",
			EditorFontSize: 14,
			SidebarWidth:   280,
			PanelHeight:    200,
		},
	}
}

// Validate validates the configuration and returns an error if invalid
func (c *AppConfig) Validate() error {
	// Validate server config
	if c.Server.Port < 0 || c.Server.Port > 65535 {
		return fmt.Errorf("invalid server port: %d (must be 0-65535)", c.Server.Port)
	}
	if c.Server.GRPCPort < 0 || c.Server.GRPCPort > 65535 {
		return fmt.Errorf("invalid grpc port: %d (must be 0-65535)", c.Server.GRPCPort)
	}

	// Validate ACP config
	if c.ACP.MaxMessageSize < 0 {
		return fmt.Errorf("invalid max message size: %d (must be >= 0)", c.ACP.MaxMessageSize)
	}
	if err := validateDuration("acp.timeout", c.ACP.Timeout); err != nil {
		return err
	}

	// Validate agent config
	if c.Agent.MaxConcurrentSessions < 0 {
		return fmt.Errorf("invalid max concurrent sessions: %d (must be >= 0)", c.Agent.MaxConcurrentSessions)
	}
	if err := validateDuration("agent.heartbeat_interval", c.Agent.HeartbeatInterval); err != nil {
		return err
	}
	if err := validateDuration("agent.session_timeout", c.Agent.SessionTimeout); err != nil {
		return err
	}

	// Validate swarm config
	if c.Swarm.MaxAgents < 0 {
		return fmt.Errorf("invalid max agents: %d (must be >= 0)", c.Swarm.MaxAgents)
	}
	if err := validateDuration("swarm.task_timeout", c.Swarm.TaskTimeout); err != nil {
		return err
	}

	// Validate consensus config
	if err := validateDuration("swarm.consensus.timeout", c.Swarm.Consensus.Timeout); err != nil {
		return err
	}
	if c.Swarm.Consensus.MinAgreement < 0 || c.Swarm.Consensus.MinAgreement > 1 {
		return fmt.Errorf("invalid min agreement: %f (must be 0.0-1.0)", c.Swarm.Consensus.MinAgreement)
	}

	// Validate pair config
	if err := validateDuration("pair.default_session_timeout", c.Pair.DefaultSessionTimeout); err != nil {
		return err
	}
	if err := validateDuration("pair.role_switch_cooldown", c.Pair.RoleSwitchCooldown); err != nil {
		return err
	}

	// Validate team config
	if c.Team.MaxTeams < 0 {
		return fmt.Errorf("invalid max teams: %d (must be >= 0)", c.Team.MaxTeams)
	}
	if c.Team.MaxMembersPerTeam < 0 {
		return fmt.Errorf("invalid max members per team: %d (must be >= 0)", c.Team.MaxMembersPerTeam)
	}
	if err := validateDuration("team.workspace_sync_interval", c.Team.WorkspaceSyncInterval); err != nil {
		return err
	}

	// Validate UI config
	if c.UI.EditorFontSize < 8 || c.UI.EditorFontSize > 72 {
		return fmt.Errorf("invalid editor font size: %d (must be 8-72)", c.UI.EditorFontSize)
	}

	return nil
}

// validateDuration checks that a duration string is parseable by time.ParseDuration.
func validateDuration(field, value string) error {
	if value == "" {
		return nil
	}
	if _, err := time.ParseDuration(value); err != nil {
		return fmt.Errorf("invalid duration for %q: %q (%w)", field, value, err)
	}
	return nil
}

// ConfigPath returns the default config file path
func ConfigPath() string {
	if path := os.Getenv("SWARM_EDITOR_CONFIG"); path != "" {
		return path
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "./configs/default.yaml"
	}

	return filepath.Join(homeDir, ".config", "swarm-editor", "config.yaml")
}

// EnsureDir ensures the directory for the given path exists
func EnsureDir(path string) error {
	dir := filepath.Dir(path)
	// Use 0750 for better security (owner rwx, group rx, others none)
	return os.MkdirAll(dir, 0750)
}
