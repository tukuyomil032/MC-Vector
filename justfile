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
    bun install

# Full development setup (install + portless setup + check-all)
setup: install check-all
    @echo ""
    @echo "Setting up portless CA certificate and hosts entry..."
    @echo "This will enable HTTPS development at https://mc-vector.localhost"
    @echo ""
    @node -e "if (process.platform === 'win32') { console.log('⚠️  Windows: Make sure you are running this terminal as Administrator!'); console.log('   (Right-click terminal → Run as Administrator)'); console.log(''); }"
    @echo "Running: portless trust (adding CA certificate to system trust store)..."
    @node -e "console.log(process.platform === 'win32' ? '   Windows: Uses certutil to add CA to Windows certificate store' : (process.platform === 'darwin' ? '   macOS: Adds CA to Keychain (may require system password)' : '   Linux: Adds CA to system trust store'))"
    bunx --no-install portless trust || echo "⚠️  portless trust failed. You may need to trust the CA manually."
    @echo ""
    @echo "Running: portless hosts sync (adding mc-vector.localhost to hosts file)..."
    @node -e "console.log(process.platform === 'win32' ? '   Windows: Modifies C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts (requires Administrator)' : '   Unix: Modifies /etc/hosts (requires sudo password)')"
    bunx --no-install portless hosts sync || echo "⚠️  portless hosts sync failed. This is optional for Chrome/Firefox but required for Safari/cmux."
    @echo ""
    @echo "✅ Development environment ready!"

# ═══════════════════════════════════════════════════════════════
# Development
# ═══════════════════════════════════════════════════════════════

# Start frontend development server via portless
dev-web:
    bun run dev

# Start development server (alias for dev)
watch:
    @echo "Starting development server with hot reload..."
    bun run dev

# Start Tauri application in dev mode
dev-app:
    bun run tauri:dev

# ═══════════════════════════════════════════════════════════════
# Build
# ═══════════════════════════════════════════════════════════════

# Build frontend for production
build:
    bun run build

# Build Tauri application
tauri-build *ARGS='':
    bun run tauri:build {{ARGS}}

# ═══════════════════════════════════════════════════════════════
# Quality Assurance
# ═══════════════════════════════════════════════════════════════

# Run linter (TypeScript, React)
lint:
    bun run lint

# Format JavaScript, TypeScript, JSON, CSS, and Astro code with Oxfmt
format:
    bun run fmt

# Run lint and format checks
check:
    bun run check

# Run all quality checks (JavaScript/TypeScript + Rust)
check-all: check rustfmt-check
    @echo "✅ All quality checks passed!"

# Format Rust code
rustfmt:
  @echo "Running Rust code formatter (rustfmt)..."
  bun run rustfmt

# Check Rust formatting without changing files
rustfmt-check:
  @echo "Checking Rust formatting (rustfmt --check)..."
  bun run rustfmt:check

# ═══════════════════════════════════════════════════════════════
# Testing
# ═══════════════════════════════════════════════════════════════

# Run all tests (Vitest + Rust unit tests)
test:
    bun run test
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

# Prepare a release
release:
    bun run release

# ═══════════════════════════════════════════════════════════════
# Dependency Management
# ═══════════════════════════════════════════════════════════════

# Update dependencies interactively
deps-update:
    @echo "Updating JavaScript dependencies..."
    bun update --interactive --latest
    @echo ""
    @echo "Updating Rust dependencies..."
    cd src-tauri && cargo update

# Check for outdated dependencies
deps-check:
    @echo "Checking JavaScript dependencies..."
    -bun outdated
    @echo ""
    @echo "Checking Rust dependencies..."
    -node scripts/cargo-optional.mjs outdated

# Security audit of dependencies
deps-audit: security-audit

# ═══════════════════════════════════════════════════════════════
# Security
# ═══════════════════════════════════════════════════════════════

# Run security audit (Bun + cargo audit)
security-audit:
    @echo "Running Bun security audit..."
    -bun audit
    @echo ""
    @echo "Running Rust security audit..."
    -node scripts/cargo-optional.mjs audit

# Auto-fix security issues
security-fix:
    @echo "Updating JavaScript dependencies and re-running Bun security audit..."
    bun update
    bun audit
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
    @echo "  Install: bun add -d typedoc"
    @echo "  Run: bun run typedoc"

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

# Update supported Minecraft versions
update-minecraft-versions:
    node scripts/update-minecraft-versions.js

# Clean build artifacts
clean:
    bunx --no-install rimraf dist build src-tauri/target node_modules/.vite


# ═══════════════════════════════════════════════════════════════
# CI Monitoring
# ═══════════════════════════════════════════════════════════════

# Monitor CI — interactive run selector (uses fzf when available)
cim:
    chmod +x .agents/skills/ci-monitoring/packages/src/index.ts
    .agents/skills/ci-monitoring/packages/src/index.ts

sh-check:
    @echo "Running shellcheck & shfmt..."
    shfmt -d .agents/skills/

sh-fix:
    @echo "Fixing shell scripts with shfmt..."
    shfmt -d -w .agents/skills/
