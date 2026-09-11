```bash
bun install             # Install dependencies
bun run dev             # Frontend dev server (HTTPS at mc-vector.localhost via portless)
bun run dev:plain       # Raw Vite dev server (localhost:5173)
bun run tauri:dev       # Full desktop app in dev mode
bun run build           # Build frontend for production
bun run tauri:build     # Build production Tauri binary
bun run check           # Run Oxlint + Oxfmt checks
bun run check:fix       # Format and auto-fix lint issues
bun run lint            # Run Oxlint
bun run lint:fix        # Run Oxlint with auto-fix
bun run fmt             # Run Oxfmt
bun run fmt:check       # Check Oxfmt output without changes
bun run format          # Compatibility alias for bun run fmt
bun run rustfmt         # Format Rust code
bun run rustfmt:check   # Check Rust formatting without changes
bun run clean:artifacts # Delete dist, build, node_modules/.vite
```

- Here is a list of the commands used in this project.
- Select the appropriate command from the list as needed and execute it.
