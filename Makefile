.PHONY: all build test test-race coverage vet lint clean fmt ci help

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOVET=$(GOCMD) vet
GOFMT=gofmt
GOLINT=staticcheck

# Binary names
EDITOR_BIN=bin/swarm-editor
AGENT_BIN=bin/swarm-agent

# Directories
CMD_DIR=./cmd
INTERNAL_DIR=./internal
PKG_DIR=./pkg
UI_DIR=./ui

# Default target
all: test build

## build: Build all binaries
build:
	@echo "Building binaries..."
	@mkdir -p bin
	$(GOBUILD) -o $(EDITOR_BIN) $(CMD_DIR)/swarm-editor
	$(GOBUILD) -o $(AGENT_BIN) $(CMD_DIR)/swarm-agent
	@echo "Build complete: $(EDITOR_BIN), $(AGENT_BIN)"

## build-editor: Build swarm-editor binary only
build-editor:
	@mkdir -p bin
	$(GOBUILD) -o $(EDITOR_BIN) $(CMD_DIR)/swarm-editor

## build-agent: Build swarm-agent binary only
build-agent:
	@mkdir -p bin
	$(GOBUILD) -o $(AGENT_BIN) $(CMD_DIR)/swarm-agent

## test: Run all tests
test:
	@echo "Running tests..."
	$(GOTEST) -v $(INTERNAL_DIR)/... $(PKG_DIR)/...

## test-race: Run tests with race detection
test-race:
	@echo "Running tests with race detection..."
	$(GOTEST) -race -count=1 $(INTERNAL_DIR)/... $(PKG_DIR)/...

## coverage: Run tests and generate coverage report
coverage:
	@echo "Generating coverage report..."
	$(GOTEST) -race -coverprofile=coverage.out $(INTERNAL_DIR)/... $(PKG_DIR)/...
	$(GOCMD) tool cover -func=coverage.out | tail -1

## coverage-html: Generate HTML coverage report
coverage-html: coverage
	$(GOCMD) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

## vet: Run go vet
vet:
	@echo "Running go vet..."
	$(GOVET) $(INTERNAL_DIR)/... $(PKG_DIR)/... $(CMD_DIR)/...

## lint: Run staticcheck
lint:
	@echo "Running staticcheck..."
	$(GOLINT) $(INTERNAL_DIR)/... $(PKG_DIR)/... $(CMD_DIR)/...

## fmt: Format Go code
fmt:
	@echo "Formatting code..."
	$(GOFMT) -s -w $(INTERNAL_DIR) $(PKG_DIR) $(CMD_DIR)

## ui-test: Run UI tests
ui-test:
	@echo "Running UI tests..."
	cd $(UI_DIR) && npm run test

## ui-build: Build UI
ui-build:
	@echo "Building UI..."
	cd $(UI_DIR) && npm install && npm run build

## ui-dev: Start UI development server
ui-dev:
	cd $(UI_DIR) && npm run dev

## ci: Run all CI checks
ci: fmt vet lint test-race coverage ui-test build
	@echo "CI checks passed!"

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf bin/
	rm -f coverage.out coverage.html
	cd $(UI_DIR) && rm -rf dist/ node_modules/.vite

## help: Show this help message
help:
	@echo "Swarm Editor - Makefile Commands"
	@echo "================================="
	@sed -n 's/^## //p' $(MAKEFILE_LIST) | column -t -s ':'
