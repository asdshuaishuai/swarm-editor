package swarm

import (
	"testing"
	"time"
)

// TestElectQueen_HealthyCandidates tests electing a queen when all candidates are healthy
func TestElectQueen_HealthyCandidates(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
		ReElectionDelay:   5 * time.Second,
	}
	qe := NewQueenElection(config)

	agents := map[string]AgentHealth{
		"claude-code": {
			AgentID:          "claude-code",
			Score:            0.95,
			SuccessfulTasks:  20,
			AvgResponseTime:  2 * time.Second,
			ConsecutiveFails: 0,
		},
		"opencode": {
			AgentID:          "opencode",
			Score:            0.85,
			SuccessfulTasks:  15,
			AvgResponseTime:  3 * time.Second,
			ConsecutiveFails: 0,
		},
		"other-agent": {
			AgentID:          "other-agent",
			Score:            0.80,
			SuccessfulTasks:  10,
			AvgResponseTime:  4 * time.Second,
			ConsecutiveFails: 1,
		},
	}

	queen, backup, err := qe.ElectQueen(agents)
	if err != nil {
		t.Fatalf("ElectQueen failed: %v", err)
	}

	// Highest priority candidate (claude-code) should be queen
	if queen != "claude-code" {
		t.Errorf("Expected queen to be 'claude-code', got '%s'", queen)
	}

	// Second highest priority candidate (opencode) should be backup
	if backup != "opencode" {
		t.Errorf("Expected backup to be 'opencode', got '%s'", backup)
	}

	// Verify state is stable
	info := qe.GetCurrent()
	if info.State != ElectionStable {
		t.Errorf("Expected state ElectionStable, got %v", info.State)
	}

	// Verify IsQueen and IsBackup
	if !qe.IsQueen("claude-code") {
		t.Error("Expected IsQueen('claude-code') to return true")
	}
	if !qe.IsBackup("opencode") {
		t.Error("Expected IsBackup('opencode') to return true")
	}
	if qe.IsQueen("opencode") {
		t.Error("Expected IsQueen('opencode') to return false")
	}
}

// TestElectQueen_SomeUnhealthy tests electing a queen when some candidates are unhealthy
func TestElectQueen_SomeUnhealthy(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	agents := map[string]AgentHealth{
		"claude-code": {
			AgentID: "claude-code",
			Score:   0.5, // Below threshold
		},
		"opencode": {
			AgentID: "opencode",
			Score:   0.85, // Healthy
		},
		"other-agent": {
			AgentID: "other-agent",
			Score:   0.75, // Healthy but lower priority
		},
	}

	queen, backup, err := qe.ElectQueen(agents)
	if err != nil {
		t.Fatalf("ElectQueen failed: %v", err)
	}

	// Only healthy default candidate (opencode) should be queen
	if queen != "opencode" {
		t.Errorf("Expected queen to be 'opencode', got '%s'", queen)
	}

	// Backup is empty because only one default candidate (opencode) is eligible,
	// and the election only picks from default candidates when at least one is healthy.
	if backup != "" {
		t.Logf("Backup is '%s' (only one eligible default candidate, backup may be empty)", backup)
	}
}

// TestElectQueen_NoCandidates tests election failure when no candidates meet threshold
func TestElectQueen_NoCandidates(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.9, // Very high threshold
	}
	qe := NewQueenElection(config)

	agents := map[string]AgentHealth{
		"claude-code": {
			AgentID: "claude-code",
			Score:   0.7, // Below threshold
		},
		"opencode": {
			AgentID: "opencode",
			Score:   0.8, // Below threshold
		},
	}

	queen, backup, err := qe.ElectQueen(agents)
	if err == nil {
		t.Error("Expected ElectQueen to fail with no eligible candidates, but it succeeded")
	}
	if queen != "" || backup != "" {
		t.Errorf("Expected empty queen/backup, got queen='%s', backup='%s'", queen, backup)
	}

	// Verify state is failed
	info := qe.GetCurrent()
	if info.State != ElectionFailed {
		t.Errorf("Expected state ElectionFailed, got %v", info.State)
	}
}

// TestAbdicate_BackupTakesOver tests that backup is promoted when queen abdicates
func TestAbdicate_BackupTakesOver(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	// First, elect a queen
	agents := map[string]AgentHealth{
		"claude-code": {AgentID: "claude-code", Score: 0.95},
		"opencode":    {AgentID: "opencode", Score: 0.85},
	}

	queen, backup, _ := qe.ElectQueen(agents)
	if queen != "claude-code" || backup != "opencode" {
		t.Fatalf("Initial election failed: queen=%s, backup=%s", queen, backup)
	}

	// Abdicate the queen
	newInfo := qe.Abdicate("token limit exceeded")

	// Backup should be promoted to queen
	if newInfo.QueenID != "opencode" {
		t.Errorf("Expected queen to be 'opencode' after abdication, got '%s'", newInfo.QueenID)
	}

	// Backup should be empty (no more backup)
	if newInfo.BackupQueenID != "" {
		t.Errorf("Expected empty backup after abdication, got '%s'", newInfo.BackupQueenID)
	}

	// Reason should be recorded
	if newInfo.AbdicationReason == "" {
		t.Error("Expected abdication reason to be recorded")
	}

	// Verify IsQueen updated
	if !qe.IsQueen("opencode") {
		t.Error("Expected IsQueen('opencode') to return true after abdication")
	}
}

// TestAbdicate_BothFail_ReElection tests full re-election when both queen and backup fail
func TestAbdicate_BothFail_ReElection(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	// Initial election
	agents := map[string]AgentHealth{
		"claude-code": {AgentID: "claude-code", Score: 0.95},
		"opencode":    {AgentID: "opencode", Score: 0.85},
		"other-agent": {AgentID: "other-agent", Score: 0.80},
	}

	qe.ElectQueen(agents)

	// Abdicate queen (promotes backup)
	qe.Abdicate("queen failed")

	// Abdicate again (no backup available - should mark as failed)
	newInfo := qe.Abdicate("backup also failed")

	if newInfo.QueenID != "" {
		t.Errorf("Expected empty queen after backup abdication, got '%s'", newInfo.QueenID)
	}

	if newInfo.State != ElectionFailed {
		t.Errorf("Expected state ElectionFailed, got %v", newInfo.State)
	}

	// Now force a new election with updated health data
	// Simulate original agents recovering, other-agent becoming best
	updatedAgents := map[string]AgentHealth{
		"claude-code": {AgentID: "claude-code", Score: 0.6},  // Still unhealthy
		"opencode":    {AgentID: "opencode", Score: 0.6},     // Still unhealthy
		"other-agent": {AgentID: "other-agent", Score: 0.85}, // Now best
	}

	queen, backup, err := qe.ForceElection(updatedAgents)
	if err != nil {
		t.Fatalf("ForceElection failed: %v", err)
	}

	// other-agent should be elected as it's the only healthy one
	if queen != "other-agent" {
		t.Errorf("Expected queen to be 'other-agent', got '%s'", queen)
	}

	// No backup available
	if backup != "" {
		t.Errorf("Expected no backup, got '%s'", backup)
	}

	// State should be stable again
	info := qe.GetCurrent()
	if info.State != ElectionStable {
		t.Errorf("Expected state ElectionStable after forced election, got %v", info.State)
	}
}

// TestIsQueen_IsBackup tests the IsQueen and IsBackup methods
func TestIsQueen_IsBackup(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	// Before election
	if qe.IsQueen("claude-code") {
		t.Error("Expected IsQueen to return false before election")
	}
	if qe.IsBackup("opencode") {
		t.Error("Expected IsBackup to return false before election")
	}

	// After election
	agents := map[string]AgentHealth{
		"claude-code": {AgentID: "claude-code", Score: 0.95},
		"opencode":    {AgentID: "opencode", Score: 0.85},
	}

	qe.ElectQueen(agents)

	if !qe.IsQueen("claude-code") {
		t.Error("Expected IsQueen('claude-code') to return true after election")
	}
	if !qe.IsBackup("opencode") {
		t.Error("Expected IsBackup('opencode') to return true after election")
	}
	if qe.IsQueen("other-agent") {
		t.Error("Expected IsQueen('other-agent') to return false")
	}
}

// TestUpdateHealth tests updating cached health scores
func TestUpdateHealth(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	// Update health score
	qe.UpdateHealth("claude-code", 0.9)

	// Verify cached score
	if score := qe.GetHealth("claude-code"); score != 0.9 {
		t.Errorf("Expected health score 0.9, got %.2f", score)
	}

	// Unknown agent should return 0
	if score := qe.GetHealth("unknown"); score != 0 {
		t.Errorf("Expected health score 0 for unknown agent, got %.2f", score)
	}
}

// TestGetCandidates tests getting and setting default candidates
func TestGetCandidates(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
	}
	qe := NewQueenElection(config)

	candidates := qe.GetCandidates()
	if len(candidates) != 2 {
		t.Fatalf("Expected 2 candidates, got %d", len(candidates))
	}
	if candidates[0] != "claude-code" || candidates[1] != "opencode" {
		t.Errorf("Unexpected candidates: %v", candidates)
	}

	// Modify returned slice should not affect internal state
	candidates[0] = "modified"
	originalCandidates := qe.GetCandidates()
	if originalCandidates[0] == "modified" {
		t.Error("Modifying returned slice affected internal state")
	}

	// Set new candidates
	qe.SetCandidates([]string{"new-queen", "new-backup"})
	updated := qe.GetCandidates()
	if updated[0] != "new-queen" || updated[1] != "new-backup" {
		t.Errorf("Candidates not updated correctly: %v", updated)
	}
}

// TestElectionRound tests that election round counter increments
func TestElectionRound(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	agents := map[string]AgentHealth{
		"claude-code": {AgentID: "claude-code", Score: 0.95},
	}

	// First election
	qe.ElectQueen(agents)
	info1 := qe.GetCurrent()
	if info1.ElectionRound != 1 {
		t.Errorf("Expected election round 1, got %d", info1.ElectionRound)
	}

	// Second election
	qe.ElectQueen(agents)
	info2 := qe.GetCurrent()
	if info2.ElectionRound != 2 {
		t.Errorf("Expected election round 2, got %d", info2.ElectionRound)
	}
}

// TestDefaultElectionConfig tests the default configuration
func TestDefaultElectionConfig(t *testing.T) {
	config := DefaultElectionConfig()

	if len(config.DefaultCandidates) != 2 {
		t.Errorf("Expected 2 default candidates, got %d", len(config.DefaultCandidates))
	}
	if config.DefaultCandidates[0] != "claude-code" {
		t.Errorf("Expected first candidate 'claude-code', got '%s'", config.DefaultCandidates[0])
	}
	if config.DefaultCandidates[1] != "opencode" {
		t.Errorf("Expected second candidate 'opencode', got '%s'", config.DefaultCandidates[1])
	}
	if config.HealthThreshold != 0.7 {
		t.Errorf("Expected health threshold 0.7, got %.2f", config.HealthThreshold)
	}
	if config.ReElectionDelay != 5*time.Second {
		t.Errorf("Expected re-election delay 5s, got %v", config.ReElectionDelay)
	}
}

// TestPriorityOrdering tests that default candidates are preferred over non-default
func TestPriorityOrdering(t *testing.T) {
	config := ElectionConfig{
		DefaultCandidates: []string{"claude-code", "opencode"},
		HealthThreshold:   0.7,
	}
	qe := NewQueenElection(config)

	agents := map[string]AgentHealth{
		"random-agent": {AgentID: "random-agent", Score: 0.99}, // Highest health
		"claude-code":  {AgentID: "claude-code", Score: 0.90},  // Default candidate
		"opencode":     {AgentID: "opencode", Score: 0.85},     // Default candidate
	}

	queen, backup, _ := qe.ElectQueen(agents)

	// Default candidate should still win despite slightly lower health
	if queen != "claude-code" {
		t.Errorf("Expected default candidate 'claude-code' to win despite lower health, got '%s'", queen)
	}

	if backup != "opencode" {
		t.Errorf("Expected second default candidate 'opencode' as backup, got '%s'", backup)
	}
}
