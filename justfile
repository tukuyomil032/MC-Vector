# MC-Vector justfile
# Modern task runner for development workflow

# Show available recipes
default:
    @just --list

# Install all dependencies
install:
    pnpm install

# Start frontend development server
dev:
    pnpm dev

# Start Tauri application in dev mode
tauri-dev:
    pnpm tauri:dev

# Build frontend for production
build:
    pnpm build

# Build Tauri application
tauri-build *ARGS='':
    pnpm tauri:build {{ARGS}}

# Run linter
lint:
    pnpm lint

# Format code
format:
    pnpm format

# Run lint and format checks
check:
    pnpm check

# Lint YAML files
yamllint:
    yamllint .

# Format Rust code
rustfmt:
    pnpm rustfmt

# Install recommended VS Code extensions
install-extensions:
    ./scripts/install-extensions.sh

# Update version numbers
update-versions:
    node scripts/update-versions.js

# Clean build artifacts
clean:
    rm -rf dist build src-tauri/target node_modules/.vite

# Run all quality checks (lint + format + yamllint + rustfmt)
check-all: check yamllint rustfmt

# Full development setup (install + check)
setup: install check-all
    @echo "✅ Development environment ready!"

# Start development server with hot reload
watch:
    `@echo` "Starting development server..."
    pnpm dev
