package org.dynmap.hdmap;

import org.dynmap.renderer.DynmapBlockState;
import org.dynmap.hdmap.TexturePack.BlockTransparency;

/** Fixture-only asset lookup boundary for the pane reference renderer. */
public final class HDBlockStateTextureMap {
    private HDBlockStateTextureMap() {
    }

    public static BlockTransparency getTransparency(DynmapBlockState state) {
        return BlockTransparency.OPAQUE;
    }
}
