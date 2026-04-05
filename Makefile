# MC-Vector Makefile
# Cross-platform task runner for development workflow

.PHONY: help install dev build lint format check clean tauri-dev tauri-build install-extensions update-versions yamllint rustfmt

# Default target: show help
help:
	@echo "MC-Vector Development Tasks"
	@echo ""
	@echo "Setup:"
	@echo "  make install              Install all dependencies (pnpm install)"
	@echo ""
	@echo "Development:"
	@echo "  make dev                  Start frontend development server"
	@echo "  make tauri-dev            Start Tauri application in dev mode"
	@echo ""
	@echo "Build:"
	@echo "  make build                Build frontend for production"
	@echo "  make tauri-build          Build Tauri application"
	@echo ""
	@echo "Quality:"
	@echo "  make lint                 Run linter"
	@echo "  make format               Format code"
	@echo "  make check                Run lint and format checks"
	@echo "  make yamllint             Lint YAML files"
	@echo "  make rustfmt              Format Rust code"
	@echo ""
	@echo "Utilities:"
	@echo "  make install-extensions   Install recommended VS Code extensions"
	@echo "  make update-versions      Update version numbers"
	@echo "  make clean                Clean build artifacts"

# Setup
install:
	pnpm install

# Development
dev:
	pnpm dev

tauri-dev:
	pnpm tauri:dev

# Build
build:
	pnpm build

tauri-build:
	pnpm tauri:build

# Quality checks
lint:
	pnpm lint

format:
	pnpm format

check:
	pnpm check

yamllint:
	pnpm yamllint

rustfmt:
	pnpm rustfmt

# Utilities
install-extensions:
	./scripts/install-extensions.sh

update-versions:
	node scripts/update-versions.js

clean:
	rm -rf dist build src-tauri/target node_modules/.vite
