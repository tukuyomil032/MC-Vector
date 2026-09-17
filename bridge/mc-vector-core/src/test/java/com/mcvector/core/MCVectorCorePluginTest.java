package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
}
