// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"context"
	"sync"
)

// Server represents an MCP server that provides tools
type Server struct {
	mu     sync.RWMutex
	name   string
	config *ServerConfig

	tools   map[string]ToolHandler
	started bool
}

// ServerConfig holds MCP server configuration
type ServerConfig struct {
	Name        string `yaml:"name"`
	Version     string `yaml:"version"`
	Description string `yaml:"description"`
}

// ToolHandler is a function that handles tool execution
type ToolHandler func(ctx context.Context, args map[string]interface{}) (*ToolResult, error)

// NewServer creates a new MCP server
func NewServer(config *ServerConfig) *Server {
	if config == nil {
		config = &ServerConfig{
			Name:    "default",
			Version: "1.0.0",
		}
	}
	return &Server{
		name:    config.Name,
		config:  config,
		tools:   make(map[string]ToolHandler),
	}
}

// RegisterTool registers a tool with its handler
func (s *Server) RegisterTool(tool Tool, handler ToolHandler) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tools[tool.Name] = handler
	return nil
}

// UnregisterTool removes a tool
func (s *Server) UnregisterTool(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.tools, name)
}

// ListTools returns all registered tools
func (s *Server) ListTools() []Tool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tools := make([]Tool, 0, len(s.tools))
	for name := range s.tools {
		tools = append(tools, Tool{Name: name})
	}
	return tools
}

// HandleTool processes a tool call
func (s *Server) HandleTool(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	s.mu.RLock()
	handler, ok := s.tools[name]
	s.mu.RUnlock()

	if !ok {
		return nil, ErrToolNotFound
	}

	return handler(ctx, args)
}

// Start starts the MCP server
func (s *Server) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.started = true
	return nil
}

// Stop stops the MCP server
func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.started = false
	return nil
}

// IsStarted returns whether the server is started
func (s *Server) IsStarted() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.started
}

// ServerInfo returns server information
func (s *Server) ServerInfo() map[string]interface{} {
	return map[string]interface{}{
		"name":    s.name,
		"version": s.config.Version,
	}
}
