package swarm

import (
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var electionLog = log.With("component", "QueenElection")

// ElectionState tracks the state of queen election
type ElectionState int

const (
	// ElectionStable means the queen is active and healthy
	ElectionStable ElectionState = iota
	// ElectionPending means an election is in progress
	ElectionPending
	// ElectionFailed means no candidates are available
	ElectionFailed
)

func (e ElectionState) String() string {
	switch e {
	case ElectionStable:
		return "stable"
	case ElectionPending:
		return "pending"
	case ElectionFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// QueenInfo tracks the current queen and backup
type QueenInfo struct {
	QueenID          string        `json:"queenId"`
	BackupQueenID    string        `json:"backupQueenId"`
	State            ElectionState `json:"state"`
	ElectionRound    int           `json:"electionRound"`
	ElectedAt        time.Time     `json:"electedAt"`
	AbdicationReason string        `json:"abdicationReason,omitempty"`
}

// QueenElection manages queen bee election
type QueenElection struct {
	mu           sync.RWMutex
	config       ElectionConfig
	current      QueenInfo
	candidates   []string           // ordered by priority
	healthScores map[string]float64 // cached health scores from supervisor
	supervisor   *Supervisor        // optional reference to supervisor for live health data
}

// ElectionConfig configures election behavior
type ElectionConfig struct {
	// DefaultCandidates is the ordered list of preferred queen candidates by priority
	DefaultCandidates []string
	// HealthThreshold is the minimum health score (0-1) to be eligible as queen
	HealthThreshold float64
	// ReElectionDelay is how long to wait before triggering a re-election after abdication
	ReElectionDelay time.Duration
}

// DefaultElectionConfig returns default election configuration
func DefaultElectionConfig() ElectionConfig {
	return ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
		ReElectionDelay:   5 * time.Second,
	}
}

// NewQueenElection creates a new queen election manager
func NewQueenElection(config ElectionConfig) *QueenElection {
	if config.HealthThreshold == 0 {
		config.HealthThreshold = 0.7
	}
	if config.ReElectionDelay == 0 {
		config.ReElectionDelay = 5 * time.Second
	}
	if len(config.DefaultCandidates) == 0 {
		config.DefaultCandidates = []string{"claude-code", "opencode"}
	}

	return &QueenElection{
		config: config,
		current: QueenInfo{
			State: ElectionFailed,
		},
		candidates:   config.DefaultCandidates,
		healthScores: make(map[string]float64),
	}
}

// SetSupervisor sets the supervisor reference for live health data
func (qe *QueenElection) SetSupervisor(sup *Supervisor) {
	qe.mu.Lock()
	defer qe.mu.Unlock()
	qe.supervisor = sup
}

// ElectQueen selects the best agent as queen and second best as backup.
// Returns queenID, backupID, error. If no eligible candidates, returns error.
func (qe *QueenElection) ElectQueen(agents map[string]AgentHealth) (queenID string, backupID string, err error) {
	qe.mu.Lock()
	defer qe.mu.Unlock()

	qe.current.State = ElectionPending
	qe.current.ElectionRound++

	// Build candidate list from both default candidates and available agents
	eligible := qe.buildEligibleCandidates(agents)

	if len(eligible) == 0 {
		qe.current.State = ElectionFailed
		return "", "", fmt.Errorf("no eligible queen candidates (health threshold: %.2f)", qe.config.HealthThreshold)
	}

	// Score and sort candidates by priority and health
	sorted := qe.scoreAndSortCandidates(eligible)

	// Select top 2 as queen and backup
	queenID = sorted[0].id
	if len(sorted) > 1 {
		backupID = sorted[1].id
	}

	// Update current state
	qe.current.QueenID = queenID
	qe.current.BackupQueenID = backupID
	qe.current.State = ElectionStable
	qe.current.ElectedAt = time.Now()
	qe.current.AbdicationReason = ""

	// Cache health scores for future use
	for id := range agents {
		qe.healthScores[id] = agents[id].Score
	}

	electionLog.Info("Queen elected",
		"queen", queenID,
		"backup", backupID,
		"round", qe.current.ElectionRound,
		"health", qe.healthScores[queenID])

	return queenID, backupID, nil
}

// candidate represents an agent with its election score
type candidate struct {
	id       string
	score    float64
	priority int // lower index = higher priority
}

// buildEligibleCandidates returns agents that meet health threshold
func (qe *QueenElection) buildEligibleCandidates(agents map[string]AgentHealth) map[string]AgentHealth {
	eligible := make(map[string]AgentHealth)

	// First, add default candidates if they exist and are healthy enough
	for _, candidateID := range qe.config.DefaultCandidates {
		if health, ok := agents[candidateID]; ok {
			if health.Score >= qe.config.HealthThreshold {
				eligible[candidateID] = health
			}
		}
	}

	// If no default candidates are eligible, consider all agents
	if len(eligible) == 0 {
		for id, health := range agents {
			if health.Score >= qe.config.HealthThreshold {
				eligible[id] = health
			}
		}
	}

	return eligible
}

// scoreAndSortCandidates sorts candidates by: priority > health score > capability bonus
func (qe *QueenElection) scoreAndSortCandidates(agents map[string]AgentHealth) []candidate {
	candidates := make([]candidate, 0, len(agents))

	// Assign priority based on default candidates list
	priorityMap := make(map[string]int)
	for i, id := range qe.config.DefaultCandidates {
		priorityMap[id] = i
	}

	// Build candidate list with scores
	for id, health := range agents {
		priority := len(qe.config.DefaultCandidates) // lowest priority for non-default
		if p, ok := priorityMap[id]; ok {
			priority = p
		}

		// Calculate score: healthScore * priorityWeight * (1 + capabilityBonus)
		// Priority weight: higher priority gets bonus (inverse of priority index)
		priorityWeight := 1.0 / (1.0 + float64(priority)*0.1)

		// Capability bonus: agents with better stats get slight boost
		capabilityBonus := 0.0
		if health.SuccessfulTasks > 10 {
			capabilityBonus += 0.05
		}
		if health.AvgResponseTime > 0 && health.AvgResponseTime < 5*time.Second {
			capabilityBonus += 0.05
		}
		if health.ConsecutiveFails == 0 {
			capabilityBonus += 0.03
		}

		score := health.Score * priorityWeight * (1.0 + capabilityBonus)

		candidates = append(candidates, candidate{
			id:       id,
			score:    score,
			priority: priority,
		})
	}

	// Sort by score (descending), then priority (ascending)
	// Use a stable sort to maintain order for equal scores
	for i := 0; i < len(candidates)-1; i++ {
		for j := i + 1; j < len(candidates); j++ {
			if candidates[j].score > candidates[i].score ||
				(candidates[j].score == candidates[i].score && candidates[j].priority < candidates[i].priority) {
				candidates[i], candidates[j] = candidates[j], candidates[i]
			}
		}
	}

	return candidates
}

// Abdicate causes the current queen to step down. The backup is promoted,
// and a new election is triggered for the backup role.
func (qe *QueenElection) Abdicate(reason string) QueenInfo {
	qe.mu.Lock()
	defer qe.mu.Unlock()

	// If no queen, nothing to abdicate
	if qe.current.QueenID == "" {
		return qe.current
	}

	// Store previous state
	previousQueen := qe.current.QueenID
	_ = qe.current.BackupQueenID // Used in logging below

	// Promote backup to queen
	if qe.current.BackupQueenID != "" {
		qe.current.QueenID = qe.current.BackupQueenID
		qe.current.BackupQueenID = ""
		qe.current.AbdicationReason = fmt.Sprintf("queen %s abdicated: %s (backup promoted)", previousQueen, reason)
		electionLog.Info("Queen abdicated, backup promoted",
			"previous_queen", previousQueen,
			"new_queen", qe.current.QueenID,
			"reason", reason)
	} else {
		// No backup available - mark as failed
		qe.current.QueenID = ""
		qe.current.State = ElectionFailed
		qe.current.AbdicationReason = fmt.Sprintf("queen %s abdicated: %s (no backup)", previousQueen, reason)
		electionLog.Warn("Queen abdicated, no backup available",
			"previous_queen", previousQueen,
			"reason", reason)
	}

	// Update election timestamp
	qe.current.ElectedAt = time.Now()

	return qe.current
}

// GetCurrent returns a copy of the current queen info (thread-safe)
func (qe *QueenElection) GetCurrent() QueenInfo {
	qe.mu.RLock()
	defer qe.mu.RUnlock()

	// Return a copy to prevent external mutation
	cp := qe.current
	return cp
}

// IsQueen returns true if the given agent is the current queen
func (qe *QueenElection) IsQueen(agentID string) bool {
	qe.mu.RLock()
	defer qe.mu.RUnlock()
	return qe.current.QueenID == agentID
}

// IsBackup returns true if the given agent is the current backup queen
func (qe *QueenElection) IsBackup(agentID string) bool {
	qe.mu.RLock()
	defer qe.mu.RUnlock()
	return qe.current.BackupQueenID == agentID
}

// UpdateHealth updates the cached health score for an agent
func (qe *QueenElection) UpdateHealth(agentID string, score float64) {
	qe.mu.Lock()
	defer qe.mu.Unlock()
	qe.healthScores[agentID] = score
}

// GetHealth returns the cached health score for an agent
func (qe *QueenElection) GetHealth(agentID string) float64 {
	qe.mu.RLock()
	defer qe.mu.RUnlock()
	return qe.healthScores[agentID]
}

// ForceElection forces a new election with the provided agent health data.
// This is used when both queen and backup fail and a full re-election is needed.
func (qe *QueenElection) ForceElection(agents map[string]AgentHealth) (queenID, backupID string, err error) {
	qe.mu.Lock()
	defer qe.mu.Unlock()

	// Reset current state
	qe.current.State = ElectionPending
	qe.current.ElectionRound++

	eligible := qe.buildEligibleCandidates(agents)

	if len(eligible) == 0 {
		qe.current.State = ElectionFailed
		qe.current.QueenID = ""
		qe.current.BackupQueenID = ""
		return "", "", fmt.Errorf("force election failed: no eligible candidates")
	}

	sorted := qe.scoreAndSortCandidates(eligible)

	queenID = sorted[0].id
	if len(sorted) > 1 {
		backupID = sorted[1].id
	}

	qe.current.QueenID = queenID
	qe.current.BackupQueenID = backupID
	qe.current.State = ElectionStable
	qe.current.ElectedAt = time.Now()
	qe.current.AbdicationReason = ""

	electionLog.Info("Forced election completed",
		"queen", queenID,
		"backup", backupID,
		"round", qe.current.ElectionRound)

	return queenID, backupID, nil
}

// GetCandidates returns the ordered list of default candidates
func (qe *QueenElection) GetCandidates() []string {
	qe.mu.RLock()
	defer qe.mu.RUnlock()

	candidates := make([]string, len(qe.candidates))
	copy(candidates, qe.candidates)
	return candidates
}

// SetCandidates updates the ordered list of default candidates
func (qe *QueenElection) SetCandidates(candidates []string) {
	qe.mu.Lock()
	defer qe.mu.Unlock()

	if len(candidates) == 0 {
		return
	}

	qe.candidates = make([]string, len(candidates))
	copy(qe.candidates, candidates)
}
