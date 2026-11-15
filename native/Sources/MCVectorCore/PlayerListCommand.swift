// SPDX-License-Identifier: GPL-3.0-or-later

/// Builds the same live command used by the React Users view after a list
/// mutation has persisted and returned its canonical target.
public enum PlayerListCommand {
    public static func command(
        for list: PlayerListKind,
        action: PlayerListAction,
        target: String
    ) -> String {
        switch list {
        case .whitelist:
            switch action {
            case .add: "whitelist add \(target)"
            case .remove: "whitelist remove \(target)"
            }
        case .ops:
            switch action {
            case .add: "op \(target)"
            case .remove: "deop \(target)"
            }
        case .bannedPlayers:
            switch action {
            case .add: "ban \(target)"
            case .remove: "pardon \(target)"
            }
        case .bannedIps:
            switch action {
            case .add: "ban-ip \(target)"
            case .remove: "pardon-ip \(target)"
            }
        }
    }
}
