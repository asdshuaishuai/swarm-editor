// Package audit provides audit logging for admin operations.
// Inspired by Temporal Cloud Audit Log (GA Jan 2026): comprehensive trail
// of who did what, when, with UI and API access.
package audit

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var auditSeq atomic.Uint64

var auditLog = log.With("component", "Audit")

// copyMapAny creates a shallow copy of a map[string]any.
// Used to prevent callers from mutating internal state via shared map references.
func copyMapAny(src map[string]any) map[string]any {
	if src == nil {
		return nil
	}
	cp := make(map[string]any, len(src))
	maps.Copy(cp, src)
	return cp
}

// Event represents a single audit event.
type Event struct {
	Timestamp    time.Time      `json:"timestamp"`
	EventType    string         `json:"eventType"`
	Actor        string         `json:"actor"`             // who performed the action
	Action       string         `json:"action"`            // what action was taken
	ResourceType string         `json:"resourceType"`      // type of resource (workflow, agent, etc.)
	ResourceID   string         `json:"resourceId"`        // ID of the affected resource
	Details      map[string]any `json:"details,omitempty"` // additional context
	IPAddress    string         `json:"ipAddress,omitempty"`
	UserAgent    string         `json:"userAgent,omitempty"`
	Success      bool           `json:"success"`
	Error        string         `json:"error,omitempty"`
}

// EventBroadcaster streams audit events to UI clients.
type EventBroadcaster interface {
	Broadcast(eventType string, payload any)
}

// Logger provides thread-safe audit logging with file persistence.
type Logger struct {
	mu          sync.RWMutex
	events      []Event
	maxSize     int    // max events in memory before rotation
	filePath    string // path to audit log file
	enabled     bool
	broadcaster EventBroadcaster
}

// NewLogger creates a new audit logger.
// If filePath is empty, logs are only kept in memory.
func NewLogger(filePath string, maxSize int) *Logger {
	if maxSize <= 0 {
		maxSize = 10000
	}
	l := &Logger{
		events:   make([]Event, 0, 1000),
		maxSize:  maxSize,
		filePath: filePath,
		enabled:  true,
	}
	// Ensure directory exists
	if filePath != "" {
		dir := filepath.Dir(filePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			auditLog.Warn("Failed to create audit directory", "dir", dir, "error", err)
		}
	}
	return l
}

// Enable toggles audit logging.
func (l *Logger) Enable(enabled bool) {
	l.mu.Lock()
	l.enabled = enabled
	l.mu.Unlock()
}

// SetBroadcaster wires the event broadcaster for real-time audit streaming.
func (l *Logger) SetBroadcaster(b EventBroadcaster) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.broadcaster = b
}

// IsEnabled returns whether audit logging is enabled.
func (l *Logger) IsEnabled() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.enabled
}

// Log records an audit event.
func (l *Logger) Log(eventType, actor, action, resourceType, resourceID string, details map[string]any, success bool, errMsg string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.enabled {
		return
	}

	// Deep copy details map to prevent caller mutation of internal state
	var detailsCopy map[string]any
	if details != nil {
		detailsCopy = copyMapAny(details)
	}

	event := Event{
		Timestamp:    time.Now().UTC(),
		EventType:    eventType,
		Actor:        actor,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Details:      detailsCopy,
		Success:      success,
		Error:        errMsg,
	}

	l.events = append(l.events, event)

	// Rotate if needed
	if len(l.events) > l.maxSize {
		l.rotate()
	}

	// Persist to file (redact secrets before writing)
	if l.filePath != "" {
		l.appendToFile(redactEvent(event))
	}

	// Broadcast to UI clients for real-time monitoring
	if bc := l.broadcaster; bc != nil {
		eventID := fmt.Sprintf("audit_%d_%d", event.Timestamp.UnixMilli(), auditSeq.Add(1))
		bc.Broadcast("audit_event", map[string]any{
			"id":           eventID,
			"timestamp":    event.Timestamp.Format(time.RFC3339),
			"eventType":    event.EventType,
			"actor":        event.Actor,
			"action":       event.Action,
			"resourceType": event.ResourceType,
			"resourceId":   event.ResourceID,
			"details":      event.Details,
			"success":      event.Success,
		})
		bc.Broadcast("audit_stats_changed", map[string]any{
			"totalEvents": len(l.events),
		})
	}
}

// LogWithMetadata records an audit event with IP and User-Agent.
func (l *Logger) LogWithMetadata(eventType, actor, action, resourceType, resourceID string, details map[string]any, success bool, errMsg, ip, userAgent string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.enabled {
		return
	}

	// Deep copy details map to prevent caller mutation of internal state
	var detailsCopy map[string]any
	if details != nil {
		detailsCopy = copyMapAny(details)
	}

	event := Event{
		Timestamp:    time.Now().UTC(),
		EventType:    eventType,
		Actor:        actor,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Details:      detailsCopy,
		Success:      success,
		Error:        errMsg,
		IPAddress:    ip,
		UserAgent:    userAgent,
	}

	l.events = append(l.events, event)

	if len(l.events) > l.maxSize {
		l.rotate()
	}

	if l.filePath != "" {
		l.appendToFile(redactEvent(event))
	}

	if bc := l.broadcaster; bc != nil {
		eventID := fmt.Sprintf("audit_%d_%d", event.Timestamp.UnixMilli(), auditSeq.Add(1))
		bc.Broadcast("audit_event", map[string]any{
			"id":           eventID,
			"timestamp":    event.Timestamp.Format(time.RFC3339),
			"eventType":    event.EventType,
			"actor":        event.Actor,
			"action":       event.Action,
			"resourceType": event.ResourceType,
			"resourceId":   event.ResourceID,
			"details":      event.Details,
			"success":      event.Success,
		})
		bc.Broadcast("audit_stats_changed", map[string]any{
			"totalEvents": len(l.events),
		})
	}
}

// GetEvents returns a copy of events, optionally filtered.
func (l *Logger) GetEvents(filter *Filter) []Event {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if filter == nil {
		result := make([]Event, len(l.events))
		copy(result, l.events)
		// MEDIUM: Deep copy Details map to prevent caller mutation of internal state
		for i := range result {
			if result[i].Details != nil {
				result[i].Details = copyMapAny(result[i].Details)
			}
		}
		return result
	}

	var result []Event
	for _, e := range l.events {
		if !filter.Match(e) {
			continue
		}
		// MEDIUM: Deep copy Details map for each event
		cp := e
		if cp.Details != nil {
			cp.Details = copyMapAny(cp.Details)
		}
		result = append(result, cp)
		// Apply limit to prevent memory exhaustion
		if filter.Limit > 0 && len(result) >= filter.Limit {
			break
		}
	}
	return result
}

// GetEventCount returns the total number of events.
func (l *Logger) GetEventCount() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.events)
}

// Filter defines criteria for filtering audit events.
type Filter struct {
	EventType    string    // exact match or empty for all
	Actor        string    // contains match or empty for all
	Action       string    // exact match or empty for all
	ResourceType string    // exact match or empty for all
	ResourceID   string    // exact match or empty for all
	Success      *bool     // nil for all, true/false for specific
	StartTime    time.Time // events after this time
	EndTime      time.Time // events before this time
	Limit        int       // max events to return (0 = unlimited)
}

// Match returns true if the event matches the filter.
func (f *Filter) Match(e Event) bool {
	if f.EventType != "" && e.EventType != f.EventType {
		return false
	}
	if f.Actor != "" && e.Actor != f.Actor {
		return false
	}
	if f.Action != "" && e.Action != f.Action {
		return false
	}
	if f.ResourceType != "" && e.ResourceType != f.ResourceType {
		return false
	}
	if f.ResourceID != "" && e.ResourceID != f.ResourceID {
		return false
	}
	if f.Success != nil && e.Success != *f.Success {
		return false
	}
	if !f.StartTime.IsZero() && e.Timestamp.Before(f.StartTime) {
		return false
	}
	if !f.EndTime.IsZero() && e.Timestamp.After(f.EndTime) {
		return false
	}
	return true
}

// rotate removes oldest events when maxSize is exceeded.
func (l *Logger) rotate() {
	// Keep newest half, minimum 10 events
	half := max(l.maxSize/2, 10)
	if len(l.events) > l.maxSize && len(l.events) > half {
		l.events = l.events[len(l.events)-half:]
	}
}

// appendToFile appends an event to the audit log file.
// Errors are logged but do not interrupt operation (audit log is best-effort).
func (l *Logger) appendToFile(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		auditLog.Error("Failed to marshal event", "error", err)
		return
	}
	f, err := os.OpenFile(l.filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		auditLog.Error("Failed to open audit file", "path", l.filePath, "error", err)
		return
	}
	defer f.Close()
	if _, err := fmt.Fprintf(f, "%s\n", data); err != nil {
		auditLog.Error("Failed to write audit event", "error", err)
	}
}

// Clear removes all events from memory (not from file).
func (l *Logger) Clear() {
	l.mu.Lock()
	l.events = make([]Event, 0, 1000)
	l.mu.Unlock()
}

// MarshalJSON returns the audit log as JSON.
func (l *Logger) MarshalJSON() ([]byte, error) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return json.Marshal(map[string]any{
		"events": l.events,
		"count":  len(l.events),
	})
}

// redactPatterns lists key patterns that indicate sensitive values.
var redactPatterns = []string{
	"password", "passwd", "secret", "token", "api_key", "apikey",
	"private_key", "authorization", "cookie", "session_token",
	"access_token", "refresh_token", "credentials",
}

// redactEvent returns a copy of the event with sensitive values masked in Details.
func redactEvent(event Event) Event {
	if len(event.Details) == 0 {
		return event
	}
	redacted := make(map[string]any, len(event.Details))
	for k, v := range event.Details {
		if isSensitiveKey(k) {
			redacted[k] = "[REDACTED]"
		} else if s, ok := v.(string); ok {
			redacted[k] = redactString(s)
		} else {
			redacted[k] = v
		}
	}
	event.Details = redacted
	return event
}

// isSensitiveKey returns true if the key name suggests a sensitive value.
func isSensitiveKey(key string) bool {
	lower := strings.ToLower(key)
	for _, pattern := range redactPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

// redactString masks sensitive values that appear as "key=value" or "key: value" in strings.
func redactString(s string) string {
	for _, pattern := range redactPatterns {
		lower := strings.ToLower(s)
		idx := 0
		for {
			pos := strings.Index(lower[idx:], pattern)
			if pos < 0 {
				break
			}
			absPos := idx + pos
			valStart := findValueStart(s, absPos, pattern)
			if valStart < 0 || valStart >= len(s) {
				idx = absPos + len(pattern)
				continue
			}
			valEnd := findValueEnd(s, valStart)
			if valEnd <= valStart {
				idx = absPos + len(pattern)
				continue
			}
			s = s[:valStart] + "[REDACTED]" + s[valEnd:]
			lower = strings.ToLower(s)
			idx = valStart + len("[REDACTED]")
		}
	}
	return s
}

// findValueStart finds where the value begins after a pattern match.
func findValueStart(s string, patternIdx int, pattern string) int {
	end := patternIdx + len(pattern)
	if end >= len(s) {
		return -1
	}
	// Look for separator characters after the pattern
	i := end
	for i < len(s) && (s[i] == ' ' || s[i] == ':' || s[i] == '=' || s[i] == '"' || s[i] == '\'') {
		i++
	}
	if i == end {
		return -1 // no separator found
	}
	if i >= len(s) {
		return -1
	}
	return i
}

// findValueEnd finds where the value ends (at whitespace, comma, quote, or end of string).
func findValueEnd(s string, pos int) int {
	if pos >= len(s) {
		return pos
	}
	end := pos
	for end < len(s) && s[end] != ',' && s[end] != '}' && s[end] != '"' &&
		s[end] != '\'' && s[end] != '\n' && s[end] != '\r' {
		if s[end] == ' ' || s[end] == ')' {
			break
		}
		end++
	}
	return end
}
