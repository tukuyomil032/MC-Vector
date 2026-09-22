# ADR-MAP-0001: Map Renderer Scope and Boundary

MC-Vector ports the Dynmap renderer dependency closure required by its Map
feature. It includes all Dynmap built-in renderers and the renderer API
contracts they require. It excludes Bukkit lifecycle, Dynmap Web, Dynmap
storage format, Bukkit commands, permissions, and individual third-party
renderer implementations.

MC-Vector replaces excluded product infrastructure with its own Tauri, cache,
scheduler, bridge, and UI contracts. Renderer input and failure semantics are
not excluded merely because the original owner was Dynmap infrastructure.

Every exact Minecraft Java Edition version registered in the inclusive `1.14`
through `26.3` matrix is an individual compatibility target.
