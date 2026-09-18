/*
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: Dynmap contributors
 *
 * Origin: https://github.com/webbukkit/dynmap
 * Source-Ref: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java
 * Ported-to: src-tauri/src/map/renderer/mod.rs
 * Changes: Added a Rust-only renderer boundary; Dynmap runtime, Bukkit, and
 *          Java dependencies are intentionally excluded.
 */

pub(crate) mod dynmap;

pub(crate) use crate::map::render::{render_iso_tile, shade_surface, Face, SurfaceSample};
pub(crate) use dynmap::iso_hd::IsoHDPerspective;
