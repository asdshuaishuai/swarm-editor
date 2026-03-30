package mcp

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestNewResourceManager(t *testing.T) {
	rm := NewResourceManager()
	if rm == nil {
		t.Fatal("NewResourceManager returned nil")
	}
	if rm.resources == nil {
		t.Error("resources map not initialized")
	}
	if rm.templates == nil {
		t.Error("templates map not initialized")
	}
}

func TestRegisterResource(t *testing.T) {
	rm := NewResourceManager()
	resource := &Resource{
		URI:         "file:///test.txt",
		Name:        "Test File",
		Description: "A test file",
		MimeType:    "text/plain",
	}

	err := rm.RegisterResource(resource)
	if err != nil {
		t.Errorf("RegisterResource failed: %v", err)
	}

	if len(rm.resources) != 1 {
		t.Errorf("expected 1 resource, got %d", len(rm.resources))
	}
}

func TestUnregisterResource(t *testing.T) {
	rm := NewResourceManager()
	resource := &Resource{
		URI:      "file:///test.txt",
		Name:     "Test",
		MimeType: "text/plain",
	}

	if err := rm.RegisterResource(resource); err != nil {
		t.Fatalf("RegisterResource failed: %v", err)
	}
	rm.UnregisterResource("file:///test.txt")

	if len(rm.resources) != 0 {
		t.Errorf("expected 0 resources, got %d", len(rm.resources))
	}
}

func TestListResources(t *testing.T) {
	rm := NewResourceManager()
	rm.RegisterResource(&Resource{URI: "file:///a.txt", Name: "A"})
	rm.RegisterResource(&Resource{URI: "file:///b.txt", Name: "B"})

	resources, _, err := rm.ListResources(context.Background(), "")
	if err != nil {
		t.Errorf("ListResources failed: %v", err)
	}

	if len(resources) != 2 {
		t.Errorf("expected 2 resources, got %d", len(resources))
	}
}

func TestRegisterTemplate(t *testing.T) {
	rm := NewResourceManager()
	template := &ResourceTemplate{
		URITemplate: "file:///{path}",
		Name:        "File Template",
	}

	err := rm.RegisterTemplate(template)
	if err != nil {
		t.Errorf("RegisterTemplate failed: %v", err)
	}

	templates := rm.ListTemplates()
	if len(templates) != 1 {
		t.Errorf("expected 1 template, got %d", len(templates))
	}
}

func TestMatchesPattern(t *testing.T) {
	tests := []struct {
		uri     string
		pattern string
		want    bool
	}{
		// Exact match
		{"file:///test.txt", "file:///test.txt", true},
		// Prefix matching (scheme + ://)
		{"file:///test.txt", "file:///", true},
		{"http://example.com", "http://", true},
		{"file:///test.txt", "http://", false},
		{"custom://resource", "custom://", true},
		// Prefix matching (trailing /)
		{"db://users/123", "db://users/", true},
		{"db://users", "db://users/", false},
		// Variable patterns (variables match single segment, but extra URI segments allowed)
		{"file:///project/abc", "file:///project/{id}", true},
		{"file:///project/abc/def", "file:///project/{id}", true}, // extra segments allowed
		{"http://api.com/v1/resource", "http://api.com/v1/{resource}", true},
		// Scheme mismatch
		{"http://example.com", "file:///project/{id}", false},
		// Empty inputs
		{"", "", true},
		{"file:///test", "", false},
		{"", "file:///test", false},
		// Multiple variables
		{"http://api.com/users/123/posts/456", "http://api.com/users/{userId}/posts/{postId}", true},
		// Extra URI segments allowed
		{"http://api.com/v1/resource/extra", "http://api.com/v1/{resource}", true},
	}

	for _, tt := range tests {
		got := matchesPattern(tt.uri, tt.pattern)
		if got != tt.want {
			t.Errorf("matchesPattern(%q, %q) = %v, want %v", tt.uri, tt.pattern, got, tt.want)
		}
	}
}

func TestFileResourceHandler(t *testing.T) {
	handler := NewFileResourceHandler("/tmp")

	resources, _, err := handler.List(context.Background(), "")
	if err != nil {
		t.Errorf("List failed: %v", err)
	}
	if resources == nil {
		t.Error("List returned nil resources")
	}

	_, err = handler.Read(context.Background(), "file:///nonexistent")
	if err != ErrResourceNotFound {
		t.Errorf("expected ErrResourceNotFound, got %v", err)
	}
}

// mockResourceHandler implements ResourceHandler for testing
type mockResourceHandler struct {
	listFn    func(ctx context.Context, cursor string) ([]Resource, string, error)
	readFn    func(ctx context.Context, uri string) (*ResourceContent, error)
	subscribe func(ctx context.Context, uri string) (<-chan ResourceUpdate, error)
}

func (m *mockResourceHandler) List(ctx context.Context, cursor string) ([]Resource, string, error) {
	return m.listFn(ctx, cursor)
}
func (m *mockResourceHandler) Read(ctx context.Context, uri string) (*ResourceContent, error) {
	return m.readFn(ctx, uri)
}
func (m *mockResourceHandler) Subscribe(ctx context.Context, uri string) (<-chan ResourceUpdate, error) {
	if m.subscribe != nil {
		return m.subscribe(ctx, uri)
	}
	return nil, fmt.Errorf("subscribe not supported")
}

func TestResourceManager_RegisterHandler(t *testing.T) {
	rm := NewResourceManager()
	handler := &mockResourceHandler{
		listFn: func(ctx context.Context, cursor string) ([]Resource, string, error) {
			return []Resource{{URI: "custom://res", Name: "R"}}, "", nil
		},
		readFn: func(ctx context.Context, uri string) (*ResourceContent, error) {
			return &ResourceContent{URI: uri, MimeType: "text/plain", Text: "hello"}, nil
		},
	}
	rm.RegisterHandler("custom://", handler)

	// ListResources should include handler resources
	resources, _, err := rm.ListResources(context.Background(), "")
	if err != nil {
		t.Fatalf("ListResources: %v", err)
	}
	found := false
	for _, r := range resources {
		if r.URI == "custom://res" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected handler resource in list")
	}
}

func TestResourceManager_ReadResource_Static(t *testing.T) {
	rm := NewResourceManager()
	rm.RegisterResource(&Resource{URI: "file:///test.txt", MimeType: "text/plain"})

	content, err := rm.ReadResource(context.Background(), "file:///test.txt")
	if err != nil {
		t.Fatalf("ReadResource: %v", err)
	}
	if content.URI != "file:///test.txt" {
		t.Errorf("expected URI file:///test.txt, got %s", content.URI)
	}
}

func TestResourceManager_ReadResource_Handler(t *testing.T) {
	rm := NewResourceManager()
	rm.RegisterHandler("custom://", &mockResourceHandler{
		readFn: func(ctx context.Context, uri string) (*ResourceContent, error) {
			return &ResourceContent{URI: uri, MimeType: "application/json", Text: `{"ok":true}`}, nil
		},
	})

	content, err := rm.ReadResource(context.Background(), "custom://data")
	if err != nil {
		t.Fatalf("ReadResource handler: %v", err)
	}
	if content.Text != `{"ok":true}` {
		t.Errorf("expected JSON content, got %s", content.Text)
	}
}

func TestResourceManager_ReadResource_NotFound(t *testing.T) {
	rm := NewResourceManager()

	_, err := rm.ReadResource(context.Background(), "nonexistent://x")
	if err != ErrResourceNotFound {
		t.Errorf("expected ErrResourceNotFound, got %v", err)
	}
}

func TestResourceManager_Subscribe_Unsubscribe(t *testing.T) {
	rm := NewResourceManager()

	ch, err := rm.Subscribe(context.Background(), "file:///test.txt")
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}

	// Send a notification
	rm.notifySubscribers(ResourceUpdate{URI: "file:///test.txt", Updated: time.Now()})

	select {
	case update := <-ch:
		if update.URI != "file:///test.txt" {
			t.Errorf("expected URI file:///test.txt, got %s", update.URI)
		}
	default:
		t.Error("expected to receive update on subscriber channel")
	}

	// Unsubscribe
	rm.Unsubscribe("file:///test.txt", ch)

	// Verify channel is closed
	_, ok := <-ch
	if ok {
		t.Error("expected channel to be closed after unsubscribe")
	}
}

func TestResourceManager_Close(t *testing.T) {
	rm := NewResourceManager()

	ch1, _ := rm.Subscribe(context.Background(), "file:///a.txt")
	ch2, _ := rm.Subscribe(context.Background(), "file:///b.txt")

	rm.Close()

	// Channels should be closed
	_, ok1 := <-ch1
	_, ok2 := <-ch2
	if ok1 || ok2 {
		t.Error("expected all channels closed after Close")
	}
}

func TestFileResourceHandler_Read_TextFile(t *testing.T) {
	dir := t.TempDir()
	handler := NewFileResourceHandler(dir)

	// Write a test file
	if err := os.WriteFile(dir+"/hello.txt", []byte("hello world"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	content, err := handler.Read(context.Background(), "file://"+dir+"/hello.txt")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if content.Text != "hello world" {
		t.Errorf("expected 'hello world', got %q", content.Text)
	}
	if content.MimeType != "text/plain" {
		t.Errorf("expected text/plain, got %s", content.MimeType)
	}
}

func TestFileResourceHandler_Read_PathTraversal(t *testing.T) {
	dir := t.TempDir()
	handler := NewFileResourceHandler(dir)

	// Try to read outside basePath
	_, err := handler.Read(context.Background(), "file:///etc/passwd")
	if err != ErrResourceNotFound {
		t.Errorf("expected ErrResourceNotFound for path traversal, got %v", err)
	}
}

func TestFileResourceHandler_Read_JsonFile(t *testing.T) {
	dir := t.TempDir()
	handler := NewFileResourceHandler(dir)

	if err := os.WriteFile(dir+"/data.json", []byte(`{"key":"val"}`), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	content, err := handler.Read(context.Background(), "file://"+dir+"/data.json")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if content.MimeType != "application/json" {
		t.Errorf("expected application/json, got %s", content.MimeType)
	}
}

func TestFileResourceHandler_List_WithFiles(t *testing.T) {
	dir := t.TempDir()
	handler := NewFileResourceHandler(dir)

	os.WriteFile(dir+"/a.go", []byte("package a"), 0644)
	os.WriteFile(dir+"/b.ts", []byte("export {}"), 0644)

	resources, _, err := handler.List(context.Background(), "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	// Find our files
	goFound, tsFound := false, false
	for _, r := range resources {
		switch r.Name {
		case "a.go":
			goFound = true
			if r.MimeType != "text/x-go" {
				t.Errorf("expected text/x-go, got %s", r.MimeType)
			}
		case "b.ts":
			tsFound = true
			if r.MimeType != "text/typescript" {
				t.Errorf("expected text/typescript, got %s", r.MimeType)
			}
		}
	}
	if !goFound {
		t.Error("expected to find a.go")
	}
	if !tsFound {
		t.Error("expected to find b.ts")
	}
}
