---
paths:
	- src/**/*.{ts,tsx}
---

- Use explicit interfaces for props and shared data structures.
- No `any` in production code. Use `unknown` for external input and narrow with type guards.
- Treat optional properties as nullable; provide safe fallbacks in rendering and install flows.
- Keep discriminated unions explicit for platform/source branching.
- If a guard cannot prove shape safety, fail with a user-visible error rather than unsafe casting.
- All external payloads require `isRecord`-style type guards in `src/lib/guards/`.
- Plugin source adapters implement `PluginSourceAdapter` in `src/lib/adapters/`.
