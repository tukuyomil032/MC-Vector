---
paths: ['src/**/*.tsx', 'src/styles/**/*.{scss,css}']
---

- Short, one-off Tailwind utilities can stay inline in TSX.
- Long or repeated class chains go into SCSS classes under the appropriate `src/styles/` subdirectory.
- Do not use invalid `@apply` values (e.g., `bg-white/3`); use explicit CSS color values instead.
- Dark-theme palette: background `#09090b` (zinc-950), card `#18181b` (zinc-900), border `#27272a` (zinc-800), accent `#ffffff` (white).
