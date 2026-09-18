package com.mcvector.core;

final class BridgeJson {
    private BridgeJson() {
    }

    static String field(String key, Object value) {
        String encodedValue;
        if (value instanceof Number number) {
            if (number instanceof Double doubleValue && !Double.isFinite(doubleValue)
                    || number instanceof Float floatValue && !Float.isFinite(floatValue)) {
                throw new IllegalArgumentException("JSON numbers must be finite");
            }
            encodedValue = String.valueOf(value);
        } else if (value instanceof Boolean) {
            encodedValue = String.valueOf(value);
        } else if (value instanceof Raw raw) {
            encodedValue = raw.value();
        } else {
            encodedValue = quote(String.valueOf(value));
        }
        return quote(key) + ":" + encodedValue;
    }

    static Raw raw(String value) {
        return new Raw(value);
    }

    static String object(String... fields) {
        return "{" + String.join(",", fields) + "}";
    }

    static String quote(String value) {
        StringBuilder builder = new StringBuilder(value.length() + 2);
        builder.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '\\' -> builder.append("\\\\");
                case '"' -> builder.append("\\\"");
                case '\b' -> builder.append("\\b");
                case '\f' -> builder.append("\\f");
                case '\n' -> builder.append("\\n");
                case '\r' -> builder.append("\\r");
                case '\t' -> builder.append("\\t");
                default -> {
                    if (character < 0x20) {
                        appendUnicodeEscape(builder, character);
                    } else {
                        builder.append(character);
                    }
                }
            }
        }
        return builder.append('"').toString();
    }

    private static void appendUnicodeEscape(StringBuilder builder, char character) {
        final char[] hex = "0123456789abcdef".toCharArray();
        builder.append("\\u0000");
        int offset = builder.length() - 1;
        builder.setCharAt(offset - 3, hex[(character >>> 12) & 0x0f]);
        builder.setCharAt(offset - 2, hex[(character >>> 8) & 0x0f]);
        builder.setCharAt(offset - 1, hex[(character >>> 4) & 0x0f]);
        builder.setCharAt(offset, hex[character & 0x0f]);
    }

    record Raw(String value) {
    }
}
