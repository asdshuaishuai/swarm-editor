package mcp

import (
	"context"
	"testing"
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
		{"file:///test.txt", "file:///", true},
		{"http://example.com", "http://", true},
		{"file:///test.txt", "http://", false},
		{"custom://resource", "custom://", true},
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
