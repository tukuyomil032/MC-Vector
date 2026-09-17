package com.mcvector.core;

final class ReconnectPolicy {
    private static final int INITIAL_DELAY_SECONDS = 1;
    private static final int MAX_DELAY_SECONDS = 30;

    private int nextDelaySeconds = INITIAL_DELAY_SECONDS;

    int delayBeforeNextAttempt() {
        int delay = nextDelaySeconds;
        nextDelaySeconds = Math.min(MAX_DELAY_SECONDS, nextDelaySeconds * 2);
        return delay;
    }

    void reset() {
        nextDelaySeconds = INITIAL_DELAY_SECONDS;
    }
}
