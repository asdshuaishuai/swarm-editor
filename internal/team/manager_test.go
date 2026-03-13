package team

import (
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewTeam(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	if team.ID != "team-1" {
		t.Errorf("Expected ID 'team-1', got '%s'", team.ID)
	}

	if team.Name != "Test Team" {
		t.Errorf("Expected Name 'Test Team', got '%s'", team.Name)
	}

	if team.Owner != "owner-1" {
		t.Errorf("Expected Owner 'owner-1', got '%s'", team.Owner)
	}

	if team.Members == nil {
		t.Error("Members map should be initialized")
	}

	if team.Agents == nil {
		t.Error("Agents map should be initialized")
	}

	if team.Workspaces == nil {
		t.Error("Workspaces map should be initialized")
	}

	// Check default settings
	if team.Settings.MaxMembers != 50 {
		t.Errorf("Expected MaxMembers 50, got %d", team.Settings.MaxMembers)
	}

	if team.Settings.MaxAgents != 20 {
		t.Errorf("Expected MaxAgents 20, got %d", team.Settings.MaxAgents)
	}
}

func TestTeamAddMember(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	member := &Member{
		ID:    "member-1",
		Name:  "Test Member",
		Email: "test@example.com",
		Role:  RoleDeveloper,
	}

	err := team.AddMember(member)
	if err != nil {
		t.Fatalf("AddMember failed: %v", err)
	}

	if len(team.Members) != 1 {
		t.Errorf("Expected 1 member, got %d", len(team.Members))
	}

	// Test duplicate member
	err = team.AddMember(member)
	if err == nil {
		t.Error("AddMember should fail for duplicate member")
	}
}

func TestTeamAddMemberLimit(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	team.Settings.MaxMembers = 2

	// Add first member
	member1 := &Member{ID: "member-1", Name: "Member 1", Role: RoleDeveloper}
	err := team.AddMember(member1)
	if err != nil {
		t.Fatalf("AddMember 1 failed: %v", err)
	}

	// Add second member
	member2 := &Member{ID: "member-2", Name: "Member 2", Role: RoleDeveloper}
	err = team.AddMember(member2)
	if err != nil {
		t.Fatalf("AddMember 2 failed: %v", err)
	}

	// Try to add third member (should fail)
	member3 := &Member{ID: "member-3", Name: "Member 3", Role: RoleDeveloper}
	err = team.AddMember(member3)
	if err == nil {
		t.Error("AddMember should fail when team is full")
	}
}

func TestTeamRemoveMember(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	member := &Member{ID: "member-1", Name: "Test Member", Role: RoleDeveloper}
	team.AddMember(member)

	err := team.RemoveMember("member-1")
	if err != nil {
		t.Fatalf("RemoveMember failed: %v", err)
	}

	if len(team.Members) != 0 {
		t.Errorf("Expected 0 members, got %d", len(team.Members))
	}
}

func TestTeamRemoveOwner(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	// Try to remove owner
	err := team.RemoveMember("owner-1")
	if err == nil {
		t.Error("RemoveMember should fail when trying to remove owner")
	}
}

func TestTeamGetMember(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	member := &Member{ID: "member-1", Name: "Test Member", Role: RoleDeveloper}
	team.AddMember(member)

	found, ok := team.GetMember("member-1")
	if !ok {
		t.Fatal("Member should be found")
	}

	if found.ID != "member-1" {
		t.Errorf("Expected ID 'member-1', got '%s'", found.ID)
	}

	// Test non-existent member
	_, ok = team.GetMember("non-existent")
	if ok {
		t.Error("Non-existent member should not be found")
	}
}

func TestTeamAddAgent(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)

	err := team.AddAgent(a)
	if err != nil {
		t.Fatalf("AddAgent failed: %v", err)
	}

	if len(team.Agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(team.Agents))
	}
}

func TestTeamAddDuplicateAgent(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)

	// First add should succeed
	err := team.AddAgent(a)
	if err != nil {
		t.Fatalf("First AddAgent failed: %v", err)
	}

	// Adding same agent again should fail
	err = team.AddAgent(a)
	if err == nil {
		t.Error("AddAgent should fail for duplicate agent")
	}
}

func TestTeamAddNilAgent(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	err := team.AddAgent(nil)
	if err == nil {
		t.Error("AddAgent should fail for nil agent")
	}
}

func TestTeamAddAgentLimit(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	team.Settings.MaxAgents = 1

	// Add first agent
	a1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	err := team.AddAgent(a1)
	if err != nil {
		t.Fatalf("AddAgent 1 failed: %v", err)
	}

	// Try to add second agent (should fail)
	a2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	err = team.AddAgent(a2)
	if err == nil {
		t.Error("AddAgent should fail when agent limit reached")
	}
}

func TestTeamRemoveAgent(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	team.AddAgent(a)

	team.RemoveAgent(a.ID)

	if len(team.Agents) != 0 {
		t.Errorf("Expected 0 agents, got %d", len(team.Agents))
	}
}

func TestTeamGetAgent(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	team.AddAgent(a)

	found, ok := team.GetAgent(a.ID)
	if !ok {
		t.Fatal("Agent should be found")
	}

	if found.ID != a.ID {
		t.Errorf("Expected ID '%s', got '%s'", a.ID, found.ID)
	}

	// Test non-existent agent
	_, ok = team.GetAgent(acp.AgentID("non-existent"))
	if ok {
		t.Error("Non-existent agent should not be found")
	}
}

func TestTeamCreateWorkspace(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	workspace, err := team.CreateWorkspace("Main Workspace", "/path/to/workspace")
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	if workspace.Name != "Main Workspace" {
		t.Errorf("Expected Name 'Main Workspace', got '%s'", workspace.Name)
	}

	if workspace.Path != "/path/to/workspace" {
		t.Errorf("Expected Path '/path/to/workspace', got '%s'", workspace.Path)
	}

	if workspace.TeamID != "team-1" {
		t.Errorf("Expected TeamID 'team-1', got '%s'", workspace.TeamID)
	}
}

func TestTeamGetWorkspace(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")
	workspace, _ := team.CreateWorkspace("Test Workspace", "/path")

	found, ok := team.GetWorkspace(workspace.ID)
	if !ok {
		t.Fatal("Workspace should be found")
	}

	if found.ID != workspace.ID {
		t.Errorf("Expected ID '%s', got '%s'", workspace.ID, found.ID)
	}

	// Test non-existent workspace
	_, ok = team.GetWorkspace("non-existent")
	if ok {
		t.Error("Non-existent workspace should not be found")
	}
}

func TestTeamListWorkspaces(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	// Create multiple workspaces
	for i := 0; i < 3; i++ {
		team.CreateWorkspace("Workspace", "/path")
	}

	workspaces := team.ListWorkspaces()
	if len(workspaces) != 3 {
		t.Errorf("Expected 3 workspaces, got %d", len(workspaces))
	}
}

func TestTeamGetStats(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	// Add members
	member1 := &Member{ID: "member-1", Name: "Member 1", Role: RoleDeveloper, Online: true}
	member2 := &Member{ID: "member-2", Name: "Member 2", Role: RoleDeveloper, Online: false}
	team.AddMember(member1)
	team.AddMember(member2)

	// Add agents
	a1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	team.AddAgent(a1)
	team.AddAgent(a2)

	// Create workspace
	team.CreateWorkspace("Test", "/path")

	stats := team.GetStats()

	if stats.MemberCount != 2 {
		t.Errorf("Expected MemberCount 2, got %d", stats.MemberCount)
	}

	if stats.OnlineMembers != 1 {
		t.Errorf("Expected OnlineMembers 1, got %d", stats.OnlineMembers)
	}

	if stats.AgentCount != 2 {
		t.Errorf("Expected AgentCount 2, got %d", stats.AgentCount)
	}

	if stats.WorkspaceCount != 1 {
		t.Errorf("Expected WorkspaceCount 1, got %d", stats.WorkspaceCount)
	}
}

// Manager tests

func TestNewManager(t *testing.T) {
	manager := NewManager()

	if manager == nil {
		t.Fatal("NewManager returned nil")
	}

	if manager.teams == nil {
		t.Error("teams map should be initialized")
	}
}

func TestManagerCreateTeam(t *testing.T) {
	manager := NewManager()

	team, err := manager.CreateTeam("Test Team", "owner-1")
	if err != nil {
		t.Fatalf("CreateTeam failed: %v", err)
	}

	if team.Name != "Test Team" {
		t.Errorf("Expected Name 'Test Team', got '%s'", team.Name)
	}

	if team.Owner != "owner-1" {
		t.Errorf("Expected Owner 'owner-1', got '%s'", team.Owner)
	}
}

func TestManagerGetTeam(t *testing.T) {
	manager := NewManager()
	team, _ := manager.CreateTeam("Test Team", "owner-1")

	found, ok := manager.GetTeam(team.ID)
	if !ok {
		t.Fatal("Team should be found")
	}

	if found.ID != team.ID {
		t.Errorf("Expected ID '%s', got '%s'", team.ID, found.ID)
	}

	// Test non-existent team
	_, ok = manager.GetTeam("non-existent")
	if ok {
		t.Error("Non-existent team should not be found")
	}
}

func TestManagerDeleteTeam(t *testing.T) {
	manager := NewManager()
	team, _ := manager.CreateTeam("Test Team", "owner-1")

	manager.DeleteTeam(team.ID)

	_, ok := manager.GetTeam(team.ID)
	if ok {
		t.Error("Team should be deleted")
	}
}

func TestManagerListTeams(t *testing.T) {
	manager := NewManager()

	// Create multiple teams
	for i := 0; i < 3; i++ {
		manager.CreateTeam("Team", "owner")
	}

	teams := manager.ListTeams()
	if len(teams) != 3 {
		t.Errorf("Expected 3 teams, got %d", len(teams))
	}
}

func TestManagerGetUserTeams(t *testing.T) {
	manager := NewManager()

	// Create teams with different members
	team1, _ := manager.CreateTeam("Team 1", "owner-1")
	_ = team1 // team1 is used via GetTeam below
	team3, _ := manager.CreateTeam("Team 3", "owner-3")

	// Add user-1 to team1 and team3
	team1.AddMember(&Member{ID: "user-1", Name: "User 1", Role: RoleDeveloper})
	team3.AddMember(&Member{ID: "user-1", Name: "User 1", Role: RoleDeveloper})

	userTeams := manager.GetUserTeams("user-1")
	if len(userTeams) != 2 {
		t.Errorf("Expected 2 teams for user-1, got %d", len(userTeams))
	}
}

func TestManagerAssignAgentToTeam(t *testing.T) {
	manager := NewManager()
	team, _ := manager.CreateTeam("Test Team", "owner-1")

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)

	err := manager.AssignAgentToTeam(team.ID, a)
	if err != nil {
		t.Fatalf("AssignAgentToTeam failed: %v", err)
	}

	if len(team.Agents) != 1 {
		t.Errorf("Expected 1 agent in team, got %d", len(team.Agents))
	}
}

func TestManagerAssignAgentToNonExistentTeam(t *testing.T) {
	manager := NewManager()
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)

	err := manager.AssignAgentToTeam("non-existent", a)
	if err == nil {
		t.Error("AssignAgentToTeam should fail for non-existent team")
	}
}

func TestManagerBroadcastToTeam(t *testing.T) {
	manager := NewManager()
	team, _ := manager.CreateTeam("Test Team", "owner-1")

	err := manager.BroadcastToTeam(team.ID, []byte(`{"type":"test"}`))
	if err != nil {
		t.Fatalf("BroadcastToTeam failed: %v", err)
	}
}

func TestManagerBroadcastToNonExistentTeam(t *testing.T) {
	manager := NewManager()

	err := manager.BroadcastToTeam("non-existent", []byte(`{}`))
	if err == nil {
		t.Error("BroadcastToTeam should fail for non-existent team")
	}
}

func TestManagerGetAllStats(t *testing.T) {
	manager := NewManager()

	// Create multiple teams
	for i := 0; i < 3; i++ {
		manager.CreateTeam("Team", "owner")
	}

	stats := manager.GetAllStats()
	if len(stats) != 3 {
		t.Errorf("Expected 3 stats, got %d", len(stats))
	}
}

// Workspace tests

func TestNewWorkspace(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test Workspace", "/path", "team-1")

	if ws.ID != "ws-1" {
		t.Errorf("Expected ID 'ws-1', got '%s'", ws.ID)
	}

	if ws.Name != "Test Workspace" {
		t.Errorf("Expected Name 'Test Workspace', got '%s'", ws.Name)
	}

	if ws.Path != "/path" {
		t.Errorf("Expected Path '/path', got '%s'", ws.Path)
	}

	if ws.TeamID != "team-1" {
		t.Errorf("Expected TeamID 'team-1', got '%s'", ws.TeamID)
	}
}

func TestWorkspaceUpdateFile(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	ws.UpdateFile("test.go", "user-1")

	state, ok := ws.Files["test.go"]
	if !ok {
		t.Fatal("File should be in Files map")
	}

	if state.Path != "test.go" {
		t.Errorf("Expected Path 'test.go', got '%s'", state.Path)
	}

	if state.ModifiedBy != "user-1" {
		t.Errorf("Expected ModifiedBy 'user-1', got '%s'", state.ModifiedBy)
	}
}

func TestWorkspaceLockFile(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Lock file
	err := ws.LockFile("test.go", "user-1")
	if err != nil {
		t.Fatalf("LockFile failed: %v", err)
	}

	state := ws.Files["test.go"]
	if state == nil {
		t.Fatal("File state should exist after locking")
	}
	if state.LockedBy != "user-1" {
		t.Errorf("Expected LockedBy 'user-1', got '%s'", state.LockedBy)
	}

	// Same user can lock again
	err = ws.LockFile("test.go", "user-1")
	if err != nil {
		t.Error("Same user should be able to re-lock")
	}

	// Different user cannot lock
	err = ws.LockFile("test.go", "user-2")
	if err == nil {
		t.Error("Different user should not be able to lock")
	}
}

func TestWorkspaceUnlockFile(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	ws.LockFile("test.go", "user-1")
	ws.UnlockFile("test.go", "user-1")

	state := ws.Files["test.go"]
	if state == nil {
		t.Fatal("File state should exist")
	}
	if state.LockedBy != "" {
		t.Errorf("Expected LockedBy to be empty, got '%s'", state.LockedBy)
	}

	// Other user cannot unlock
	ws.LockFile("test.go", "user-1")
	ws.UnlockFile("test.go", "user-2")

	state = ws.Files["test.go"]
	if state == nil {
		t.Fatal("File state should exist")
	}
	if state.LockedBy == "" {
		t.Error("Other user should not be able to unlock")
	}
}

func TestWorkspaceUpdateCursor(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	ws.UpdateCursor("user-1", "test.go", 10, 5, &Range{
		StartLine: 5, StartColumn: 0, EndLine: 15, EndColumn: 0,
	})

	cursor := ws.ActiveUsers["user-1"]
	if cursor == nil {
		t.Fatal("Cursor should be set")
	}

	if cursor.Line != 10 {
		t.Errorf("Expected Line 10, got %d", cursor.Line)
	}

	if cursor.Column != 5 {
		t.Errorf("Expected Column 5, got %d", cursor.Column)
	}
}

func TestWorkspaceRemoveCursor(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	ws.UpdateCursor("user-1", "test.go", 10, 5, nil)
	ws.RemoveCursor("user-1")

	if _, exists := ws.ActiveUsers["user-1"]; exists {
		t.Error("Cursor should be removed")
	}
}

func TestWorkspaceGetActiveCursors(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Add multiple cursors
	for i := 0; i < 3; i++ {
		ws.UpdateCursor("user-"+string(rune('1'+i)), "test.go", i*10, 0, nil)
	}

	cursors := ws.GetActiveCursors()
	if len(cursors) != 3 {
		t.Errorf("Expected 3 cursors, got %d", len(cursors))
	}
}

func TestWorkspaceCreateReview(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	review := ws.CreateReview("test.go", "reviewer-1")

	if review.File != "test.go" {
		t.Errorf("Expected File 'test.go', got '%s'", review.File)
	}

	if review.Author != "reviewer-1" {
		t.Errorf("Expected Author 'reviewer-1', got '%s'", review.Author)
	}

	if review.Status != ReviewPending {
		t.Errorf("Expected Status '%s', got '%s'", ReviewPending, review.Status)
	}
}

func TestWorkspaceAddReviewComment(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	review := ws.CreateReview("test.go", "reviewer-1")

	err := ws.AddReviewComment(review.ID, "commenter-1", 10, "This looks good")
	if err != nil {
		t.Fatalf("AddReviewComment failed: %v", err)
	}

	if len(review.Comments) != 1 {
		t.Errorf("Expected 1 comment, got %d", len(review.Comments))
	}

	comment := review.Comments[0]
	if comment.Line != 10 {
		t.Errorf("Expected Line 10, got %d", comment.Line)
	}

	if comment.Content != "This looks good" {
		t.Errorf("Expected Content 'This looks good', got '%s'", comment.Content)
	}
}

func TestWorkspaceAddReviewCommentNonExistent(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	err := ws.AddReviewComment("non-existent", "user-1", 10, "comment")
	if err == nil {
		t.Error("AddReviewComment should fail for non-existent review")
	}
}

func TestWorkspaceCompleteReview(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	review := ws.CreateReview("test.go", "reviewer-1")

	ws.CompleteReview(review.ID, ReviewApproved)

	if review.Status != ReviewApproved {
		t.Errorf("Expected Status '%s', got '%s'", ReviewApproved, review.Status)
	}

	if review.CompletedAt == nil {
		t.Error("CompletedAt should be set")
	}
}

func TestWorkspaceGetFileState(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	ws.UpdateFile("test.go", "user-1")

	state, ok := ws.GetFileState("test.go")
	if !ok {
		t.Fatal("File state should be found")
	}

	if state.Path != "test.go" {
		t.Errorf("Expected Path 'test.go', got '%s'", state.Path)
	}

	// Test non-existent file
	_, ok = ws.GetFileState("non-existent.go")
	if ok {
		t.Error("Non-existent file should not be found")
	}
}

// Concurrent access tests

func TestTeamConcurrentAccess(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	done := make(chan bool, 10)

	// Concurrent member additions
	for i := 0; i < 5; i++ {
		go func(idx int) {
			member := &Member{
				ID:   "member-" + string(rune('0'+idx)),
				Name: "Member",
				Role: RoleDeveloper,
			}
			team.AddMember(member)
			done <- true
		}(i)
	}

	// Concurrent member reads
	for i := 0; i < 5; i++ {
		go func() {
			team.GetMember("member-0")
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestManagerConcurrentAccess(t *testing.T) {
	manager := NewManager()
	done := make(chan bool, 10)

	// Concurrent team creation
	for i := 0; i < 5; i++ {
		go func() {
			manager.CreateTeam("Team", "owner")
			done <- true
		}()
	}

	// Concurrent team listing
	for i := 0; i < 5; i++ {
		go func() {
			manager.ListTeams()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestWorkspaceConcurrentAccess(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	done := make(chan bool, 10)

	// Concurrent file updates
	for i := 0; i < 5; i++ {
		go func(idx int) {
			ws.UpdateFile("test.go", "user-1")
			done <- true
		}(i)
	}

	// Concurrent cursor updates
	for i := 0; i < 5; i++ {
		go func(idx int) {
			ws.UpdateCursor("user-1", "test.go", idx, 0, nil)
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

// Member role tests

func TestMemberRoles(t *testing.T) {
	roles := []MemberRole{
		RoleOwner,
		RoleAdmin,
		RoleDeveloper,
		RoleReviewer,
		RoleObserver,
	}

	for _, role := range roles {
		if role == "" {
			t.Errorf("Role should not be empty")
		}
	}
}

// Review status tests

func TestReviewStatuses(t *testing.T) {
	statuses := []ReviewStatus{
		ReviewPending,
		ReviewApproved,
		ReviewRejected,
		ReviewChanges,
	}

	for _, status := range statuses {
		if status == "" {
			t.Errorf("Status should not be empty")
		}
	}
}

// ID generation tests

func TestGenerateTeamID(t *testing.T) {
	id1 := generateTeamID()
	time.Sleep(time.Millisecond)
	id2 := generateTeamID()

	if id1 == id2 {
		t.Error("Team IDs should be unique")
	}

	if len(id1) < 5 {
		t.Errorf("Team ID too short: %s", id1)
	}
}

func TestGenerateWorkspaceID(t *testing.T) {
	id1 := generateWorkspaceID()
	time.Sleep(time.Millisecond)
	id2 := generateWorkspaceID()

	if id1 == id2 {
		t.Error("Workspace IDs should be unique")
	}
}

func TestGenerateReviewID(t *testing.T) {
	id1 := generateReviewID()
	time.Sleep(time.Millisecond)
	id2 := generateReviewID()

	if id1 == id2 {
		t.Error("Review IDs should be unique")
	}
}

func TestGenerateCommentID(t *testing.T) {
	id1 := generateCommentID()
	time.Sleep(time.Millisecond)
	id2 := generateCommentID()

	if id1 == id2 {
		t.Error("Comment IDs should be unique")
	}
}

// Edge case tests

func TestTeamAddNilMember(t *testing.T) {
	team := NewTeam("team-1", "Test Team", "owner-1")

	err := team.AddMember(nil)
	if err == nil {
		t.Error("AddMember should fail for nil member")
	}
}

func TestManagerAssignNilAgentToTeam(t *testing.T) {
	manager := NewManager()
	team, _ := manager.CreateTeam("Test Team", "owner-1")

	err := manager.AssignAgentToTeam(team.ID, nil)
	if err == nil {
		t.Error("AssignAgentToTeam should fail for nil agent")
	}
}

// Workspace edge case tests

func TestWorkspaceUpdateFileEmptyPath(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty path should be ignored
	ws.UpdateFile("", "user-1")

	if len(ws.Files) != 0 {
		t.Errorf("Expected 0 files after empty path update, got %d", len(ws.Files))
	}
}

func TestWorkspaceLockFileEmptyPath(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty path should fail
	err := ws.LockFile("", "user-1")
	if err == nil {
		t.Error("LockFile should fail for empty path")
	}
}

func TestWorkspaceLockFileEmptyUserID(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty userID should fail
	err := ws.LockFile("test.go", "")
	if err == nil {
		t.Error("LockFile should fail for empty userID")
	}
}

func TestWorkspaceCreateReviewEmptyFile(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty file should return nil
	review := ws.CreateReview("", "reviewer-1")
	if review != nil {
		t.Error("CreateReview should return nil for empty file")
	}
}

func TestWorkspaceCreateReviewEmptyAuthor(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty author should return nil
	review := ws.CreateReview("test.go", "")
	if review != nil {
		t.Error("CreateReview should return nil for empty author")
	}
}

func TestWorkspaceAddReviewCommentEmptyReviewID(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")

	// Empty reviewID should fail
	err := ws.AddReviewComment("", "author", 10, "content")
	if err == nil {
		t.Error("AddReviewComment should fail for empty reviewID")
	}
}

func TestWorkspaceAddReviewCommentEmptyAuthor(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	review := ws.CreateReview("test.go", "reviewer-1")

	// Empty author should fail
	err := ws.AddReviewComment(review.ID, "", 10, "content")
	if err == nil {
		t.Error("AddReviewComment should fail for empty author")
	}
}

func TestWorkspaceAddReviewCommentEmptyContent(t *testing.T) {
	ws := NewWorkspace("ws-1", "Test", "/path", "team-1")
	review := ws.CreateReview("test.go", "reviewer-1")

	// Empty content should fail
	err := ws.AddReviewComment(review.ID, "author", 10, "")
	if err == nil {
		t.Error("AddReviewComment should fail for empty content")
	}
}
