---
paths: ["src/**/*.tsx", "src/styles/**/*.{scss,css}"]
---

- Short, one-off Tailwind utilities can stay inline in TSX.
- Long or repeated class chains go into SCSS classes under the appropriate `src/styles/` subdirectory.
- Do not use invalid `@apply` values (e.g., `bg-white/3`); use explicit CSS color values instead.
- Dark-theme palette: background `#121214`, accent `#5865F2`.
