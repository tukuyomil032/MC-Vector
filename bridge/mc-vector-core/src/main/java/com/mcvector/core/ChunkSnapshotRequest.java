package com.mcvector.core;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

record ChunkSnapshotRequest(String requestId, String dimension, int chunkX, int chunkZ) {
    private static final Pattern STRING_FIELD = Pattern.compile(
            "\"([A-Za-z][A-Za-z0-9]*)\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern INTEGER_FIELD = Pattern.compile(
            "\"([A-Za-z][A-Za-z0-9]*)\"\\s*:\\s*(-?\\d+)");

    static Optional<ChunkSnapshotRequest> parse(String json) {
        if (!json.contains("\"type\":\"chunk_snapshot_request\"")
                && !json.matches(".*\"type\"\\s*:\\s*\"chunk_snapshot_request\".*")) {
            return Optional.empty();
        }
        String requestId = stringField(json, "requestId");
        String dimension = stringField(json, "dimension");
        Integer chunkX = integerField(json, "chunkX");
        Integer chunkZ = integerField(json, "chunkZ");
        if (requestId == null || dimension == null || chunkX == null || chunkZ == null
                || requestId.isBlank() || dimension.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new ChunkSnapshotRequest(requestId, dimension, chunkX, chunkZ));
    }

    private static String stringField(String json, String expectedKey) {
        Matcher matcher = STRING_FIELD.matcher(json);
        while (matcher.find()) {
            if (expectedKey.equals(matcher.group(1))) {
                return matcher.group(2);
            }
        }
        return null;
    }

    private static Integer integerField(String json, String expectedKey) {
        Matcher matcher = INTEGER_FIELD.matcher(json);
        while (matcher.find()) {
            if (expectedKey.equals(matcher.group(1))) {
                try {
                    return Integer.valueOf(matcher.group(2));
                } catch (NumberFormatException ignored) {
                    return null;
                }
            }
        }
        return null;
    }
}
