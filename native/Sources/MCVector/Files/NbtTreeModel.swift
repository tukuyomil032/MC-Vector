// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation

/// The NBT tree view's state: the loaded tags, which containers are open and
/// the search. Rows are the root's descendants in file order, each with its
/// depth; a search shows matches and the containers leading to them.
@MainActor
@Observable
final class NbtTreeModel {
    let serverID: String
    let relativePath: String

    enum Phase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var truncated = false
    private(set) var nodeCount = 0
    var expanded: Set<UInt32> = []
    var query = ""

    @ObservationIgnored private var nodes: [UInt32: NbtNode] = [:]
    @ObservationIgnored private var children: [UInt32: [UInt32]] = [:]
    @ObservationIgnored private var rootID: UInt32?

    /// A row to draw: the tag and how deep it sits below the root.
    struct Row: Identifiable {
        let node: NbtNode
        let depth: Int
        var id: UInt32 { node.id }
        var isContainer: Bool { node.kind == "compound" || node.kind == "list" }
    }

    init(serverID: String, relativePath: String) {
        self.serverID = serverID
        self.relativePath = relativePath
    }

    func load() async {
        phase = .loading
        do throws(CoreError) {
            let tree = try await CoreClient.readNbtTree(serverID: serverID, relative: relativePath)
            nodes = Dictionary(uniqueKeysWithValues: tree.nodes.map { ($0.id, $0) })
            children = Dictionary(grouping: tree.nodes.filter { $0.parent != nil }, by: { $0.parent! })
                .mapValues { $0.map(\.id) }
            rootID = tree.nodes.first?.id
            truncated = tree.truncated
            nodeCount = tree.nodes.count
            // Open the first two levels, as in level.dat's Data compound.
            expanded = Set(tree.nodes.filter { node in depth(of: node.id) < 2 }.map(\.id))
            phase = .ready
        } catch {
            phase = .failed(error.uiText)
        }
    }

    // MARK: Rows

    var rows: [Row] {
        guard let rootID else { return [] }
        let search = query.trimmingCharacters(in: .whitespaces)
        let shown = search.isEmpty ? nil : matchingWithAncestors(search)
        var result: [Row] = []
        func walk(_ id: UInt32, depth: Int) {
            for child in children[id] ?? [] {
                guard let node = nodes[child] else { continue }
                if let shown, !shown.contains(child) { continue }
                result.append(Row(node: node, depth: depth))
                if shown != nil || expanded.contains(child) { walk(child, depth: depth + 1) }
            }
        }
        walk(rootID, depth: 0)
        return result
    }

    /// Ids of tags whose name or value contains `search`, plus every container
    /// on the way to them.
    private func matchingWithAncestors(_ search: String) -> Set<UInt32> {
        var shown = Set<UInt32>()
        for node in nodes.values
        where node.name.localizedCaseInsensitiveContains(search) || node.value.localizedCaseInsensitiveContains(search)
        {
            var current: UInt32? = node.id
            while let id = current, id != rootID, shown.insert(id).inserted {
                current = nodes[id]?.parent
            }
        }
        return shown
    }

    private func depth(of id: UInt32) -> Int {
        var depth = 0
        var current = nodes[id]?.parent
        while let parent = current, parent != rootID {
            depth += 1
            current = nodes[parent]?.parent
        }
        return depth
    }

    func toggle(_ id: UInt32) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }

    func expandAll() {
        expanded = Set(children.keys)
    }

    func collapseAll() {
        expanded = []
    }

    // MARK: Paths

    /// `Data.Player.Pos[0]`: compound keys joined by dots, list indices appended.
    func path(of id: UInt32) -> String {
        var parts: [String] = []
        var current: UInt32? = id
        while let node = current.flatMap({ nodes[$0] }), node.id != rootID {
            parts.append(node.name)
            current = node.parent
        }
        return parts.reversed().reduce(into: "") { path, part in
            path += part.hasPrefix("[") || path.isEmpty ? part : ".\(part)"
        }
    }
}
