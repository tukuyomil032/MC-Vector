# License and Attribution

## Dynmap source

Dynmap source is Apache License 2.0 according to the project repository. The
repository also publishes project-specific reuse/support policy text. MC-Vector
must preserve the Apache license, original notices, source references, and any
applicable Dynmap project policy. A release cannot claim legal clearance from
the presence of an SPDX header alone.

When derived code is distributed, include:

- `LICENSE-APACHE-2.0`;
- `NOTICE` naming Dynmap contributors and the source revision;
- `SOURCE-REF.md` with source URLs, paths, commit, and change summary;
- the porting manifest;
- a clear statement that MC-Vector is not Dynmap and is not endorsed by it;
- source availability and modification information required by the applicable
  license/policy review.

## Minecraft assets

Minecraft client JARs, textures, models, and resource packs are separate from
Dynmap code. They are treated as user-owned input, not as third-party source
that MC-Vector may blindly redistribute. Asset packaging, download, caching,
and release screenshots require a separate review against the applicable
Minecraft Usage Guidelines.

## Distribution gate

Before release, a reviewer must verify that:

1. copied/translated source has a manifest row and preserved attribution;
2. generated binaries include the required notices;
3. no user asset is embedded in the repository or release by accident;
4. Dynmap support/endorsement is not implied;
5. license policy changes are reflected in the ADR and release checklist.

## References

- [Dynmap repository](https://github.com/webbukkit/dynmap)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Minecraft Usage Guidelines](https://www.minecraft.net/usage-guidelines)
