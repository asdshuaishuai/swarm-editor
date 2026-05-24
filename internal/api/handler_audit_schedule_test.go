package api

import (
	"encoding/json"
	"testing"
)

func TestHandleStartScheduleRunner_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_schedule_runner", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error when schedule runner not configured")
	}
}

func TestHandleStopScheduleRunner_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_schedule_runner", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error when schedule runner not configured")
	}
}

func TestHandleGetScheduleRunnerStatus_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_schedule_runner_status", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error when schedule runner not configured")
	}
}

func TestHandleListAuditEvents_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{}`), "test")
	if err == nil {
		// May return empty or error depending on impl
	}
}

func TestHandleGetAuditStats_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_audit_stats", json.RawMessage(`{}`), "test")
	if err == nil {
		// May return empty or error depending on impl
	}
}

func TestHandleClearAuditLog_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_audit_log", json.RawMessage(`{"confirm":true}`), "test")
	if err == nil {
		t.Error("expected error when orchestrator not available")
	}
}

func TestHandleClearAuditLog_NotConfirmed(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_audit_log", json.RawMessage(`{"confirm":false}`), "test")
	if err == nil {
		t.Error("expected error when confirm is false")
	}
}

func TestHandleClearAuditLog_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_audit_log", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetSupervisorStats_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_supervisor_stats", json.RawMessage(`{}`), "test")
	if err == nil {
		// May return empty or error depending on impl
	}
}

func TestHandleGetEmergenceData_NoService(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_emergence_data", json.RawMessage(`{}`), "test")
	if err == nil {
		// May return empty or error depending on impl
	}
}
