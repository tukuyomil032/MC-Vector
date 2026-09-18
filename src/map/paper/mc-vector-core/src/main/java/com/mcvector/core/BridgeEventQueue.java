package com.mcvector.core;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class BridgeEventQueue {
    enum Kind {
        PLAYER_SNAPSHOT,
        WORLD_STATUS,
        IMMEDIATE,
        DIRTY
    }

    enum OfferResult {
        ENQUEUED,
        COALESCED,
        DROPPED
    }

    record DirtyChunkKey(String dimension, int chunkX, int chunkZ) {
    }

    record Event(Kind kind, String message, DirtyChunkKey dirtyKey) {
        static Event playerSnapshot(String message) {
            return new Event(Kind.PLAYER_SNAPSHOT, message, null);
        }

        static Event immediate(String message) {
            return new Event(Kind.IMMEDIATE, message, null);
        }

        static Event worldStatus(String message) {
            return new Event(Kind.WORLD_STATUS, message, null);
        }

        static Event dirty(DirtyChunkKey key, String message) {
            return new Event(Kind.DIRTY, message, key);
        }
    }

    private final LinkedBlockingQueue<Event> queue;
    private final AtomicReference<String> latestPlayerSnapshot = new AtomicReference<>();
    private final AtomicReference<String> latestWorldStatus = new AtomicReference<>();
    private final Set<DirtyChunkKey> queuedDirtyChunks = ConcurrentHashMap.newKeySet();

    BridgeEventQueue(int capacity) {
        if (capacity < 1) {
            throw new IllegalArgumentException("Queue capacity must be positive");
        }
        queue = new LinkedBlockingQueue<>(capacity);
    }

    OfferResult offerImmediate(String message) {
        return queue.offer(Event.immediate(message))
                ? OfferResult.ENQUEUED
                : OfferResult.DROPPED;
    }

    OfferResult offerPlayerSnapshot(String message) {
        latestPlayerSnapshot.set(message);
        queue.removeIf(event -> event.kind() == Kind.PLAYER_SNAPSHOT);
        return queue.offer(Event.playerSnapshot(message))
                ? OfferResult.ENQUEUED
                : OfferResult.DROPPED;
    }

    OfferResult offerWorldStatus(String message) {
        latestWorldStatus.set(message);
        queue.removeIf(event -> event.kind() == Kind.WORLD_STATUS);
        return queue.offer(Event.worldStatus(message))
                ? OfferResult.ENQUEUED
                : OfferResult.DROPPED;
    }

    OfferResult offerDirty(DirtyChunkKey key, String message) {
        if (!queuedDirtyChunks.add(key)) {
            return OfferResult.COALESCED;
        }
        if (queue.offer(Event.dirty(key, message))) {
            return OfferResult.ENQUEUED;
        }
        queuedDirtyChunks.remove(key);
        return OfferResult.DROPPED;
    }

    String latestPlayerSnapshot() {
        return latestPlayerSnapshot.get();
    }

    String latestWorldStatus() {
        return latestWorldStatus.get();
    }

    void removeQueuedSnapshot(String message) {
        queue.removeIf(event -> event.kind() == Kind.PLAYER_SNAPSHOT
                && event.message().equals(message));
    }

    void removeQueuedWorldStatus(String message) {
        queue.removeIf(event -> event.kind() == Kind.WORLD_STATUS
                && event.message().equals(message));
    }

    Event poll(long timeoutMillis) throws InterruptedException {
        Event event = queue.poll(timeoutMillis, TimeUnit.MILLISECONDS);
        if (event != null && event.dirtyKey() != null) {
            queuedDirtyChunks.remove(event.dirtyKey());
        }
        return event;
    }

    int size() {
        return queue.size();
    }
}
