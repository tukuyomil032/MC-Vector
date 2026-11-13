// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Testing
@testable import MCVectorCore

@Suite("CoreError")
struct CoreErrorTests {
    @Test func mapsFfiErrorFields() {
        let error = CoreError(FfiError.Core(code: "lock.unavailable", message: "m", retryable: false))
        #expect(error == CoreError(code: "lock.unavailable", message: "m", retryable: false))
    }

    @Test func localizationKeyPrefixesCode() {
        let error = CoreError(code: "registry.read_failed", message: "m", retryable: true)
        #expect(error.localizationKey == "error.registry.read_failed")
    }

    @Test func unknownCodeFallsBackToCoreMessageWithoutStrings() {
        // The test bundle has no Localizable.strings, so the core message is the fallback.
        let error = CoreError(code: "nope.nothing", message: "plain message", retryable: false)
        #expect(error.localizedText(bundle: Bundle(for: BundleToken.self)) == "plain message")
    }

    @Test func unexpectedWrapsForeignErrors() {
        struct Foreign: Error {}
        #expect(CoreError.unexpected(Foreign()).code == "internal.unknown")
    }

    @Test func getServersBeforeStartReportsNotStarted() async {
        // start() is never called in the test process, so the core refuses data access.
        await #expect(throws: CoreError.self) { try await CoreClient.servers() }
        do {
            _ = try await CoreClient.servers()
        } catch {
            #expect(error.code == "core.not_started")
        }
    }
}

private final class BundleToken {}
