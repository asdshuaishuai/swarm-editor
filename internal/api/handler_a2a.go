package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// syncAgentCards generates and registers AgentCards from all known agents.
// Called during get_agents to keep cards up-to-date.
func (h *CommandHandler) syncAgentCards() {
	registry := h.server.A2ACardRegistry()
	if registry == nil {
		return
	}

	// Load config for descriptions/tags
	configAgents := make(map[string]*acp.AgentConfig)
	if cfg, err := acp.LoadConfig(""); err == nil {
		for _, a := range cfg.Agents {
			configAgents[a.ID] = a
		}
	}

	seen := make(map[string]bool)

	// Registry agents
	if reg := h.server.Registry(); reg != nil {
		for _, a := range reg.GetAll() {
			id := string(a.ID)
			seen[id] = true
			card := buildAgentCard(id, a.Name, string(a.Type), configAgents[id])
			registry.Register(id, card)
		}
	}

	// External agents
	if cm := h.server.ConnManager(); cm != nil {
		for _, conn := range cm.GetConnected() {
			if seen[conn.ID] {
				continue
			}
			seen[conn.ID] = true
			name := ""
			if conn.Config != nil {
				name = conn.Config.Name
			}
			card := buildAgentCard(conn.ID, name, AgentTypeExternal, configAgents[conn.ID])
			registry.Register(conn.ID, card)
		}
	}

	// CLI agents
	if scanner := h.server.Scanner(); scanner != nil {
		for _, cli := range scanner.GetAgents() {
			if seen[cli.ID] {
				continue
			}
			card := buildAgentCardFromCLI(cli, configAgents[cli.ID])
			registry.Register(cli.ID, card)
		}
	}
}

// buildAgentCard creates an AgentCard from agent info and config.
func buildAgentCard(_, name, agentType string, cfg *acp.AgentConfig) *a2a.AgentCard {
	card := &a2a.AgentCard{
		Name:    name,
		Version: "1.0.0",
		Provider: &a2a.AgentProvider{
			Name: "swarm-editor",
		},
		Capabilities: a2a.AgentCapabilities{
			Streaming:          true,
			StateTransitionHistory: true,
		},
		DefaultInputModes:  []string{"text/plain"},
		DefaultOutputModes: []string{"text/plain", "text/markdown"},
		Tags:               []string{agentType},
		Metadata: map[string]any{
			"agentType": agentType,
		},
	}

	if cfg != nil {
		card.Description = cfg.Description
		if len(cfg.Tags) > 0 {
			card.Tags = append(card.Tags, cfg.Tags...)
		}
		caps := cfg.ExpectedCapabilities
		if caps.MCP.HTTP || caps.MCP.SSE {
			card.Capabilities.MCP = true
		}
		if caps.PairProgramming {
			card.Tags = append(card.Tags, "pair_programming")
		}
		if caps.LoadSession {
			card.Tags = append(card.Tags, "session_management")
		}
	}

	return card
}

// buildAgentCardFromCLI creates an AgentCard from a scanned CLI agent.
func buildAgentCardFromCLI(cli *agent.AgentCLI, cfg *acp.AgentConfig) *a2a.AgentCard {
	card := &a2a.AgentCard{
		Name:    cli.Name,
		Version: "1.0.0",
		Provider: &a2a.AgentProvider{
			Name: "swarm-editor",
		},
		Capabilities: a2a.AgentCapabilities{
			Streaming: true,
		},
		DefaultInputModes:  []string{"text/plain"},
		DefaultOutputModes: []string{"text/plain", "text/markdown"},
		Tags:               []string{AgentTypeCLI},
		Metadata: map[string]any{
			"agentType": AgentTypeCLI,
			"path":      cli.Path,
		},
	}

	if cfg != nil {
		card.Description = cfg.Description
		if len(cfg.Tags) > 0 {
			card.Tags = append(card.Tags, cfg.Tags...)
		}
	}

	return card
}

func (h *CommandHandler) handleGetAgentCards(ctx context.Context, params json.RawMessage) (any, error) {
	h.syncAgentCards()
	registry := h.server.A2ACardRegistry()
	if registry == nil {
		return []*a2a.AgentCard{}, nil
	}
	return registry.List(), nil
}

func (h *CommandHandler) handleFindAgentsByCapability(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Capability string `json:"capability"`
		Skill      string `json:"skill"`
		Tag        string `json:"tag"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	h.syncAgentCards()
	registry := h.server.A2ACardRegistry()
	if registry == nil {
		return []*a2a.AgentCard{}, nil
	}

	cap := strings.TrimSpace(req.Capability)
	skill := strings.TrimSpace(req.Skill)
	tag := strings.TrimSpace(req.Tag)

	switch {
	case cap != "":
		return registry.FindByCapability(cap), nil
	case skill != "":
		return registry.FindBySkill(skill), nil
	case tag != "":
		return registry.FindByTag(tag), nil
	default:
		return nil, errValidation("one of capability, skill, or tag is required")
	}
}

func (h *CommandHandler) handleA2AStatus(ctx context.Context, params json.RawMessage) (any, error) {
	router := h.server.A2ARouter()
	coordinator := h.server.A2ACoordinator()
	cardRegistry := h.server.A2ACardRegistry()

	result := map[string]any{
		"routerAvailable":  router != nil,
		"coordAvailable":   coordinator != nil,
		"cardRegistrySize": 0,
	}

	if cardRegistry != nil {
		result["cardRegistrySize"] = cardRegistry.Len()
	}

	if router != nil {
		ml := router.MessageLog()
		if ml != nil {
			result["messageLogSize"] = ml.Len()
			result["messageLogStats"] = ml.Stats()
		}
	}

	return result, nil
}

func (h *CommandHandler) handleA2AMessageLog(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Limit int `json:"limit"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	router := h.server.A2ARouter()
	if router == nil {
		return []struct{}{}, nil
	}

	ml := router.MessageLog()
	if ml == nil {
		return []struct{}{}, nil
	}

	return ml.Recent(req.Limit), nil
}
