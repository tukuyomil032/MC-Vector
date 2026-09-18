package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class ChatMessageTest {
    @Test
    void escapesChatPayloadFieldsThroughBridgeJson() {
        UUID playerId = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
        ChatMessage chatMessage = new ChatMessage(
                playerId,
                "Alex\"",
                "Hello\\\nworld",
                999L);

        assertEquals(
                "{\"type\":\"chat_message\",\"playerId\":\"123e4567-e89b-12d3-a456-426614174000\","
                        + "\"name\":\"Alex\\\"\",\"message\":\"Hello\\\\\\nworld\","
                        + "\"capturedAt\":999}",
                chatMessage.toJson());
    }
}
