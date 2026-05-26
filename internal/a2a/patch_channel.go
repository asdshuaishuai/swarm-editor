package a2a

import (
	"encoding/json"
	"fmt"
	"time"
)

// MessageTypeCodePatch is the dedicated A2A message type for in-memory
// code patch transfer between agents (Design Doc Section 5: A2A peer
// transport bypasses disk for agent-to-agent handoff).
const MessageTypeCodePatch MessageType = "code_patch"

// MessageTypeCodePatchAck signals receipt and outcome of a patch transfer.
const MessageTypeCodePatchAck MessageType = "code_patch_ack"

// CodePatchPayload carries a code change between agents. The receiver
// applies it to its own shadow buffer (Design Doc Section 7) without
// touching disk until a separate Commit decision.
type CodePatchPayload struct {
	PatchID    string `json:"patchId"`
	Path       string `json:"path"`
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
	Language   string `json:"language,omitempty"` // hint for AST diff
	Reason     string `json:"reason,omitempty"`   // why this patch exists
}

// CodePatchAckPayload is sent back after a code_patch is processed.
type CodePatchAckPayload struct {
	PatchID  string `json:"patchId"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

// NewCodePatchMessage constructs an A2A message carrying a code patch.
// from/to are agent IDs. patch is the change to transfer.
func NewCodePatchMessage(from, to string, patch CodePatchPayload) *Message {
	msg := NewMessage(MessageTypeCodePatch, from, to)
	msg.Subject = fmt.Sprintf("patch:%s", patch.Path)
	msg.Priority = PriorityHigh // patches are time-sensitive handoffs
	msg.WithPayload(patch)
	msg.WithTTL(2 * time.Minute) // expire if not delivered quickly
	return msg
}

// NewCodePatchAckMessage builds the ack response for a delivered patch.
func NewCodePatchAckMessage(from, to string, ack CodePatchAckPayload) *Message {
	msg := NewMessage(MessageTypeCodePatchAck, from, to)
	msg.Priority = PriorityHigh
	msg.WithPayload(ack)
	return msg
}

// ParseCodePatchPayload extracts the patch payload from a message.
func ParseCodePatchPayload(msg *Message) (*CodePatchPayload, error) {
	if msg == nil {
		return nil, fmt.Errorf("nil message")
	}
	if msg.Type != MessageTypeCodePatch {
		return nil, fmt.Errorf("message type is %s, not code_patch", msg.Type)
	}
	if len(msg.Payload) == 0 {
		return nil, fmt.Errorf("empty payload")
	}
	var p CodePatchPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	if p.Path == "" {
		return nil, fmt.Errorf("payload missing path")
	}
	return &p, nil
}

// ParseCodePatchAckPayload extracts the ack payload.
func ParseCodePatchAckPayload(msg *Message) (*CodePatchAckPayload, error) {
	if msg == nil {
		return nil, fmt.Errorf("nil message")
	}
	if msg.Type != MessageTypeCodePatchAck {
		return nil, fmt.Errorf("message type is %s, not code_patch_ack", msg.Type)
	}
	if len(msg.Payload) == 0 {
		return nil, fmt.Errorf("empty payload")
	}
	var p CodePatchAckPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	return &p, nil
}

// SendCodePatch is a convenience wrapper to send a patch via the router.
// It returns the message ID assigned to the transfer.
func SendCodePatch(r *Router, from, to string, patch CodePatchPayload) (string, error) {
	if r == nil {
		return "", fmt.Errorf("nil router")
	}
	if from == "" || to == "" {
		return "", fmt.Errorf("from and to required")
	}
	if patch.Path == "" {
		return "", fmt.Errorf("patch path required")
	}
	msg := NewCodePatchMessage(from, to, patch)
	if err := r.Send(msg); err != nil {
		return "", err
	}
	return msg.ID, nil
}
