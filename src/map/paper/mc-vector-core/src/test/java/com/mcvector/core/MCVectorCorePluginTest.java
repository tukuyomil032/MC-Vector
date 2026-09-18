package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockbukkit.mockbukkit.MockBukkit;
import org.mockbukkit.mockbukkit.ServerMock;
import org.mockbukkit.mockbukkit.entity.PlayerMock;

import net.kyori.adventure.text.Component;

class MCVectorCorePluginTest {
    private ServerMock server;
    private MCVectorCorePlugin plugin;

    @BeforeEach
    void setUp() {
        server = MockBukkit.mock();
        plugin = MockBukkit.load(MCVectorCorePlugin.class);
    }

    @AfterEach
    void tearDown() {
        MockBukkit.unmock();
    }

    @Test
    void enablesWithoutBridgeConfiguration() {
        assertTrue(plugin.isEnabled());
    }

    @Test
    void snapshotsPlayersOnThePaperScheduler() throws InterruptedException {
        PlayerMock player = server.addPlayer("Alex");
        plugin.eventQueueForTests().poll(0);

        server.getScheduler().performTicks(20);

        BridgeEventQueue.Event event = plugin.eventQueueForTests().poll(0);
        assertNotNull(event);
        assertEquals(BridgeEventQueue.Kind.PLAYER_SNAPSHOT, event.kind());
        assertTrue(event.message().contains(player.getUniqueId().toString()));
        assertTrue(event.message().contains("\"name\":\"Alex\""));
    }

    @Test
    void snapshotsEveryWorldStatusOnThePaperScheduler() throws InterruptedException {
        server.addPlayer("Alex");
        plugin.eventQueueForTests().poll(0);

        server.getScheduler().performTicks(20);

        BridgeEventQueue.Event playerSnapshot = plugin.eventQueueForTests().poll(0);
        assertNotNull(playerSnapshot);
        assertEquals(BridgeEventQueue.Kind.PLAYER_SNAPSHOT, playerSnapshot.kind());

        BridgeEventQueue.Event worldStatus = plugin.eventQueueForTests().poll(0);
        assertNotNull(worldStatus);
        assertEquals(BridgeEventQueue.Kind.WORLD_STATUS, worldStatus.kind());
        assertTrue(worldStatus.message().contains("\"type\":\"world_status\""));
        assertTrue(worldStatus.message().contains("\"worlds\":[{"));
        assertTrue(worldStatus.message().contains("\"worldId\":\"world\""));
        assertTrue(worldStatus.message().contains("\"dimension\":\"minecraft:overworld\""));
        assertTrue(worldStatus.message().contains("\"time\":"));
        assertTrue(worldStatus.message().contains("\"fullTime\":"));
        assertTrue(worldStatus.message().contains("\"hasStorm\":"));
        assertTrue(worldStatus.message().contains("\"thundering\":"));
        assertTrue(worldStatus.message().contains("\"weatherDuration\":"));
        assertTrue(worldStatus.message().contains("\"thunderDuration\":"));
        assertTrue(worldStatus.message().contains("\"capturedAt\":"));
        assertEquals(null, plugin.eventQueueForTests().poll(0));
    }

    @Test
    void enqueuesJoinAndQuitEventsImmediately() throws InterruptedException {
        PlayerMock player = server.addPlayer("Alex");
        plugin.eventQueueForTests().poll(0);

        server.getPluginManager().callEvent(new PlayerJoinEvent(player, Component.text("Alex joined")));
        BridgeEventQueue.Event join = plugin.eventQueueForTests().poll(0);
        assertNotNull(join);
        assertEquals(BridgeEventQueue.Kind.IMMEDIATE, join.kind());
        assertTrue(join.message().contains("\"type\":\"player_joined\""));
        assertTrue(join.message().contains("\"player\":{"));

        server.getPluginManager().callEvent(new PlayerQuitEvent(
                player,
                Component.text("Alex left"),
                PlayerQuitEvent.QuitReason.DISCONNECTED));
        BridgeEventQueue.Event quit = plugin.eventQueueForTests().poll(0);
        assertNotNull(quit);
        assertEquals(BridgeEventQueue.Kind.IMMEDIATE, quit.kind());
        assertTrue(quit.message().contains("\"type\":\"player_quit\""));
    }

    @Test
    void coalescesDirtyBlockEventsForTheSameChunk() throws InterruptedException {
        PlayerMock player = server.addPlayer("Alex");
        plugin.eventQueueForTests().poll(0);
        Block block = server.getWorlds().get(0).getBlockAt(0, 64, 0);

        server.getPluginManager().callEvent(new BlockBreakEvent(block, player));
        server.getPluginManager().callEvent(new BlockBreakEvent(block, player));

        BridgeEventQueue.Event dirty = plugin.eventQueueForTests().poll(0);
        assertNotNull(dirty);
        assertEquals(BridgeEventQueue.Kind.DIRTY, dirty.kind());
        assertEquals(null, plugin.eventQueueForTests().poll(0));
    }

    @Test
    void servesLoadedChunksWithoutLoadingUnavailableChunks() throws InterruptedException {
        server.addPlayer("Alex");
        World world = server.getWorlds().get(0);
        world.getChunkAt(0, 0);
        int unloadedChunkX = 1000;
        int unloadedChunkZ = 1000;
        assertFalse(world.isChunkLoaded(unloadedChunkX, unloadedChunkZ));

        plugin.handleBridgeMessageForTests(snapshotRequest("loaded", "minecraft:overworld", 0, 0));
        plugin.handleBridgeMessageForTests(
                snapshotRequest("unloaded", "minecraft:overworld", unloadedChunkX, unloadedChunkZ));

        plugin.serveSnapshotRequestForTests();
        BridgeEventQueue.Event snapshot = plugin.eventQueueForTests().poll(0);
        assertNotNull(snapshot);
        assertTrue(snapshot.message().contains("\"type\":\"chunk_snapshot\""));
        assertTrue(snapshot.message().contains("\"requestId\":\"loaded\""));
        assertTrue(snapshot.message().contains("\"payload\":\""));

        plugin.serveSnapshotRequestForTests();
        BridgeEventQueue.Event unavailable = plugin.eventQueueForTests().poll(0);
        assertNotNull(unavailable);
        assertTrue(unavailable.message().contains("\"type\":\"chunk_snapshot_unavailable\""));
        assertTrue(unavailable.message().contains("\"requestId\":\"unloaded\""));
        assertTrue(unavailable.message().contains("\"reason\":\"not_loaded\""));
        assertFalse(world.isChunkLoaded(unloadedChunkX, unloadedChunkZ));
    }

    @Test
    void rejectsDuplicateRequestIdsAndKeepsOneRequestPerTick() throws InterruptedException {
        plugin.handleBridgeMessageForTests(snapshotRequest("duplicate", "missing-world", 0, 0));
        plugin.handleBridgeMessageForTests(snapshotRequest("duplicate", "missing-world", 1, 1));

        BridgeEventQueue.Event duplicate = plugin.eventQueueForTests().poll(0);
        assertNotNull(duplicate);
        assertTrue(duplicate.message().contains("\"type\":\"chunk_snapshot_unavailable\""));
        assertTrue(duplicate.message().contains("\"requestId\":\"duplicate\""));
        assertTrue(duplicate.message().contains("\"reason\":\"duplicate_request\""));

        plugin.handleBridgeMessageForTests(snapshotRequest("second", "missing-world", 2, 2));
        plugin.serveSnapshotRequestForTests();
        BridgeEventQueue.Event first = plugin.eventQueueForTests().poll(0);
        assertNotNull(first);
        assertTrue(first.message().contains("\"requestId\":\"duplicate\""));
        assertTrue(first.message().contains("\"reason\":\"world_unavailable\""));
        assertEquals(null, plugin.eventQueueForTests().poll(0));

        plugin.serveSnapshotRequestForTests();
        BridgeEventQueue.Event second = plugin.eventQueueForTests().poll(0);
        assertNotNull(second);
        assertTrue(second.message().contains("\"requestId\":\"second\""));
        assertTrue(second.message().contains("\"reason\":\"world_unavailable\""));
    }

    private static String snapshotRequest(String requestId, String dimension, int chunkX, int chunkZ) {
        return "{\"type\":\"chunk_snapshot_request\",\"requestId\":\""
                + requestId
                + "\",\"dimension\":\""
                + dimension
                + "\",\"chunkX\":"
                + chunkX
                + ",\"chunkZ\":"
                + chunkZ
                + "}";
    }
}
