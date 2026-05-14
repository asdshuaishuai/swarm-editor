package api

import (
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// TestEmergenceService_CollectHealthMetrics_CollaborationIdxNegative covers
// the CollaborationIdx < 0 clamp branch by directly incrementing worker load
// to make avgLoad > totalWorkers.
func TestEmergenceService_CollectHealthMetrics_CollaborationIdxNegative(t *testing.T) {
	connMgr := acp.NewConnectionManager(nil)
	scheduler := swarm.NewScheduler(swarm.SchedulerConfig{}, connMgr)

	// Add a single worker
	worker := &swarm.AgentInfo{ID: "w1", MaxConcurrent: 100}
	scheduler.AddWorker(worker)

	// Increment load to exceed totalWorkers count (1 worker, need load > 1)
	// This simulates having more running tasks than workers
	worker.IncrementLoad()
	worker.IncrementLoad()
	worker.IncrementLoad()

	svc := NewEmergenceService(nil, scheduler, nil)
	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil")
	}

	stats := scheduler.GetStats()
	t.Logf("AvgLoad=%.2f, TotalWorkers=%d, CollaborationIdx=%.4f",
		stats.AverageLoad, stats.TotalWorkers, data.Health.CollaborationIdx)

	// With 1 worker and load=3: CollaborationIdx = 1.0 - 3.0/1.0 = -2.0
	// This should be clamped to 0
	if data.Health.CollaborationIdx != 0 {
		t.Errorf("CollaborationIdx should be 0 (clamped from negative), got %.4f", data.Health.CollaborationIdx)
	}

	// Verify it was actually negative before clamping
	if stats.AverageLoad > float64(stats.TotalWorkers) {
		t.Logf("Confirmed: avgLoad (%.2f) > totalWorkers (%d), so CollaborationIdx was negative before clamp",
			stats.AverageLoad, stats.TotalWorkers)
	}
}
