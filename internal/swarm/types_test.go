package swarm

import (
	"encoding/json"
	"testing"
	"time"
)

func TestTaskResultJSON(t *testing.T) {
	now := time.Now()
	result := TaskResult{
		TaskID:       "task-123",
		AgentID:      "agent-456",
		Content:      "task completed successfully",
		FilesChanged: []string{"file1.go", "file2.go"},
		Artifacts: []Artifact{
			{
				Type:        "file",
				Name:        "output.txt",
				Path:        "/tmp/output.txt",
				Content:     "output content",
				Description: "output file",
			},
		},
		Error:       "",
		StartedAt:   now,
		CompletedAt: now.Add(5 * time.Minute),
		Duration:    5 * time.Minute,
	}

	// Marshal to JSON
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal TaskResult: %v", err)
	}

	// Unmarshal back
	var unmarshaled TaskResult
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal TaskResult: %v", err)
	}

	if unmarshaled.TaskID != result.TaskID {
		t.Errorf("TaskID mismatch: expected %s, got %s", result.TaskID, unmarshaled.TaskID)
	}
	if unmarshaled.AgentID != result.AgentID {
		t.Errorf("AgentID mismatch: expected %s, got %s", result.AgentID, unmarshaled.AgentID)
	}
	if len(unmarshaled.FilesChanged) != len(result.FilesChanged) {
		t.Errorf("FilesChanged length mismatch: expected %d, got %d", len(result.FilesChanged), len(unmarshaled.FilesChanged))
	}
}

func TestTaskResultWithError(t *testing.T) {
	result := TaskResult{
		TaskID: "task-123",
		Error:  "something went wrong",
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled TaskResult
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.Error != "something went wrong" {
		t.Errorf("Error mismatch: expected 'something went wrong', got '%s'", unmarshaled.Error)
	}
}

func TestTaskResultEmpty(t *testing.T) {
	result := TaskResult{}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal empty TaskResult: %v", err)
	}

	var unmarshaled TaskResult
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal empty TaskResult: %v", err)
	}

	if unmarshaled.TaskID != "" {
		t.Errorf("expected empty TaskID, got '%s'", unmarshaled.TaskID)
	}
}

func TestArtifactJSON(t *testing.T) {
	artifact := Artifact{
		Type:        "code",
		Name:        "main.go",
		Path:        "/src/main.go",
		Content:     "package main\n\nfunc main() {}",
		Description: "main entry point",
	}

	data, err := json.Marshal(artifact)
	if err != nil {
		t.Fatalf("failed to marshal Artifact: %v", err)
	}

	var unmarshaled Artifact
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal Artifact: %v", err)
	}

	if unmarshaled.Type != artifact.Type {
		t.Errorf("Type mismatch: expected %s, got %s", artifact.Type, unmarshaled.Type)
	}
	if unmarshaled.Name != artifact.Name {
		t.Errorf("Name mismatch: expected %s, got %s", artifact.Name, unmarshaled.Name)
	}
}

func TestArtifactTypes(t *testing.T) {
	types := []string{"file", "code", "documentation", "test"}

	for _, typ := range types {
		artifact := Artifact{Type: typ, Name: "test"}
		data, _ := json.Marshal(artifact)

		var unmarshaled Artifact
		json.Unmarshal(data, &unmarshaled)

		if unmarshaled.Type != typ {
			t.Errorf("Artifact type not preserved: expected %s, got %s", typ, unmarshaled.Type)
		}
	}
}

func TestConsensusResultJSON(t *testing.T) {
	result := ConsensusResult{
		TaskID:       "task-123",
		Status:       "agreed",
		ApprovalRate: 0.85,
		Votes: map[string]Vote{
			"agent-1": {AgentID: "agent-1", Approve: true, Comment: "LGTM", Weight: 1.0},
			"agent-2": {AgentID: "agent-2", Approve: false, Comment: "Needs work", Weight: 1.0},
		},
		Contributions: []AgentContribution{
			{AgentID: "agent-1", Content: "Fixed the bug", Vote: "approve", Weight: 1.0},
		},
		FinalResult: "Approved with minor changes",
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal ConsensusResult: %v", err)
	}

	var unmarshaled ConsensusResult
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal ConsensusResult: %v", err)
	}

	if unmarshaled.TaskID != result.TaskID {
		t.Errorf("TaskID mismatch")
	}
	if unmarshaled.Status != result.Status {
		t.Errorf("Status mismatch: expected %s, got %s", result.Status, unmarshaled.Status)
	}
	if unmarshaled.ApprovalRate != result.ApprovalRate {
		t.Errorf("ApprovalRate mismatch: expected %f, got %f", result.ApprovalRate, unmarshaled.ApprovalRate)
	}
	if len(unmarshaled.Votes) != 2 {
		t.Errorf("Votes length mismatch: expected 2, got %d", len(unmarshaled.Votes))
	}
}

func TestConsensusResultStatuses(t *testing.T) {
	statuses := []string{"agreed", "disagreed", "partial"}

	for _, status := range statuses {
		result := ConsensusResult{TaskID: "test", Status: status}
		data, _ := json.Marshal(result)

		var unmarshaled ConsensusResult
		json.Unmarshal(data, &unmarshaled)

		if unmarshaled.Status != status {
			t.Errorf("Status not preserved: expected %s, got %s", status, unmarshaled.Status)
		}
	}
}

func TestVoteJSON(t *testing.T) {
	vote := Vote{
		AgentID: "agent-123",
		Approve: true,
		Comment: "Looks good to me",
		Weight:  2.0,
	}

	data, err := json.Marshal(vote)
	if err != nil {
		t.Fatalf("failed to marshal Vote: %v", err)
	}

	var unmarshaled Vote
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal Vote: %v", err)
	}

	if unmarshaled.AgentID != vote.AgentID {
		t.Errorf("AgentID mismatch")
	}
	if unmarshaled.Approve != vote.Approve {
		t.Errorf("Approve mismatch: expected %v, got %v", vote.Approve, unmarshaled.Approve)
	}
	if unmarshaled.Weight != vote.Weight {
		t.Errorf("Weight mismatch: expected %f, got %f", vote.Weight, unmarshaled.Weight)
	}
}

func TestVoteApproveReject(t *testing.T) {
	approveVote := Vote{AgentID: "agent-1", Approve: true}
	rejectVote := Vote{AgentID: "agent-2", Approve: false}

	if !approveVote.Approve {
		t.Error("approve vote should have Approve=true")
	}
	if rejectVote.Approve {
		t.Error("reject vote should have Approve=false")
	}
}

func TestAgentContributionJSON(t *testing.T) {
	contribution := AgentContribution{
		AgentID: "agent-123",
		Content: "Implemented the feature",
		Vote:    "approve",
		Weight:  1.5,
	}

	data, err := json.Marshal(contribution)
	if err != nil {
		t.Fatalf("failed to marshal AgentContribution: %v", err)
	}

	var unmarshaled AgentContribution
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("failed to unmarshal AgentContribution: %v", err)
	}

	if unmarshaled.AgentID != contribution.AgentID {
		t.Errorf("AgentID mismatch")
	}
	if unmarshaled.Vote != contribution.Vote {
		t.Errorf("Vote mismatch: expected %s, got %s", contribution.Vote, unmarshaled.Vote)
	}
}

func TestAgentContributionVoteTypes(t *testing.T) {
	voteTypes := []string{"approve", "reject", "abstain"}

	for _, voteType := range voteTypes {
		contribution := AgentContribution{AgentID: "agent-1", Vote: voteType}
		data, _ := json.Marshal(contribution)

		var unmarshaled AgentContribution
		json.Unmarshal(data, &unmarshaled)

		if unmarshaled.Vote != voteType {
			t.Errorf("Vote type not preserved: expected %s, got %s", voteType, unmarshaled.Vote)
		}
	}
}

func TestTaskResultWithMultipleArtifacts(t *testing.T) {
	result := TaskResult{
		TaskID: "task-123",
		Artifacts: []Artifact{
			{Type: "file", Name: "a.go"},
			{Type: "code", Name: "b.go"},
			{Type: "test", Name: "b_test.go"},
		},
	}

	data, _ := json.Marshal(result)

	var unmarshaled TaskResult
	json.Unmarshal(data, &unmarshaled)

	if len(unmarshaled.Artifacts) != 3 {
		t.Errorf("expected 3 artifacts, got %d", len(unmarshaled.Artifacts))
	}
}

func TestConsensusResultWithMultipleContributions(t *testing.T) {
	result := ConsensusResult{
		TaskID: "task-123",
		Contributions: []AgentContribution{
			{AgentID: "agent-1", Content: "Work 1", Vote: "approve"},
			{AgentID: "agent-2", Content: "Work 2", Vote: "approve"},
			{AgentID: "agent-3", Content: "Work 3", Vote: "reject"},
		},
	}

	data, _ := json.Marshal(result)

	var unmarshaled ConsensusResult
	json.Unmarshal(data, &unmarshaled)

	if len(unmarshaled.Contributions) != 3 {
		t.Errorf("expected 3 contributions, got %d", len(unmarshaled.Contributions))
	}

	// Check order is preserved
	if unmarshaled.Contributions[0].AgentID != "agent-1" {
		t.Error("contributions order not preserved")
	}
}

func TestVoteWithEmptyComment(t *testing.T) {
	vote := Vote{
		AgentID: "agent-1",
		Approve: true,
		// Comment intentionally empty
	}

	data, _ := json.Marshal(vote)

	var unmarshaled Vote
	json.Unmarshal(data, &unmarshaled)

	if unmarshaled.Comment != "" {
		t.Errorf("expected empty comment, got '%s'", unmarshaled.Comment)
	}
}

func TestTaskResultDurationPreservation(t *testing.T) {
	duration := 3*time.Minute + 30*time.Second
	result := TaskResult{
		TaskID:   "task-123",
		Duration: duration,
	}

	data, _ := json.Marshal(result)

	var unmarshaled TaskResult
	json.Unmarshal(data, &unmarshaled)

	if unmarshaled.Duration != duration {
		t.Errorf("Duration mismatch: expected %v, got %v", duration, unmarshaled.Duration)
	}
}
