package api

import (
"context"
"encoding/json"
)

func (h *CommandHandler) handleGetWorkspace(_ context.Context, _ json.RawMessage) (any, error) {
	return map[string]string{"path": h.server.workspacePath}, nil
}

