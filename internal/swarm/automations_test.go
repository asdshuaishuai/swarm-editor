package swarm

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestAutomationEngine_BasicTrigger(t *testing.T) {
	engine := NewAutomationEngine()

	var fired atomic.Int64
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		fired.Add(1)
		return nil
	})

	a := &Automation{
		ID:   "auto-1",
		Name: "notify-on-failure",
		Trigger: AutomationTrigger{
			Events: []string{"workflow.failed"},
		},
		Actions: []AutomationAction{
			{Type: "send_notification", Params: map[string]any{"message": "workflow failed!"}},
		},
		Enabled: true,
	}
	if err := engine.AddAutomation(a); err != nil {
		t.Fatal(err)
	}

	n := engine.EvaluateEvent(context.Background(), "workflow.failed", map[string]any{
		"workflowId": "wf-123",
	})

	if n != 1 {
		t.Fatalf("expected 1 automation triggered, got %d", n)
	}

	// Wait for async action
	time.Sleep(50 * time.Millisecond)
	if fired.Load() != 1 {
		t.Fatalf("expected 1 action fired, got %d", fired.Load())
	}
}

func TestAutomationEngine_MatchFiltering(t *testing.T) {
	engine := NewAutomationEngine()

	var lastWorkflowID atomic.Value
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		lastWorkflowID.Store(event["workflowId"])
		return nil
	})

	// Only trigger for specific workflow
	a := &Automation{
		ID:   "auto-match",
		Name: "specific-workflow-alert",
		Trigger: AutomationTrigger{
			Events: []string{"workflow.failed"},
			Match:  map[string]string{"workflowId": "wf-target"},
		},
		Actions: []AutomationAction{
			{Type: "send_notification"},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Wrong workflow
	n := engine.EvaluateEvent(context.Background(), "workflow.failed", map[string]any{
		"workflowId": "wf-other",
	})
	if n != 0 {
		t.Fatalf("expected 0 triggers for non-matching workflow, got %d", n)
	}

	// Correct workflow
	n = engine.EvaluateEvent(context.Background(), "workflow.failed", map[string]any{
		"workflowId": "wf-target",
	})
	if n != 1 {
		t.Fatalf("expected 1 trigger for matching workflow, got %d", n)
	}

	time.Sleep(50 * time.Millisecond)
	val := lastWorkflowID.Load()
	if val != "wf-target" {
		t.Fatalf("expected workflowId=wf-target, got %v", val)
	}
}

func TestAutomationEngine_Disabled(t *testing.T) {
	engine := NewAutomationEngine()

	var fired atomic.Int64
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		fired.Add(1)
		return nil
	})

	a := &Automation{
		ID:      "auto-disabled",
		Name:    "disabled-auto",
		Enabled: false,
		Trigger: AutomationTrigger{Events: []string{"workflow.failed"}},
		Actions: []AutomationAction{{Type: "send_notification"}},
	}
	engine.AddAutomation(a)

	n := engine.EvaluateEvent(context.Background(), "workflow.failed", nil)
	if n != 0 {
		t.Fatalf("expected 0 triggers for disabled automation, got %d", n)
	}
}

func TestAutomationEngine_Cooldown(t *testing.T) {
	engine := NewAutomationEngine()

	var fired atomic.Int64
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		fired.Add(1)
		return nil
	})

	a := &Automation{
		ID:       "auto-cooldown",
		Name:     "cooldown-auto",
		Enabled:  true,
		Cooldown: 1 * time.Second,
		Trigger:  AutomationTrigger{Events: []string{"workflow.failed"}},
		Actions:  []AutomationAction{{Type: "send_notification"}},
	}
	engine.AddAutomation(a)

	// First fire
	n1 := engine.EvaluateEvent(context.Background(), "workflow.failed", nil)
	if n1 != 1 {
		t.Fatalf("expected 1 trigger on first fire, got %d", n1)
	}

	// Second fire (within cooldown)
	n2 := engine.EvaluateEvent(context.Background(), "workflow.failed", nil)
	if n2 != 0 {
		t.Fatalf("expected 0 triggers within cooldown, got %d", n2)
	}

	time.Sleep(50 * time.Millisecond)
	if fired.Load() != 1 {
		t.Fatalf("expected 1 action fired (cooldown blocked second), got %d", fired.Load())
	}
}

func TestAutomationEngine_MultiTrigger_OR(t *testing.T) {
	engine := NewAutomationEngine()

	var fired atomic.Int64
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		fired.Add(1)
		return nil
	})

	a := &Automation{
		ID:      "auto-multi",
		Name:    "multi-event",
		Enabled: true,
		Trigger: AutomationTrigger{
			Events: []string{"workflow.failed", "workflow.paused"},
		},
		Actions: []AutomationAction{{Type: "send_notification"}},
	}
	engine.AddAutomation(a)

	engine.EvaluateEvent(context.Background(), "workflow.failed", nil)
	engine.EvaluateEvent(context.Background(), "workflow.paused", nil)

	time.Sleep(50 * time.Millisecond)
	if fired.Load() != 2 {
		t.Fatalf("expected 2 actions fired, got %d", fired.Load())
	}
}

func TestAutomationEngine_FireCount(t *testing.T) {
	engine := NewAutomationEngine()
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		return nil
	})

	a := &Automation{
		ID:      "auto-count",
		Name:    "count-auto",
		Enabled: true,
		Trigger: AutomationTrigger{Events: []string{"workflow.failed"}},
		Actions: []AutomationAction{{Type: "send_notification"}},
	}
	engine.AddAutomation(a)

	for i := 0; i < 5; i++ {
		engine.EvaluateEvent(context.Background(), "workflow.failed", nil)
	}

	if a.FireCount() != 5 {
		t.Fatalf("expected fireCount=5, got %d", a.FireCount())
	}
}

func TestAutomationEngine_CRUD(t *testing.T) {
	engine := NewAutomationEngine()

	// Add
	a := &Automation{ID: "a1", Name: "test", Trigger: AutomationTrigger{Events: []string{"test"}}}
	if err := engine.AddAutomation(a); err != nil {
		t.Fatal(err)
	}

	// Get
	got := engine.GetAutomation("a1")
	if got == nil || got.Name != "test" {
		t.Fatal("expected to get automation a1")
	}

	// List
	list := engine.ListAutomations()
	if len(list) != 1 {
		t.Fatalf("expected 1 automation, got %d", len(list))
	}

	// Remove
	if !engine.RemoveAutomation("a1") {
		t.Fatal("expected remove to return true")
	}
	if engine.GetAutomation("a1") != nil {
		t.Fatal("expected automation to be removed")
	}

	// Remove non-existent
	if engine.RemoveAutomation("nonexistent") {
		t.Fatal("expected remove to return false for non-existent")
	}
}

func TestAutomationEngine_AddEmptyID(t *testing.T) {
	engine := NewAutomationEngine()
	if err := engine.AddAutomation(&Automation{Name: "no-id"}); err == nil {
		t.Fatal("expected error for empty ID")
	}
}

func TestAutomationEngine_ConcurrentEvaluate(t *testing.T) {
	engine := NewAutomationEngine()

	var fired atomic.Int64
	engine.RegisterActionHandler("send_notification", func(ctx context.Context, event map[string]any) error {
		fired.Add(1)
		return nil
	})

	// Add 10 automations
	for i := 0; i < 10; i++ {
		engine.AddAutomation(&Automation{
			ID:      fmt.Sprintf("auto-%d", i),
			Name:    fmt.Sprintf("auto-%d", i),
			Enabled: true,
			Trigger: AutomationTrigger{Events: []string{"test"}},
			Actions: []AutomationAction{{Type: "send_notification"}},
		})
	}

	// Fire 100 events concurrently
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			engine.EvaluateEvent(context.Background(), "test", nil)
		}()
	}
	wg.Wait()

	// All 100 events should trigger all 10 automations
	time.Sleep(100 * time.Millisecond)
	// Due to async execution, check fireCount of first automation
	a := engine.GetAutomation("auto-0")
	if a == nil {
		t.Fatal("expected auto-0 to exist")
	}
	if a.FireCount() != 100 {
		t.Fatalf("expected fireCount=100, got %d", a.FireCount())
	}
}

func TestAutomationEngine_MarshalJSON(t *testing.T) {
	engine := NewAutomationEngine()
	engine.AddAutomation(&Automation{
		ID:      "a1",
		Name:    "test",
		Enabled: true,
		Trigger: AutomationTrigger{Events: []string{"workflow.failed"}},
		Actions: []AutomationAction{{Type: "send_notification"}},
	})

	data, err := engine.MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Fatal("expected non-empty JSON")
	}
}

// ==================== ScheduleStore Tests ====================

func TestScheduleStore_Basic(t *testing.T) {
	store := NewScheduleStore()

	sc := &ScheduleConfig{
		ID:         "sched-1",
		Name:       "every-5-min",
		WorkflowID: "wf-123",
		Cron:       "*/5 * * * *",
		Enabled:    true,
	}
	if err := store.AddSchedule(sc); err != nil {
		t.Fatal(err)
	}

	got := store.GetSchedule("sched-1")
	if got == nil || got.Name != "every-5-min" {
		t.Fatal("expected to get schedule sched-1")
	}

	list := store.ListSchedules()
	if len(list) != 1 {
		t.Fatalf("expected 1 schedule, got %d", len(list))
	}
}

func TestScheduleStore_Remove(t *testing.T) {
	store := NewScheduleStore()
	store.AddSchedule(&ScheduleConfig{ID: "s1", Name: "test", Cron: "* * * * *"})

	if !store.RemoveSchedule("s1") {
		t.Fatal("expected remove to return true")
	}
	if store.GetSchedule("s1") != nil {
		t.Fatal("expected schedule to be removed")
	}
	if store.RemoveSchedule("nonexistent") {
		t.Fatal("expected remove to return false for non-existent")
	}
}

func TestScheduleStore_Enable(t *testing.T) {
	store := NewScheduleStore()
	store.AddSchedule(&ScheduleConfig{ID: "s1", Name: "test", Cron: "* * * * *", Enabled: true})

	if !store.EnableSchedule("s1", false) {
		t.Fatal("expected enable to return true")
	}
	if store.GetSchedule("s1").Enabled {
		t.Fatal("expected schedule to be disabled")
	}
}

func TestScheduleStore_Validation(t *testing.T) {
	store := NewScheduleStore()

	if err := store.AddSchedule(&ScheduleConfig{Name: "no-id", Cron: "* * * * *"}); err == nil {
		t.Fatal("expected error for empty ID")
	}
	if err := store.AddSchedule(&ScheduleConfig{ID: "s1", Name: "no-cron"}); err == nil {
		t.Fatal("expected error for empty cron")
	}
}

func TestScheduleStore_ExecuteCallback(t *testing.T) {
	store := NewScheduleStore()

	var called atomic.Bool
	store.SetExecuteCallback(func(scheduleID string, input map[string]any) {
		if scheduleID == "s1" {
			called.Store(true)
		}
	})

	// Callback can be invoked (tested via direct call pattern)
	store.mu.RLock()
	cb := store.onExecute
	store.mu.RUnlock()
	if cb == nil {
		t.Fatal("expected callback to be set")
	}
	cb("s1", nil)
	if !called.Load() {
		t.Fatal("expected callback to be invoked")
	}
}

func TestSnapshotAutomation_Isolation(t *testing.T) {
	// Create an automation with mutable data
	a := &Automation{
		ID:   "test-automation",
		Name: "Test",
		Trigger: AutomationTrigger{
			Events: []string{"event1", "event2"},
			Match:  map[string]string{"key1": "value1", "key2": "value2"},
		},
		Actions: []AutomationAction{
			{Type: "test", Params: map[string]any{"p1": "v1"}},
		},
		Enabled: true,
	}

	snap := snapshotAutomation(a)

	// Mutate the original
	a.mu.Lock()
	a.Trigger.Events[0] = "modified"
	a.Trigger.Match["key1"] = "modified"
	a.Actions[0].Params["p1"] = "modified"
	a.mu.Unlock()

	// Check that the snapshot is not affected
	if len(snap.Trigger.Events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(snap.Trigger.Events))
	}
	if snap.Trigger.Events[0] != "event1" {
		t.Errorf("expected event1, got %s", snap.Trigger.Events[0])
	}
	if len(snap.Trigger.Match) != 2 {
		t.Fatalf("expected 2 match entries, got %d", len(snap.Trigger.Match))
	}
	if snap.Trigger.Match["key1"] != "value1" {
		t.Errorf("expected value1, got %s", snap.Trigger.Match["key1"])
	}
	if len(snap.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(snap.Actions))
	}
	if snap.Actions[0].Params["p1"] != "v1" {
		t.Errorf("expected v1, got %v", snap.Actions[0].Params["p1"])
	}
}

func TestAutomationEngine_WebhookAction(t *testing.T) {
	// Start a mock HTTP server with mutex protection for received request
	var mu sync.Mutex
	var receivedReq struct {
		Method  string
		Headers http.Header
		Body    []byte
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		receivedReq.Method = r.Method
		receivedReq.Headers = r.Header
		body, _ := io.ReadAll(r.Body)
		receivedReq.Body = body
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "webhook-test",
		Name: "Test Webhook",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{
				Type: "call_webhook",
				Params: map[string]any{
					"url":                  server.URL + "/webhook",
					"method":               "POST",
					"headers":              map[string]any{"X-Custom-Header": "test-value"},
					"body":                 `{"event": "test"}`,
					"allowPrivateNetworks": true,
				},
			},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Trigger the automation
	triggered := engine.EvaluateEvent(context.Background(), "test.event", map[string]any{
		"_automationId":   "webhook-test",
		"_automationName": "Test Webhook",
	})

	if triggered != 1 {
		t.Fatalf("expected 1 triggered, got %d", triggered)
	}

	// Wait for the async webhook call
	time.Sleep(100 * time.Millisecond)

	// Verify the request was received correctly
	mu.Lock()
	method := receivedReq.Method
	headers := receivedReq.Headers
	body := receivedReq.Body
	mu.Unlock()

	if method != "POST" {
		t.Errorf("expected POST, got %s", method)
	}
	if headers.Get("X-Custom-Header") != "test-value" {
		t.Errorf("expected test-value, got %s", headers.Get("X-Custom-Header"))
	}
	if string(body) != `{"event": "test"}` {
		t.Errorf("expected body, got %s", string(body))
	}
	if !strings.Contains(headers.Get("User-Agent"), "SwarmEditor-Automation") {
		t.Errorf("expected User-Agent to contain SwarmEditor-Automation, got %s", headers.Get("User-Agent"))
	}
}

func TestAutomationEngine_WebhookAction_MissingURL(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "webhook-no-url",
		Name: "No URL",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "call_webhook", Params: map[string]any{}},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Should not panic, just log the error
	triggered := engine.EvaluateEvent(context.Background(), "test.event", nil)
	if triggered != 1 {
		t.Fatalf("expected 1 triggered (action still fires, just fails), got %d", triggered)
	}
}

func TestAutomationEngine_NotificationAction_MissingMessage(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "notify-no-msg",
		Name: "No Message",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "send_notification", Params: map[string]any{}},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Should not panic — message is required but event data is nil/empty
	triggered := engine.EvaluateEvent(context.Background(), "test.event", nil)
	if triggered != 1 {
		t.Fatalf("expected 1 triggered, got %d", triggered)
	}
}

func TestAutomationEngine_NotificationAction_NilEventMap(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "notify-nil-map",
		Name: "Nil Map",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "send_notification", Params: nil},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Params is nil — must not panic on nil map access
	triggered := engine.EvaluateEvent(context.Background(), "test.event", nil)
	if triggered != 1 {
		t.Fatalf("expected 1 triggered, got %d", triggered)
	}
}

func TestAutomationEngine_WebhookAction_NilParams(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "webhook-nil-params",
		Name: "Nil Params",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "call_webhook", Params: nil},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Params is nil — must not panic
	triggered := engine.EvaluateEvent(context.Background(), "test.event", nil)
	if triggered != 1 {
		t.Fatalf("expected 1 triggered, got %d", triggered)
	}
}

func TestAutomation_LastFired(t *testing.T) {
	a := &Automation{
		ID:        "test-auto",
		lastFired: time.Now().Add(-1 * time.Hour),
		fireCount: 5,
	}

	if a.LastFired().IsZero() {
		t.Error("LastFired should not be zero")
	}
}

func TestAutomation_FireCount(t *testing.T) {
	a := &Automation{fireCount: 42}
	if a.FireCount() != 42 {
		t.Errorf("FireCount = %d, want 42", a.FireCount())
	}
}

func TestAutomationEngine_SetBroadcaster(t *testing.T) {
	engine := NewAutomationEngine()
	engine.SetBroadcaster(&mockEventBroadcaster{})
	// Just verify no panic
}

type mockEventBroadcaster struct{}

func (m *mockEventBroadcaster) Broadcast(eventType string, payload any) {}

func TestAutomationEngine_EnableAutomation(t *testing.T) {
	engine := NewAutomationEngine()
	a := &Automation{
		ID:      "auto-1",
		Name:    "Test",
		Trigger: AutomationTrigger{Events: []string{"test"}},
		Actions: []AutomationAction{{Type: "send_notification"}},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Disable
	ok := engine.EnableAutomation("auto-1", false)
	if !ok {
		t.Error("EnableAutomation should return true")
	}

	// Nonexistent
	ok = engine.EnableAutomation("nonexistent", true)
	if ok {
		t.Error("EnableAutomation should return false for nonexistent")
	}
}

func TestAutomationEngine_Close(t *testing.T) {
	engine := NewAutomationEngine()
	engine.Close()
	// Should not block or panic
}

func TestAutomationEngine_Close_Idempotent(t *testing.T) {
	engine := NewAutomationEngine()
	engine.Close()
	engine.Close()
}

func TestMatchesTrigger_ComplexPayload(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		Trigger: AutomationTrigger{
			Events: []string{"workflow_completed"},
			Match: map[string]string{
				"status":  "completed",
				"count":   "3",
				"enabled": "true",
			},
		},
		Actions: []AutomationAction{{Type: "send_notification"}},
	}

	// Should match when all conditions are met
	payload := map[string]any{
		"status":  "completed",
		"count":   3,
		"enabled": true,
	}
	if !engine.matchesTrigger(a, "workflow_completed", payload) {
		t.Error("expected match with all conditions met")
	}

	// Should not match when a condition is missing
	delete(payload, "status")
	if engine.matchesTrigger(a, "workflow_completed", payload) {
		t.Error("expected no match when status is missing")
	}

	// Should not match when a condition has wrong value
	payload["status"] = "failed"
	if engine.matchesTrigger(a, "workflow_completed", payload) {
		t.Error("expected no match when status is wrong")
	}

	// Should not match wrong event type
	payload["status"] = "completed"
	if engine.matchesTrigger(a, "workflow_failed", payload) {
		t.Error("expected no match for wrong event type")
	}
}

func TestMatchesTrigger_NestedObjectPayload(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		Trigger: AutomationTrigger{
			Events: []string{"test_event"},
			Match: map[string]string{
				"data": `{"key":"value"}`,
			},
		},
		Actions: []AutomationAction{{Type: "send_notification"}},
	}

	// Nested object should be JSON-marshaled for comparison
	payload := map[string]any{
		"data": map[string]string{"key": "value"},
	}
	if !engine.matchesTrigger(a, "test_event", payload) {
		t.Error("expected match for nested object payload")
	}

	// Different nested object should not match
	payload["data"] = map[string]string{"key": "different"}
	if engine.matchesTrigger(a, "test_event", payload) {
		t.Error("expected no match for different nested object")
	}
}

func TestAutomationEngine_WebhookAction_InvalidScheme(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "webhook-bad-scheme",
		Name: "Bad Scheme",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "call_webhook", Params: map[string]any{
				"url": "ftp://evil.com/webhook",
			}},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	engine.EvaluateEvent(context.Background(), "test.event", nil)
	// Should not panic, just log error for invalid scheme
}

func TestAutomationEngine_WebhookAction_BlockedHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify blocked headers are NOT set
		if r.Header.Get("Authorization") != "" {
			t.Error("expected Authorization header to be blocked")
		}
		if r.Header.Get("Cookie") != "" {
			t.Error("expected Cookie header to be blocked")
		}
		// Verify allowed header IS set
		if r.Header.Get("X-Custom") != "ok" {
			t.Error("expected X-Custom header to be set")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "webhook-headers",
		Name: "Headers Test",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "call_webhook", Params: map[string]any{
				"url":                  server.URL,
				"allowPrivateNetworks": true,
				"headers": map[string]any{
					"Authorization": "Bearer secret",
					"Cookie":        "session=abc",
					"X-Custom":      "ok",
				},
			}},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	engine.EvaluateEvent(context.Background(), "test.event", nil)
	time.Sleep(100 * time.Millisecond)
}

func TestAutomationEngine_NotificationAction_WithLevel(t *testing.T) {
	engine := NewAutomationEngine()

	a := &Automation{
		ID:   "notify-level",
		Name: "Level Test",
		Trigger: AutomationTrigger{
			Events: []string{"test.event"},
		},
		Actions: []AutomationAction{
			{Type: "send_notification", Params: map[string]any{
				"message": "test message",
				"level":   "warning",
			}},
		},
		Enabled: true,
	}
	engine.AddAutomation(a)

	// Should trigger without error (builtin handler uses level)
	engine.EvaluateEvent(context.Background(), "test.event", nil)
}
