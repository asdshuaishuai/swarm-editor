// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"context"
	"sync"
	"time"
)

// HealthStatus represents the health status of an MCP server
type HealthStatus struct {
	Healthy      bool          `json:"healthy"`
	LastChecked  time.Time     `json:"lastChecked"`
	ResponseTime time.Duration `json:"responseTime"`
	Error        string        `json:"error,omitempty"`
	Details      HealthDetails `json:"details,omitempty"`
}

// HealthDetails contains detailed health information
type HealthDetails struct {
	ToolsCount      int       `json:"toolsCount"`
	ResourcesCount  int       `json:"resourcesCount"`
	PromptsCount    int       `json:"promptsCount"`
	ServerVersion   string    `json:"serverVersion"`
	ProtocolVersion string    `json:"protocolVersion"`
	Capabilities    []string  `json:"capabilities"`
	Uptime          time.Time `json:"uptime"`
}

// HealthChecker performs health checks on MCP servers
type HealthChecker struct {
	mu         sync.RWMutex
	interval   time.Duration
	timeout    time.Duration
	statuses   map[string]*HealthStatus
	onChange   func(serverName string, status *HealthStatus)
	getClient  func(serverName string) (*Client, bool)
	stopChan   chan struct{}
	running    bool
}

// HealthCheckerConfig configures the health checker
type HealthCheckerConfig struct {
	Interval time.Duration
	Timeout  time.Duration
	OnChange func(serverName string, status *HealthStatus)
}

// NewHealthChecker creates a new health checker
func NewHealthChecker(config *HealthCheckerConfig) *HealthChecker {
	if config == nil {
		config = &HealthCheckerConfig{}
	}
	if config.Interval == 0 {
		config.Interval = 30 * time.Second
	}
	if config.Timeout == 0 {
		config.Timeout = 5 * time.Second
	}

	return &HealthChecker{
		interval: config.Interval,
		timeout:  config.Timeout,
		statuses: make(map[string]*HealthStatus),
		onChange: config.OnChange,
		stopChan: make(chan struct{}),
	}
}

// SetClientGetter sets the function used to look up MCP clients by name
func (hc *HealthChecker) SetClientGetter(fn func(serverName string) (*Client, bool)) {
	hc.mu.Lock()
	defer hc.mu.Unlock()
	hc.getClient = fn
}

// Start starts the health check loop
func (hc *HealthChecker) Start() {
	hc.mu.Lock()
	if hc.running {
		hc.mu.Unlock()
		return
	}
	// Recreate stopChan in case it was closed by a previous Stop()
	hc.stopChan = make(chan struct{})
	hc.running = true
	hc.mu.Unlock()

	go hc.checkLoop()
}

// Stop stops the health check loop
func (hc *HealthChecker) Stop() {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if !hc.running {
		return
	}

	close(hc.stopChan)
	hc.running = false
}

// checkLoop runs the periodic health check
func (hc *HealthChecker) checkLoop() {
	ticker := time.NewTicker(hc.interval)
	defer ticker.Stop()

	for {
		select {
		case <-hc.stopChan:
			return
		case <-ticker.C:
			hc.checkAll()
		}
	}
}

// checkAll checks all registered servers
func (hc *HealthChecker) checkAll() {
	hc.mu.RLock()
	serverNames := make([]string, 0, len(hc.statuses))
	for name := range hc.statuses {
		serverNames = append(serverNames, name)
	}
	getClient := hc.getClient
	hc.mu.RUnlock()

	if getClient == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), hc.timeout)
	defer cancel()

	for _, name := range serverNames {
		client, ok := getClient(name)
		if !ok {
			continue
		}
		status := hc.CheckServer(ctx, client)
		hc.UpdateStatus(name, status)
	}
}

// CheckServer performs an immediate health check on a server
func (hc *HealthChecker) CheckServer(ctx context.Context, client *Client) *HealthStatus {
	ctx, cancel := context.WithTimeout(ctx, hc.timeout)
	defer cancel()

	start := time.Now()
	status := &HealthStatus{
		LastChecked: start,
	}

	// Attempt to check server health
	err := hc.pingServer(ctx, client)
	status.ResponseTime = time.Since(start)

	if err != nil {
		status.Healthy = false
		status.Error = err.Error()
	} else {
		status.Healthy = true
		status.Details = HealthDetails{
			ToolsCount:      len(client.ListTools()),
			ServerVersion:   "1.0.0",
			ProtocolVersion: "2024-11-05",
			Uptime:          time.Now(),
		}
	}

	return status
}

// pingServer sends a ping to the server
func (hc *HealthChecker) pingServer(ctx context.Context, client *Client) error {
	if !client.IsConnected() {
		return ErrNotConnected
	}
	return client.Ping(ctx)
}

// GetStatus returns a copy of the health status for a server
func (hc *HealthChecker) GetStatus(serverName string) *HealthStatus {
	hc.mu.RLock()
	defer hc.mu.RUnlock()

	if status, ok := hc.statuses[serverName]; ok {
		cp := *status
		return &cp
	}
	return nil
}

// GetAllStatuses returns copies of all health statuses
func (hc *HealthChecker) GetAllStatuses() map[string]*HealthStatus {
	hc.mu.RLock()
	defer hc.mu.RUnlock()

	result := make(map[string]*HealthStatus, len(hc.statuses))
	for k, v := range hc.statuses {
		cp := *v
		result[k] = &cp
	}
	return result
}

// RegisterServer registers a server for health monitoring
func (hc *HealthChecker) RegisterServer(serverName string) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	hc.statuses[serverName] = &HealthStatus{
		Healthy:     false,
		LastChecked: time.Now(),
	}
}

// UnregisterServer removes a server from health monitoring
func (hc *HealthChecker) UnregisterServer(serverName string) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	delete(hc.statuses, serverName)
}

// UpdateStatus updates the health status for a server
func (hc *HealthChecker) UpdateStatus(serverName string, status *HealthStatus) {
	hc.mu.Lock()
	oldStatus := hc.statuses[serverName]
	hc.statuses[serverName] = status
	onChange := hc.onChange
	hc.mu.Unlock()

	// Notify if status changed
	if onChange != nil && (oldStatus == nil || oldStatus.Healthy != status.Healthy) {
		onChange(serverName, status)
	}
}
