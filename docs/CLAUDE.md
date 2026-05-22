# docs/CLAUDE.md — Starlight Documentation Site

## Commands

```bash
pnpm --filter @mc-vector/docs dev          # Dev server → http://localhost:4321
pnpm --filter @mc-vector/docs build        # Production build → docs/dist/
pnpm --filter @mc-vector/docs build:full   # TypeDoc + Astro full build
pnpm --filter @mc-vector/docs preview      # Preview production build
pnpm --filter @mc-vector/docs typedoc      # Regenerate TypeScript API docs
```

## Content Guidelines

- Frontmatter required: `title`, `description`, `sidebar.order`
- Developer pages: add `sidebar.badge: { text: Developer, variant: note }`
- `api/typescript/` is auto-generated — DO NOT edit manually
- `public/rustdoc/` is auto-generated — DO NOT edit manually
- Internal links: Starlight slug format `/guide/features/dashboard`, not relative paths
- After adding a new page: update `sidebar` in astro.config.mjs

## Directory Structure

- `guide/getting-started/` — Installation, First server
- `guide/features/` — Server lifecycle, plugins, backups, file manager, console
- `guide/configuration/` — Server properties, general settings, theme
- `guide/network/` — ngrok, Velocity/proxy
- `guide/troubleshooting/` — Common errors, performance
- `dev/` — Environment setup, architecture
- `api/typescript/` — Auto-generated (TypeDoc) — gitignored
- `api/rust/` — Rustdoc reference page

## After changes

Run `pnpm --filter @mc-vector/docs build` — catches broken links and build errors.

## Deployment

Merged to `main` → GitHub Actions (`docs.yml`) auto-runs TypeDoc + Astro build and deploys to Vercel.
