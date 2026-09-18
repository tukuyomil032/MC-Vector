package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class BridgeEventQueueTest {
    @Test
    void replacesOlderPlayerSnapshots() throws InterruptedException {
        BridgeEventQueue queue = new BridgeEventQueue(4);

        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerPlayerSnapshot("old"));
        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerPlayerSnapshot("new"));
        assertEquals("new", queue.latestPlayerSnapshot());
        assertEquals(1, queue.size());
        assertEquals("new", queue.poll(0).message());
    }

    @Test
    void replacesOlderWorldStatusEvents() throws InterruptedException {
        BridgeEventQueue queue = new BridgeEventQueue(2);
        String oldMessage = "{\"type\":\"world_status\",\"worlds\":[],\"capturedAt\":1}";
        String latestMessage = "{\"type\":\"world_status\",\"worlds\":[],\"capturedAt\":2}";

        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerWorldStatus(oldMessage));
        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerWorldStatus(latestMessage));
        assertEquals(latestMessage, queue.latestWorldStatus());
        assertEquals(1, queue.size());

        BridgeEventQueue.Event event = queue.poll(0);
        assertEquals(BridgeEventQueue.Kind.WORLD_STATUS, event.kind());
        assertEquals(latestMessage, event.message());
        assertEquals(null, queue.poll(0));
    }

    @Test
    void coalescesDirtyHintsByDimensionAndChunk() throws InterruptedException {
        BridgeEventQueue queue = new BridgeEventQueue(4);
        BridgeEventQueue.DirtyChunkKey overworld = new BridgeEventQueue.DirtyChunkKey("minecraft:overworld", 4, -2);
        BridgeEventQueue.DirtyChunkKey nether = new BridgeEventQueue.DirtyChunkKey("minecraft:the_nether", 4, -2);

        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerDirty(overworld, "overworld-1"));
        assertEquals(BridgeEventQueue.OfferResult.COALESCED, queue.offerDirty(overworld, "overworld-2"));
        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerDirty(nether, "nether"));

        assertEquals("overworld-1", queue.poll(0).message());
        assertEquals("nether", queue.poll(0).message());
        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerDirty(overworld, "overworld-after-drain"));
    }

    @Test
    void neverBlocksWhenTheQueueIsFull() {
        BridgeEventQueue queue = new BridgeEventQueue(1);

        assertEquals(BridgeEventQueue.OfferResult.ENQUEUED, queue.offerImmediate("first"));
        assertEquals(BridgeEventQueue.OfferResult.DROPPED, queue.offerImmediate("second"));
        assertEquals(1, queue.size());
    }

    @Test
    void retainsTheLatestSnapshotWhenTheBoundedQueueIsFull() {
        BridgeEventQueue queue = new BridgeEventQueue(1);

        queue.offerImmediate("first");

        assertEquals(BridgeEventQueue.OfferResult.DROPPED, queue.offerPlayerSnapshot("latest"));
        assertEquals("latest", queue.latestPlayerSnapshot());
        assertEquals(1, queue.size());
    }

    @Test
    void keepsImmediateEventsInOrder() throws InterruptedException {
        BridgeEventQueue queue = new BridgeEventQueue(3);
        queue.offerImmediate("join");
        queue.offerImmediate("quit");

        assertEquals("join", queue.poll(0).message());
        assertEquals("quit", queue.poll(0).message());
    }
}
