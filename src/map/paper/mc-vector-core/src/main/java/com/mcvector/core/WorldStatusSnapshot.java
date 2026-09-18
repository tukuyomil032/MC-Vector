package com.mcvector.core;

import java.util.List;

import org.bukkit.World;

record WorldStatusSnapshot(
        String worldId,
        String dimension,
        long time,
        long fullTime,
        boolean hasStorm,
        boolean thundering,
        int weatherDuration,
        int thunderDuration,
        long capturedAt) {
    static WorldStatusSnapshot from(World world, long capturedAt) {
        return new WorldStatusSnapshot(
                world.getName(),
                PlayerSnapshot.dimensionKey(world),
                world.getTime(),
                world.getFullTime(),
                world.hasStorm(),
                world.isThundering(),
                world.getWeatherDuration(),
                world.getThunderDuration(),
                capturedAt);
    }

    String toJson() {
        return BridgeJson.object(
                BridgeJson.field("worldId", worldId),
                BridgeJson.field("dimension", dimension),
                BridgeJson.field("time", time),
                BridgeJson.field("fullTime", fullTime),
                BridgeJson.field("hasStorm", hasStorm),
                BridgeJson.field("thundering", thundering),
                BridgeJson.field("weatherDuration", weatherDuration),
                BridgeJson.field("thunderDuration", thunderDuration),
                BridgeJson.field("capturedAt", capturedAt));
    }

    static String eventJson(List<WorldStatusSnapshot> worlds, long capturedAt) {
        return BridgeJson.object(
                BridgeJson.field("type", "world_status"),
                BridgeJson.field(
                        "worlds",
                        BridgeJson.raw("[" + String.join(",", worlds.stream().map(WorldStatusSnapshot::toJson).toList())
                                + "]")),
                BridgeJson.field("capturedAt", capturedAt));
    }
}
