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
    @node -e "if (process.platform === 'win32') { console.log('⚠️  Windows: Make sure you are running this terminal as Administrator!'); console.log('   (Right-click terminal → Run as Administrator)'); console.log(''); }"
    @echo "Running: portless trust (adding CA certificate to system trust store)..."
    @node -e "console.log(process.platform === 'win32' ? '   Windows: Uses certutil to add CA to Windows certificate store' : (process.platform === 'darwin' ? '   macOS: Adds CA to Keychain (may require system password)' : '   Linux: Adds CA to system trust store'))"
    pnpm exec portless trust || echo "⚠️  portless trust failed. You may need to trust the CA manually."
    @echo ""
    @echo "Running: portless hosts sync (adding mc-vector.localhost to hosts file)..."
    @node -e "console.log(process.platform === 'win32' ? '   Windows: Modifies C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts (requires Administrator)' : '   Unix: Modifies /etc/hosts (requires sudo password)')"
    pnpm exec portless hosts sync || echo "⚠️  portless hosts sync failed. This is optional for Chrome/Firefox but required for Safari/cmux."
    @echo ""
    @echo "✅ Development environment ready!"

# ═══════════════════════════════════════════════════════════════
# Development
# ═══════════════════════════════════════════════════════════════

# Start frontend development server via portless
dev-web:
    pnpm dev

# Start development server (alias for dev)
watch:
    @echo "Starting development server with hot reload..."
    pnpm dev

# Start Tauri application in dev mode
dev-app:
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

# Format code (oxfmt via vite+)
format:
    pnpm format

# Run lint and format checks
check:
    pnpm check:fix

# Run all quality checks (check + rustfmt)
check-all: check rustfmt
    @echo "✅ All quality checks passed!"

# Format Rust code
rustfmt:
	cargo fmt --manifest-path src-tauri/Cargo.toml

# ═══════════════════════════════════════════════════════════════
# Testing
# ═══════════════════════════════════════════════════════════════

# Run all tests (Vitest + Rust unit tests)
test:
    pnpm test
    cd src-tauri && cargo test

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
    node scripts/release-tag.mjs

# Publish release (triggers GitHub workflow)
release-publish:
    node scripts/release-publish.mjs

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
    -node scripts/cargo-optional.mjs outdated

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
    -node scripts/cargo-optional.mjs audit

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
    node scripts/install-extensions.mjs

# Update version numbers across project
update-versions:
    node scripts/update-versions.js

# Clean build artifacts
clean:
    pnpm exec rimraf dist build src-tauri/target node_modules/.vite
