package com.mcvector.core;

import java.util.UUID;

record ChatMessage(UUID playerId, String name, String message, long capturedAt) {
    String toJson() {
        return BridgeJson.object(
                BridgeJson.field("type", "chat_message"),
                BridgeJson.field("playerId", playerId.toString()),
                BridgeJson.field("name", name),
                BridgeJson.field("message", message),
                BridgeJson.field("capturedAt", capturedAt));
    }
}
