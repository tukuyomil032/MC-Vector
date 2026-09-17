package com.mcvector.core;

import java.util.Optional;

record BridgeConfig(
        String serverId,
        String host,
        int port,
        String token,
        int protocolVersion,
        String pluginVersion) {
    static Optional<BridgeConfig> parse(
            String managedBy,
            String serverId,
            String host,
            int port,
            String token,
            int protocolVersion,
            String pluginVersion) {
        if (!"MC-Vector".equals(managedBy)
                || serverId == null
                || serverId.isBlank()
                || !"127.0.0.1".equals(host)
                || port <= 0
                || port > 65_535
                || token == null
                || token.length() < 16
                || protocolVersion != 2
                || pluginVersion == null
                || pluginVersion.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new BridgeConfig(serverId, host, port, token, protocolVersion, pluginVersion));
    }
}
