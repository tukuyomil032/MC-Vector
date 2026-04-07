# MC-Vector Makefile
# Cross-platform task runner for development workflow

# OS Detection
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
else
	DETECTED_OS := $(shell uname -s)
endif

.PHONY: help install dev build lint format check clean tauri-dev tauri-build install-extensions update-versions yamllint rustfmt \
	test test-rust test-watch \
	release-prepare release-tag release-publish \
	deps-update deps-check deps-audit \
	security-audit security-fix \
	docs-generate docs-serve \
	check-all setup watch

# Default target: show help
help:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "MC-Vector Development Tasks"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo ""
	@echo "Setup:"
	@echo "  make install              Install all dependencies"
	@echo "  make setup                Full setup (install + check-all)"
	@echo ""
	@echo "Development:"
	@echo "  make dev                  Start frontend development server via portless"
	@echo "  make watch                Start dev server (alias for dev)"
	@echo "  make tauri-dev            Start Tauri application in dev mode"
	@echo ""
	@echo "Build:"
	@echo "  make build                Build frontend for production"
	@echo "  make tauri-build          Build Tauri application"
	@echo ""
	@echo "Quality Assurance:"
	@echo "  make lint                 Run linter (TypeScript, React)"
	@echo "  make format               Format code (Biome, Prettier)"
	@echo "  make check                Run lint and format checks"
	@echo "  make check-all            Run all quality checks (check + yamllint + rustfmt)"
	@echo "  make yamllint             Lint YAML files"
	@echo "  make rustfmt              Format Rust code"
	@echo ""
	@echo "Testing:"
	@echo "  make test                 Run all tests (Rust unit tests)"
	@echo "  make test-rust            Run Rust tests"
	@echo "  make test-watch           Run Rust tests in watch mode"
	@echo ""
	@echo "Release Management:"
	@echo "  make release-prepare      Prepare release (version bump, changelog)"
	@echo "  make release-tag          Create git tag for release"
	@echo "  make release-publish      Trigger GitHub release workflow"
	@echo ""
	@echo "Dependency Management:"
	@echo "  make deps-update          Update dependencies interactively"
	@echo "  make deps-check           Check for outdated dependencies"
	@echo "  make deps-audit           Security audit of dependencies"
	@echo ""
	@echo "Security:"
	@echo "  make security-audit       Run security audit (pnpm + cargo audit)"
	@echo "  make security-fix         Auto-fix security issues"
	@echo ""
	@echo "Documentation:"
	@echo "  make docs-generate        Generate documentation (Rust docs + TypeDoc)"
	@echo "  make docs-serve           Serve documentation locally"
	@echo ""
	@echo "Utilities:"
	@echo "  make install-extensions   Install recommended VS Code extensions"
	@echo "  make update-versions      Update version numbers across project"
	@echo "  make clean                Clean build artifacts"
	@echo "═══════════════════════════════════════════════════════════════"

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
	yamllint .

rustfmt:
	pnpm rustfmt

# Utilities
install-extensions:
	./scripts/install-extensions.sh

update-versions:
	node scripts/update-versions.js

clean:
	rm -rf dist build src-tauri/target node_modules/.vite

# ═══════════════════════════════════════════════════════════════
# Additional tasks
# ═══════════════════════════════════════════════════════════════

# Setup: Full development environment setup
setup: install check-all
	@echo ""
	@echo "Setting up portless CA certificate and hosts entry..."
	@echo "This will enable HTTPS development at https://mc-vector.localhost"
	@echo ""
ifeq ($(DETECTED_OS),Windows)
	@echo "⚠️  Windows: Make sure you are running this terminal as Administrator!"
	@echo "   (Right-click terminal → 'Run as Administrator')"
	@echo ""
endif
	@echo "Running: portless trust (adding CA certificate to system trust store)..."
ifeq ($(DETECTED_OS),Windows)
	@echo "   Windows: Uses certutil to add CA to Windows certificate store"
else ifeq ($(DETECTED_OS),Darwin)
	@echo "   macOS: Adds CA to Keychain (may require system password)"
else
	@echo "   Linux: Adds CA to system trust store"
endif
	-portless trust || echo "⚠️  portless trust failed. You may need to trust the CA manually."
	@echo ""
	@echo "Running: portless hosts sync (adding mc-vector.localhost to hosts file)..."
ifeq ($(DETECTED_OS),Windows)
	@echo "   Windows: Modifies C:\Windows\System32\drivers\etc\hosts (requires Administrator)"
else
	@echo "   Unix: Modifies /etc/hosts (requires sudo password)"
endif
	-portless hosts sync || echo "⚠️  portless hosts sync failed. This is optional for Chrome/Firefox but required for Safari/cmux."
	@echo ""
	@echo "✅ Development environment ready!"

# Development: Alias for dev server
watch: dev

# Quality: Run all quality checks
check-all: check yamllint rustfmt
	@echo "✅ All quality checks passed!"

# Testing: Run all tests (currently Rust unit tests)
test: test-rust

# Testing: Run Rust unit tests
test-rust:
	@echo "Running Rust tests..."
	cd src-tauri && cargo test

# Testing: Run Rust tests in watch mode
test-watch:
	@echo "Running Rust tests in watch mode..."
	@echo "Note: Requires 'cargo install cargo-watch'"
	cd src-tauri && cargo watch -x test

# Release: Prepare release (version bump, changelog)
release-prepare:
	@echo "Preparing release..."
	@echo "Current version: $$(node -p "require('./package.json').version")"
	@echo "Run: make update-versions to bump version"
	@echo "Then: Update CHANGELOG.md manually"
	@echo "Finally: make release-tag"

# Release: Create git tag for release
release-tag:
	@echo "Creating release tag..."
	@version=$$(node -p "require('./package.json').version"); \
	git tag -a "v$$version" -m "Release v$$version"; \
	echo "Tag v$$version created. Push with: git push origin v$$version"

# Release: Publish release (triggers GitHub workflow)
release-publish:
	@echo "Publishing release..."
	@version=$$(node -p "require('./package.json').version"); \
	git push origin "v$$version"; \
	echo "Release workflow triggered for v$$version"

# Dependencies: Update dependencies interactively
deps-update:
	@echo "Updating JavaScript dependencies..."
	pnpm update --interactive --latest
	@echo ""
	@echo "Updating Rust dependencies..."
	cd src-tauri && cargo update

# Dependencies: Check for outdated dependencies
deps-check:
	@echo "Checking JavaScript dependencies..."
	pnpm outdated
	@echo ""
	@echo "Checking Rust dependencies..."
	cd src-tauri && cargo outdated 2>/dev/null || \
		echo "Note: Install cargo-outdated with 'cargo install cargo-outdated'"

# Dependencies: Security audit
deps-audit: security-audit

# Security: Run security audit
security-audit:
	@echo "Running pnpm security audit..."
	pnpm audit || true
	@echo ""
	@echo "Running Rust security audit..."
	cd src-tauri && cargo audit 2>/dev/null || \
		echo "Note: Install cargo-audit with 'cargo install cargo-audit'"

# Security: Auto-fix security issues
security-fix:
	@echo "Attempting to fix security issues..."
	pnpm audit --fix || true
	@echo "Note: Some issues may require manual intervention"

# Documentation: Generate documentation
docs-generate:
	@echo "Generating Rust documentation..."
	cd src-tauri && cargo doc --no-deps
	@echo ""
	@echo "Note: Add TypeDoc for TypeScript documentation"
	@echo "  Install: pnpm add -D typedoc"
	@echo "  Run: pnpm typedoc"

# Documentation: Serve documentation locally
docs-serve:
	@echo "Serving Rust documentation..."
	cd src-tauri && cargo doc --no-deps --open
