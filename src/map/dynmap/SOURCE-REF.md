# Dynmap Source Reference

This directory is the checked-in provenance boundary for selected Dynmap v3.0
source snapshots. It is research input for the later Rust renderer and asset
port; it is not a runtime dependency and is not compiled into the frontend or
Paper plugin.

## Pinned source

- Repository: <https://github.com/webbukkit/dynmap>
- Branch used for browsing: `v3.0`
- Immutable source ref: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- Ref URL: <https://github.com/webbukkit/dynmap/tree/93b454efb8802dc7406d6873434f2aeec5c636f4>
- Research date: 2026-09-18
- License text: [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)
- License source URL: <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/LICENSE>
- License SHA-256: `50e6751797c50dedd75ef1b8a0d9e42f5f8472e9fbce91f34718e9f97b0c780a`
- Local attribution: [NOTICE](NOTICE)

The ref and source URLs are copied from the repository's checked-in Dynmap
research corpus. The commit is intentionally immutable; do not replace it with
the moving `v3.0` branch or a guessed successor.

## Selected upstream snapshots

| Local path | Upstream path | Source URL | SHA-256 | Selection reason |
| --- | --- | --- | --- | --- |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java> | `1bd07eb34fbde3638c541807ed93c4545ae845e5f43364d4f82a0af9beee301f` | Small interface boundary for perspective requirements and tile invalidation. |
| `upstream/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | `DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java> | `3e1db6c77caeb84fe2bcbb7d70b5db0b57a204d5b8ff4f139bfda36a54f69dcd` | Directly relevant render-patch data model without copying the full renderer. |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java> | `dcbaacc681a6930ee3ae8e7ee7eb227382e5eb4db69d1564d2f759e4274d3692` | Full source snapshot for the Iso ray/traversal port; not compiled at runtime. |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java> | `ce8a720df763ac3c0815fe4fbe69e5a6673b02f73be464ea869111ca952ecf1c` | Full source snapshot for texture/model mapping comparison; Java runtime dependencies are excluded. |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java> | `cbd857b896f10bb08b057a3f9ddf01ba53242b3ebd9116b163bf26739b0c48c0` | Full source snapshot for patch/model registry comparison. |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java> | `7075f40adc82b7e02a10305f97e78da8eb3809e017b675c1edd8d225e817e896` | Shader contract snapshot for Rust lighting/compositing translation. |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java> | `0dea1ddbb370e04ba49cd8f05d12c46e1cb0e3af0963a4f7dc86cd5c88da5413` | Lighting requirement and sampled-light contract snapshot. |
| observed-only: `DynmapCore/src/main/java/org/dynmap/hdmap/DefaultHDLighting.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/DefaultHDLighting.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/DefaultHDLighting.java> | `1a28537a553019fe86ed4a05b5bea5731b78b4b0fd669a614e1eef2bc9520d0c` | Direct source read for profile/grayscale contract; not copied because MC-Vector does not implement Dynmap's Java lighting registry. |
| observed-only: `DynmapCore/src/main/java/org/dynmap/hdmap/ShadowHDLighting.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/ShadowHDLighting.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/ShadowHDLighting.java> | `c8a08ada2f72806200a3882d3e72f01b4d8c2022fa90f1db130f6e7dd8251ab8` | Direct source read for 16-level shadow scaling and emitted-light precedence; translated selectively into Rust. |
| observed-only: `DynmapCore/src/main/java/org/dynmap/utils/LightLevels.java` | `DynmapCore/src/main/java/org/dynmap/utils/LightLevels.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/LightLevels.java> | `790f276d5a6faabc580728e8f3bdf54f300065041b83346b622391300315b524` | Direct source read for the sky/emitted pair represented by `SurfaceSample`. |
| observed-only: `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackHDShader.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackHDShader.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackHDShader.java> | `b3b788ab9ef1861aac9fa6b1a79f580f2a00e3b301f6895b73ca942ebe8a3763` | Direct source read for face coefficients, alpha continuation, and shader stop behavior; translated selectively into Rust. |
| `upstream/DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` | `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java> | `3b4731e0352a4764dfd975d97e0f1447d294e6b46160ce00805feba4352934e2` | Matrix operation source for the Rust Iso translation. |
| `upstream/DynmapCore/src/main/resources/shaders.txt` | `DynmapCore/src/main/resources/shaders.txt` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/resources/shaders.txt> | `2fa0e7dce0bddd7462f5039c2f1a63153b376708e87afd8687250cb178164675` | Built-in shader rule/resource snapshot for comparison and attribution. |

The selected Java files are verbatim source snapshots. Their upstream
contents did not include a copyright header, so no synthetic header was added;
the exact source path, ref, URL, hash, and Apache attribution are recorded here
and in the manifest.

`DefaultHDLighting.java`, `ShadowHDLighting.java`, `LightLevels.java`, and
`TexturePackHDShader.java` were additionally read from the same immutable ref
for the Phase 11 translation. Their hashes and URLs are recorded above; the
current checkout records them as observed-only because copying the Java
lighting registry would introduce a runtime dependency that MC-Vector does not
want.

## Translated geometry sources

The following sources were read at the same immutable ref and translated into
Rust rather than copied verbatim:

- `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java`
  supplies the azimuth/inclination normalization, world-to-map and map-to-world
  transform order, tile floor convention, and ray construction contract.
- `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` supplies the 3x3
  left-multiply, rotation, shear, scale, and vector transform operations.

The translated destination is
`src-tauri/src/map/renderer/dynmap/iso_hd.rs`. The module carries its own SPDX,
origin, source-ref, destination, and change metadata. It is a geometry slice,
not a complete port of Dynmap's voxel traversal or asset pipeline.

The additional snapshots for `IsoHDPerspective`, `TexturePack`,
`HDBlockModels`, `HDShader`, `HDLighting`, `Matrix3D`, and `shaders.txt` are
kept as source evidence. They make the remaining renderer gap measurable: the
current Rust implementation has translated the matrix/ray boundary, while
texture-pack rules, patch registries, and shader coefficients still require
feature-specific work and fixtures.

## Intentionally not runtime-linked

The upstream snapshots are never added to the Paper Gradle source set or the
frontend bundle. `IsoHDPerspective` has a tracked geometry translation, while
its full voxel/patch traversal and `TexturePack` remain unported. Their exact
paths and future port destinations remain registered in
[porting-manifest.md](porting-manifest.md). No snapshot is evidence that the
corresponding MC-Vector feature is complete.

The pinned repository did not contain a root `NOTICE` file at this ref. The
local [NOTICE](NOTICE) is therefore an MC-Vector attribution artifact, not a
claim that an upstream NOTICE was copied.

The checked upstream NOTICE URL was
<https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/NOTICE>;
the pinned ref returned no such file.
