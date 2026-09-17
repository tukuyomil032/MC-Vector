package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ChunkSnapshotRequestTest {
    @Test
    void parsesTheRustSnapshotRequestContract() {
        var request = ChunkSnapshotRequest.parse(
                "{\"type\":\"chunk_snapshot_request\",\"requestId\":\"req-1\","
                        + "\"dimension\":\"minecraft:overworld\",\"chunkX\":-12,"
                        + "\"chunkZ\":34,\"preferLive\":true}");

        assertTrue(request.isPresent());
        assertEquals("req-1", request.get().requestId());
        assertEquals("minecraft:overworld", request.get().dimension());
        assertEquals(-12, request.get().chunkX());
        assertEquals(34, request.get().chunkZ());
    }

    @Test
    void rejectsWrongMessageTypesAndIncompleteCoordinates() {
        assertTrue(ChunkSnapshotRequest.parse("{\"type\":\"heartbeat\"}").isEmpty());
        assertTrue(ChunkSnapshotRequest.parse(
                "{\"type\":\"chunk_snapshot_request\",\"requestId\":\"req\","
                        + "\"dimension\":\"minecraft:overworld\",\"chunkX\":0}").isEmpty());
    }

    @Test
    void rejectsBlankIdentifiersAndDimensions() {
        assertTrue(ChunkSnapshotRequest.parse(
                "{\"type\":\"chunk_snapshot_request\",\"requestId\":\"\","
                        + "\"dimension\":\"minecraft:overworld\",\"chunkX\":0,\"chunkZ\":0}")
                .isEmpty());
        assertTrue(ChunkSnapshotRequest.parse(
                "{\"type\":\"chunk_snapshot_request\",\"requestId\":\"req\","
                        + "\"dimension\":\"\",\"chunkX\":0,\"chunkZ\":0}").isEmpty());
    }
}
