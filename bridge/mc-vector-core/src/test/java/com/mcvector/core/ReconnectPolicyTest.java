package com.mcvector.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ReconnectPolicyTest {
    @Test
    void doublesFromOneSecondAndCapsAtThirtySeconds() {
        ReconnectPolicy policy = new ReconnectPolicy();

        assertEquals(1, policy.delayBeforeNextAttempt());
        assertEquals(2, policy.delayBeforeNextAttempt());
        assertEquals(4, policy.delayBeforeNextAttempt());
        assertEquals(8, policy.delayBeforeNextAttempt());
        assertEquals(16, policy.delayBeforeNextAttempt());
        assertEquals(30, policy.delayBeforeNextAttempt());
        assertEquals(30, policy.delayBeforeNextAttempt());
    }

    @Test
    void resetStartsThePolicyAtOneSecondAgain() {
        ReconnectPolicy policy = new ReconnectPolicy();
        policy.delayBeforeNextAttempt();
        policy.delayBeforeNextAttempt();

        policy.reset();

        assertEquals(1, policy.delayBeforeNextAttempt());
    }
}
