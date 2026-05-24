package context

import (
	"testing"
)

func TestExtractSymbols_Go(t *testing.T) {
	code := []byte(`package main

import "fmt"

func main() {}
func Helper() {}
func (r *Receiver) Method() {}

type Config struct{}
type Handler interface{}
type Alias int
`)
	symbols := extractSymbols("test.go", code)
	if len(symbols) == 0 {
		t.Fatal("expected symbols")
	}

	names := make(map[string]bool)
	for _, s := range symbols {
		names[s.Name] = true
	}
	for _, name := range []string{"main", "Helper", "Method", "Config", "Handler", "Alias"} {
		if !names[name] {
			t.Errorf("expected symbol %s not found", name)
		}
	}
}

func TestExtractSymbols_TypeScript(t *testing.T) {
	code := []byte(`export function hello() {}
const arrow = () => {}
export class MyClass {}
interface MyInterface {}
type MyType = string
enum MyEnum { A, B }
`)
	symbols := extractSymbols("test.ts", code)
	if len(symbols) == 0 {
		t.Fatal("expected symbols")
	}

	names := make(map[string]bool)
	for _, s := range symbols {
		names[s.Name] = true
	}
	for _, name := range []string{"hello", "arrow", "MyClass", "MyInterface", "MyType", "MyEnum"} {
		if !names[name] {
			t.Errorf("expected symbol %s not found", name)
		}
	}
}

func TestExtractSymbols_Python(t *testing.T) {
	code := []byte(`def foo():
    pass

async def bar():
    pass

class MyClass:
    pass

def _private():
    pass
`)
	symbols := extractSymbols("test.py", code)
	if len(symbols) == 0 {
		t.Fatal("expected symbols")
	}

	names := make(map[string]bool)
	for _, s := range symbols {
		names[s.Name] = true
	}
	for _, name := range []string{"foo", "bar", "MyClass", "_private"} {
		if !names[name] {
			t.Errorf("expected symbol %s not found", name)
		}
	}

	// _private should not be exported
	for _, s := range symbols {
		if s.Name == "_private" && s.Exported {
			t.Error("_private should not be exported")
		}
		if s.Name == "foo" && !s.Exported {
			t.Error("foo should be exported")
		}
	}
}

func TestExtractSymbols_Rust(t *testing.T) {
	code := []byte(`fn private_fn() {}
pub fn public_fn() {}
pub struct MyStruct {}
pub enum MyEnum { A }
pub trait MyTrait {}
pub type MyAlias = i32;
`)
	symbols := extractSymbols("test.rs", code)
	if len(symbols) == 0 {
		t.Fatal("expected symbols")
	}

	names := make(map[string]bool)
	for _, s := range symbols {
		names[s.Name] = true
	}
	for _, name := range []string{"private_fn", "public_fn", "MyStruct", "MyEnum", "MyTrait", "MyAlias"} {
		if !names[name] {
			t.Errorf("expected symbol %s not found", name)
		}
	}
}

func TestExtractSymbols_UnknownFile(t *testing.T) {
	symbols := extractSymbols("readme.txt", []byte("hello"))
	if symbols != nil {
		t.Errorf("expected nil for unknown file type, got %v", symbols)
	}
}

func TestExtractImports_Go(t *testing.T) {
	code := []byte(`package main

import "fmt"
import "strings"

import (
	"os"
	"io"
)
`)
	imports := extractImports("test.go", code)
	if len(imports) < 4 {
		t.Errorf("expected at least 4 imports, got %d: %v", len(imports), imports)
	}
}

func TestExtractImports_TypeScript(t *testing.T) {
	code := []byte(`import React from 'react';
import { useState } from "react";
const x = import('dynamic');
`)
	imports := extractImports("test.tsx", code)
	if len(imports) < 2 {
		t.Errorf("expected at least 2 imports, got %d: %v", len(imports), imports)
	}
}

func TestExtractImports_Python(t *testing.T) {
	code := []byte(`import os`)
	imports := extractImports("test.py", code)
	if len(imports) != 1 {
		t.Errorf("expected 1 import, got %d: %v", len(imports), imports)
	}
	if imports[0] != "os" {
		t.Errorf("expected os, got %s", imports[0])
	}
}

func TestExtractImports_Rust(t *testing.T) {
	code := []byte(`use std::io`)
	imports := extractImports("test.rs", code)
	if len(imports) != 1 {
		t.Errorf("expected 1 import, got %d: %v", len(imports), imports)
	}
	if imports[0] != "std::io" {
		t.Errorf("expected std::io, got %s", imports[0])
	}
}

func TestExtractExports_TypeScript(t *testing.T) {
	code := []byte(`export function hello() {}
export const x = 1;
export class MyClass {}
const internal = 2;
`)
	exports := extractExports("test.ts", code)
	if len(exports) < 3 {
		t.Errorf("expected at least 3 exports, got %d: %v", len(exports), exports)
	}
}

func TestExtractExports_Go(t *testing.T) {
	exports := extractExports("test.go", []byte("anything"))
	if exports != nil {
		t.Error("expected nil exports for Go files")
	}
}

func TestHashContent_Symbols(t *testing.T) {
	h1 := hashContent([]byte("hello"))
	h2 := hashContent([]byte("hello"))
	h3 := hashContent([]byte("world"))
	if h1 != h2 {
		t.Error("same content should produce same hash")
	}
	if h1 == h3 {
		t.Error("different content should produce different hash")
	}
	if len(h1) != 16 {
		t.Errorf("expected 16-char hash (8 bytes hex), got %d", len(h1))
	}
}

func TestExtractSymbols_ExportedFlag(t *testing.T) {
	code := []byte(`package main
func Exported() {}
func unexported() {}
`)
	symbols := extractSymbols("test.go", code)
	exported := false
	unexported := false
	for _, s := range symbols {
		if s.Name == "Exported" && s.Exported {
			exported = true
		}
		if s.Name == "unexported" && !s.Exported {
			unexported = true
		}
	}
	if !exported {
		t.Error("Exported should be marked as exported")
	}
	if !unexported {
		t.Error("unexported should not be marked as exported")
	}
}

func TestExtractSymbols_JSX(t *testing.T) {
	code := []byte(`export function Component() { return <div/> }`)
	symbols := extractSymbols("test.jsx", code)
	if len(symbols) == 0 {
		t.Error("expected symbols from JSX")
	}
	if symbols[0].Name != "Component" {
		t.Errorf("expected Component, got %s", symbols[0].Name)
	}
}

func TestCountLines_Symbols(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"", 0},
		{"hello", 0},
		{"hello\n", 1},
		{"hello\nworld\n", 2},
		{"a\nb\nc", 2},
	}
	for _, tt := range tests {
		got := countLines([]byte(tt.input))
		if got != tt.expected {
			t.Errorf("countLines(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}
