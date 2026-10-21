package org.dynmap;

/** Fixture-only logger boundary. */
public final class Log {
    private Log() {
    }

    public static void severe(String message) {
        throw new IllegalArgumentException(message);
    }
}
