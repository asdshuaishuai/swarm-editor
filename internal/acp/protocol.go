// Package acp implements the Agent Client Protocol (ACP) as defined by JetBrains.
// ACP is a JSON-RPC 2.0 based protocol for communication between code editors and AI agents.
package acp

import (
	"encoding/json"
	"fmt"
)

// ProtocolVersion is the current ACP protocol version
const ProtocolVersion = 1

// JSONRPCVersion is the JSON-RPC version used
const JSONRPCVersion = "2.0"

// Message represents a JSON-RPC 2.0 message
type Message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *RequestID      `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
}

// RequestID represents a JSON-RPC request ID (can be number or string)
type RequestID struct {
	Number int64
	String string
	IsNum  bool
}

func (id *RequestID) MarshalJSON() ([]byte, error) {
	if id.IsNum {
		return json.Marshal(id.Number)
	}
	return json.Marshal(id.String)
}

func (id *RequestID) UnmarshalJSON(data []byte) error {
	// Try number first
	var num int64
	if err := json.Unmarshal(data, &num); err == nil {
		id.Number = num
		id.IsNum = true
		return nil
	}
	// Try string
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return err
	}
	id.String = str
	id.IsNum = false
	return nil
}

// Error represents a JSON-RPC error
type Error struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("ACP error %d: %s", e.Code, e.Message)
}

// Standard JSON-RPC error codes
const (
	ParseError     = -32700
	InvalidRequest = -32600
	MethodNotFound = -32601
	InvalidParams  = -32602
	InternalError  = -32603
)

// Custom ACP error codes (range -32000 to -32099)
const (
	ErrSessionNotFound        = -32001
	ErrAgentNotReady          = -32002
	ErrPermissionDenied       = -32003
	ErrToolExecution          = -32004
	ErrAuthentication         = -32005
	ErrSessionCancelled       = -32006
	ErrCapabilityNotSupported = -32007
)

// Sentinel errors
var (
	// ErrNoConnection is returned when trying to execute without an ACP connection
	ErrNoConnection = fmt.Errorf("no ACP connection available")
)

// NewRequest creates a new JSON-RPC request
func NewRequest(id *RequestID, method string, params any) (*Message, error) {
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	return &Message{
		JSONRPC: JSONRPCVersion,
		ID:      id,
		Method:  method,
		Params:  paramsJSON,
	}, nil
}

// NewResponse creates a new JSON-RPC response
func NewResponse(id *RequestID, result any) (*Message, error) {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	return &Message{
		JSONRPC: JSONRPCVersion,
		ID:      id,
		Result:  resultJSON,
	}, nil
}

// NewErrorResponse creates a new JSON-RPC error response
// Note: data marshal errors are logged but not propagated to avoid
// masking the original error being reported
func NewErrorResponse(id *RequestID, code int, message string, data any) *Message {
	var dataJSON json.RawMessage
	if data != nil {
		d, err := json.Marshal(data)
		if err != nil {
			// Log marshal error but continue - don't mask the original error
			// by failing to create the error response
			dataJSON = json.RawMessage(fmt.Sprintf(`{"marshal_error":%q}`, err.Error()))
		} else {
			dataJSON = d
		}
	}
	return &Message{
		JSONRPC: JSONRPCVersion,
		ID:      id,
		Error: &Error{
			Code:    code,
			Message: message,
			Data:    dataJSON,
		},
	}
}

// NewNotification creates a new JSON-RPC notification
func NewNotification(method string, params any) (*Message, error) {
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	return &Message{
		JSONRPC: JSONRPCVersion,
		Method:  method,
		Params:  paramsJSON,
	}, nil
}
