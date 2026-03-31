package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestWorkspaceManager_Create(t *testing.T) {
	m := NewWorkspaceManager()

	w := m.Create("ws-1", "Test", "/tmp/test")
	if w == nil {
		t.Fatal("expected workspace, got nil")
	}
	if w.ID != "ws-1" {
		t.Errorf("expected ID ws-1, got %s", w.ID)
	}
}

func TestWorkspaceManager_Get(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	w := m.Get("ws-1")
	if w == nil {
		t.Error("expected workspace, got nil")
	}

	w = m.Get("ws-404")
	if w != nil {
		t.Error("expected nil for non-existing workspace")
	}

	// Test immutability of returned copy
	original := m.Get("ws-1")
	 original.Name = "modified"
	if m.Get("ws-1").Name == "modified" {
	 t.Error("Get should return a copy")
    }
}

func TestWorkspaceManager_Delete(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	m.Delete("ws-1")
	if m.Get("ws-1") != nil {
        t.Error("ws-1 should be deleted")
    }
	if m.GetByPath("/tmp/test") != nil {
        t.Error("byPath mapping should be removed")
    }
}

func TestWorkspaceManager_LockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	// Lock file successfully
	err := m.LockFile("ws-1", "/file.go", "user-1")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	 }

	// Verify lock
	w := m.Get("ws-1")
	if w.FileLocks["/file.go"] != "user-1" {
        t.Error("file should be locked")
    }

	// Double lock by different user should fail
	err = m.LockFile("ws-1", "/file.go", "user-2")
	if err == nil {
        t.Error("expected error when file already locked")
    }
}

func TestWorkspaceManager_UnlockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	// Lock file first
	m.LockFile("ws-1", "/file.go", "user-1")

	// Owner unlocks
	err := m.UnlockFile("ws-1", "/file.go", "user-1")
	if err != nil {
        t.Errorf("owner should be able to unlock: %v", err)
    }

	// Verify unlocked
	w := m.Get("ws-1")
	if _, ok := w.FileLocks["/file.go"]; ok {
        t.Error("file should be unlocked")
    }
}

func TestWorkspaceManager_Concurrency(t *testing.T) {
	m := NewWorkspaceManager()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			m.Create(fmt.Sprintf("ws-%d", id), "Workspace", fmt.Sprintf("/path%d", id))
		}(i)
	}

	wg.Wait()

	if len(m.List()) != 10 {
		t.Errorf("expected 10 workspaces, got %d", len(m.List()))
	}
}

func TestWorkspaceManager_GetByPath(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("found by path", func(t *testing.T) {
		w := m.GetByPath("/tmp/test")
		if w == nil {
			t.Fatal("expected workspace, got nil")
		}
		if w.ID != "ws-1" {
			t.Errorf("expected ID ws-1, got %s", w.ID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		w := m.GetByPath("/nonexistent")
		if w != nil {
			t.Error("expected nil for non-existing path")
		}
	})

	t.Run("returns copy", func(t *testing.T) {
		w := m.GetByPath("/tmp/test")
		w.Name = "modified"
		original := m.GetByPath("/tmp/test")
		if original.Name == "modified" {
			t.Error("GetByPath should return a copy")
		}
	})
}

func TestWorkspaceManager_List(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "One", "/path1")
	m.Create("ws-2", "Two", "/path2")

	t.Run("returns all workspaces", func(t *testing.T) {
		list := m.List()
		if len(list) != 2 {
			t.Errorf("expected 2 workspaces, got %d", len(list))
		}
	})

	t.Run("returns copies", func(t *testing.T) {
		list := m.List()
		list[0].Name = "mutated"
		original := m.Get("ws-1")
		if original.Name == "mutated" {
			t.Error("List should return copies")
		}
	})

	t.Run("empty manager", func(t *testing.T) {
		empty := NewWorkspaceManager()
		list := empty.List()
		if len(list) != 0 {
			t.Errorf("expected 0 workspaces, got %d", len(list))
		}
	})
}

func TestWorkspaceManager_UpdateCursor(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("update cursor successfully", func(t *testing.T) {
		cursor := Cursor{FilePath: "/main.go", Line: 10, Column: 5}
		err := m.UpdateCursor("ws-1", "user-1", cursor)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		cursors, err := m.GetCursors("ws-1")
		if err != nil {
			t.Fatal(err)
		}
		if len(cursors) != 1 {
			t.Fatalf("expected 1 cursor, got %d", len(cursors))
		}
		if cursors[0].FilePath != "/main.go" || cursors[0].Line != 10 {
			t.Errorf("cursor mismatch: %+v", cursors[0])
		}
		if cursors[0].UserID != "user-1" {
			t.Errorf("expected userId user-1, got %s", cursors[0].UserID)
		}
	})

	t.Run("overwrite existing cursor", func(t *testing.T) {
		m.UpdateCursor("ws-1", "user-1", Cursor{FilePath: "/main.go", Line: 10, Column: 5})
		m.UpdateCursor("ws-1", "user-1", Cursor{FilePath: "/test.go", Line: 20, Column: 3})

		cursors, _ := m.GetCursors("ws-1")
		if len(cursors) != 1 {
			t.Errorf("expected 1 cursor after overwrite, got %d", len(cursors))
		}
		if cursors[0].FilePath != "/test.go" {
			t.Errorf("expected /test.go, got %s", cursors[0].FilePath)
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		err := m.UpdateCursor("ws-404", "user-1", Cursor{})
		if err == nil {
			t.Error("expected error for non-existing workspace")
		}
	})
}

func TestWorkspaceManager_GetCursors(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("empty cursors", func(t *testing.T) {
		cursors, err := m.GetCursors("ws-1")
		if err != nil {
			t.Fatal(err)
		}
		if len(cursors) != 0 {
			t.Errorf("expected 0 cursors, got %d", len(cursors))
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		_, err := m.GetCursors("ws-404")
		if err == nil {
			t.Error("expected error for non-existing workspace")
		}
	})
}

func TestWorkspaceManager_UpdateFiles(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("update files successfully", func(t *testing.T) {
		files := []WorkspaceFileInfo{
			{Path: "/main.go", Name: "main.go", Size: 1024, IsDir: false},
			{Path: "/lib", Name: "lib", Size: 0, IsDir: true},
		}
		err := m.UpdateFiles("ws-1", files)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		w := m.Get("ws-1")
		if len(w.Files) != 2 {
			t.Errorf("expected 2 files, got %d", len(w.Files))
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		err := m.UpdateFiles("ws-404", nil)
		if err == nil {
			t.Error("expected error for non-existing workspace")
		}
	})
}

func TestWorkspaceManager_AddOpenFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("add file successfully", func(t *testing.T) {
		err := m.AddOpenFile("ws-1", "/main.go")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		w := m.Get("ws-1")
		if len(w.OpenFiles) != 1 || w.OpenFiles[0] != "/main.go" {
			t.Errorf("expected [/main.go], got %v", w.OpenFiles)
		}
	})

	t.Run("deduplicate", func(t *testing.T) {
		m.AddOpenFile("ws-1", "/main.go")
		m.AddOpenFile("ws-1", "/main.go")
		w := m.Get("ws-1")
		if len(w.OpenFiles) != 1 {
			t.Errorf("expected 1 file after duplicate add, got %d", len(w.OpenFiles))
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		err := m.AddOpenFile("ws-404", "/main.go")
		if err == nil {
			t.Error("expected error for non-existing workspace")
		}
	})
}

func TestWorkspaceManager_RemoveOpenFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")
	m.AddOpenFile("ws-1", "/main.go")
	m.AddOpenFile("ws-1", "/test.go")

	t.Run("remove file successfully", func(t *testing.T) {
		err := m.RemoveOpenFile("ws-1", "/main.go")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		w := m.Get("ws-1")
		if len(w.OpenFiles) != 1 || w.OpenFiles[0] != "/test.go" {
			t.Errorf("expected [/test.go], got %v", w.OpenFiles)
		}
	})

	t.Run("remove non-existent file is no-op", func(t *testing.T) {
		err := m.RemoveOpenFile("ws-1", "/nonexistent.go")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		err := m.RemoveOpenFile("ws-404", "/main.go")
		if err == nil {
			t.Error("expected error for non-existing workspace")
		}
	})
}

// --- HTTP Handler Tests ---

func TestHandleListWorkspaces(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "One", "/path1")
	m.Create("ws-2", "Two", "/path2")

	req := httptest.NewRequest(http.MethodGet, "/workspaces", nil)
	rec := httptest.NewRecorder()
	m.HandleListWorkspaces(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var list []Workspace
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 workspaces, got %d", len(list))
	}
}

func TestHandleGetWorkspace(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-1", nil)
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleGetWorkspace(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-404", nil)
		req.SetPathValue("id", "ws-404")
		rec := httptest.NewRecorder()
		m.HandleGetWorkspace(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/workspaces/", nil)
		req.SetPathValue("id", "")
		rec := httptest.NewRecorder()
		m.HandleGetWorkspace(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})
}

func TestHandleCreateWorkspace(t *testing.T) {
	m := NewWorkspaceManager()

	t.Run("create successfully", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"id": "ws-new", "name": "New", "path": "/tmp/new"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		m.HandleCreateWorkspace(rec, req)

		if rec.Code != http.StatusCreated {
			t.Errorf("expected 201, got %d", rec.Code)
		}

		var w Workspace
		if err := json.NewDecoder(rec.Body).Decode(&w); err != nil {
			t.Fatal(err)
		}
		if w.ID != "ws-new" {
			t.Errorf("expected ws-new, got %s", w.ID)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"name": "New", "path": "/tmp/new"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		m.HandleCreateWorkspace(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("path is normalized by filepath.Abs", func(t *testing.T) {
		// filepath.Abs resolves ".." so /tmp/../../etc becomes /etc
		// The handler's ".." check is a defense-in-depth measure
		body, _ := json.Marshal(map[string]string{"id": "ws-abs", "name": "Abs", "path": "/tmp/../../etc"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		m.HandleCreateWorkspace(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 (Abs normalizes the path), got %d", rec.Code)
		}
		var w Workspace
		json.NewDecoder(rec.Body).Decode(&w)
		if w.Path != "/etc" {
			t.Errorf("expected path /etc after normalization, got %s", w.Path)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewReader([]byte("not json")))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		m.HandleCreateWorkspace(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for invalid JSON, got %d", rec.Code)
		}
	})
}

func TestHandleLockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("lock successfully", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "/file.go", "userId": "user-1"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleLockFile(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("lock conflict", func(t *testing.T) {
		m.LockFile("ws-1", "/conflict.go", "user-1")
		body, _ := json.Marshal(map[string]string{"filePath": "/conflict.go", "userId": "user-2"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleLockFile(rec, req)

		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d", rec.Code)
		}
	})

	t.Run("missing workspace id", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "/file.go", "userId": "user-1"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces//lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "")
		rec := httptest.NewRecorder()
		m.HandleLockFile(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("empty filePath", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "  ", "userId": "user-1"})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleLockFile(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for empty filePath, got %d", rec.Code)
		}
	})
}

func TestHandleUnlockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")
	m.LockFile("ws-1", "/file.go", "user-1")

	t.Run("unlock successfully", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "/file.go", "userId": "user-1"})
		req := httptest.NewRequest(http.MethodDelete, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("unlock by wrong user", func(t *testing.T) {
		m.LockFile("ws-1", "/locked.go", "user-1")
		body, _ := json.Marshal(map[string]string{"filePath": "/locked.go", "userId": "user-2"})
		req := httptest.NewRequest(http.MethodDelete, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)

		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d", rec.Code)
		}
	})

	t.Run("missing workspace id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/workspaces//lock", bytes.NewReader([]byte(`{}`)))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("empty filePath", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "", "userId": "u1"})
		req := httptest.NewRequest(http.MethodDelete, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("empty userId", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"filePath": "/f.go", "userId": ""})
		req := httptest.NewRequest(http.MethodDelete, "/workspaces/ws-1/lock", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("invalid json body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/workspaces/ws-1/lock", bytes.NewReader([]byte(`not json`)))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUnlockFile(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})
}

func TestHandleUpdateCursor(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	t.Run("update cursor successfully", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"userId": "user-1", "filePath": "/main.go", "line": 10, "column": 5})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/cursor", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUpdateCursor(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"userId": "user-1", "filePath": "/main.go", "line": 10, "column": 5})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-404/cursor", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-404")
		rec := httptest.NewRecorder()
		m.HandleUpdateCursor(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("empty userId", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"userId": "  ", "filePath": "/main.go", "line": 10, "column": 5})
		req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/cursor", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleUpdateCursor(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
	})
}

func TestHandleGetCursors(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")
	m.UpdateCursor("ws-1", "user-1", Cursor{FilePath: "/main.go", Line: 10, Column: 5})

	t.Run("get cursors successfully", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-1/cursors", nil)
		req.SetPathValue("id", "ws-1")
		rec := httptest.NewRecorder()
		m.HandleGetCursors(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}

		var cursors []Cursor
		if err := json.NewDecoder(rec.Body).Decode(&cursors); err != nil {
			t.Fatal(err)
		}
		if len(cursors) != 1 {
			t.Errorf("expected 1 cursor, got %d", len(cursors))
		}
	})

	t.Run("workspace not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-404/cursors", nil)
		req.SetPathValue("id", "ws-404")
		rec := httptest.NewRecorder()
		m.HandleGetCursors(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rec.Code)
		}
	})
}

func TestDeepCopyMapAny(t *testing.T) {
	t.Run("nil input", func(t *testing.T) {
		result := deepCopyMapAny(nil)
		if result != nil {
			t.Error("expected nil for nil input")
		}
	})

	t.Run("nested map deep copy", func(t *testing.T) {
		original := map[string]any{
			"level1": map[string]any{
				"level2": "value",
			},
		}
		cp := deepCopyMapAny(original)
		cp["level1"].(map[string]any)["level2"] = "modified"

		if original["level1"].(map[string]any)["level2"] == "modified" {
			t.Error("deep copy should not share nested references")
		}
	})

	t.Run("slice deep copy", func(t *testing.T) {
		original := map[string]any{
			"items": []any{"a", "b", "c"},
		}
		cp := deepCopyMapAny(original)
		cp["items"].([]any)[0] = "modified"

		if original["items"].([]any)[0] == "modified" {
			t.Error("deep copy should not share slice references")
		}
	})

	t.Run("map[string]string copy", func(t *testing.T) {
		original := map[string]any{
			"tags": map[string]string{"key": "value"},
		}
		cp := deepCopyMapAny(original)
		cp["tags"].(map[string]string)["key"] = "modified"

		if original["tags"].(map[string]string)["key"] == "modified" {
			t.Error("deep copy should not share map[string]string references")
		}
	})

	t.Run("[]string copy", func(t *testing.T) {
		original := map[string]any{
			"list": []string{"a", "b"},
		}
		cp := deepCopyMapAny(original)
		cp["list"].([]string)[0] = "modified"

		if original["list"].([]string)[0] == "modified" {
			t.Error("deep copy should not share []string references")
		}
	})

	t.Run("primitive values pass through", func(t *testing.T) {
		original := map[string]any{
			"int":    42,
			"float":  3.14,
			"bool":   true,
			"string": "hello",
		}
		cp := deepCopyMapAny(original)
		if cp["int"] != 42 || cp["float"] != 3.14 || cp["bool"] != true || cp["string"] != "hello" {
			t.Error("primitive values should be preserved")
		}
	})
}

func TestDeepCopyAnyValue(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		result := deepCopyAnyValue(nil)
		if result != nil {
			t.Error("expected nil")
		}
	})

	t.Run("int pass through", func(t *testing.T) {
		result := deepCopyAnyValue(42)
		if result != 42 {
			t.Error("int should pass through")
		}
	})

	t.Run("string pass through", func(t *testing.T) {
		result := deepCopyAnyValue("hello")
		if result != "hello" {
			t.Error("string should pass through")
		}
	})

	t.Run("bool pass through", func(t *testing.T) {
		result := deepCopyAnyValue(true)
		if result != true {
			t.Error("bool should pass through")
		}
	})

	t.Run("float64 pass through", func(t *testing.T) {
		result := deepCopyAnyValue(float64(3.14))
		if result != float64(3.14) {
			t.Error("float64 should pass through")
		}
	})

	t.Run("int64 pass through", func(t *testing.T) {
		result := deepCopyAnyValue(int64(42))
		if result != int64(42) {
			t.Error("int64 should pass through")
		}
	})

	t.Run("time.Time pass through", func(t *testing.T) {
		now := time.Now()
		result := deepCopyAnyValue(now)
		if result.(time.Time) != now {
			t.Error("time.Time should pass through")
		}
	})

	t.Run("slice any deep copy", func(t *testing.T) {
		original := []any{"a", 1, true}
		cp := deepCopyAnyValue(original).([]any)
		if len(cp) != 3 {
			t.Errorf("len = %d, want 3", len(cp))
		}
		original[0] = "modified"
		if cp[0] == "modified" {
			t.Error("slice should be deep copied")
		}
	})

	t.Run("slice string clone", func(t *testing.T) {
		original := []string{"a", "b"}
		cp := deepCopyAnyValue(original).([]string)
		if len(cp) != 2 {
			t.Errorf("len = %d, want 2", len(cp))
		}
		original[0] = "modified"
		if cp[0] == "modified" {
			t.Error("[]string should be cloned")
		}
	})

	t.Run("map string string copy", func(t *testing.T) {
		original := map[string]string{"a": "1"}
		cp := deepCopyAnyValue(original).(map[string]string)
		if cp["a"] != "1" {
			t.Error("value should be copied")
		}
		original["a"] = "modified"
		if cp["a"] == "modified" {
			t.Error("map should be independent")
		}
	})

	t.Run("nested map any deep copy", func(t *testing.T) {
		original := map[string]any{"inner": map[string]any{"val": 42}}
		cp := deepCopyAnyValue(original).(map[string]any)
		original["inner"].(map[string]any)["val"] = 999
		if cp["inner"].(map[string]any)["val"] == 999 {
			t.Error("nested map should be deep copied")
		}
	})

	t.Run("unserializable fallback", func(t *testing.T) {
		// channel type can't be marshaled to JSON, should fall back to return as-is
		ch := make(chan int, 1)
		result := deepCopyAnyValue(ch)
		if result != ch {
			t.Error("unserializable type should return as-is")
		}
	})
}
