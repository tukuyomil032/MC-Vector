// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Testing
@testable import MCVectorCore

@Suite("Server creation API")
struct ServerCreationTests {
    @Test func softwareOptionsKeepReactOrderAndGroups() {
        let options = CoreClient.softwareOptions()
        #expect(options.map(\.name) == [
            "Vanilla", "Paper", "LeafMC", "Spigot", "Fabric", "Forge", "NeoForge",
            "Velocity", "Waterfall", "BungeeCord",
        ])
        #expect(options.filter { $0.group == .proxy }.map(\.name) == ["Velocity", "Waterfall", "BungeeCord"])
    }

    @Test func onlyChecksummedSourcesDownloadAutomatically() {
        let automatic = CoreClient.softwareOptions().filter(\.automaticJar).map(\.name)
        #expect(automatic == ["Vanilla", "Paper", "LeafMC"])
    }

    @Test func serverNamesAreCheckedAfterTrimming() {
        #expect(CoreClient.isValidServerName(" survival "))
        #expect(CoreClient.isValidServerName("lobby_2-a"))
        #expect(!CoreClient.isValidServerName("my server"))
        #expect(!CoreClient.isValidServerName("   "))
        #expect(!CoreClient.isValidServerName("../outside"))
    }

    @Test func cancellingAnUnknownCreationReportsFalse() {
        #expect(!CoreClient.cancelServerCreation(operationID: UUID().uuidString.lowercased()))
    }
}
