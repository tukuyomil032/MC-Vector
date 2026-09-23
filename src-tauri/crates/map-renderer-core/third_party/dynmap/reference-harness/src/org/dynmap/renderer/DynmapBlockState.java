package org.dynmap.renderer;

/**
 * Minimal fixture-only type boundary for the Dynmap renderer reference harness.
 * Bukkit state registration is intentionally not part of this harness.
 */
public final class DynmapBlockState {
    public static final DynmapBlockState GLASS_BLOCK = new DynmapBlockState();
    public int stateIndex;

    public boolean is(DynmapBlockState other) {
        return this == other;
    }
}
