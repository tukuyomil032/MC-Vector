package org.mcvector.dynmap.reference;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.dynmap.hdmap.renderer.BoxRenderer;
import org.dynmap.hdmap.renderer.CuboidRenderer;
import org.dynmap.hdmap.renderer.PaneRenderer;
import org.dynmap.hdmap.renderer.PlantRenderer;
import org.dynmap.renderer.CustomRenderer;
import org.dynmap.renderer.DynmapBlockState;
import org.dynmap.renderer.MapDataContext;
import org.dynmap.renderer.RenderPatch;
import org.dynmap.renderer.RenderPatchFactory;
import org.dynmap.renderer.RenderPatchFactory.SideVisible;

/**
 * Fixture-only runner for pinned Dynmap renderer classes.
 *
 * The harness executes the upstream Java renderer and emits a deterministic
 * intermediate patch trace. It deliberately has no Bukkit, web, storage, or
 * plugin lifecycle dependency.
 */
public final class ReferenceHarness {
    private ReferenceHarness() {
    }

    public static void main(String[] args) {
        if (args.length != 1) {
            throw new IllegalArgumentException("expected renderer name");
        }
        CustomRenderer renderer = renderer(args[0]);
        RecordingPatchFactory factory = new RecordingPatchFactory();
        if (!renderer.initializeRenderer(factory, "minecraft:fixture", new BitSet(), Map.of())) {
            throw new IllegalStateException("renderer initialization failed");
        }
        RenderPatch[] patches = renderer.getRenderPatchList(new FixtureContext(factory));
        System.out.println(trace(args[0], patches));
    }

    private static CustomRenderer renderer(String name) {
        return switch (name) {
            case "box" -> new BoxRenderer();
            case "cuboid" -> new CuboidRenderer();
            case "pane" -> new PaneRenderer();
            case "plant" -> new PlantRenderer();
            default -> throw new IllegalArgumentException("unsupported fixture renderer: " + name);
        };
    }

    private static String trace(String name, RenderPatch[] patches) {
        StringBuilder output = new StringBuilder();
        output.append("{\"renderer\":\"").append(name).append("\",\"patches\":[");
        for (int index = 0; index < patches.length; index++) {
            if (index > 0) {
                output.append(',');
            }
            RecordingPatch patch = (RecordingPatch) patches[index];
            output.append(patch.toJson());
        }
        output.append("]}");
        return output.toString();
    }

    private static final class FixtureContext implements MapDataContext {
        private final RenderPatchFactory factory;

        private FixtureContext(RenderPatchFactory factory) {
            this.factory = factory;
        }

        @Override
        public RenderPatchFactory getPatchFactory() {
            return factory;
        }

        @Override
        public DynmapBlockState getBlockType() {
            return new DynmapBlockState();
        }

        @Override
        public Object getBlockTileEntityField(String fieldId) {
            return null;
        }

        @Override
        public DynmapBlockState getBlockTypeAt(int xoff, int yoff, int zoff) {
            return new DynmapBlockState();
        }

        @Override
        public Object getBlockTileEntityFieldAt(String fieldId, int xoff, int yoff, int zoff) {
            return null;
        }

        @Override
        public int getX() {
            return 0;
        }

        @Override
        public int getY() {
            return 0;
        }

        @Override
        public int getZ() {
            return 0;
        }
    }

    private static final class RecordingPatchFactory implements RenderPatchFactory {
        @Override
        public RenderPatch getPatch(double x0, double y0, double z0, double xu, double yu, double zu,
                                    double xv, double yv, double zv, double umin, double umax,
                                    double vmin, double vmax, SideVisible sidevis, int textureidx) {
            return new RecordingPatch(x0, y0, z0, xu, yu, zu, xv, yv, zv, umin, umax, vmin, vmax,
                    vmin, vmax, sidevis, textureidx);
        }

        @Override
        public RenderPatch getPatch(double x0, double y0, double z0, double xu, double yu, double zu,
                                    double xv, double yv, double zv, double umin, double umax,
                                    double vmin, double vminatumax, double vmax, double vmaxatumax,
                                    SideVisible sidevis, int textureidx) {
            return new RecordingPatch(x0, y0, z0, xu, yu, zu, xv, yv, zv, umin, umax, vmin, vmax,
                    vminatumax, vmaxatumax, sidevis, textureidx);
        }

        @Override
        public RenderPatch getPatch(double x0, double y0, double z0, double xu, double yu, double zu,
                                    double xv, double yv, double zv, double uplusvmax,
                                    SideVisible sidevis, int textureidx) {
            return getPatch(x0, y0, z0, xu, yu, zu, xv, yv, zv, 0.0, 1.0, 0.0, uplusvmax,
                    sidevis, textureidx);
        }

        @Override
        public RenderPatch getRotatedPatch(RenderPatch patch, double xrot, double yrot, double zrot,
                                           int textureidx) {
            return patch;
        }

        @Override
        public RenderPatch getRotatedPatch(RenderPatch patch, double xrot, double yrot, double zrot,
                                           double rotorigx, double rotorigy, double rotorigz,
                                           int textureidx) {
            return patch;
        }

        @Override
        public RenderPatch getRotatedPatch(RenderPatch patch, int xrot, int yrot, int zrot,
                                           int textureidx) {
            return patch;
        }

        @Override
        public RenderPatch getNamedPatch(String name, int textureidx) {
            throw new UnsupportedOperationException("named patches are not part of this fixture");
        }

        @Override
        public int getTextureIndexFromMap(String id, int key) {
            return -1;
        }

        @Override
        public int getTextureCountFromMap(String id) {
            return -1;
        }
    }

    private static final class RecordingPatch implements RenderPatch {
        private final double[] geometry;
        private final double umin;
        private final double umax;
        private final double vmin;
        private final double vmax;
        private final double vminAtUmax;
        private final double vmaxAtUmax;
        private final SideVisible sideVisible;
        private final int textureIndex;

        private RecordingPatch(double x0, double y0, double z0, double xu, double yu, double zu,
                               double xv, double yv, double zv, double umin, double umax,
                               double vmin, double vmax, double vminAtUmax, double vmaxAtUmax,
                               SideVisible sideVisible, int textureIndex) {
            this.geometry = new double[] {x0, y0, z0, xu, yu, zu, xv, yv, zv};
            this.umin = umin;
            this.umax = umax;
            this.vmin = vmin;
            this.vmax = vmax;
            this.vminAtUmax = vminAtUmax;
            this.vmaxAtUmax = vmaxAtUmax;
            this.sideVisible = sideVisible;
            this.textureIndex = textureIndex;
        }

        @Override
        public int getTextureIndex() {
            return textureIndex;
        }

        private String toJson() {
            StringBuilder output = new StringBuilder("{\"geometry\":[");
            for (int index = 0; index < geometry.length; index++) {
                if (index > 0) {
                    output.append(',');
                }
                output.append(Double.toString(geometry[index]));
            }
            output.append("],\"uv\":[")
                    .append(umin).append(',').append(umax).append(',')
                    .append(vmin).append(',').append(vmax).append(',')
                    .append(vminAtUmax).append(',').append(vmaxAtUmax)
                    .append("],\"side\":\"").append(sideVisible)
                    .append("\",\"textureIndex\":").append(textureIndex).append('}');
            return output.toString();
        }
    }
}
