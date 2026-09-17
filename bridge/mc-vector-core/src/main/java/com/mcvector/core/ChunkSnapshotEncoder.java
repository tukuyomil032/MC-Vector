package com.mcvector.core;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.DeflaterOutputStream;

import org.bukkit.Chunk;
import org.bukkit.ChunkSnapshot;
import org.bukkit.World;
import org.bukkit.block.Biome;
import org.bukkit.block.data.BlockData;

final class ChunkSnapshotEncoder {
    private static final int FORMAT_VERSION = 1;
    private static final int SURFACE_LAYER_LIMIT = 16;
    private static final int MAX_COMPRESSED_PAYLOAD_BYTES = 256 * 1024;

    private ChunkSnapshotEncoder() {
    }

    static String encode(ChunkSnapshotRequest request, World world, Chunk chunk) {
        ChunkSnapshot snapshot = chunk.getChunkSnapshot(true, true, false, true);
        List<String> states = new ArrayList<>();
        Map<String, Integer> stateIndexes = new HashMap<>();
        List<String> biomes = new ArrayList<>();
        Map<String, Integer> biomeIndexes = new HashMap<>();
        List<List<Layer>> columns = new ArrayList<>(16 * 16);
        int minHeight = world.getMinHeight();
        int maxHeight = world.getMaxHeight();

        for (int z = 0; z < 16; z++) {
            for (int x = 0; x < 16; x++) {
                int top = snapshot.getHighestBlockYAt(x, z);
                List<Layer> layers = new ArrayList<>(SURFACE_LAYER_LIMIT);
                for (int offset = 0; offset < SURFACE_LAYER_LIMIT; offset++) {
                    int y = top - offset;
                    if (y < minHeight) {
                        break;
                    }
                    BlockData blockData = snapshot.getBlockData(x, y, z);
                    if (blockData.getMaterial().isAir() && layers.isEmpty()) {
                        continue;
                    }
                    String state = blockData.getAsString();
                    int stateIndex = indexOf(state, states, stateIndexes);
                    Biome biome = snapshot.getBiome(x, y, z);
                    String biomeKey = biome.getKey().toString();
                    int biomeIndex = indexOf(biomeKey, biomes, biomeIndexes);
                    layers.add(new Layer(
                            y,
                            stateIndex,
                            biomeIndex,
                            snapshot.getBlockSkyLight(x, y, z),
                            snapshot.getBlockEmittedLight(x, y, z)));
                    if (blockData.isOccluding()) {
                        break;
                    }
                }
                if (layers.isEmpty()) {
                    String state = "minecraft:air";
                    int stateIndex = indexOf(state, states, stateIndexes);
                    int biomeIndex = indexOf("minecraft:plains", biomes, biomeIndexes);
                    layers.add(new Layer(top, stateIndex, biomeIndex, 15, 0));
                }
                columns.add(layers);
            }
        }

        try {
            byte[] payload = encodePayload(
                    request.chunkX(),
                    request.chunkZ(),
                    minHeight,
                    maxHeight,
                    states,
                    biomes,
                    columns);
            if (payload.length > MAX_COMPRESSED_PAYLOAD_BYTES) {
                return unavailable(request, "payload_too_large");
            }
            return BridgeJson.object(
                    BridgeJson.field("type", "chunk_snapshot"),
                    BridgeJson.field("requestId", request.requestId()),
                    BridgeJson.field("dimension", request.dimension()),
                    BridgeJson.field("chunkX", request.chunkX()),
                    BridgeJson.field("chunkZ", request.chunkZ()),
                    BridgeJson.field("capturedAt", Instant.now().toEpochMilli()),
                    BridgeJson.field("codec", "deflate-base64"),
                    BridgeJson.field("layerLimit", SURFACE_LAYER_LIMIT),
                    BridgeJson.field("payload", Base64.getEncoder().encodeToString(payload)));
        } catch (IOException error) {
            return unavailable(request, "encode_failed");
        }
    }

    static String unavailable(ChunkSnapshotRequest request, String reason) {
        return BridgeJson.object(
                BridgeJson.field("type", "chunk_snapshot_unavailable"),
                BridgeJson.field("requestId", request.requestId()),
                BridgeJson.field("dimension", request.dimension()),
                BridgeJson.field("chunkX", request.chunkX()),
                BridgeJson.field("chunkZ", request.chunkZ()),
                BridgeJson.field("reason", reason));
    }

    private static byte[] encodePayload(
            int chunkX,
            int chunkZ,
            int minHeight,
            int maxHeight,
            List<String> states,
            List<String> biomes,
            List<List<Layer>> columns) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(output);
                DataOutputStream data = new DataOutputStream(deflater)) {
            data.writeInt(0x4D435653);
            data.writeByte(FORMAT_VERSION);
            data.writeInt(chunkX);
            data.writeInt(chunkZ);
            data.writeInt(minHeight);
            data.writeInt(maxHeight);
            writeDictionary(data, states);
            writeDictionary(data, biomes);
            for (List<Layer> column : columns) {
                data.writeByte(column.size());
                for (Layer layer : column) {
                    data.writeShort(layer.y());
                    data.writeShort(layer.stateIndex());
                    data.writeShort(layer.biomeIndex());
                    data.writeByte(layer.skyLight());
                    data.writeByte(layer.blockLight());
                }
            }
        }
        return output.toByteArray();
    }

    private static void writeDictionary(DataOutputStream data, List<String> values) throws IOException {
        data.writeShort(values.size());
        for (String value : values) {
            byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 65_535) {
                throw new IOException("Snapshot dictionary entry is too large");
            }
            data.writeShort(bytes.length);
            data.write(bytes);
        }
    }

    private static int indexOf(String value, List<String> values, Map<String, Integer> indexes) {
        Integer existing = indexes.get(value);
        if (existing != null) {
            return existing;
        }
        int index = values.size();
        values.add(value);
        indexes.put(value, index);
        return index;
    }

    private record Layer(int y, int stateIndex, int biomeIndex, int skyLight, int blockLight) {
    }
}
