package com.mcvector.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockExplodeEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.block.BlockPistonExtendEvent;
import org.bukkit.event.block.BlockPistonRetractEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * The Paper-side half of MC-Vector Map.
 *
 * <p>This class deliberately contains no terrain renderer and no world-file
 * access. The Paper thread only observes lightweight event data and refreshes
 * a coalesced player snapshot. Socket I/O is delegated to {@link BridgeClient}.
 * </p>
 */
public class MCVectorCorePlugin extends JavaPlugin implements Listener {
    private static final int QUEUE_CAPACITY = 512;
    private static final int SNAPSHOT_REQUEST_CAPACITY = 128;
    private static final int SNAPSHOT_REQUESTS_PER_TICK = 1;
    private static final long SNAPSHOT_PERIOD_TICKS = 20L;

    private final AtomicBoolean shuttingDown = new AtomicBoolean(false);
    private final AtomicReference<BridgeConfig> bridgeConfig = new AtomicReference<>();
    private final BridgeEventQueue eventQueue = new BridgeEventQueue(QUEUE_CAPACITY);
    private final ConcurrentLinkedQueue<ChunkSnapshotRequest> snapshotRequests =
            new ConcurrentLinkedQueue<>();
    private final Set<String> queuedSnapshotRequestIds = ConcurrentHashMap.newKeySet();

    private BukkitTask snapshotTask;
    private BukkitTask snapshotRequestTask;
    private BridgeClient bridgeClient;
    private String minecraftVersion;
    private String paperVersion;

    @Override
    public void onEnable() {
        minecraftVersion = Bukkit.getMinecraftVersion();
        paperVersion = Bukkit.getVersion();
        bridgeConfig.set(loadBridgeConfig());
        if (bridgeConfig.get() == null) {
            getLogger().warning("MC-Vector bridge configuration is unavailable; reconnect is paused");
        }

        Bukkit.getPluginManager().registerEvents(this, this);
        snapshotTask = Bukkit.getScheduler().runTaskTimer(this, this::capturePlayerSnapshot,
                SNAPSHOT_PERIOD_TICKS, SNAPSHOT_PERIOD_TICKS);
        snapshotRequestTask = Bukkit.getScheduler().runTaskTimer(this, this::serveSnapshotRequest, 1L, 1L);

        bridgeClient = new BridgeClient(
                shuttingDown,
                eventQueue,
                this::currentBridgeConfig,
                this::helloMessage,
                message -> getLogger().fine(message),
                this::handleInboundMessage);
        bridgeClient.start();
    }

    @Override
    public void onDisable() {
        shuttingDown.set(true);
        if (snapshotTask != null) {
            snapshotTask.cancel();
        }
        if (snapshotRequestTask != null) {
            snapshotRequestTask.cancel();
        }
        if (bridgeClient != null) {
            bridgeClient.close();
        }
    }

    private BridgeConfig currentBridgeConfig() {
        BridgeConfig existing = bridgeConfig.get();
        if (existing != null) {
            return existing;
        }
        BridgeConfig loaded = loadBridgeConfig();
        if (loaded != null) {
            bridgeConfig.compareAndSet(null, loaded);
        }
        return bridgeConfig.get();
    }

    private BridgeConfig loadBridgeConfig() {
        Path pluginsDirectory = getDataFolder().toPath().getParent();
        if (pluginsDirectory == null) {
            return null;
        }
        Path configPath = pluginsDirectory.resolve("mc-vector-core.yml");
        if (!Files.isRegularFile(configPath)) {
            return null;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(configPath.toFile());
        String managedBy = yaml.getString("managed-by", "");
        String serverId = yaml.getString("server-id", "");
        String host = yaml.getString("host", "127.0.0.1");
        String token = yaml.getString("token", "");
        int port = yaml.getInt("port", 0);
        int protocolVersion = yaml.getInt("protocol-version", 0);
        String pluginVersion = yaml.getString("plugin-version", getPluginMeta().getVersion());

        Optional<BridgeConfig> parsed = BridgeConfig.parse(
                managedBy,
                serverId,
                host,
                port,
                token,
                protocolVersion,
                pluginVersion);
        if (parsed.isEmpty()) {
            getLogger().warning("MC-Vector bridge configuration is invalid; reconnect is paused");
            return null;
        }
        return parsed.get();
    }

    private void capturePlayerSnapshot() {
        List<String> players = new ArrayList<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            players.add(PlayerSnapshot.from(player).toJson());
        }
        long capturedAt = Instant.now().toEpochMilli();
        String snapshot = BridgeJson.object(
                BridgeJson.field("type", "player_snapshot"),
                BridgeJson.field("players", BridgeJson.raw("[" + String.join(",", players) + "]")),
                BridgeJson.field("capturedAt", capturedAt));
        if (eventQueue.offerPlayerSnapshot(snapshot) == BridgeEventQueue.OfferResult.DROPPED) {
            getLogger().fine("MC-Vector bridge queue is full; dropping a player snapshot marker");
        }
        List<WorldStatusSnapshot> worldStatuses = new ArrayList<>();
        for (World world : Bukkit.getWorlds()) {
            worldStatuses.add(WorldStatusSnapshot.from(world, capturedAt));
        }
        String worldStatus = WorldStatusSnapshot.eventJson(worldStatuses, capturedAt);
        if (eventQueue.offerWorldStatus(worldStatus) == BridgeEventQueue.OfferResult.DROPPED) {
            getLogger().fine("MC-Vector bridge queue is full; dropping a world status marker");
        }
    }

    private String helloMessage(BridgeConfig config) {
        return BridgeJson.object(
                BridgeJson.field("protocolVersion", config.protocolVersion()),
                BridgeJson.field("type", "hello"),
                BridgeJson.field("serverId", config.serverId()),
                BridgeJson.field("pluginVersion", config.pluginVersion()),
                BridgeJson.field("minecraftVersion", minecraftVersion),
                BridgeJson.field("paperVersion", paperVersion),
                BridgeJson.field(
                        "capabilities",
                        BridgeJson.raw("[\"player_snapshot\",\"world_status\",\"chunk_dirty\",\"chunk_surface_snapshot_v1\"]")),
                BridgeJson.field("token", config.token()));
    }

    private void handleInboundMessage(String message) {
        ChunkSnapshotRequest.parse(message).ifPresent(request -> {
            if (!queuedSnapshotRequestIds.add(request.requestId())) {
                enqueueImmediate(ChunkSnapshotEncoder.unavailable(request, "duplicate_request"));
                return;
            }
            if (snapshotRequests.size() >= SNAPSHOT_REQUEST_CAPACITY
                    || !snapshotRequests.offer(request)) {
                queuedSnapshotRequestIds.remove(request.requestId());
                enqueueImmediate(ChunkSnapshotEncoder.unavailable(request, "queue_full"));
            }
        });
    }

    private void serveSnapshotRequest() {
        for (int count = 0; count < SNAPSHOT_REQUESTS_PER_TICK; count++) {
            ChunkSnapshotRequest request = snapshotRequests.poll();
            if (request == null) {
                return;
            }
            try {
                World world = Bukkit.getWorlds().stream()
                        .filter(candidate -> PlayerSnapshot.dimensionKey(candidate).equals(request.dimension()))
                        .findFirst()
                        .orElse(null);
                if (world == null) {
                    enqueueImmediate(ChunkSnapshotEncoder.unavailable(request, "world_unavailable"));
                    continue;
                }
                if (!world.isChunkLoaded(request.chunkX(), request.chunkZ())) {
                    enqueueImmediate(ChunkSnapshotEncoder.unavailable(request, "not_loaded"));
                    continue;
                }
                Chunk chunk = world.getChunkAt(request.chunkX(), request.chunkZ());
                enqueueImmediate(ChunkSnapshotEncoder.encode(request, world, chunk));
            } finally {
                queuedSnapshotRequestIds.remove(request.requestId());
            }
        }
    }

    private void enqueueImmediate(String message) {
        if (eventQueue.offerImmediate(message) == BridgeEventQueue.OfferResult.DROPPED) {
            getLogger().fine("MC-Vector bridge queue is full; dropping an immediate event");
        }
    }

    private void enqueueDirty(Chunk chunk) {
        World world = chunk.getWorld();
        BridgeEventQueue.DirtyChunkKey key = new BridgeEventQueue.DirtyChunkKey(
                PlayerSnapshot.dimensionKey(world), chunk.getX(), chunk.getZ());
        BridgeEventQueue.OfferResult result = eventQueue.offerDirty(key, BridgeJson.object(
                BridgeJson.field("type", "chunk_dirty"),
                BridgeJson.field("dimension", key.dimension()),
                BridgeJson.field("chunkX", key.chunkX()),
                BridgeJson.field("chunkZ", key.chunkZ()),
                BridgeJson.field("capturedAt", Instant.now().toEpochMilli())));
        if (result == BridgeEventQueue.OfferResult.DROPPED) {
            getLogger().fine("MC-Vector bridge queue is full; dropping a dirty chunk hint");
        }
    }

    BridgeEventQueue eventQueueForTests() {
        return eventQueue;
    }

    void handleBridgeMessageForTests(String message) {
        handleInboundMessage(message);
    }

    void serveSnapshotRequestForTests() {
        serveSnapshotRequest();
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        enqueueImmediate(BridgeJson.object(
                BridgeJson.field("type", "player_joined"),
                BridgeJson.field("player", BridgeJson.raw(PlayerSnapshot.from(event.getPlayer()).toJson())),
                BridgeJson.field("capturedAt", Instant.now().toEpochMilli())));
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        enqueueImmediate(BridgeJson.object(
                BridgeJson.field("type", "player_quit"),
                BridgeJson.field("playerId", event.getPlayer().getUniqueId().toString()),
                BridgeJson.field("capturedAt", Instant.now().toEpochMilli())));
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        enqueueDirty(event.getBlock().getChunk());
    }

    @EventHandler
    public void onBlockPlace(BlockPlaceEvent event) {
        enqueueDirty(event.getBlock().getChunk());
    }

    @EventHandler
    public void onBlockExplode(BlockExplodeEvent event) {
        for (org.bukkit.block.Block block : event.blockList()) {
            enqueueDirty(block.getChunk());
        }
    }

    @EventHandler
    public void onEntityExplode(EntityExplodeEvent event) {
        for (org.bukkit.block.Block block : event.blockList()) {
            enqueueDirty(block.getChunk());
        }
    }

    @EventHandler
    public void onPistonExtend(BlockPistonExtendEvent event) {
        enqueueDirty(event.getBlock().getChunk());
    }

    @EventHandler
    public void onPistonRetract(BlockPistonRetractEvent event) {
        enqueueDirty(event.getBlock().getChunk());
    }
}
