package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BridgeConfigTest {
    private static final String SERVER_ID = "server-a";
    private static final String HOST = "127.0.0.1";
    private static final String TOKEN = "1234567890123456";
    private static final String VERSION = "0.1.0";

    @Test
    void acceptsAValidManagedLoopbackConfiguration() {
        var result = BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 45_000, TOKEN, 2, VERSION);

        assertTrue(result.isPresent());
        assertEquals(45_000, result.get().port());
    }

    @Test
    void rejectsUnmanagedOrNonLoopbackConfigurations() {
        assertTrue(BridgeConfig.parse("Other", SERVER_ID, HOST, 45_000, TOKEN, 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, "0.0.0.0", 45_000, TOKEN, 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 45_000, TOKEN, 1, VERSION).isEmpty());
    }

    @Test
    void rejectsInvalidPortTokenAndIdentifiers() {
        assertTrue(BridgeConfig.parse("MC-Vector", "", HOST, 45_000, TOKEN, 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 0, TOKEN, 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 65_536, TOKEN, 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 45_000, "short", 2, VERSION).isEmpty());
        assertTrue(BridgeConfig.parse("MC-Vector", SERVER_ID, HOST, 45_000, TOKEN, 2, "").isEmpty());
    }
}
