// Package a2a implements the Agent Card specification
// Based on Google's A2A (Agent-to-Agent) Protocol Agent Card:
// https://github.com/google/A2A/blob/main/specification/agent-card.md
//
// Agent Cards provide a machine-readable description of an agent's capabilities,
// enabling automatic discovery, capability matching, and interoperability.
package a2a

import (
	"encoding/json"
	"sync"
	"time"
)

// AgentCard is a machine-readable description of an agent's capabilities.
// Inspired by Google's A2A Protocol Agent Card specification.
// It enables automatic agent discovery and capability-based routing.
type AgentCard struct {
	// Name is the human-readable name of the agent.
	Name string `json:"name"`

	// Description explains what the agent does.
	Description string `json:"description,omitempty"`

	// URL is the agent's endpoint URL (for remote agents).
	URL string `json:"url,omitempty"`

	// Version is the agent's semantic version.
	Version string `json:"version,omitempty"`

	// Provider information about who created the agent.
	Provider *AgentProvider `json:"provider,omitempty"`

	// Capabilities describes what the agent supports.
	Capabilities AgentCapabilities `json:"capabilities"`

	// Skills lists the specific abilities the agent can perform.
	Skills []AgentSkill `json:"skills,omitempty"`

	// DefaultInputModes lists the content types the agent accepts (e.g., "text/plain").
	DefaultInputModes []string `json:"defaultInputModes,omitempty"`

	// DefaultOutputModes lists the content types the agent produces.
	DefaultOutputModes []string `json:"defaultOutputModes,omitempty"`

	// Tags are searchable keywords for discovery.
	Tags []string `json:"tags,omitempty"`

	// Custom metadata for extensibility.
	Metadata map[string]any `json:"metadata,omitempty"`

	// CreatedAt is when the card was created.
	CreatedAt time.Time `json:"createdAt,omitempty"`

	// UpdatedAt is when the card was last modified.
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
}

// AgentCapabilities describes what the agent supports.
// Based on A2A Protocol capabilities enumeration.
type AgentCapabilities struct {
	// Streaming indicates the agent supports streaming responses.
	Streaming bool `json:"streaming,omitempty"`

	// PushNotifications indicates the agent can send push notifications.
	PushNotifications bool `json:"pushNotifications,omitempty"`

	// StateTransitionHistory indicates the agent exposes state history.
	StateTransitionHistory bool `json:"stateTransitionHistory,omitempty"`

	// FileTransfer indicates the agent supports file upload/download.
	FileTransfer bool `json:"fileTransfer,omitempty"`

	// MCP indicates the agent supports Model Context Protocol tools.
	MCP bool `json:"mcp,omitempty"`

	// Custom capabilities for extensibility.
	Custom map[string]any `json:"custom,omitempty"`
}

// AgentSkill describes a specific ability the agent can perform.
// Based on A2A Protocol skill definition.
type AgentSkill struct {
	// ID is a unique identifier for the skill.
	ID string `json:"id"`

	// Name is the human-readable skill name.
	Name string `json:"name"`

	// Description explains what the skill does.
	Description string `json:"description,omitempty"`

	// Tags are searchable keywords for the skill.
	Tags []string `json:"tags,omitempty"`

	// Examples are example inputs/outputs for the skill.
	Examples []SkillExample `json:"examples,omitempty"`

	// InputModes lists accepted content types for this skill.
	InputModes []string `json:"inputModes,omitempty"`

	// OutputModes lists produced content types for this skill.
	OutputModes []string `json:"outputModes,omitempty"`
}

// SkillExample shows an example input/output for a skill.
type SkillExample struct {
	Input  any `json:"input,omitempty"`
	Output any `json:"output,omitempty"`
}

// AgentProvider describes who created the agent.
type AgentProvider struct {
	// Organization is the name of the organization.
	Organization string `json:"organization,omitempty"`

	// Name is the provider's name.
	Name string `json:"name,omitempty"`

	// URL is the provider's website.
	URL string `json:"url,omitempty"`
}

// AgentCardRegistry manages agent cards for discovery and capability matching.
// Thread-safe for concurrent access.
type AgentCardRegistry struct {
	mu    sync.RWMutex
	cards map[string]*AgentCard // agentID -> card
}

// NewAgentCardRegistry creates a new registry.
func NewAgentCardRegistry() *AgentCardRegistry {
	return &AgentCardRegistry{
		cards: make(map[string]*AgentCard),
	}
}

// Register adds or updates an agent card.
func (r *AgentCardRegistry) Register(agentID string, card *AgentCard) {
	if card == nil || agentID == "" {
		return
	}
	r.mu.Lock()
	card.UpdatedAt = time.Now()
	if card.CreatedAt.IsZero() {
		card.CreatedAt = card.UpdatedAt
	}
	r.cards[agentID] = card
	r.mu.Unlock()
}

// Unregister removes an agent card.
func (r *AgentCardRegistry) Unregister(agentID string) {
	r.mu.Lock()
	delete(r.cards, agentID)
	r.mu.Unlock()
}

// Get retrieves an agent card by ID.
func (r *AgentCardRegistry) Get(agentID string) (*AgentCard, bool) {
	r.mu.RLock()
	card, ok := r.cards[agentID]
	r.mu.RUnlock()
	return card, ok
}

// List returns all registered agent cards.
func (r *AgentCardRegistry) List() []*AgentCard {
	r.mu.RLock()
	result := make([]*AgentCard, 0, len(r.cards))
	for _, card := range r.cards {
		result = append(result, card)
	}
	r.mu.RUnlock()
	return result
}

// FindByCapability returns agents that have a specific capability enabled.
func (r *AgentCardRegistry) FindByCapability(cap string) []*AgentCard {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*AgentCard
	for _, card := range r.cards {
		if hasCapability(card, cap) {
			result = append(result, card)
		}
	}
	return result
}

// FindBySkill returns agents that have a skill with the given ID or tag.
func (r *AgentCardRegistry) FindBySkill(skillIDOrTag string) []*AgentCard {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*AgentCard
	for _, card := range r.cards {
		if hasSkill(card, skillIDOrTag) {
			result = append(result, card)
		}
	}
	return result
}

// FindByTag returns agents matching any of the given tags.
func (r *AgentCardRegistry) FindByTag(tags ...string) []*AgentCard {
	if len(tags) == 0 {
		return nil
	}
	tagSet := make(map[string]struct{}, len(tags))
	for _, t := range tags {
		tagSet[t] = struct{}{}
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*AgentCard
	for _, card := range r.cards {
		for _, t := range card.Tags {
			if _, ok := tagSet[t]; ok {
				result = append(result, card)
				break
			}
		}
	}
	return result
}

// Len returns the number of registered cards.
func (r *AgentCardRegistry) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.cards)
}

// MarshalJSON returns JSON representation of all cards.
func (r *AgentCardRegistry) MarshalJSON() ([]byte, error) {
	r.mu.RLock()
	cards := make([]*AgentCard, 0, len(r.cards))
	for _, card := range r.cards {
		cards = append(cards, card)
	}
	r.mu.RUnlock()
	return json.Marshal(cards)
}

// hasCapability checks if a card has a specific capability.
func hasCapability(card *AgentCard, cap string) bool {
	switch cap {
	case "streaming":
		return card.Capabilities.Streaming
	case "pushNotifications":
		return card.Capabilities.PushNotifications
	case "stateTransitionHistory":
		return card.Capabilities.StateTransitionHistory
	case "fileTransfer":
		return card.Capabilities.FileTransfer
	case "mcp":
		return card.Capabilities.MCP
	default:
		// Check custom capabilities
		if card.Capabilities.Custom != nil {
			if v, ok := card.Capabilities.Custom[cap]; ok {
				if b, ok := v.(bool); ok {
					return b
				}
			}
		}
		return false
	}
}

// hasSkill checks if a card has a skill matching the given ID or tag.
func hasSkill(card *AgentCard, skillIDOrTag string) bool {
	for _, skill := range card.Skills {
		if skill.ID == skillIDOrTag {
			return true
		}
		for _, tag := range skill.Tags {
			if tag == skillIDOrTag {
				return true
			}
		}
	}
	return false
}
