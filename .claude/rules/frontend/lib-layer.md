---
paths:
	- src/**/*.{ts,tsx}
---

- UI components must never call raw Tauri APIs or consume raw API payloads directly.
- All async file/system operations go through `src/lib/` wrappers.
- All external API payloads (Modrinth, Hangar, SpigotMC) must pass through runtime type guards in `src/lib/guards/` before reaching the UI.
- Path alias: `@/*` maps to `./src/*`
