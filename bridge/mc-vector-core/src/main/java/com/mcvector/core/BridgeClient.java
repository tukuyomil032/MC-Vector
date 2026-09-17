package com.mcvector.core;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

final class BridgeClient implements AutoCloseable {
    private static final int CONNECT_TIMEOUT_MILLIS = 1_000;
    private static final int HANDSHAKE_TIMEOUT_MILLIS = 2_000;
    private static final long HEARTBEAT_PERIOD_MILLIS = 10_000L;

    private final AtomicBoolean shuttingDown;
    private final BridgeEventQueue eventQueue;
    private final Supplier<BridgeConfig> configSupplier;
    private final Function<BridgeConfig, String> helloMessageFactory;
    private final Consumer<String> diagnosticLogger;
    private final Consumer<String> inboundMessageHandler;
    private final ExecutorService executor;

    BridgeClient(
            AtomicBoolean shuttingDown,
            BridgeEventQueue eventQueue,
            Supplier<BridgeConfig> configSupplier,
            Function<BridgeConfig, String> helloMessageFactory,
            Consumer<String> diagnosticLogger) {
        this(shuttingDown, eventQueue, configSupplier, helloMessageFactory, diagnosticLogger, ignored -> {
        });
    }

    BridgeClient(
            AtomicBoolean shuttingDown,
            BridgeEventQueue eventQueue,
            Supplier<BridgeConfig> configSupplier,
            Function<BridgeConfig, String> helloMessageFactory,
            Consumer<String> diagnosticLogger,
            Consumer<String> inboundMessageHandler) {
        this.shuttingDown = shuttingDown;
        this.eventQueue = eventQueue;
        this.configSupplier = configSupplier;
        this.helloMessageFactory = helloMessageFactory;
        this.diagnosticLogger = diagnosticLogger;
        this.inboundMessageHandler = inboundMessageHandler;
        executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "mc-vector-core-bridge");
            thread.setDaemon(true);
            return thread;
        });
    }

    void start() {
        executor.execute(this::connectionLoop);
    }

    @Override
    public void close() {
        shuttingDown.set(true);
        executor.shutdownNow();
    }

    private void connectionLoop() {
        ReconnectPolicy reconnectPolicy = new ReconnectPolicy();
        while (!shuttingDown.get()) {
            BridgeConfig config = configSupplier.get();
            if (config == null) {
                sleepQuietly(reconnectPolicy.delayBeforeNextAttempt());
                continue;
            }

            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(config.host(), config.port()), CONNECT_TIMEOUT_MILLIS);
                socket.setTcpNoDelay(true);
                sendConnectedSession(socket, config);
                reconnectPolicy.reset();
            } catch (IOException | InterruptedException error) {
                if (!shuttingDown.get()) {
                    int delay = reconnectPolicy.delayBeforeNextAttempt();
                    diagnosticLogger.accept("MC-Vector bridge disconnected; retrying in "
                            + delay + "s");
                    sleepQuietly(delay);
                }
            }
        }
    }

    private void sendConnectedSession(Socket socket, BridgeConfig config)
            throws IOException, InterruptedException {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                BufferedWriter writer = new BufferedWriter(
                        new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {
            sendLine(writer, helloMessageFactory.apply(config));
            socket.setSoTimeout(HANDSHAKE_TIMEOUT_MILLIS);
            String acknowledgement = reader.readLine();
            if (!isAcceptedHandshake(acknowledgement)) {
                throw new IOException("MC-Vector bridge handshake was rejected");
            }
            socket.setSoTimeout(250);

            String snapshot = eventQueue.latestPlayerSnapshot();
            if (snapshot != null) {
                sendLine(writer, snapshot);
                eventQueue.removeQueuedSnapshot(snapshot);
            }

            long nextHeartbeat = System.currentTimeMillis() + HEARTBEAT_PERIOD_MILLIS;
            while (!shuttingDown.get() && !socket.isClosed()) {
                boolean didWork = false;
                try {
                    String inbound = reader.readLine();
                    if (inbound == null) {
                        return;
                    }
                    if (!inbound.isBlank()) {
                        inboundMessageHandler.accept(inbound);
                        didWork = true;
                    }
                } catch (SocketTimeoutException ignored) {
                    // The timeout gives the network thread a chance to drain outbound events.
                }

                for (int count = 0; count < 32; count++) {
                    BridgeEventQueue.Event event = eventQueue.poll(0);
                    if (event == null) {
                        break;
                    }
                    sendLine(writer, event.message());
                    didWork = true;
                }
                long now = System.currentTimeMillis();
                if (now >= nextHeartbeat) {
                    sendLine(writer, BridgeJson.object(
                            BridgeJson.field("type", "heartbeat"),
                            BridgeJson.field("capturedAt", System.currentTimeMillis())));
                    nextHeartbeat = now + HEARTBEAT_PERIOD_MILLIS;
                    didWork = true;
                }
                if (!didWork) {
                    Thread.sleep(10);
                }
            }
        }
    }

    private boolean isAcceptedHandshake(String acknowledgement) {
        return acknowledgement != null
                && acknowledgement.contains("\"accepted\":true")
                && acknowledgement.contains("\"protocolVersion\":2");
    }

    private void sendLine(BufferedWriter writer, String message) throws IOException {
        writer.write(message);
        writer.newLine();
        writer.flush();
    }

    private void sleepQuietly(int seconds) {
        try {
            TimeUnit.SECONDS.sleep(seconds);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
