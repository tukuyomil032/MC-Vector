// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import QuickLookThumbnailing
import SwiftUI

/// Quick Look thumbnails of server files, made on demand and kept for the
/// session. Folders and files Quick Look only draws a generic icon for fall
/// back to the app's own icon.
@MainActor
enum FileThumbnails {
    private static var cache: [String: NSImage] = [:]
    /// Keys Quick Look had no real thumbnail for.
    private static var iconOnly: Set<String> = []

    static func cached(_ key: String) -> NSImage? { cache[key] }

    static func hasNone(_ key: String) -> Bool { iconOnly.contains(key) }

    /// `key` includes the size and modification time, so an edited file gets a
    /// new thumbnail.
    static func key(serverID: String, relative: String, modified: Date, size: CGFloat) -> String {
        "\(serverID)/\(relative)@\(Int(modified.timeIntervalSince1970))x\(Int(size))"
    }

    static func load(serverID: String, relative: String, key: String, size: CGFloat, scale: CGFloat) async -> NSImage? {
        if let image = cache[key] { return image }
        if iconOnly.contains(key) { return nil }
        guard let url = try? CoreClient.fileEntryURL(serverID: serverID, relative: relative) else { return nil }
        let request = QLThumbnailGenerator.Request(
            fileAt: url, size: CGSize(width: size, height: size), scale: scale, representationTypes: .thumbnail)
        let image = await withCheckedContinuation { (continuation: CheckedContinuation<NSImage?, Never>) in
            QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { representation, _ in
                continuation.resume(returning: representation?.type == .thumbnail ? representation?.nsImage : nil)
            }
        }
        if let image { cache[key] = image } else { iconOnly.insert(key) }
        return image
    }
}

/// A file's Quick Look thumbnail at `size`, or its icon while loading and when
/// there is none (folders always show their icon).
struct FileThumbnailView: View {
    let serverID: String
    let relative: String
    let row: FileRow
    let size: CGFloat
    @Environment(\.displayScale) private var scale
    @State private var image: NSImage?

    private var key: String {
        FileThumbnails.key(serverID: serverID, relative: relative, modified: row.modified, size: size)
    }

    /// Below 128 pt a text file's thumbnail is an unreadable white page, so
    /// only images use one there; everything else shows its colored icon.
    private var usesThumbnail: Bool {
        !row.isDirectory && (size >= 128 || FileKindGroup(row) == .image)
    }

    var body: some View {
        Group {
            if usesThumbnail, let image = image ?? FileThumbnails.cached(key) {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: max(2, size * 0.04), style: .continuous))
                    .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
            } else {
                FileIconView(name: row.name, isDirectory: row.isDirectory, size: size * 0.8)
            }
        }
        .frame(width: size, height: size)
        .task(id: key) {
            guard usesThumbnail, FileThumbnails.cached(key) == nil, !FileThumbnails.hasNone(key) else { return }
            image = await FileThumbnails.load(
                serverID: serverID, relative: relative, key: key, size: size, scale: scale)
        }
    }
}
