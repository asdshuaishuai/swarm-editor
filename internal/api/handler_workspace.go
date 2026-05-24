package api

import (
	"context"
	"encoding/json"
	"strings"
)

func (h *CommandHandler) handleGetWorkspace(_ context.Context, _ json.RawMessage) (any, error) {
	return map[string]string{"path": h.server.workspacePath}, nil
}

func (h *CommandHandler) handleSetWorkspace(_ context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Path == "" {
		return nil, errValidation("path is required")
	}
	req.Path = strings.TrimSpace(req.Path)
	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	h.server.SetWorkspace(req.Path)

	return map[string]string{"path": req.Path}, nil
}
