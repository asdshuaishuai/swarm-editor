package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// AgentConfigWriter reads/writes MCP server configs in an agent's native format
type AgentConfigWriter interface {
	ReadMCPServers() (map[string]McpServerSpec, error)
	WriteMCPServers(servers map[string]McpServerSpec) error
	RemoveMCPServer(name string) error
}

// GetConfigWriter returns the appropriate writer for an agent
func GetConfigWriter(agent string) (AgentConfigWriter, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}

	switch agent {
	case AgentClaude:
		return &claudeWriter{path: filepath.Join(home, ".claude.json")}, nil
	case AgentOpenCode:
		return &openCodeWriter{path: filepath.Join(home, ".config", "opencode", "opencode.json")}, nil
	case AgentQwen:
		return &qwenWriter{path: filepath.Join(home, ".qwen", "settings.json")}, nil
	case AgentKimi:
		return &kimiWriter{path: filepath.Join(home, ".kimi", "mcp.json")}, nil
	default:
		return nil, fmt.Errorf("unsupported agent: %s", agent)
	}
}

// SyncToAgent syncs a server to a specific agent's config file
func SyncToAgent(server *UnifiedMCPServer, agent string) error {
	writer, err := GetConfigWriter(agent)
	if err != nil {
		return err
	}

	servers, err := writer.ReadMCPServers()
	if err != nil {
		// If file doesn't exist, start with empty map
		servers = make(map[string]McpServerSpec)
	}

	servers[server.Name] = server.Server
	return writer.WriteMCPServers(servers)
}

// RemoveFromAgent removes a server from a specific agent's config
func RemoveFromAgent(serverName string, agent string) error {
	writer, err := GetConfigWriter(agent)
	if err != nil {
		return err
	}
	return writer.RemoveMCPServer(serverName)
}

// --- Claude Writer ---
// Config: ~/.claude.json
// Format: { "mcpServers": { "name": { "type": "stdio", "command": "...", "args": [...], "env": {} } } }

type claudeWriter struct {
	path string
}

func (w *claudeWriter) ReadMCPServers() (map[string]McpServerSpec, error) {
	return readJSONMCPServers(w.path, "mcpServers")
}

func (w *claudeWriter) WriteMCPServers(servers map[string]McpServerSpec) error {
	return writeJSONMCPServers(w.path, "mcpServers", servers)
}

func (w *claudeWriter) RemoveMCPServer(name string) error {
	return removeJSONMCPServer(w.path, "mcpServers", name)
}

// --- Kimi Writer ---
// Config: ~/.kimi/mcp.json
// Format: same as Claude { "mcpServers": { ... } }

type kimiWriter struct {
	path string
}

func (w *kimiWriter) ReadMCPServers() (map[string]McpServerSpec, error) {
	return readJSONMCPServers(w.path, "mcpServers")
}

func (w *kimiWriter) WriteMCPServers(servers map[string]McpServerSpec) error {
	return writeJSONMCPServers(w.path, "mcpServers", servers)
}

func (w *kimiWriter) RemoveMCPServer(name string) error {
	return removeJSONMCPServer(w.path, "mcpServers", name)
}

// --- OpenCode Writer ---
// Config: ~/.config/opencode/opencode.json
// Format: { "mcp": { "mcpServers": { "name": { "type": "local", "command": ["npx", "-y", "pkg"], "environment": {} } } } }
// Mappings: stdio→"local", http/sse→"remote", command=[cmd+args], env→environment

type openCodeWriter struct {
	path string
}

func (w *openCodeWriter) ReadMCPServers() (map[string]McpServerSpec, error) {
	data, err := os.ReadFile(w.path)
	if err != nil {
		return nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	// OpenCode: servers are direct children of top-level "mcp" key
	mcpServers, ok := raw["mcp"].(map[string]any)
	if !ok {
		return make(map[string]McpServerSpec), nil
	}

	result := make(map[string]McpServerSpec)
	for name, v := range mcpServers {
		srvData, ok := v.(map[string]any)
		if !ok {
			continue
		}
		spec := McpServerSpec{}

		// type mapping: "local" → "stdio", "remote" → "http"
		if t, ok := srvData["type"].(string); ok {
			switch t {
			case "local":
				spec.Type = "stdio"
			case "remote":
				spec.Type = "http"
			default:
				spec.Type = t
			}
		}

		// command is an array: [cmd, ...args]
		if cmdArr, ok := srvData["command"].([]any); ok && len(cmdArr) > 0 {
			if cmd, ok := cmdArr[0].(string); ok {
				spec.Command = cmd
			}
			for i := 1; i < len(cmdArr); i++ {
				if arg, ok := cmdArr[i].(string); ok {
					spec.Args = append(spec.Args, arg)
				}
			}
		}

		// environment → env
		if env, ok := srvData["environment"].(map[string]any); ok {
			spec.Env = make(map[string]string)
			for k, v := range env {
				if s, ok := v.(string); ok {
					spec.Env[k] = s
				}
			}
		}

		// url/headers for remote
		if url, ok := srvData["url"].(string); ok {
			spec.URL = url
		}
		if headers, ok := srvData["headers"].(map[string]any); ok {
			spec.Headers = make(map[string]string)
			for k, v := range headers {
				if s, ok := v.(string); ok {
					spec.Headers[k] = s
				}
			}
		}

		result[name] = spec
	}

	return result, nil
}

func (w *openCodeWriter) WriteMCPServers(servers map[string]McpServerSpec) error {
	// Read existing config to preserve other fields
	raw := readOrCreateJSON(w.path)

	// Build servers as direct children of top-level "mcp" key
	mcpServers := make(map[string]any)
	for name, spec := range servers {
		srv := make(map[string]any)

		// type mapping: stdio→"local", http/sse→"remote"
		switch spec.Type {
		case "http", "sse":
			srv["type"] = "remote"
		default:
			srv["type"] = "local"
		}

		// command = [cmd, ...args]
		cmdArr := []any{spec.Command}
		for _, arg := range spec.Args {
			cmdArr = append(cmdArr, arg)
		}
		srv["command"] = cmdArr

		// env → environment
		if len(spec.Env) > 0 {
			env := make(map[string]any)
			for k, v := range spec.Env {
				env[k] = v
			}
			srv["environment"] = env
		}

		// url/headers for remote
		if spec.URL != "" {
			srv["url"] = spec.URL
		}
		if len(spec.Headers) > 0 {
			headers := make(map[string]any)
			for k, v := range spec.Headers {
				headers[k] = v
			}
			srv["headers"] = headers
		}

		mcpServers[name] = srv
	}

	raw["mcp"] = mcpServers

	return writeJSON(w.path, raw)
}

func (w *openCodeWriter) RemoveMCPServer(name string) error {
	return removeJSONMCPServer(w.path, "mcp", name)
}

// --- Qwen Writer ---
// Config: ~/.qwen/settings.json
// Format: { "mcpServers": { "name": { "command": "...", "args": [...], "env": {} } } }
// No type field. HTTP: url→httpUrl on write, httpUrl→url on read.

type qwenWriter struct {
	path string
}

func (w *qwenWriter) ReadMCPServers() (map[string]McpServerSpec, error) {
	data, err := os.ReadFile(w.path)
	if err != nil {
		return nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	mcpServers, ok := raw["mcpServers"].(map[string]any)
	if !ok {
		return make(map[string]McpServerSpec), nil
	}

	result := make(map[string]McpServerSpec)
	for name, v := range mcpServers {
		srvData, ok := v.(map[string]any)
		if !ok {
			continue
		}
		spec := McpServerSpec{}

		if cmd, ok := srvData["command"].(string); ok {
			spec.Command = cmd
		}
		if args, ok := srvData["args"].([]any); ok {
			for _, arg := range args {
				if s, ok := arg.(string); ok {
					spec.Args = append(spec.Args, s)
				}
			}
		}
		if env, ok := srvData["env"].(map[string]any); ok {
			spec.Env = make(map[string]string)
			for k, v := range env {
				if s, ok := v.(string); ok {
					spec.Env[k] = s
				}
			}
		}

		// Qwen: httpUrl → url + type:"http"
		if httpURL, ok := srvData["httpUrl"].(string); ok && httpURL != "" {
			spec.URL = httpURL
			spec.Type = "http"
		} else if url, ok := srvData["url"].(string); ok && url != "" {
			spec.URL = url
			spec.Type = "http"
		} else {
			spec.Type = "stdio"
		}

		result[name] = spec
	}

	return result, nil
}

func (w *qwenWriter) WriteMCPServers(servers map[string]McpServerSpec) error {
	raw := readOrCreateJSON(w.path)

	mcpServers := make(map[string]any)
	for name, spec := range servers {
		srv := make(map[string]any)

		// No type field for Qwen
		if spec.Command != "" {
			srv["command"] = spec.Command
		}
		if len(spec.Args) > 0 {
			args := make([]any, len(spec.Args))
			for i, a := range spec.Args {
				args[i] = a
			}
			srv["args"] = args
		}
		if len(spec.Env) > 0 {
			env := make(map[string]any)
			for k, v := range spec.Env {
				env[k] = v
			}
			srv["env"] = env
		}

		// HTTP: url → httpUrl
		if spec.Type == "http" || spec.Type == "sse" {
			if spec.URL != "" {
				srv["httpUrl"] = spec.URL
			}
		}

		mcpServers[name] = srv
	}

	raw["mcpServers"] = mcpServers
	return writeJSON(w.path, raw)
}

func (w *qwenWriter) RemoveMCPServer(name string) error {
	return removeJSONMCPServer(w.path, "mcpServers", name)
}

// --- JSON helpers ---

// readJSONMCPServers reads mcpServers from a flat JSON file
func readJSONMCPServers(path string, key string) (map[string]McpServerSpec, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	mcpServers, ok := raw[key].(map[string]any)
	if !ok {
		return make(map[string]McpServerSpec), nil
	}

	result := make(map[string]McpServerSpec)
	for name, v := range mcpServers {
		srvData, ok := v.(map[string]any)
		if !ok {
			continue
		}
		spec := McpServerSpec{}
		if t, ok := srvData["type"].(string); ok {
			spec.Type = t
		}
		if cmd, ok := srvData["command"].(string); ok {
			spec.Command = cmd
		}
		if args, ok := srvData["args"].([]any); ok {
			for _, arg := range args {
				if s, ok := arg.(string); ok {
					spec.Args = append(spec.Args, s)
				}
			}
		}
		if env, ok := srvData["env"].(map[string]any); ok {
			spec.Env = make(map[string]string)
			for k, v := range env {
				if s, ok := v.(string); ok {
					spec.Env[k] = s
				}
			}
		}
		if url, ok := srvData["url"].(string); ok {
			spec.URL = url
		}
		if headers, ok := srvData["headers"].(map[string]any); ok {
			spec.Headers = make(map[string]string)
			for k, v := range headers {
				if s, ok := v.(string); ok {
					spec.Headers[k] = s
				}
			}
		}
		result[name] = spec
	}

	return result, nil
}

// writeJSONMCPServers writes mcpServers to a flat JSON file, preserving other fields
func writeJSONMCPServers(path string, key string, servers map[string]McpServerSpec) error {
	raw := readOrCreateJSON(path)

	mcpServers := make(map[string]any)
	for name, spec := range servers {
		srv := make(map[string]any)
		if spec.Type != "" {
			srv["type"] = spec.Type
		}
		if spec.Command != "" {
			srv["command"] = spec.Command
		}
		if len(spec.Args) > 0 {
			args := make([]any, len(spec.Args))
			for i, a := range spec.Args {
				args[i] = a
			}
			srv["args"] = args
		}
		if len(spec.Env) > 0 {
			env := make(map[string]any)
			for k, v := range spec.Env {
				env[k] = v
			}
			srv["env"] = env
		}
		if spec.URL != "" {
			srv["url"] = spec.URL
		}
		if len(spec.Headers) > 0 {
			headers := make(map[string]any)
			for k, v := range spec.Headers {
				headers[k] = v
			}
			srv["headers"] = headers
		}
		mcpServers[name] = srv
	}

	raw[key] = mcpServers
	return writeJSON(path, raw)
}

// removeJSONMCPServer removes a server from a flat JSON mcpServers key
func removeJSONMCPServer(path string, key string, name string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	mcpServers, ok := raw[key].(map[string]any)
	if !ok {
		return nil
	}

	delete(mcpServers, name)
	raw[key] = mcpServers
	return writeJSON(path, raw)
}

// readOrCreateJSON reads a JSON file or returns an empty map
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

// writeJSON writes a map as indented JSON with restricted permissions
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
