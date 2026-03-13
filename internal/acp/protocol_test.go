package acp

import (
	"encoding/json"
	"testing"
)

func TestMessageMarshalRequest(t *testing.T) {
	msg := Message{
		JSONRPC: "2.0",
		ID:      &RequestID{Number: 123, IsNum: true},
		Method:  "test/method",
		Params:  json.RawMessage(`{"key": "value"}`),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Message
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.JSONRPC != "2.0" {
		t.Errorf("Expected JSONRPC 2.0, got %s", unmarshaled.JSONRPC)
	}

	if unmarshaled.Method != "test/method" {
		t.Errorf("Expected method 'test/method', got %s", unmarshaled.Method)
	}
}

func TestMessageMarshalResponse(t *testing.T) {
	msg := Message{
		JSONRPC: "2.0",
		ID:      &RequestID{Number: 456, IsNum: true},
		Result:  json.RawMessage(`{"status": "ok"}`),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Message
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Result == nil {
		t.Error("Result should not be nil")
	}
}

func TestMessageMarshalError(t *testing.T) {
	msg := Message{
		JSONRPC: "2.0",
		ID:      &RequestID{Number: 789, IsNum: true},
		Error: &Error{
			Code:    -32600,
			Message: "Invalid params",
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Message
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Error == nil {
		t.Error("Error should not be nil")
	}

	if unmarshaled.Error.Code != -32600 {
		t.Errorf("Expected error code -32600, got %d", unmarshaled.Error.Code)
	}
}

func TestMessageMarshalNotification(t *testing.T) {
	msg := Message{
		JSONRPC: "2.0",
		Method:  "notification/test",
		Params:  json.RawMessage(`{"event": "created"}`),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Message
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	// Notifications don't have ID
	if unmarshaled.ID != nil {
		t.Error("Notification should not have ID")
	}
}

func TestRequestIDNumber(t *testing.T) {
	id := &RequestID{Number: 42, IsNum: true}

	data, err := json.Marshal(id)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled RequestID
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !unmarshaled.IsNum {
		t.Error("IsNum should be true")
	}

	if unmarshaled.Number != 42 {
		t.Errorf("Expected 42, got %d", unmarshaled.Number)
	}
}

func TestRequestIDString(t *testing.T) {
	id := &RequestID{String: "abc-123", IsNum: false}

	data, err := json.Marshal(id)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled RequestID
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.IsNum {
		t.Error("IsNum should be false")
	}

	if unmarshaled.String != "abc-123" {
		t.Errorf("Expected 'abc-123', got %s", unmarshaled.String)
	}
}

func TestErrorStruct(t *testing.T) {
	jsonErr := Error{
		Code:    -32700,
		Message: "Test error",
	}

	data, err := json.Marshal(jsonErr)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Error
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Code != -32700 {
		t.Errorf("Expected code -32700, got %d", unmarshaled.Code)
	}

	if unmarshaled.Message != "Test error" {
		t.Errorf("Expected message 'Test error', got %s", unmarshaled.Message)
	}
}

func TestErrorError(t *testing.T) {
	err := &Error{
		Code:    -32600,
		Message: "Invalid params",
	}

	errStr := err.Error()
	expected := "ACP error -32600: Invalid params"
	if errStr != expected {
		t.Errorf("Expected '%s', got '%s'", expected, errStr)
	}
}

func TestNewRequest(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	msg, err := NewRequest(id, "test/method", map[string]interface{}{"key": "value"})
	if err != nil {
		t.Fatalf("NewRequest failed: %v", err)
	}

	if msg.JSONRPC != "2.0" {
		t.Errorf("Expected JSONRPC 2.0, got %s", msg.JSONRPC)
	}

	if msg.Method != "test/method" {
		t.Errorf("Expected method 'test/method', got %s", msg.Method)
	}

	if msg.ID == nil {
		t.Error("ID should not be nil")
	}
}

func TestNewResponse(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	msg, err := NewResponse(id, map[string]interface{}{"status": "ok"})
	if err != nil {
		t.Fatalf("NewResponse failed: %v", err)
	}

	if msg.JSONRPC != "2.0" {
		t.Errorf("Expected JSONRPC 2.0, got %s", msg.JSONRPC)
	}

	if msg.Result == nil {
		t.Error("Result should not be nil")
	}

	if msg.Method != "" {
		t.Errorf("Response should not have method, got %s", msg.Method)
	}
}

func TestNewErrorResponse(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	msg := NewErrorResponse(id, -32600, "Invalid params", nil)

	if msg.JSONRPC != "2.0" {
		t.Errorf("Expected JSONRPC 2.0, got %s", msg.JSONRPC)
	}

	if msg.Error == nil {
		t.Fatal("Error should not be nil")
	}

	if msg.Error.Code != -32600 {
		t.Errorf("Expected code -32600, got %d", msg.Error.Code)
	}

	if msg.Error.Message != "Invalid params" {
		t.Errorf("Expected message 'Invalid params', got %s", msg.Error.Message)
	}
}

func TestNewErrorResponseWithData(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	data := map[string]interface{}{"field": "value"}
	msg := NewErrorResponse(id, -32600, "Invalid params", data)

	if msg.Error.Data == nil {
		t.Error("Error data should not be nil")
	}
}

func TestNewNotification(t *testing.T) {
	msg, err := NewNotification("test/event", map[string]interface{}{"data": "value"})
	if err != nil {
		t.Fatalf("NewNotification failed: %v", err)
	}

	if msg.JSONRPC != "2.0" {
		t.Errorf("Expected JSONRPC 2.0, got %s", msg.JSONRPC)
	}

	if msg.Method != "test/event" {
		t.Errorf("Expected method 'test/event', got %s", msg.Method)
	}

	if msg.ID != nil {
		t.Error("Notification should not have ID")
	}
}

func TestErrorCodeConstants(t *testing.T) {
	tests := []struct {
		code     int
		expected int
	}{
		{ParseError, -32700},
		{InvalidRequest, -32600},
		{MethodNotFound, -32601},
		{InvalidParams, -32602},
		{InternalError, -32603},
		{ErrSessionNotFound, -32001},
		{ErrAgentNotReady, -32002},
		{ErrPermissionDenied, -32003},
		{ErrToolExecution, -32004},
		{ErrAuthentication, -32005},
		{ErrSessionCancelled, -32006},
		{ErrCapabilityNotSupported, -32007},
	}

	for _, tt := range tests {
		if tt.code != tt.expected {
			t.Errorf("Expected %d, got %d", tt.expected, tt.code)
		}
	}
}

// TestNewRequestWithMarshalError tests NewRequest with unmarshallable params
func TestNewRequestWithMarshalError(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	// Channels cannot be marshaled to JSON
	unmarshallable := map[string]interface{}{"ch": make(chan int)}
	_, err := NewRequest(id, "test/method", unmarshallable)
	if err == nil {
		t.Error("NewRequest should return error for unmarshallable params")
	}
}

// TestNewResponseWithMarshalError tests NewResponse with unmarshallable result
func TestNewResponseWithMarshalError(t *testing.T) {
	id := &RequestID{Number: 1, IsNum: true}
	// Channels cannot be marshaled to JSON
	unmarshallable := map[string]interface{}{"ch": make(chan int)}
	_, err := NewResponse(id, unmarshallable)
	if err == nil {
		t.Error("NewResponse should return error for unmarshallable result")
	}
}

// TestNewNotificationWithMarshalError tests NewNotification with unmarshallable params
func TestNewNotificationWithMarshalError(t *testing.T) {
	// Channels cannot be marshaled to JSON
	unmarshallable := map[string]interface{}{"ch": make(chan int)}
	_, err := NewNotification("test/event", unmarshallable)
	if err == nil {
		t.Error("NewNotification should return error for unmarshallable params")
	}
}
