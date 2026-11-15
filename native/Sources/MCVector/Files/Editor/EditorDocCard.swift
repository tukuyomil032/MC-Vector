// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorEditorKit
import SwiftUI

/// Documentation for one config key: shown beside the suggestion list and in
/// the hover card. Key names, types and values stay as written in the file;
/// only the description is localized.
struct EditorDocCard: View {
    let entry: SchemaEntry
    var diagnostic: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let diagnostic {
                Label {
                    Text(diagnostic)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
                .font(.callout)
                Divider()
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(entry.path)
                    .font(.system(.callout, design: .monospaced).weight(.semibold))
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Text(entry.type.rawValue)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(.quaternary, in: Capsule())
            }
            Text(entry.doc.text(language: L10n.language))
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            facts
        }
        .padding(12)
    }

    @ViewBuilder
    private var facts: some View {
        let hasRange = entry.min != nil || entry.max != nil
        if entry.default != nil || hasRange || !(entry.values ?? []).isEmpty || entry.since != nil || entry.until != nil
        {
            VStack(alignment: .leading, spacing: 5) {
                if let value = entry.default {
                    fact(L10n.t("native.editor.doc.default")) {
                        Text(value.displayText).font(.caption.monospaced())
                    }
                }
                if hasRange {
                    fact(L10n.t("native.editor.doc.range")) {
                        Text("\(entry.min.map(Self.number) ?? "…") – \(entry.max.map(Self.number) ?? "…")")
                            .font(.caption.monospaced())
                    }
                }
                if let values = entry.values, !values.isEmpty {
                    fact(L10n.t("native.editor.doc.values")) {
                        FlowLayout(spacing: 4) {
                            ForEach(values, id: \.self) { value in
                                Text(value)
                                    .font(.caption.monospaced())
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
                            }
                        }
                    }
                }
                if let since = entry.since {
                    fact(L10n.t("native.editor.doc.since")) { Text(since).font(.caption.monospaced()) }
                }
                if let until = entry.until {
                    fact(L10n.t("native.editor.doc.until")) { Text(until).font(.caption.monospaced()) }
                }
            }
            .foregroundStyle(.secondary)
        }
    }

    private func fact(_ title: String, @ViewBuilder value: () -> some View) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(title)
                .font(.caption.weight(.medium))
                .frame(minWidth: 52, alignment: .leading)
            value()
        }
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}

/// Places children left to right and wraps them onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var (cursorX, cursorY, rowHeight, widest) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if cursorX > 0, cursorX + size.width > width {
                cursorY += rowHeight + spacing
                (cursorX, rowHeight) = (0, 0)
            }
            cursorX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, cursorX - spacing)
        }
        return CGSize(width: min(widest, width), height: cursorY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var (cursorX, cursorY, rowHeight) = (bounds.minX, bounds.minY, CGFloat(0))
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if cursorX > bounds.minX, cursorX + size.width > bounds.maxX {
                cursorY += rowHeight + spacing
                (cursorX, rowHeight) = (bounds.minX, 0)
            }
            subview.place(at: CGPoint(x: cursorX, y: cursorY), proposal: ProposedViewSize(size))
            cursorX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
