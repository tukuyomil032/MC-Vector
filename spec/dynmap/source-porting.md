# Source Porting

## Strategy

Use the pinned Dynmap source as an implementation reference and, where useful,
copy or translate platform-neutral code under the Apache License 2.0 boundary.
Do not copy the entire repository into the product. Every selected file or
translated symbol is tracked before it becomes release code.

## Porting categories

| Category | Method | Destination |
| --- | --- | --- |
| Matrix/ray/patch mathematics | translate to idiomatic Rust | `src-tauri/src/map/renderer/dynmap` |
| Render patch data model | translate and adapt serde-free domain types | `src-tauri/src/map/domain` |
| Texture/model resolution | translate rules; use MC-Vector asset sources | `src-tauri/src/map/assets` |
| Shader/lighting coefficients | translate with golden fixtures | `src-tauri/src/map/renderer` |
| Bukkit/Paper adapter | reimplement | `src/map/paper` |
| Dynmap lifecycle/storage/web | reimplement or exclude | `application`, `tiles`, React |

## Required file header

Every source file containing translated Dynmap code carries:

```text
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: Dynmap contributors
Origin: <Dynmap source path>
Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
Ported-to: MC-Vector Rust
Changes: <short, concrete summary>
```

The original copyright/license header is retained when source is copied.

## Review gates

Porting is blocked until:

1. the manifest entry exists;
2. the translated code has an equivalent fixture or a documented reason why
   the source behavior cannot be reproduced;
3. the dependency on Java/Bukkit classes is removed or isolated;
4. license and distribution review is recorded;
5. the frontend bundle and Paper JAR do not accidentally include unrelated
   upstream source.

## No fake parity

Renaming a fixed-colour helper to `DynmapRenderer` is not a port. The gate
requires model patches, UV/alpha, projection/traversal, shader/lighting
inputs, and a recognizable golden image.
