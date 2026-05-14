package swarm

import (
	"testing"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m,
		// ConsensusEngine.checkTimeouts spawns goroutines for timeout checking
		// that may not complete before test ends (harmless - they will be GC'd)
		goleak.IgnoreAnyFunction("github.com/swarm-editor/swarm-editor/internal/swarm.(*ConsensusEngine).checkTimeouts.func3"),
		// ScheduleRunner.executeSchedule runs in background and may sleep
		goleak.IgnoreAnyFunction("github.com/swarm-editor/swarm-editor/internal/swarm.(*ScheduleRunner).executeSchedule"),
	)
}
