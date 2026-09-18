package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

class WorldStatusSnapshotTest {
    @Test
    void serializesWorldStatusesAsOneWorldStatusEvent() {
        WorldStatusSnapshot snapshot = new WorldStatusSnapshot(
                "world",
                "minecraft:overworld",
                123L,
                4567L,
                true,
                false,
                80,
                40,
                999L);

        assertEquals(
                "{\"type\":\"world_status\",\"worlds\":[{\"worldId\":\"world\","
                        + "\"dimension\":\"minecraft:overworld\",\"time\":123,"
                        + "\"fullTime\":4567,\"hasStorm\":true,\"thundering\":false,"
                        + "\"weatherDuration\":80,\"thunderDuration\":40,\"capturedAt\":999}],"
                        + "\"capturedAt\":999}",
                WorldStatusSnapshot.eventJson(List.of(snapshot), 999L));
    }
}
