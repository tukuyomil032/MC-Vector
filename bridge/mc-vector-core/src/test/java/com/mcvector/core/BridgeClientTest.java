package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

class BridgeClientTest {
    private static final String ACKNOWLEDGEMENT =
            "{\"type\":\"hello_ack\",\"accepted\":true,\"protocolVersion\":2}";

    @Test
    void sendsHelloAndQueuedEventsAfterAcceptedHandshake() throws Exception {
        BridgeEventQueue queue = new BridgeEventQueue(4);
        queue.offerImmediate("{\"type\":\"player_quit\"}");
        BridgeConfig config = new BridgeConfig("server-a", "127.0.0.1", 0, "1234567890123456", 2, "0.1.0");
        AtomicBoolean shuttingDown = new AtomicBoolean(false);
        ExecutorService serverExecutor = Executors.newSingleThreadExecutor();

        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            BridgeConfig listeningConfig = new BridgeConfig(
                    config.serverId(), config.host(), server.getLocalPort(), config.token(),
                    config.protocolVersion(), config.pluginVersion());
            Future<String> received = serverExecutor.submit(() -> {
                try (Socket socket = server.accept();
                        BufferedReader reader = new BufferedReader(
                                new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        BufferedWriter writer = new BufferedWriter(
                                new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {
                    String hello = reader.readLine();
                    writer.write(ACKNOWLEDGEMENT);
                    writer.newLine();
                    writer.flush();
                    assertEquals("{\"type\":\"player_quit\"}", reader.readLine());
                    return hello;
                }
            });

            BridgeClient client = new BridgeClient(
                    shuttingDown,
                    queue,
                    () -> listeningConfig,
                    value -> "{\"type\":\"hello\",\"serverId\":\"" + value.serverId() + "\"}",
                    ignored -> { });
            try {
                client.start();
                assertEquals("{\"type\":\"hello\",\"serverId\":\"server-a\"}",
                        received.get(5, TimeUnit.SECONDS));
            } finally {
                client.close();
            }
        } finally {
            serverExecutor.shutdownNow();
        }
    }

    @Test
    void backsOffAfterRejectedHandshakeWithoutBlockingTheCaller() throws Exception {
        BridgeEventQueue queue = new BridgeEventQueue(4);
        BridgeConfig config = new BridgeConfig("server-a", "127.0.0.1", 0, "1234567890123456", 2, "0.1.0");
        AtomicBoolean shuttingDown = new AtomicBoolean(false);
        CountDownLatch rejected = new CountDownLatch(1);
        AtomicReference<Throwable> serverError = new AtomicReference<>();
        ExecutorService serverExecutor = Executors.newSingleThreadExecutor();

        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            BridgeConfig listeningConfig = new BridgeConfig(
                    config.serverId(), config.host(), server.getLocalPort(), config.token(),
                    config.protocolVersion(), config.pluginVersion());
            serverExecutor.submit(() -> {
                try (Socket socket = server.accept();
                        BufferedReader reader = new BufferedReader(
                                new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        BufferedWriter writer = new BufferedWriter(
                                new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {
                    reader.readLine();
                    writer.write("{\"type\":\"hello_ack\",\"accepted\":false,\"reason\":\"authentication_failed\"}");
                    writer.newLine();
                    writer.flush();
                } catch (Throwable error) {
                    serverError.set(error);
                }
            });

            BridgeClient client = new BridgeClient(
                    shuttingDown,
                    queue,
                    () -> listeningConfig,
                    ignored -> "{\"type\":\"hello\"}",
                    ignored -> rejected.countDown());
            try {
                client.start();
                assertTrue(rejected.await(5, TimeUnit.SECONDS));
                assertEquals(null, serverError.get());
            } finally {
                client.close();
            }
        } finally {
            serverExecutor.shutdownNow();
        }
    }
}
