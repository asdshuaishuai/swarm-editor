// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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
	mu          sync.RWMutex
	resources   map[string]*Resource
	templates   map[string]*ResourceTemplate
	handlers    map[string]ResourceHandler
	subscribers map[string][]chan ResourceUpdate
	wg          sync.WaitGroup // tracks Subscribe goroutines
}

// maxSubscribersPerURI limits the number of subscribers per URI to prevent unbounded growth
const maxSubscribersPerURI = 50

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

	if len(rm.subscribers[uri]) >= maxSubscribersPerURI {
		return nil, fmt.Errorf("max subscribers (%d) reached for uri %q", maxSubscribersPerURI, uri)
	}

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
					rm.wg.Add(1)
					go func() {
						defer rm.wg.Done()
						defer func() {
							if r := recover(); r != nil {
								log.Printf("[MCP] Subscribe goroutine panic for uri %s: %v", uri, r)
							}
						}()
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

// Unsubscribe removes a subscription and closes the channel
func (rm *ResourceManager) Unsubscribe(uri string, ch <-chan ResourceUpdate) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	subscribers := rm.subscribers[uri]
	for i, subCh := range subscribers {
		if subCh == ch {
			// Remove this subscriber
			rm.subscribers[uri] = append(subscribers[:i], subscribers[i+1:]...)
			close(subCh)
			// Clean up empty subscriber lists
			if len(rm.subscribers[uri]) == 0 {
				delete(rm.subscribers, uri)
			}
			return
		}
	}
}

// Close closes all subscribers and cleans up resources
func (rm *ResourceManager) Close() {
	rm.mu.Lock()
	// Close all subscriber channels
	for uri, subscribers := range rm.subscribers {
		for _, ch := range subscribers {
			close(ch)
		}
		delete(rm.subscribers, uri)
	}
	rm.mu.Unlock()

	// Wait for all Subscribe goroutines to finish
	rm.wg.Wait()
}

// notifySubscribers notifies all subscribers of a resource update
func (rm *ResourceManager) notifySubscribers(update ResourceUpdate) {
	rm.mu.RLock()
	// Make a copy of the subscribers slice to avoid TOCTOU race
	subscribers := make([]chan ResourceUpdate, len(rm.subscribers[update.URI]))
	copy(subscribers, rm.subscribers[update.URI])
	rm.mu.RUnlock()

	for _, ch := range subscribers {
		select {
		case ch <- update:
		default:
			// Channel full, skip
		}
	}
}

// matchesPattern checks if a URI matches a URI template pattern
// Supports basic RFC 6570 URI Template patterns like:
// - {scheme}://{prefix}/{id}
// - {scheme}://{prefix}/{+path}
// - {scheme}://{+id}
// Also supports simple prefix matching for patterns ending with "/"
func matchesPattern(uri, pattern string) bool {
	// Simple exact match
	if uri == pattern {
		return true
	}

	// Handle prefix matching for patterns ending with "/" (scheme-only patterns)
	// e.g., "http://" matches "http://example.com"
	if strings.HasSuffix(pattern, "://") || strings.HasSuffix(pattern, "/") {
		return strings.HasPrefix(uri, pattern)
	}

	// Check for prefix match with variable parts
	if len(pattern) == 0 || len(uri) == 0 {
		return false
	}

	// Extract the scheme if present
	patternScheme := ""
	if idx := strings.Index(pattern, "://"); idx > 0 {
		patternScheme = pattern[:idx+3]
	}

	uriScheme := ""
	if idx := strings.Index(uri, "://"); idx > 0 {
		uriScheme = uri[:idx+3]
	}

	// Schemes must match
	if patternScheme != "" && uriScheme != "" && patternScheme != uriScheme {
		return false
	}

	// For patterns with {variable}, we do simple matching up to the variable
	// Example: file:///project/{id} should match file:///project/anything
	patternParts := strings.Split(pattern, "/")
	uriParts := strings.Split(uri, "/")

	if len(patternParts) > len(uriParts) {
		return false
	}

	for i := range len(patternParts) {
		pp := patternParts[i]
		up := uriParts[i]

		// Check for variable placeholders
		if strings.HasPrefix(pp, "{") && strings.HasSuffix(pp, "}") {
			// This is a variable, it matches anything
			continue
		}

		// Literal parts must match exactly
		if pp != up {
			return false
		}
	}

	return true
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
	var resources []Resource

	// Read the directory
	entries, err := os.ReadDir(h.basePath)
	if err != nil {
		return nil, "", err
	}

	// Convert entries to resources
	for _, entry := range entries {
		name := entry.Name()
		fullPath := filepath.Join(h.basePath, name)

		resource := Resource{
			URI:  "file://" + fullPath,
			Name: name,
		}

		// Determine MIME type based on extension
		ext := strings.ToLower(filepath.Ext(name))
		switch ext {
		case ".txt", ".md":
			resource.MimeType = "text/plain"
		case ".json":
			resource.MimeType = "application/json"
		case ".yaml", ".yml":
			resource.MimeType = "application/x-yaml"
		case ".go":
			resource.MimeType = "text/x-go"
		case ".js":
			resource.MimeType = "text/javascript"
		case ".ts":
			resource.MimeType = "text/typescript"
		case ".py":
			resource.MimeType = "text/x-python"
		case ".html":
			resource.MimeType = "text/html"
		case ".css":
			resource.MimeType = "text/css"
		default:
			if entry.IsDir() {
				resource.MimeType = "application/x-directory"
			} else {
				resource.MimeType = "application/octet-stream"
			}
		}

		if entry.IsDir() {
			resource.Description = "Directory: " + name
		} else {
			resource.Description = "File: " + name
		}

		resources = append(resources, resource)
	}

	// Pagination not implemented - return all results
	return resources, "", nil
}

// Read implements ResourceHandler
func (h *FileResourceHandler) Read(ctx context.Context, uri string) (*ResourceContent, error) {
	// Parse the file:// URI
	if !strings.HasPrefix(uri, "file://") {
		return nil, ErrResourceNotFound
	}

	// Extract the file path from URI
	filePath := strings.TrimPrefix(uri, "file://")

	// Security check: ensure the path is within basePath
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	absPath, err := filepath.EvalSymlinks(filePath)
	if err != nil {
		return nil, ErrResourceNotFound
	}

	baseAbs, err := filepath.EvalSymlinks(h.basePath)
	if err != nil {
		return nil, ErrResourceNotFound
	}

	// Ensure the requested file is within the base path
	// Use baseAbs+separator to prevent "/data" matching "/data_backup/..."
	if !strings.HasPrefix(absPath, baseAbs+string(filepath.Separator)) && absPath != baseAbs {
		return nil, ErrResourceNotFound
	}

	// Read the file
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, ErrResourceNotFound
	}

	// Determine MIME type
	ext := strings.ToLower(filepath.Ext(absPath))
	mimeType := "application/octet-stream"
	switch ext {
	case ".txt", ".md":
		mimeType = "text/plain"
	case ".json":
		mimeType = "application/json"
	case ".yaml", ".yml":
		mimeType = "application/x-yaml"
	case ".go":
		mimeType = "text/x-go"
	case ".js":
		mimeType = "text/javascript"
	case ".ts":
		mimeType = "text/typescript"
	case ".py":
		mimeType = "text/x-python"
	case ".html":
		mimeType = "text/html"
	case ".css":
		mimeType = "text/css"
	}

	// Check if it's a text file
	isText := strings.HasPrefix(mimeType, "text/") ||
		mimeType == "application/json" ||
		mimeType == "application/x-yaml"

	if isText {
		return &ResourceContent{
			URI:      uri,
			MimeType: mimeType,
			Text:     string(content),
		}, nil
	}

	// Binary file - return as blob
	return &ResourceContent{
		URI:      uri,
		MimeType: mimeType,
		Blob:     content,
	}, nil
}
