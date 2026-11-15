// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Testing
@testable import MCVectorCore

@Suite("Player list commands")
struct PlayerListCommandTests {
    @Test(arguments: [
        (PlayerListKind.whitelist, PlayerListAction.add, "whitelist add Alex"),
        (PlayerListKind.whitelist, PlayerListAction.remove, "whitelist remove Alex"),
        (PlayerListKind.ops, PlayerListAction.add, "op Alex"),
        (PlayerListKind.ops, PlayerListAction.remove, "deop Alex"),
        (PlayerListKind.bannedPlayers, PlayerListAction.add, "ban Alex"),
        (PlayerListKind.bannedPlayers, PlayerListAction.remove, "pardon Alex"),
        (PlayerListKind.bannedIps, PlayerListAction.add, "ban-ip 192.0.2.1"),
        (PlayerListKind.bannedIps, PlayerListAction.remove, "pardon-ip 192.0.2.1"),
    ])
    func mapsEveryListAndActionToTheReactCommand(
        list: PlayerListKind,
        action: PlayerListAction,
        expected: String
    ) {
        let target = list == .bannedIps ? "192.0.2.1" : "Alex"
        #expect(PlayerListCommand.command(for: list, action: action, target: target) == expected)
    }
}
