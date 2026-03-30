package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"maps"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// AutomationTrigger defines when an automation fires.
// Inspired by Prefect 3 Automations and Temporal Schedules.
type AutomationTrigger struct {
	// Event types that activate this trigger (OR logic).
	// Supported: "workflow.completed", "workflow.failed", "workflow.paused",
	// "node.completed", "node.failed", "agent.health_degraded", "agent.stuck"
	Events []string `json:"events"`

	// Match specifies optional filtering on event payload fields.
	// Example: {"workflowId": "wf-abc"} to only trigger for a specific workflow.
	Match map[string]string `json:"match,omitempty"`
}

// AutomationAction defines what to do when a trigger fires.
type AutomationAction struct {
	// Type: "run_workflow", "send_notification", "cancel_workflow",
	// "resume_workflow", "call_webhook", "set_variable"
	Type string `json:"type"`

	// Params are action-specific parameters.
	// For "run_workflow": {"workflowId": "...", "input": {...}}
	// For "send_notification": {"message": "...", "level": "info|warn|error"}
	// For "cancel_workflow": {"workflowId": "..."}
	// For "resume_workflow": {"workflowId": "...", "input": "..."}
	// For "call_webhook": {"url": "...", "method": "POST", "body": "..."}
	// For "set_variable": {"key": "...", "value": "..."}
	Params map[string]any `json:"params,omitempty"`
}

// Automation represents a declarative event-driven rule.
// Modeled after Prefect 3 Automations:
//   - Triggers: event type matching with optional payload filtering
//   - Actions: predefined operations executed when trigger fires
//   - Enabled: can be toggled without deletion
//   - Cooldown: minimum interval between firings (prevents alert storms)
type Automation struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Trigger     AutomationTrigger `json:"trigger"`
	Actions     []AutomationAction `json:"actions"`
	Enabled     bool              `json:"enabled"`
	Cooldown    time.Duration     `json:"cooldown,omitempty"` // minimum interval between firings

	mu         sync.RWMutex // MEDIUM FIX: changed from Mutex to RWMutex for read-only access
	lastFired  time.Time // protected by mu
	fireCount  int64     // protected by mu
}

// LastFired returns the last time this automation fired.
func (a *Automation) LastFired() time.Time {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.lastFired
}

// FireCount returns how many times this automation has fired.
func (a *Automation) FireCount() int64 {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.fireCount
}

// maxConcurrentActions limits concurrent automation action goroutines to prevent resource exhaustion.
const maxConcurrentActions = 10

// AutomationEngine evaluates and executes automations in response to events.
// Thread-safe: event handlers and CRUD operations can be called concurrently.
type AutomationEngine struct {
	mu          sync.RWMutex
	automations map[string]*Automation
	handlers    map[string]func(ctx context.Context, event map[string]any) error // action type → handler
	broadcaster EventBroadcaster // optional, for broadcasting automation events
	httpClient  *http.Client     // shared client for webhook connections
	actionSem   chan struct{}    // semaphore limiting concurrent action goroutines
	wg          sync.WaitGroup   // tracks in-flight action goroutines
	closed      bool             // prevents new actions after Close
	closeMu     sync.Mutex       // protects closed flag
}

// NewAutomationEngine creates a new automation engine.
func NewAutomationEngine() *AutomationEngine {
	e := &AutomationEngine{
		automations: make(map[string]*Automation),
		handlers:    make(map[string]func(ctx context.Context, event map[string]any) error),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		actionSem:   make(chan struct{}, maxConcurrentActions),
	}
	e.registerBuiltinHandlers()
	return e
}

// SetBroadcaster sets the event broadcaster for automation lifecycle events.
func (e *AutomationEngine) SetBroadcaster(b EventBroadcaster) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.broadcaster = b
}

// registerBuiltinHandlers registers default action handlers.
func (e *AutomationEngine) registerBuiltinHandlers() {
	e.handlers["send_notification"] = func(ctx context.Context, event map[string]any) error {
		level, _ := event["level"].(string)
		if level == "" {
			level = "info"
		}
		message, _ := event["message"].(string)
		if message == "" {
			return fmt.Errorf("notification message is required")
		}
		log.Printf("[Automation] Notification (%s): %s", level, message)
		return nil
	}

	// Webhook action handler (Prefect 3 call-webhook pattern)
	// Params: url (required), method (default POST), headers (map), body (string/template)
	e.handlers["call_webhook"] = func(ctx context.Context, event map[string]any) error {
		urlStr, _ := event["url"].(string)
		if urlStr == "" {
			return fmt.Errorf("webhook url is required")
		}

		// SSRF protection: validate URL scheme and host
		parsedURL, err := url.Parse(urlStr)
		if err != nil {
			return fmt.Errorf("webhook url parse failed: %w", err)
		}
		if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
			return fmt.Errorf("webhook url must use http or https scheme")
		}
		allowPrivate := false
		if v, ok := event["allowPrivateNetworks"].(bool); ok {
			allowPrivate = v
		}
		if !allowPrivate {
			if err := validateURLHost(parsedURL.Host); err != nil {
				return fmt.Errorf("webhook url blocked: %w", err)
			}
		}

		method := "POST"
		if v, ok := event["method"].(string); ok && v != "" {
			method = v
		}

		// Build request body (support simple string or JSON template)
		var body io.Reader
		if bodyStr, ok := event["body"].(string); ok && bodyStr != "" {
			body = strings.NewReader(bodyStr)
		}

		req, err := http.NewRequestWithContext(ctx, method, urlStr, body)
		if err != nil {
			return fmt.Errorf("create webhook request: %w", err)
		}

		// Set headers (block dangerous headers same as HTTP node)
		if headers, ok := event["headers"].(map[string]any); ok {
			blockedHeaders := map[string]bool{
				"host": true, "authorization": true, "proxy-authorization": true,
				"cookie": true, "proxy-connection": true, "upgrade": true, "connection": true,
			}
			for k, v := range headers {
				if blockedHeaders[strings.ToLower(k)] {
					log.Printf("[Automation] Webhook blocked dangerous header: %s", k)
					continue
				}
				if vs, ok := v.(string); ok {
					req.Header.Set(k, vs)
				}
			}
		}
		if body != nil && req.Header.Get("Content-Type") == "" {
			req.Header.Set("Content-Type", "application/json")
		}

		// Use automation name as User-Agent for tracing
		if name, ok := event["_automationName"].(string); ok && name != "" {
			req.Header.Set("User-Agent", "SwarmEditor-Automation/"+name)
		}

		// Use per-request client with SSRF-protected redirect handling
		// (shared client has no CheckRedirect, so redirects could bypass SSRF validation)
		client := &http.Client{
			Timeout:   e.httpClient.Timeout,
			Transport: e.httpClient.Transport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("stopped after 10 redirects")
				}
				if !allowPrivate {
					if err := validateURLHost(req.URL.Host); err != nil {
						return fmt.Errorf("webhook redirect blocked: %w", err)
					}
				}
				return nil
			},
		}
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("webhook request failed: %w", err)
		}
		defer resp.Body.Close()

		// Limit response body size (1MB) to prevent memory exhaustion
		if _, drainErr := io.CopyN(io.Discard, resp.Body, 1<<20); drainErr != nil && drainErr != io.EOF {
			log.Printf("[Automation] Webhook response drain error: %v", drainErr)
		}

		if resp.StatusCode >= 400 {
			return fmt.Errorf("webhook returned status %d", resp.StatusCode)
		}
		log.Printf("[Automation] Webhook %s %s -> %d", method, urlStr, resp.StatusCode)
		return nil
	}
}

// RegisterActionHandler registers a custom action handler.
func (e *AutomationEngine) RegisterActionHandler(actionType string, handler func(ctx context.Context, event map[string]any) error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.handlers[actionType] = handler
}

// maxAutomations limits the number of automation rules to prevent abuse.
const maxAutomations = 100

// AddAutomation adds an automation rule. Returns error if ID is empty or limit reached.
func (e *AutomationEngine) AddAutomation(a *Automation) error {
	if a.ID == "" {
		return fmt.Errorf("automation ID is required")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.automations) >= maxAutomations {
		return fmt.Errorf("automation limit reached (%d)", maxAutomations)
	}
	e.automations[a.ID] = a
	log.Printf("[Automation] Added automation %q (%d triggers, %d actions)", a.Name, len(a.Trigger.Events), len(a.Actions))
	return nil
}

// RemoveAutomation removes an automation rule by ID.
func (e *AutomationEngine) RemoveAutomation(id string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, ok := e.automations[id]; !ok {
		return false
	}
	delete(e.automations, id)
	return true
}

// GetAutomation returns a snapshot of the automation by ID (safe for concurrent use).
func (e *AutomationEngine) GetAutomation(id string) *Automation {
	e.mu.RLock()
	defer e.mu.RUnlock()
	a, ok := e.automations[id]
	if !ok {
		return nil
	}
	return snapshotAutomation(a)
}

// ListAutomations returns snapshots of all automations.
func (e *AutomationEngine) ListAutomations() []*Automation {
	e.mu.RLock()
	defer e.mu.RUnlock()
	result := make([]*Automation, 0, len(e.automations))
	for _, a := range e.automations {
		result = append(result, snapshotAutomation(a))
	}
	return result
}

// snapshotAutomation creates a safe copy of an automation (new mutex, deep-copied fields).
func snapshotAutomation(a *Automation) *Automation {
	a.mu.Lock()
	lastFired := a.lastFired
	fireCount := a.fireCount
	// Deep copy Trigger.Events slice
	events := make([]string, len(a.Trigger.Events))
	copy(events, a.Trigger.Events)
	// Deep copy Trigger.Match map
	match := make(map[string]string, len(a.Trigger.Match))
	for k, v := range a.Trigger.Match {
		match[k] = v
	}
	// Deep copy Actions slice
	actions := make([]AutomationAction, len(a.Actions))
	for i, act := range a.Actions {
		actions[i] = act
		if act.Params != nil {
			actions[i].Params = deepCopyAny(act.Params).(map[string]any)
		}
	}
	a.mu.Unlock()
	return &Automation{
		ID:          a.ID,
		Name:        a.Name,
		Description: a.Description,
		Trigger: AutomationTrigger{
			Events: events,
			Match:  match,
		},
		Actions:   actions,
		Enabled:   a.Enabled,
		Cooldown:  a.Cooldown,
		lastFired: lastFired,
		fireCount: fireCount,
	}
}

// EnableAutomation toggles an automation's enabled state.
func (e *AutomationEngine) EnableAutomation(id string, enabled bool) bool {
	e.mu.Lock()
	a, ok := e.automations[id]
	e.mu.Unlock()
	if !ok {
		return false
	}
	// HIGH FIX: Hold a.mu when modifying a.Enabled
	a.mu.Lock()
	a.Enabled = enabled
	a.mu.Unlock()
	return true
}

// Close waits for all in-flight automation actions to complete.
// Must be called during shutdown to prevent goroutine leaks.
func (e *AutomationEngine) Close() {
	e.closeMu.Lock()
	e.closed = true
	e.closeMu.Unlock()
	e.wg.Wait()
}

// EvaluateEvent checks all automations against an incoming event and executes
// matching actions asynchronously. Returns the number of automations triggered.
// This is the main entry point for the event-driven pipeline.
func (e *AutomationEngine) EvaluateEvent(ctx context.Context, eventType string, payload map[string]any) int {
	e.mu.RLock()
	candidates := make([]*Automation, 0, len(e.automations))
	for _, a := range e.automations {
		// MEDIUM FIX: Read a.Enabled under a.mu to prevent race with EnableAutomation
		a.mu.Lock()
		enabled := a.Enabled
		a.mu.Unlock()
		if !enabled {
			continue
		}
		if e.matchesTrigger(a, eventType, payload) {
			candidates = append(candidates, a)
		}
	}
	handlers := make(map[string]func(ctx context.Context, event map[string]any) error, len(e.handlers))
	maps.Copy(handlers, e.handlers)
	// Snapshot broadcaster under lock to prevent data race with SetBroadcaster
	broadcaster := e.broadcaster
	e.mu.RUnlock()

	triggered := 0
	for _, a := range candidates {
		a.mu.Lock()
		// Check cooldown
		if a.Cooldown > 0 && !a.lastFired.IsZero() && time.Since(a.lastFired) < a.Cooldown {
			a.mu.Unlock()
			continue
		}
		a.lastFired = time.Now()
		a.fireCount++
		a.mu.Unlock()

		triggered++
		log.Printf("[Automation] Triggered %q on event %q", a.Name, eventType)

		// HIGH FIX: Check if engine is closed before spawning goroutine
		e.closeMu.Lock()
		if e.closed {
			e.closeMu.Unlock()
			continue
		}
		e.wg.Add(1)
		e.closeMu.Unlock()

		// Execute actions asynchronously with detached context
		// to prevent caller cancel from aborting side-effectful actions mid-flight
		go func(automation *Automation) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Automation] Action goroutine panic for %q: %v", automation.Name, r)
				}
				e.wg.Done()
			}()
			e.actionSem <- struct{}{}        // acquire semaphore
			defer func() { <-e.actionSem }() // release semaphore
			asyncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for _, action := range automation.Actions {
				handler, ok := handlers[action.Type]
				if !ok {
					log.Printf("[Automation] No handler for action type %q in automation %q", action.Type, automation.Name)
					continue
				}
				// Merge action params into event context
				actionCtx := make(map[string]any)
				for k, v := range payload {
					actionCtx[k] = v
				}
				for k, v := range action.Params {
					actionCtx[k] = v
				}
				actionCtx["_automationId"] = automation.ID
				actionCtx["_automationName"] = automation.Name

				if err := handler(asyncCtx, actionCtx); err != nil {
					log.Printf("[Automation] Action %q failed in automation %q: %v", action.Type, automation.Name, err)
				}
			}
		}(a)
	}

	if triggered > 0 && broadcaster != nil {
		broadcaster.Broadcast("automation_triggered", map[string]any{
			"eventType":     eventType,
			"triggeredCount": triggered,
		})
	}

	return triggered
}

// matchesTrigger checks if an event matches an automation's trigger conditions.
func (e *AutomationEngine) matchesTrigger(a *Automation, eventType string, payload map[string]any) bool {
	// MEDIUM FIX: Hold a.mu.RLock when reading Trigger fields
	a.mu.RLock()
	events := a.Trigger.Events
	match := a.Trigger.Match
	a.mu.RUnlock()

	// Check event type
	matched := false
	for _, evt := range events {
		if evt == eventType {
			matched = true
			break
		}
	}
	if !matched {
		return false
	}

	// Check match conditions (AND logic: all must match)
	for key, expected := range match {
		val, ok := payload[key]
		if !ok {
			return false
		}
		// Use JSON for reliable comparison of nested structures
		// For simple values (string, number, bool), fmt.Sprintf is fine
		// For nested objects/arrays, JSON marshaling provides consistent representation
		var valStr string
		switch v := val.(type) {
		case string:
			valStr = v
		case float64, int, int64, bool:
			valStr = fmt.Sprintf("%v", v)
		default:
			// For complex types, use JSON representation
			if data, err := json.Marshal(v); err == nil {
				valStr = string(data)
			} else {
				valStr = fmt.Sprintf("%v", v)
			}
		}
		if valStr != expected {
			return false
		}
	}

	return true
}

// ScheduleOverlapPolicy defines how to handle overlapping schedule executions.
// Inspired by Temporal's ScheduleOverlapPolicy.
type ScheduleOverlapPolicy string

const (
	// ScheduleOverlapSkip skips new runs while previous is still active (default).
	ScheduleOverlapSkip ScheduleOverlapPolicy = "skip"
	// ScheduleOverlapAllow runs concurrent executions without restriction.
	ScheduleOverlapAllow ScheduleOverlapPolicy = "allow"
	// ScheduleOverlapQueueOne buffers a single run until current completes.
	ScheduleOverlapQueueOne ScheduleOverlapPolicy = "queue_one"
)

// ScheduleRuntimeState tracks execution state for a schedule.
type ScheduleRuntimeState struct {
	LastRun    time.Time `json:"lastRun"`
	NextRun    time.Time `json:"nextRun"`
	LastResult string    `json:"lastResult"` // "success", "failed", "skipped"
	LastError  string    `json:"lastError,omitempty"`
	RunCount   int64     `json:"runCount"`
	SkipCount  int64     `json:"skipCount"`
	IsRunning  bool      `json:"isRunning"`
	QueuedRuns int       `json:"queuedRuns"`
}

// ScheduleConfig defines a cron-like schedule for recurring workflow execution.
// Inspired by Temporal Schedules API.
type ScheduleConfig struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	WorkflowID  string        `json:"workflowId"`
	Cron        string        `json:"cron"`        // cron expression (e.g., "*/5 * * * *")
	Input       map[string]any `json:"input,omitempty"`
	Enabled     bool          `json:"enabled"`
	Overlap     bool          `json:"overlap"`     // DEPRECATED: use OverlapPolicy instead
	OverlapPolicy ScheduleOverlapPolicy `json:"overlapPolicy,omitempty"` // skip (default), allow, queue_one
	CatchUp     bool          `json:"catchUp"`     // run missed schedules (default: false)
	CatchUpWindow time.Duration `json:"catchUpWindow,omitempty"` // max age for catch-up (default: 1h)
	Timezone    string        `json:"timezone,omitempty"` // IANA timezone (default: local)
	MaxRetries  int           `json:"maxRetries,omitempty"`
	RetryDelay  time.Duration `json:"retryDelay,omitempty"`

	// Runtime state (protected by store's mu)
	State ScheduleRuntimeState `json:"state"`
}

// ScheduleStore manages scheduled workflow executions.
type ScheduleStore struct {
	mu         sync.RWMutex
	schedules  map[string]*ScheduleConfig
	onExecute  func(scheduleID string, input map[string]any) // callback to execute workflow
}

// NewScheduleStore creates a new schedule store.
func NewScheduleStore() *ScheduleStore {
	return &ScheduleStore{
		schedules: make(map[string]*ScheduleConfig),
	}
}

// SetExecuteCallback sets the callback invoked when a schedule fires.
func (s *ScheduleStore) SetExecuteCallback(cb func(scheduleID string, input map[string]any)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onExecute = cb
}

// AddSchedule adds a schedule configuration.
func (s *ScheduleStore) AddSchedule(sc *ScheduleConfig) error {
	if sc.ID == "" {
		return fmt.Errorf("schedule ID is required")
	}
	if sc.Cron == "" {
		return fmt.Errorf("cron expression is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// MEDIUM FIX: Deep copy to prevent external modification of Input map
	cp := *sc
	if sc.Input != nil {
		cp.Input = deepCopyAny(sc.Input).(map[string]any)
	}
	s.schedules[sc.ID] = &cp
	log.Printf("[Schedule] Added schedule %q (cron: %s, workflow: %s)", sc.Name, sc.Cron, sc.WorkflowID)
	return nil
}

// RemoveSchedule removes a schedule by ID.
func (s *ScheduleStore) RemoveSchedule(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.schedules[id]; !ok {
		return false
	}
	delete(s.schedules, id)
	return true
}

// GetSchedule returns a copy of the schedule by ID.
func (s *ScheduleStore) GetSchedule(id string) *ScheduleConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sc, ok := s.schedules[id]
	if !ok {
		return nil
	}
	cp := *sc
	if sc.Input != nil {
		cp.Input = deepCopyAny(sc.Input).(map[string]any)
	}
	return &cp
}

// ListSchedules returns all schedules.
func (s *ScheduleStore) ListSchedules() []*ScheduleConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*ScheduleConfig, 0, len(s.schedules))
	for _, sc := range s.schedules {
		cp := *sc
		if sc.Input != nil {
			cp.Input = deepCopyAny(sc.Input).(map[string]any)
		}
		result = append(result, &cp)
	}
	return result
}

// EnableSchedule toggles a schedule's enabled state.
func (s *ScheduleStore) EnableSchedule(id string, enabled bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.schedules[id]
	if !ok {
		return false
	}
	sc.Enabled = enabled
	return true
}

// MarshalJSON implements custom JSON serialization for automation engine state.
func (e *AutomationEngine) MarshalJSON() ([]byte, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	automations := make([]*Automation, 0, len(e.automations))
	for _, a := range e.automations {
		automations = append(automations, snapshotAutomation(a))
	}
	return json.Marshal(map[string]any{
		"automations": automations,
		"count":       len(automations),
	})
}
