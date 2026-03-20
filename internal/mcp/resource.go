// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"context"
	"sync"
	"time"
)

// Resource represents an MCP resource
type Resource struct {
	URI         string            `json:"uri"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	MimeType    string            `json:"mimeType"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// ResourceContent represents the content of a resource
type ResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text,omitempty"`
	Blob     []byte `json:"blob,omitempty"`
}

// ResourceTemplate represents a resource template
type ResourceTemplate struct {
	URITemplate string            `json:"uriTemplate"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	MimeType    string            `json:"mimeType"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// ResourceHandler handles resource operations
type ResourceHandler interface {
	// List returns available resources
	List(ctx context.Context, cursor string) ([]Resource, string, error)
	// Read reads a resource by URI
	Read(ctx context.Context, uri string) (*ResourceContent, error)
	// Subscribe subscribes to resource updates (optional)
	Subscribe(ctx context.Context, uri string) (<-chan ResourceUpdate, error)
}

// ResourceUpdate represents a resource update notification
type ResourceUpdate struct {
	URI     string    `json:"uri"`
	Updated time.Time `json:"updated"`
}

// ResourceManager manages MCP resources
type ResourceManager struct {
	mu         sync.RWMutex
	resources  map[string]*Resource
	templates  map[string]*ResourceTemplate
	handlers   map[string]ResourceHandler
	subscribers map[string][]chan ResourceUpdate
}

// NewResourceManager creates a new resource manager
func NewResourceManager() *ResourceManager {
	return &ResourceManager{
		resources:   make(map[string]*Resource),
		templates:   make(map[string]*ResourceTemplate),
		handlers:    make(map[string]ResourceHandler),
		subscribers: make(map[string][]chan ResourceUpdate),
	}
}

// RegisterResource registers a static resource
func (rm *ResourceManager) RegisterResource(resource *Resource) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rm.resources[resource.URI] = resource
	return nil
}

// UnregisterResource removes a resource
func (rm *ResourceManager) UnregisterResource(uri string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	delete(rm.resources, uri)
}

// RegisterTemplate registers a resource template
func (rm *ResourceManager) RegisterTemplate(template *ResourceTemplate) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rm.templates[template.URITemplate] = template
	return nil
}

// RegisterHandler registers a resource handler for a URI pattern
func (rm *ResourceManager) RegisterHandler(uriPattern string, handler ResourceHandler) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	rm.handlers[uriPattern] = handler
}

// ListResources lists all available resources
func (rm *ResourceManager) ListResources(ctx context.Context, cursor string) ([]Resource, string, error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	// Collect static resources
	resources := make([]Resource, 0, len(rm.resources))
	for _, r := range rm.resources {
		resources = append(resources, *r)
	}

	// Collect resources from handlers
	for _, handler := range rm.handlers {
		handlerResources, nextCursor, err := handler.List(ctx, cursor)
		if err != nil {
			continue
		}
		resources = append(resources, handlerResources...)
		if nextCursor != "" {
			cursor = nextCursor
		}
	}

	return resources, cursor, nil
}

// ListTemplates lists all resource templates
func (rm *ResourceManager) ListTemplates() []ResourceTemplate {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	templates := make([]ResourceTemplate, 0, len(rm.templates))
	for _, t := range rm.templates {
		templates = append(templates, *t)
	}
	return templates
}

// ReadResource reads a resource by URI
func (rm *ResourceManager) ReadResource(ctx context.Context, uri string) (*ResourceContent, error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	// Check static resources first
	if resource, ok := rm.resources[uri]; ok {
		return &ResourceContent{
			URI:      uri,
			MimeType: resource.MimeType,
		}, nil
	}

	// Try handlers
	for pattern, handler := range rm.handlers {
		if matchesPattern(uri, pattern) {
			return handler.Read(ctx, uri)
		}
	}

	return nil, ErrResourceNotFound
}

// Subscribe subscribes to resource updates
func (rm *ResourceManager) Subscribe(ctx context.Context, uri string) (<-chan ResourceUpdate, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	ch := make(chan ResourceUpdate, 10)
	rm.subscribers[uri] = append(rm.subscribers[uri], ch)

	// Start handler subscription if available
	for pattern, handler := range rm.handlers {
		if matchesPattern(uri, pattern) {
			if subHandler, ok := handler.(interface {
				Subscribe(context.Context, string) (<-chan ResourceUpdate, error)
			}); ok {
				handlerCh, err := subHandler.Subscribe(ctx, uri)
				if err == nil {
					go func() {
						for update := range handlerCh {
							rm.notifySubscribers(update)
						}
					}()
				}
			}
		}
	}

	return ch, nil
}

// notifySubscribers notifies all subscribers of a resource update
func (rm *ResourceManager) notifySubscribers(update ResourceUpdate) {
	rm.mu.RLock()
	subscribers := rm.subscribers[update.URI]
	rm.mu.RUnlock()

	for _, ch := range subscribers {
		select {
		case ch <- update:
		default:
			// Channel full, skip
		}
	}
}

// matchesPattern checks if a URI matches a pattern
func matchesPattern(uri, pattern string) bool {
	// Simple prefix matching for now
	// TODO: Implement proper URI template matching
	return len(uri) >= len(pattern) && uri[:len(pattern)] == pattern
}

// ErrResourceNotFound indicates resource not found
var ErrResourceNotFound = &MCPError{Code: -4, Message: "resource not found"}

// FileResourceHandler is a handler for file-based resources
type FileResourceHandler struct {
	basePath string
}

// NewFileResourceHandler creates a file resource handler
func NewFileResourceHandler(basePath string) *FileResourceHandler {
	return &FileResourceHandler{basePath: basePath}
}

// List implements ResourceHandler
func (h *FileResourceHandler) List(ctx context.Context, cursor string) ([]Resource, string, error) {
	// TODO: Implement file listing
	return []Resource{}, "", nil
}

// Read implements ResourceHandler
func (h *FileResourceHandler) Read(ctx context.Context, uri string) (*ResourceContent, error) {
	// TODO: Implement file reading
	return nil, ErrResourceNotFound
}
