package a2a

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestAgentCardJSON(t *testing.T) {
	card := &AgentCard{
		Name:        "Code Reviewer",
		Description: "Reviews code for bugs and style issues",
		URL:         "http://localhost:8080/a2a",
		Version:     "1.2.0",
		Provider: &AgentProvider{
			Organization: "Swarm Team",
			Name:         "Reviewer Bot",
		},
		Capabilities: AgentCapabilities{
			Streaming:             true,
			PushNotifications:    false,
			StateTransitionHistory: true,
			MCP:                   true,
		},
		Skills: []AgentSkill{
			{
				ID:          "code-review",
				Name:        "Code Review",
				Description: "Reviews code for bugs",
				Tags:        []string{"review", "quality"},
			},
		},
		DefaultInputModes:  []string{"text/plain", "application/json"},
		DefaultOutputModes: []string{"text/plain"},
		Tags:               []string{"review", "quality", "code"},
	}

	data, err := json.Marshal(card)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	var decoded AgentCard
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	if decoded.Name != "Code Reviewer" {
		t.Errorf("Name = %q, want %q", decoded.Name, "Code Reviewer")
	}
	if decoded.Capabilities.Streaming != true {
		t.Error("Streaming should be true")
	}
	if len(decoded.Skills) != 1 || decoded.Skills[0].ID != "code-review" {
		t.Error("Skills mismatch")
	}
	if decoded.Provider.Organization != "Swarm Team" {
		t.Errorf("Provider = %q", decoded.Provider.Organization)
	}
}

func TestAgentCardRegistry_RegisterGet(t *testing.T) {
	reg := NewAgentCardRegistry()

	card := &AgentCard{
		Name:        "Test Agent",
		Description: "A test agent",
		Version:     "1.0.0",
	}

	reg.Register("agent-1", card)

	got, ok := reg.Get("agent-1")
	if !ok {
		t.Fatal("expected to find agent-1")
	}
	if got.Name != "Test Agent" {
		t.Errorf("Name = %q, want %q", got.Name, "Test Agent")
	}

	// Non-existent
	_, ok = reg.Get("non-existent")
	if ok {
		t.Error("expected not to find non-existent agent")
	}
}

func TestAgentCardRegistry_RegisterNil(t *testing.T) {
	reg := NewAgentCardRegistry()

	// Should not panic
	reg.Register("", nil)
	reg.Register("agent-1", nil)

	if reg.Len() != 0 {
		t.Error("expected 0 cards after nil registration")
	}
}

func TestAgentCardRegistry_Unregister(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("agent-1", &AgentCard{Name: "A"})
	reg.Register("agent-2", &AgentCard{Name: "B"})

	reg.Unregister("agent-1")

	if reg.Len() != 1 {
		t.Errorf("Len = %d, want 1", reg.Len())
	}
	_, ok := reg.Get("agent-1")
	if ok {
		t.Error("agent-1 should be removed")
	}
}

func TestAgentCardRegistry_List(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("a", &AgentCard{Name: "A"})
	reg.Register("b", &AgentCard{Name: "B"})
	reg.Register("c", &AgentCard{Name: "C"})

	cards := reg.List()
	if len(cards) != 3 {
		t.Errorf("List returned %d cards, want 3", len(cards))
	}
}

func TestAgentCardRegistry_FindByCapability(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("agent-1", &AgentCard{
		Name: "Streamer",
		Capabilities: AgentCapabilities{Streaming: true},
	})
	reg.Register("agent-2", &AgentCard{
		Name: "Non-Streamer",
		Capabilities: AgentCapabilities{Streaming: false},
	})
	reg.Register("agent-3", &AgentCard{
		Name: "MCP Agent",
		Capabilities: AgentCapabilities{MCP: true},
	})

	streaming := reg.FindByCapability("streaming")
	if len(streaming) != 1 {
		t.Errorf("FindByCapability(streaming) = %d, want 1", len(streaming))
	}

	mcp := reg.FindByCapability("mcp")
	if len(mcp) != 1 {
		t.Errorf("FindByCapability(mcp) = %d, want 1", len(mcp))
	}

	// Custom capability
	reg.Register("agent-4", &AgentCard{
		Name: "Custom Agent",
		Capabilities: AgentCapabilities{
			Custom: map[string]any{"customFeature": true},
		},
	})
	custom := reg.FindByCapability("customFeature")
	if len(custom) != 1 {
		t.Errorf("FindByCapability(customFeature) = %d, want 1", len(custom))
	}
}

func TestAgentCardRegistry_FindBySkill(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("agent-1", &AgentCard{
		Name: "Reviewer",
		Skills: []AgentSkill{
			{ID: "code-review", Tags: []string{"review", "quality"}},
		},
	})
	reg.Register("agent-2", &AgentCard{
		Name: "Writer",
		Skills: []AgentSkill{
			{ID: "writing", Tags: []string{"create", "edit"}},
		},
	})
	reg.Register("agent-3", &AgentCard{
		Name: "Both",
		Skills: []AgentSkill{
			{ID: "code-review"},
			{ID: "writing", Tags: []string{"review"}},
		},
	})

	// Find by skill ID
	byID := reg.FindBySkill("code-review")
	if len(byID) != 2 {
		t.Errorf("FindBySkill(code-review) = %d, want 2", len(byID))
	}

	// Find by tag
	byTag := reg.FindBySkill("review")
	if len(byTag) != 2 {
		t.Errorf("FindBySkill(review) = %d, want 2", len(byTag))
	}

	// Not found
	none := reg.FindBySkill("nonexistent")
	if len(none) != 0 {
		t.Errorf("FindBySkill(nonexistent) = %d, want 0", len(none))
	}
}

func TestAgentCardRegistry_FindByTag(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("agent-1", &AgentCard{Tags: []string{"go", "review"}})
	reg.Register("agent-2", &AgentCard{Tags: []string{"python", "review"}})
	reg.Register("agent-3", &AgentCard{Tags: []string{"javascript"}})

	matches := reg.FindByTag("review")
	if len(matches) != 2 {
		t.Errorf("FindByTag(review) = %d, want 2", len(matches))
	}

	multi := reg.FindByTag("review", "python")
	if len(multi) != 2 {
		t.Errorf("FindByTag(review, python) = %d, want 2", len(multi))
	}

	none := reg.FindByTag("nonexistent")
	if len(none) != 0 {
		t.Errorf("FindByTag(nonexistent) = %d, want 0", len(none))
	}

	empty := reg.FindByTag()
	if empty != nil {
		t.Error("FindByTag() should return nil")
	}
}

func TestAgentCardRegistry_Timestamps(t *testing.T) {
	reg := NewAgentCardRegistry()
	before := time.Now()

	card := &AgentCard{Name: "Test"}
	reg.Register("agent-1", card)

	got, _ := reg.Get("agent-1")
	if got.CreatedAt.Before(before) {
		t.Error("CreatedAt should be >= before")
	}
	if got.UpdatedAt.Before(before) {
		t.Error("UpdatedAt should be >= before")
	}

	// Update should change UpdatedAt but not CreatedAt
	time.Sleep(1 * time.Millisecond)
	updatedCard := &AgentCard{
		Name:      "Test Updated",
		CreatedAt: got.CreatedAt, // Preserve the original CreatedAt
	}
	reg.Register("agent-1", updatedCard)
	got2, _ := reg.Get("agent-1")
	if !got2.CreatedAt.Equal(got.CreatedAt) {
		t.Error("CreatedAt should not change on update")
	}
	if !got2.UpdatedAt.After(got.UpdatedAt) {
		t.Error("UpdatedAt should change on update")
	}
}

func TestAgentCardRegistry_MarshalJSON(t *testing.T) {
	reg := NewAgentCardRegistry()
	reg.Register("a", &AgentCard{Name: "Agent A"})
	reg.Register("b", &AgentCard{Name: "Agent B"})

	data, err := reg.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}

	var cards []AgentCard
	if err := json.Unmarshal(data, &cards); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	if len(cards) != 2 {
		t.Errorf("got %d cards, want 2", len(cards))
	}
}

func TestAgentCardRegistry_ConcurrentAccess(t *testing.T) {
	reg := NewAgentCardRegistry()

	done := make(chan struct{})

	// Concurrent writers
	for i := 0; i < 50; i++ {
		go func(idx int) {
			defer func() { done <- struct{}{} }()
			reg.Register("writer-"+fmt.Sprint(idx), &AgentCard{Name: fmt.Sprintf("writer-%d", idx)})
		}(i)
	}

	// Concurrent readers
	for i := 0; i < 50; i++ {
		go func(idx int) {
			defer func() { done <- struct{}{} }()
			reg.Get(fmt.Sprintf("reader-%d", idx))
			reg.FindByCapability("streaming")
			reg.FindByTag("test")
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 100; i++ {
		<-done
	}

	if reg.Len() != 50 {
		t.Errorf("Len = %d, want 50", reg.Len())
	}
}

func TestAgentCardRegistry_Len(t *testing.T) {
	reg := NewAgentCardRegistry()
	if reg.Len() != 0 {
		t.Errorf("empty registry Len = %d", reg.Len())
	}

	reg.Register("a", &AgentCard{Name: "A"})
	if reg.Len() != 1 {
		t.Errorf("Len = %d, want 1", reg.Len())
	}

	reg.Unregister("a")
	if reg.Len() != 0 {
		t.Errorf("Len = %d, want 0", reg.Len())
	}
}

func TestAgentSkillExampleJSON(t *testing.T) {
	skill := AgentSkill{
		ID:          "translate",
		Name:        "Translation",
		Description: "Translates text between languages",
		Examples: []SkillExample{
			{Input: "Hello", Output: "Bonjour"},
			{Input: map[string]string{"text": "Goodbye", "target": "fr"}, Output: "Au revoir"},
		},
	}

	data, err := json.Marshal(skill)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	var decoded AgentSkill
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	if len(decoded.Examples) != 2 {
		t.Fatalf("Examples = %d, want 2", len(decoded.Examples))
	}
	if decoded.Examples[0].Input != "Hello" {
		t.Errorf("Example[0].Input = %v", decoded.Examples[0].Input)
	}
}
