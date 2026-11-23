// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore

/// What the Files view knows about Minecraft's own files: a world folder's
/// level.dat, a region file's chunk count, or how many tags an NBT file holds.
enum MinecraftFacts: Equatable {
    case world(WorldInfo)
    case regionChunks(UInt32)
    case nbtTags(Int)

    /// Nil for anything else, or when the file cannot be read.
    @MainActor
    static func load(serverID: String, relative: String, row: FileRow) async -> MinecraftFacts? {
        if row.isDirectory {
            // `try?` flattens "no level.dat" (nil) and "unreadable" into nil.
            guard let world = try? await CoreClient.readWorldInfo(serverID: serverID, relative: relative) else {
                return nil
            }
            return .world(world)
        }
        let ext = (row.name as NSString).pathExtension.lowercased()
        if ext == "mca" || ext == "mcr" {
            return (try? await CoreClient.countRegionChunks(serverID: serverID, relative: relative))
                .map(MinecraftFacts.regionChunks)
        }
        if FileKind.isNbt(row.name) {
            return (try? await CoreClient.readNbtTree(serverID: serverID, relative: relative))
                .map { .nbtTags(max(0, $0.nodes.count - 1)) }
        }
        return nil
    }
}
