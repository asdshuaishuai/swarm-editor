package acp

import (
	"encoding/json"
	"testing"
)

func TestInitializeParams(t *testing.T) {
	params := InitializeParams{
		ProtocolVersion: ProtocolVersion,
		ClientCapabilities: ClientCapabilities{
			Terminal: true,
		},
		ClientInfo: ImplementationInfo{
			Name:    "test-client",
			Version: "1.0.0",
		},
	}

	data, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled InitializeParams
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.ProtocolVersion != ProtocolVersion {
		t.Errorf("Expected version %d, got %d", ProtocolVersion, unmarshaled.ProtocolVersion)
	}
}

func TestInitializeResult(t *testing.T) {
	result := InitializeResult{
		ProtocolVersion: ProtocolVersion,
		AgentCapabilities: AgentCapabilities{
			LoadSession: true,
			PromptCapabilities: PromptCapabilities{
				Image:           true,
				Audio:           false,
				EmbeddedContext: true,
			},
		},
		AgentInfo: ImplementationInfo{
			Name:    "test-agent",
			Version: "1.0.0",
		},
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled InitializeResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !unmarshaled.AgentCapabilities.LoadSession {
		t.Error("LoadSession should be true")
	}
}

func TestSessionNewParams(t *testing.T) {
	params := SessionNewParams{
		Mode: ModePlanning,
	}

	data, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled SessionNewParams
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Mode != ModePlanning {
		t.Errorf("Expected mode %s, got %s", ModePlanning, unmarshaled.Mode)
	}
}

func TestSessionNewResult(t *testing.T) {
	result := SessionNewResult{
		SessionID: "session-123",
		Mode:      ModeDefault,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled SessionNewResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.SessionID != "session-123" {
		t.Errorf("Expected session 'session-123', got %s", unmarshaled.SessionID)
	}
}

func TestSessionPromptParams(t *testing.T) {
	params := SessionPromptParams{
		SessionID: "session-123",
		Prompt: Prompt{
			{Type: "text", Text: "Hello"},
			{Type: "image", Image: &ImageData{Data: "base64data", MimeType: "image/png"}},
		},
	}

	data, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled SessionPromptParams
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if len(unmarshaled.Prompt) != 2 {
		t.Errorf("Expected 2 prompt items, got %d", len(unmarshaled.Prompt))
	}
}

func TestSessionPromptResult(t *testing.T) {
	result := SessionPromptResult{
		StopReason: StopEndTurn,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled SessionPromptResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.StopReason != StopEndTurn {
		t.Errorf("Expected stop reason %s, got %s", StopEndTurn, unmarshaled.StopReason)
	}
}

func TestContentBlockText(t *testing.T) {
	block := ContentBlock{
		Type: "text",
		Text: "Hello, world!",
	}

	data, err := json.Marshal(block)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ContentBlock
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Text != "Hello, world!" {
		t.Errorf("Expected text 'Hello, world!', got %s", unmarshaled.Text)
	}
}

func TestContentBlockImage(t *testing.T) {
	block := ContentBlock{
		Type: "image",
		Image: &ImageData{
			MimeType: "image/png",
			Data:     "base64imagedata",
		},
	}

	data, err := json.Marshal(block)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ContentBlock
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Image == nil {
		t.Fatal("Image should not be nil")
	}

	if unmarshaled.Image.MimeType != "image/png" {
		t.Errorf("Expected media type 'image/png', got %s", unmarshaled.Image.MimeType)
	}
}

func TestContentBlockResource(t *testing.T) {
	block := ContentBlock{
		Type: "resource",
		Resource: &Resource{
			URI:      "file:///test/file.go",
			MimeType: "text/plain",
		},
	}

	data, err := json.Marshal(block)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ContentBlock
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Resource == nil {
		t.Fatal("Resource should not be nil")
	}

	if unmarshaled.Resource.URI != "file:///test/file.go" {
		t.Errorf("Expected URI 'file:///test/file.go', got %s", unmarshaled.Resource.URI)
	}
}

func TestPromptType(t *testing.T) {
	prompt := Prompt{
		{Type: "text", Text: "First"},
		{Type: "text", Text: "Second"},
	}

	data, err := json.Marshal(prompt)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Prompt
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if len(unmarshaled) != 2 {
		t.Errorf("Expected 2 items, got %d", len(unmarshaled))
	}
}

func TestAgentCapabilities(t *testing.T) {
	caps := AgentCapabilities{
		LoadSession: true,
		PromptCapabilities: PromptCapabilities{
			Image:           true,
			Audio:           false,
			EmbeddedContext: true,
		},
		SwarmMode: &SwarmCapabilities{
			MaxAgents:     10,
			Topologies:    []string{"star", "mesh"},
			TaskDecompose: true,
			Consensus:     true,
		},
		PairProgramming:   true,
		TeamCollaboration: true,
	}

	data, err := json.Marshal(caps)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled AgentCapabilities
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !unmarshaled.LoadSession {
		t.Error("LoadSession should be true")
	}

	if unmarshaled.SwarmMode == nil {
		t.Fatal("SwarmMode should not be nil")
	}

	if unmarshaled.SwarmMode.MaxAgents != 10 {
		t.Errorf("Expected MaxAgents 10, got %d", unmarshaled.SwarmMode.MaxAgents)
	}
}

func TestImplementationInfo(t *testing.T) {
	info := ImplementationInfo{
		Name:    "test-agent",
		Title:   "Test Agent",
		Version: "1.0.0",
	}

	data, err := json.Marshal(info)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ImplementationInfo
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Name != "test-agent" {
		t.Errorf("Expected name 'test-agent', got %s", unmarshaled.Name)
	}
}

func TestSessionModeConstants(t *testing.T) {
	tests := []struct {
		mode     SessionMode
		expected string
	}{
		{ModeDefault, "default"},
		{ModePlanning, "planning"},
		{ModeEditing, "editing"},
		{ModeReviewing, "reviewing"},
		{ModePairDriver, "pair_driver"},
		{ModePairNav, "pair_navigator"},
		{ModeSwarm, "swarm"},
	}

	for _, tt := range tests {
		if string(tt.mode) != tt.expected {
			t.Errorf("SessionMode %s should be '%s'", tt.mode, tt.expected)
		}
	}
}

func TestStopReasonConstants(t *testing.T) {
	tests := []struct {
		reason   StopReason
		expected string
	}{
		{StopEndTurn, "end_turn"},
		{StopMaxTokens, "max_tokens"},
		{StopMaxRequests, "max_turn_requests"},
		{StopRefusal, "refusal"},
		{StopCancelled, "cancelled"},
	}

	for _, tt := range tests {
		if string(tt.reason) != tt.expected {
			t.Errorf("StopReason %s should be '%s'", tt.reason, tt.expected)
		}
	}
}

func TestGenerateSessionID(t *testing.T) {
	id1 := GenerateSessionID()
	id2 := GenerateSessionID()

	if id1 == "" {
		t.Error("Session ID should not be empty")
	}

	if id1 == id2 {
		t.Error("Session IDs should be unique")
	}
}

func TestGenerateAgentID(t *testing.T) {
	id1 := GenerateAgentID()
	id2 := GenerateAgentID()

	if id1 == "" {
		t.Error("Agent ID should not be empty")
	}

	if id1 == id2 {
		t.Error("Agent IDs should be unique")
	}
}

func TestGenerateToolCallID(t *testing.T) {
	id1 := GenerateToolCallID()
	id2 := GenerateToolCallID()

	if id1 == "" {
		t.Error("Tool call ID should not be empty")
	}

	if id1 == id2 {
		t.Error("Tool call IDs should be unique")
	}
}

func TestToolCallStatusConstants(t *testing.T) {
	tests := []struct {
		status   ToolCallStatus
		expected string
	}{
		{StatusPending, "pending"},
		{StatusInProgress, "in_progress"},
		{StatusCompleted, "completed"},
		{StatusFailed, "failed"},
	}

	for _, tt := range tests {
		if string(tt.status) != tt.expected {
			t.Errorf("ToolCallStatus %s should be '%s'", tt.status, tt.expected)
		}
	}
}

func TestToolKindConstants(t *testing.T) {
	tests := []struct {
		kind     ToolKind
		expected string
	}{
		{ToolRead, "read"},
		{ToolEdit, "edit"},
		{ToolDelete, "delete"},
		{ToolExecute, "execute"},
	}

	for _, tt := range tests {
		if string(tt.kind) != tt.expected {
			t.Errorf("ToolKind %s should be '%s'", tt.kind, tt.expected)
		}
	}
}

func TestUpdateStruct(t *testing.T) {
	update := Update{
		SessionUpdate: "message",
		Content: &ContentBlock{
			Type: "text",
			Text: "Hello",
		},
	}

	data, err := json.Marshal(update)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Update
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.SessionUpdate != "message" {
		t.Errorf("Expected sessionUpdate 'message', got %s", unmarshaled.SessionUpdate)
	}
}

func TestSwarmSessionConfig(t *testing.T) {
	config := SwarmSessionConfig{
		Topology:     "star",
		AgentCount:   5,
		AgentTypes:   []string{"coder", "reviewer"},
		TaskStrategy: "parallel",
	}

	data, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled SwarmSessionConfig
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Topology != "star" {
		t.Errorf("Expected topology 'star', got %s", unmarshaled.Topology)
	}

	if unmarshaled.AgentCount != 5 {
		t.Errorf("Expected agent count 5, got %d", unmarshaled.AgentCount)
	}
}

func TestPlanEntry(t *testing.T) {
	entry := PlanEntry{
		Content:  "Implement feature X",
		Priority: "high",
		Status:   "pending",
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled PlanEntry
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.Content != "Implement feature X" {
		t.Errorf("Expected content 'Implement feature X', got %s", unmarshaled.Content)
	}
}

func TestResourceStruct(t *testing.T) {
	resource := Resource{
		URI:      "file:///path/to/file.go",
		MimeType: "text/plain",
		Text:     "package main",
	}

	data, err := json.Marshal(resource)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled Resource
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.URI != "file:///path/to/file.go" {
		t.Errorf("Expected URI 'file:///path/to/file.go', got %s", unmarshaled.URI)
	}
}

func TestResourceLinkStruct(t *testing.T) {
	link := ResourceLink{
		URI:      "file:///path/to/file.go",
		MimeType: "text/plain",
	}

	data, err := json.Marshal(link)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ResourceLink
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.URI != "file:///path/to/file.go" {
		t.Errorf("Expected URI 'file:///path/to/file.go', got %s", unmarshaled.URI)
	}
}

func TestImageDataStruct(t *testing.T) {
	img := ImageData{
		Data:     "base64imagedata",
		MimeType: "image/png",
	}

	data, err := json.Marshal(img)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled ImageData
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.MimeType != "image/png" {
		t.Errorf("Expected mimeType 'image/png', got %s", unmarshaled.MimeType)
	}
}

func TestAudioDataStruct(t *testing.T) {
	audio := AudioData{
		Data:     "base64audiodata",
		MimeType: "audio/mp3",
	}

	data, err := json.Marshal(audio)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var unmarshaled AudioData
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if unmarshaled.MimeType != "audio/mp3" {
		t.Errorf("Expected mimeType 'audio/mp3', got %s", unmarshaled.MimeType)
	}
}
