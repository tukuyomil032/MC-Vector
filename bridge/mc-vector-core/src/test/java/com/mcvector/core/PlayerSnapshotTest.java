package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bukkit.Location;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockbukkit.mockbukkit.MockBukkit;
import org.mockbukkit.mockbukkit.ServerMock;
import org.mockbukkit.mockbukkit.entity.PlayerMock;

class PlayerSnapshotTest {
    private ServerMock server;

    @BeforeEach
    void setUp() {
        server = MockBukkit.mock();
    }

    @AfterEach
    void tearDown() {
        MockBukkit.unmock();
    }

    @Test
    void capturesRequiredPlayerFieldsAndUsesNestedJsonObjectsCorrectly() {
        PlayerMock player = server.addPlayer("Alex");
        player.teleport(new Location(server.getWorlds().get(0), 12.5, 70.0, -4.25, 90.0f, 15.0f));

        PlayerSnapshot snapshot = PlayerSnapshot.from(player);

        assertEquals(player.getUniqueId(), snapshot.playerId());
        assertEquals("Alex", snapshot.name());
        assertEquals("minecraft:overworld", snapshot.dimension());
        assertEquals(12.5, snapshot.x());
        assertEquals(70.0, snapshot.y());
        assertEquals(-4.25, snapshot.z());
        assertEquals(90.0f, snapshot.yaw());
        assertEquals(15.0f, snapshot.pitch());
        assertTrue(snapshot.capturedAt() > 0);

        String json = snapshot.toJson();
        assertTrue(json.contains("\"playerId\":\"" + snapshot.playerId() + "\""));
        assertTrue(json.contains("\"name\":\"Alex\""));
        assertTrue(json.contains("\"x\":12.5"));
        assertTrue(json.contains("\"z\":-4.25"));
        assertFalse(json.contains("\"player\":\"{"));
    }
}
