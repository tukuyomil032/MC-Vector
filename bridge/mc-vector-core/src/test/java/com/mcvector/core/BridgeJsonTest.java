package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class BridgeJsonTest {
    @Test
    void escapesJsonStringsAndControlCharacters() {
        assertEquals(
                "\"quote\\\" slash\\\\ backspace\\b formfeed\\f newline\\n return\\r tab\\t \\u0001\"",
                BridgeJson.quote("quote\" slash\\ backspace\b formfeed\f newline\n return\r tab\t \u0001"));
    }

    @Test
    void preservesRawNestedValuesWithoutDoubleEncoding() {
        String message = BridgeJson.object(
                BridgeJson.field("type", "player_joined"),
                BridgeJson.field("player", BridgeJson.raw("{\"name\":\"Alex\"}")),
                BridgeJson.field("capabilities", BridgeJson.raw("[\"player_snapshot\"]")));

        assertEquals(
                "{\"type\":\"player_joined\",\"player\":{\"name\":\"Alex\"},"
                        + "\"capabilities\":[\"player_snapshot\"]}",
                message);
    }

    @Test
    void encodesNumbersAndBooleansAsJsonLiterals() {
        assertEquals("\"count\":3", BridgeJson.field("count", 3));
        assertEquals("\"enabled\":true", BridgeJson.field("enabled", true));
    }

    @Test
    void rejectsNonFiniteNumbers() {
        assertThrows(IllegalArgumentException.class, () -> BridgeJson.field("value", Double.NaN));
        assertThrows(IllegalArgumentException.class, () -> BridgeJson.field("value", Float.POSITIVE_INFINITY));
    }
}
