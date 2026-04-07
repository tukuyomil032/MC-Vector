# MC-Vector justfile
# Modern task runner for development workflow

# Show available recipes with categories
default:
    @echo "═══════════════════════════════════════════════════════════════"
    @echo "MC-Vector Development Tasks"
    @echo "═══════════════════════════════════════════════════════════════"
    @just --list --unsorted
    @echo "═══════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════
# Setup
# ═══════════════════════════════════════════════════════════════

# Install all dependencies
install:
    pnpm install

# Full development setup (install + portless setup + check-all)
setup: install check-all
    @echo ""
    @echo "Setting up portless CA certificate and hosts entry..."
    @echo "This will enable HTTPS development at https://mc-vector.localhost"
    @echo ""
    pnpm exec portless trust || echo "⚠️  portless trust failed. You may need to trust the CA manually."
    @echo ""
    pnpm exec portless hosts sync || echo "⚠️  portless hosts sync failed. This is optional for Chrome/Firefox but required for Safari/cmux."
    @echo ""
    @echo "✅ Development environment ready!"

# ═══════════════════════════════════════════════════════════════
# Development
# ═══════════════════════════════════════════════════════════════

# Start frontend development server via portless
dev:
    pnpm dev

# Start development server (alias for dev)
watch:
    @echo "Starting development server with hot reload..."
    pnpm dev

# Start Tauri application in dev mode
tauri-dev:
    pnpm tauri:dev

# ═══════════════════════════════════════════════════════════════
# Build
# ═══════════════════════════════════════════════════════════════

# Build frontend for production
build:
    pnpm build

# Build Tauri application
tauri-build *ARGS='':
    pnpm tauri:build {{ARGS}}

# ═══════════════════════════════════════════════════════════════
# Quality Assurance
# ═══════════════════════════════════════════════════════════════

# Run linter (TypeScript, React)
lint:
    pnpm lint

# Format code (Biome, Prettier)
format:
    pnpm format

# Run lint and format checks
check:
    pnpm check

# Run all quality checks (check + yamllint + rustfmt)
check-all: check yamllint rustfmt
    @echo "✅ All quality checks passed!"

# Lint YAML files
yamllint:
    yamllint .

# Format Rust code
rustfmt:
    pnpm rustfmt

# ═══════════════════════════════════════════════════════════════
# Testing
# ═══════════════════════════════════════════════════════════════

# Run all tests (Rust unit tests)
test: test-rust

# Run Rust unit tests
test-rust:
    @echo "Running Rust tests..."
    cd src-tauri && cargo test

# Run Rust tests in watch mode
test-watch:
    @echo "Running Rust tests in watch mode..."
    @echo "Note: Requires 'cargo install cargo-watch'"
    cd src-tauri && cargo watch -x test

# ═══════════════════════════════════════════════════════════════
# Release Management
# ═══════════════════════════════════════════════════════════════

# Prepare release (version bump, changelog)
release-prepare:
    @echo "Preparing release..."
    @echo "Current version: $(node -p "require('./package.json').version")"
    @echo "Run: just update-versions to bump version"
    @echo "Then: Update CHANGELOG.md manually"
    @echo "Finally: just release-tag"

# Create git tag for release
release-tag:
    #!/usr/bin/env bash
    set -euo pipefail
    version=$(node -p "require('./package.json').version")
    git tag -a "v$version" -m "Release v$version"
    echo "Tag v$version created. Push with: git push origin v$version"

# Publish release (triggers GitHub workflow)
release-publish:
    #!/usr/bin/env bash
    set -euo pipefail
    version=$(node -p "require('./package.json').version")
    git push origin "v$version"
    echo "Release workflow triggered for v$version"

# ═══════════════════════════════════════════════════════════════
# Dependency Management
# ═══════════════════════════════════════════════════════════════

# Update dependencies interactively
deps-update:
    @echo "Updating JavaScript dependencies..."
    pnpm update --interactive --latest
    @echo ""
    @echo "Updating Rust dependencies..."
    cd src-tauri && cargo update

# Check for outdated dependencies
deps-check:
    @echo "Checking JavaScript dependencies..."
    -pnpm outdated
    @echo ""
    @echo "Checking Rust dependencies..."
    -cd src-tauri && cargo outdated 2>/dev/null || echo "Note: Install cargo-outdated with 'cargo install cargo-outdated'"

# Security audit of dependencies
deps-audit: security-audit

# ═══════════════════════════════════════════════════════════════
# Security
# ═══════════════════════════════════════════════════════════════

# Run security audit (pnpm + cargo audit)
security-audit:
    @echo "Running pnpm security audit..."
    -pnpm audit
    @echo ""
    @echo "Running Rust security audit..."
    -cd src-tauri && cargo audit 2>/dev/null || echo "Note: Install cargo-audit with 'cargo install cargo-audit'"

# Auto-fix security issues
security-fix:
    @echo "Attempting to fix security issues..."
    -pnpm audit --fix
    @echo "Note: Some issues may require manual intervention"

# ═══════════════════════════════════════════════════════════════
# Documentation
# ═══════════════════════════════════════════════════════════════

# Generate documentation (Rust docs + TypeDoc)
docs-generate:
    @echo "Generating Rust documentation..."
    cd src-tauri && cargo doc --no-deps
    @echo ""
    @echo "Note: Add TypeDoc for TypeScript documentation"
    @echo "  Install: pnpm add -D typedoc"
    @echo "  Run: pnpm typedoc"

# Serve documentation locally
docs-serve:
    @echo "Serving Rust documentation..."
    cd src-tauri && cargo doc --no-deps --open

# ═══════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════

# Install recommended VS Code extensions
install-extensions:
    ./scripts/install-extensions.sh

# Update version numbers across project
update-versions:
    node scripts/update-versions.js

# Clean build artifacts
clean:
    rm -rf dist build src-tauri/target node_modules/.vite
