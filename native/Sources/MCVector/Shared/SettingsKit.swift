// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorEditorKit
import SwiftUI

/// System Settings style icon: a white symbol on a colored rounded square.
struct SettingsIconTile: View {
    let symbol: String
    let color: Color
    var size: CGFloat = 22

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.55, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color.gradient, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
    }
}

/// One settings row in a grouped Form: the name with an optional ⓘ (the
/// key's documentation in a popover) and a note under it, the control on the
/// right (Snapzy / System Settings layout).
struct SettingsRow<Control: View>: View {
    let title: String
    var doc: SchemaEntry?
    var help: String?
    /// Shown under the name, e.g. "Max 65535".
    var note: String?
    var noteColor: Color = .orange
    @ViewBuilder var control: Control

    @State private var showsDoc = false

    var body: some View {
        LabeledContent {
            control
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(title)
                    if doc != nil || help != nil {
                        Button {
                            showsDoc.toggle()
                        } label: {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .help(help ?? doc?.doc.text(language: L10n.language) ?? "")
                        .popover(isPresented: $showsDoc, arrowEdge: .bottom) {
                            Group {
                                if let doc {
                                    EditorDocCard(entry: doc)
                                } else if let help {
                                    Text(help).padding(12)
                                }
                            }
                            .frame(width: 340)
                        }
                    }
                }
                if let note {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(noteColor)
                        .transition(.motionFade)
                }
            }
            .animation(Motion.snappy, value: note)
        }
    }
}

/// The top of an overview page: a big icon, a title and one line of text
/// (Droppy's About / MCP pages).
struct SettingsHero: View {
    let symbol: String
    let color: Color
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 10) {
            SettingsIconTile(symbol: symbol, color: color, size: 64)
                .shadow(color: color.opacity(0.35), radius: 12, y: 4)
            Text(title)
                .font(.title.weight(.bold))
            Text(subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }
}

/// A large square button at the top of a settings sidebar (Droppy's
/// General / Theme tiles). Filled with the accent color while selected.
struct SettingsBigTile: View {
    let title: String
    let symbol: String
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 26, height: 26)
                    .background(
                        isSelected ? AnyShapeStyle(.white.opacity(0.22)) : AnyShapeStyle(.quaternary),
                        in: Circle())
                Text(title)
                    .font(.callout.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
                isSelected
                    ? AnyShapeStyle(Color.accentColor.gradient)
                    : AnyShapeStyle(.quaternary.opacity(isHovered ? 1 : 0.6)),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering in withAnimation(Motion.snappy) { isHovered = hovering } }
        .animation(Motion.snappy, value: isSelected)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// A row that opens a page: icon tile, title, subtitle and a chevron
/// (Snapzy's shortcut list).
struct SettingsLinkRow: View {
    let title: String
    let subtitle: String
    let symbol: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                SettingsIconTile(symbol: symbol, color: color, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
