---
name: astro
description: Skill for building with the Astro web framework. Helps create Astro components and pages, configure SSR adapters, set up content collections, deploy static sites, and manage project structure and CLI commands. Use when the user needs to work with Astro, mentions .astro files, asks about static site generation (SSG), islands architecture, content collections, or deploying an Astro project.
license: MIT
metadata: 
  authors: "Astro Team"
  version: "0.0.1"
---

# Astro Usage Guide

**Always consult [docs.astro.build](https://docs.astro.build) for code examples and latest API.**

Astro is the web framework for content-driven websites.

---

## Quick Reference

### File Location
CLI looks for `astro.config.js`, `astro.config.mjs`, `astro.config.cjs`, and `astro.config.ts` in: `./`. Use `--config` for custom path.

### CLI Commands

- `npx astro dev` - Start the development server.
- `npx astro build` - Build your project and write it to disk.
- `npx astro check` - Check your project for errors.
- `npx astro add` - Add an integration.
- `npx astro sync` - Generate TypeScript types for all Astro modules.

**Re-run after adding/changing plugins.**

### Project Structure

Reference [project structure docs](https://docs.astro.build/en/basics/project-structure).

- `src/*` - Project source code (components, pages, styles, images, etc.)
- `src/pages` - **Required.** Defines all pages and routes.
- `src/components` - Components (convention, not required).
- `src/layouts` - Layout components (convention, not required).
- `src/styles` - CSS/Sass files (convention, not required).
- `public/*` - Non-code, unprocessed assets (fonts, icons, etc.); copied as-is to build output.
- `package.json` - Project manifest.
- `astro.config.{js,mjs,cjs,ts}` - Astro configuration file. (recommended)
- `tsconfig.json` - TypeScript configuration file. (recommended)

---

## Core Config Options

| Option | Notes |
|--------|-------|
| `site` | Your final, deployed URL. Used to generate sitemaps and canonical URLs. |

### Example `astro.config.ts`

```ts
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
});
```

---

## Common Workflows

### Creating a Basic Page

Add a file to `src/pages/` — the filename becomes the route:

```astro
---
// src/pages/index.astro
const title = 'Hello, Astro!';
---
<html>
  <head><title>{title}</title></head>
  <body>
    <h1>{title}</h1>
  </body>
</html>
```

### Creating a Component

```astro
---
// src/components/Card.astro
const { title, body } = Astro.props;
---
<div class="card">
  <h2>{title}</h2>
  <p>{body}</p>
</div>
```

### Deploying with an Adapter

1. Add the adapter: `npx astro add vercel --yes` (or `node`, `cloudflare`, `netlify`)
2. Run `npx astro check` to catch type and configuration errors before building.
3. Run `npx astro build` to produce the deployment artifact.
4. Verify the build output directory (e.g. `dist/`) exists and is non-empty before proceeding.
5. Deploy the output per the adapter's documentation.

---

## Adapters

Deploy to your favorite server, serverless, or edge host with build adapters. Use an adapter to enable on-demand rendering in your Astro project.

**Add [Node.js](https://docs.astro.build/en/guides/integrations-guide/node) adapter using astro add:**
```
npx astro add node --yes
```

**Add [Cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare) adapter using astro add:**
```
npx astro add cloudflare --yes
```

**Add [Netlify](https://docs.astro.build/en/guides/integrations-guide/netlify) adapter using astro add:**
```
npx astro add netlify --yes
```

**Add [Vercel](https://docs.astro.build/en/guides/integrations-guide/vercel) adapter using astro add:**
```
npx astro add vercel --yes
```

[Other Community adapters](https://astro.build/integrations/2/?search=&categories%5B%5D=adapters)

---

## Starlight Documentation Sites

[Starlight](https://starlight.astro.build) is Astro's first-party documentation framework.

### Minimum setup (Astro 5 + Starlight 0.30+)

**`astro.config.mjs`** (object-not-array for `social`):
```js
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      social: { github: "https://github.com/org/repo" },  // object, NOT array
      sidebar: [
        { label: "Guide", items: [{ label: "Intro", slug: "guide/intro" }] },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
```

**`src/content.config.ts`** — **required in Astro 5** (omitting it causes deprecation warning):
```ts
import { defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({ schema: docsSchema() }),
};
```

**Sidebar slug validation**: every `slug` listed in the sidebar must have a corresponding `.md` / `.mdx` file in `src/content/docs/`. Missing files cause a 500 error on the homepage. Create stub pages before testing.

### pnpm monorepo commands

When Astro lives inside a pnpm workspace (e.g., `packages: ['docs']` in `pnpm-workspace.yaml`), use filter commands — do **not** use `npx`:

```bash
pnpm --filter @my/docs dev      # dev server → http://localhost:4321
pnpm --filter @my/docs build    # production build → docs/dist/
pnpm --filter @my/docs check    # type-check
```

---

## Troubleshooting

### `Cannot set property code of #<OutputChunkImpl> which has only a getter`

**Symptom**: `astro build` fails with this error in `astro/dist/core/build/plugin.js`. `astro dev` works fine.

**Root cause**: The workspace uses `@voidzero-dev/vite-plus-core` (or similar rolldown-based Vite fork) as a vite override. Rolldown's `OutputChunkImpl.code` is a getter-only native property; Astro's static-build plugin tries to write to it — this works with standard Rollup but fails with rolldown.

**Why dev works but build doesn't**: `astro dev` runs Vite's transform server (no output chunk mutation). `astro build` runs a full Rollup/rolldown bundle pass that calls the post-build hook which attempts `chunk.code = newCode`.

**Fix** — add scoped overrides in `pnpm-workspace.yaml` so Astro uses real Vite instead of the rolldown-based fork:

```yaml
overrides:
  vite: npm:@voidzero-dev/vite-plus-core@latest   # existing — keep as-is
  'astro>vite': 'npm:vite@^6.4.1'                 # force astro to use real vite
  '@my/docs>vite': 'npm:vite@^8.0.3'              # also scope docs package directly
```

After editing, run `pnpm install` and confirm the peer-dep warning shows a real vite version (e.g., `found 6.4.2`) instead of vite-plus-core's version.

---

## Resources

- [Docs](https://docs.astro.build)
- [Starlight Docs](https://starlight.astro.build)
- [Config Reference](https://docs.astro.build/en/reference/configuration-reference/)
- [llms.txt](https://docs.astro.build/llms.txt)
- [GitHub](https://github.com/withastro/astro)
