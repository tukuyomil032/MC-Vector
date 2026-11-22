// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// Project icon, or the first letter on a tinted tile when there is none or it
/// fails to load.
struct PluginIcon: View {
    let url: String?
    let name: String
    var size: CGFloat = 44

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
        AsyncImage(url: url.flatMap(URL.init(string:))) { phase in
            if let image = phase.image {
                image.resizable().interpolation(.high).scaledToFill()
            } else {
                Text(name.first.map { String($0).uppercased() } ?? "?")
                    .font(.system(size: size * 0.42, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.quaternary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.separator, lineWidth: 0.5))
    }
}

/// Compatible / Incompatible / Unknown with the server version.
struct CompatibilityBadge: View {
    let compatibility: PluginCompatibility

    var body: some View {
        let (key, color): (String, Color) =
            switch compatibility {
            case .compatible: ("plugins.browser.compatCompatible", .green)
            case .incompatible: ("plugins.browser.compatIncompatible", .red)
            case .unknown: ("plugins.browser.compatUnknown", .secondary)
            }
        Text(L10n.t(key))
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
    }
}

/// Downloads as a short rolling number (12.3K).
struct DownloadCount: View {
    let downloads: UInt64

    var body: some View {
        Label {
            Text(
                Double(downloads),
                format: .number.notation(.compactName).precision(.significantDigits(1...3))
                    .locale(Locale(identifier: L10n.language))
            )
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(downloads)))
        } icon: {
            Image(systemName: "arrow.down.circle")
        }
        .labelStyle(.titleAndIcon)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

/// One search result in the grid.
struct PluginCard: View {
    let item: PluginItem
    let isSelected: Bool
    /// nil: not installing; .some(nil): preparing; .some(x): downloading.
    let progress: Double??
    let installed: InstalledItem?
    let install: () -> Void

    @State private var isHovered = false

    var body: some View {
        let record = item.record
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                PluginIcon(url: record.iconUrl, name: record.name)
                VStack(alignment: .leading, spacing: 3) {
                    Text(record.name).font(.headline).lineLimit(1)
                    Text(record.author.isEmpty ? L10n.t("plugins.browser.unknownAuthor") : record.author)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            Text(record.summary.isEmpty ? L10n.t("plugins.browser.noDescription") : record.summary)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(2, reservesSpace: true)
            HStack(spacing: 8) {
                DownloadCount(downloads: record.downloads)
                CompatibilityBadge(compatibility: record.compatibility)
                Spacer(minLength: 0)
                action
            }
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(
                    isSelected ? Color.accentColor : Color(nsColor: .separatorColor), lineWidth: isSelected ? 2 : 0.5)
        )
        .scaleEffect(isHovered ? 1.01 : 1)
        .shadow(color: .black.opacity(isHovered ? 0.12 : 0), radius: 8, y: 3)
        .animation(Motion.snappy, value: isHovered)
        .animation(Motion.standard, value: isSelected)
        .onHover { isHovered = $0 }
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    @ViewBuilder private var action: some View {
        if let progress {
            if let value = progress {
                ProgressView(value: value).progressViewStyle(.circular).controlSize(.small)
            } else {
                ProgressView().controlSize(.small)
            }
        } else if let installed {
            if installed.updateVersion != nil {
                Button(L10n.t("plugins.browser.update"), action: install).controlSize(.small)
            } else {
                Label(L10n.t("plugins.browser.installedBadge"), systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.green)
            }
        } else {
            Button(L10n.t("plugins.install.button"), systemImage: "arrow.down.to.line", action: install)
                .controlSize(.small)
                .buttonStyle(.borderedProminent)
                .disabled(item.record.compatibility == .incompatible)
        }
    }
}

/// One installed file.
struct InstalledRow: View {
    let item: InstalledItem
    let progress: Double??
    let isBusy: Bool
    let toggle: () -> Void
    let update: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "shippingbox.fill")
                .font(.title3)
                .foregroundStyle(item.plugin.enabled ? Color.accentColor : .secondary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.title).font(.body.weight(.medium)).lineLimit(1)
                    if !item.plugin.enabled {
                        Text(L10n.t("plugins.browser.disabledBadge"))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .foregroundStyle(.secondary)
                            .background(.quaternary, in: Capsule())
                    }
                }
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            trailing
            Toggle("", isOn: Binding(get: { item.plugin.enabled }, set: { _ in toggle() }))
                .toggleStyle(.switch)
                .labelsHidden()
                .controlSize(.small)
                .disabled(isBusy || progress != nil)
        }
        .padding(.vertical, 6)
        .opacity(item.plugin.enabled ? 1 : 0.7)
    }

    private var subtitle: String {
        var parts = [item.plugin.fileName]
        if let origin = item.plugin.origin {
            parts.append(origin.version)
        } else {
            parts.append(L10n.t("plugins.browser.localSource"))
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private var trailing: some View {
        if let progress {
            if let value = progress {
                ProgressView(value: value).frame(width: 80)
            } else {
                ProgressView().controlSize(.small)
            }
        } else {
            switch item.plugin.update {
            case .available(let version):
                Button(L10n.t("plugins.browser.update"), action: update)
                    .help(L10n.t("plugins.browser.latestTooltip", ["fileName": version]))
                    .disabled(isBusy)
            case .upToDate:
                Label(L10n.t("plugins.browser.upToDate"), systemImage: "checkmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .unknown, .local:
                EmptyView()
            }
        }
    }
}
