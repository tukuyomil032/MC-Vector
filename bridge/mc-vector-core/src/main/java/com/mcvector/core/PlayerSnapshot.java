package com.mcvector.core;

import java.time.Instant;
import java.util.UUID;

import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;

record PlayerSnapshot(
        UUID playerId,
        String name,
        String dimension,
        double x,
        double y,
        double z,
        float yaw,
        float pitch,
        long capturedAt) {
    static PlayerSnapshot from(Player player) {
        Location location = player.getLocation();
        return new PlayerSnapshot(
                player.getUniqueId(),
                player.getName(),
                dimensionKey(player.getWorld()),
                location.getX(),
                location.getY(),
                location.getZ(),
                location.getYaw(),
                location.getPitch(),
                Instant.now().toEpochMilli());
    }

    static String dimensionKey(World world) {
        return switch (world.getEnvironment()) {
            case NORMAL -> "minecraft:overworld";
            case NETHER -> "minecraft:the_nether";
            case THE_END -> "minecraft:the_end";
            case CUSTOM -> world.getKey().toString();
        };
    }

    String toJson() {
        return BridgeJson.object(
                BridgeJson.field("playerId", playerId.toString()),
                BridgeJson.field("name", name),
                BridgeJson.field("dimension", dimension),
                BridgeJson.field("x", x),
                BridgeJson.field("y", y),
                BridgeJson.field("z", z),
                BridgeJson.field("yaw", yaw),
                BridgeJson.field("pitch", pitch),
                BridgeJson.field("capturedAt", capturedAt));
    }
}
