# Dynmap Porting Manifest

This file is the provenance ledger for any Dynmap-derived or Dynmap-translated
implementation. An entry is required before source code is copied or
translated into MC-Vector.

## Required entry fields

| Field | Meaning |
| --- | --- |
| `sourceRepository` | Dynmap repository URL |
| `sourceRef` | Immutable tag or commit, not only a branch |
| `sourcePath` | Original file path |
| `sourceSymbols` | Classes/methods or resource entries used |
| `destinationPath` | MC-Vector path |
| `license` | Expected license and attribution |
| `changeSummary` | Java-to-Rust and product-specific changes |
| `fixture` | Test world, model, or image proving behavior |
| `reviewStatus` | pending, reviewed, accepted, rejected |

## Initial candidates

| Source | Intended use | Status |
| --- | --- | --- |
| `DynmapCore/hdmap/IsoHDPerspective.java` | Ray setup, coordinate transform, patch traversal reference | pending |
| `DynmapCore/hdmap/TexturePack.java` | State/model/texture resolution reference | pending |
| `DynmapCore/hdmap/HDBlockModels.java` | Patch and scaled-model representation reference | pending |
| `DynmapCore/hdmap/renderer/*` | Special block geometry reference | pending |
| `DynmapCore/hdmap/*Shader.java` | Shader behavior reference | pending |
| `DynmapCore/hdmap/*Lighting.java` | Light and face shading reference | pending |

No candidate is considered ported until the source ref, license header, and a
focused fixture are recorded.
