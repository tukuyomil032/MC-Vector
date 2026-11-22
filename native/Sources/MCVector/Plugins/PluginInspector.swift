// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// Details of the selected result in the inspector: Info, README and Versions.
struct PluginInspector: View {
    let model: PluginsModel
    let item: PluginItem
    let install: () -> Void

    enum Tab: String, CaseIterable, Identifiable {
        case info, readme, versions
        var id: String { rawValue }
        var titleKey: String {
            switch self {
            case .info: "plugins.browser.detailInfo"
            case .readme: "plugins.browser.detailReadme"
            case .versions: "native.plugins.versions"
            }
        }
    }

    @State private var tab: Tab = Self.initialTab

    #if DEBUG
        /// Capture states open the inspector on this tab.
        static var captureTab: Tab?
        private static var initialTab: Tab { captureTab ?? .info }
    #else
        private static let initialTab: Tab = .info
    #endif
    @Environment(\.openURL) private var openURL

    var body: some View {
        let record = item.record
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                PluginIcon(url: record.iconUrl, name: record.name, size: 52)
                VStack(alignment: .leading, spacing: 4) {
                    Text(record.name).font(.title3.weight(.semibold)).lineLimit(2)
                    Text("\(L10n.t(record.source.titleKey)) · \(L10n.t("plugins.browser.byAuthor")) \(record.author)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    CompatibilityBadge(compatibility: record.compatibility)
                }
            }
            HStack {
                installButton
                Button(L10n.t("plugins.browser.detailProjectPage"), systemImage: "arrow.up.right.square") {
                    if let url = URL(string: record.projectUrl) { openURL(url) }
                }
            }
            .controlSize(.regular)

            GlassSegmentedPicker(Tab.allCases, selection: $tab, title: { L10n.t($0.titleKey) })
                .accessibilityLabel(L10n.t("plugins.browser.detailTabs"))

            Group {
                switch tab {
                case .info: info(record)
                case .readme: readme
                case .versions: versions
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .transition(.opacity)
        }
        .padding(16)
        .animation(Motion.standard, value: tab)
        .task(id: item.id) { await model.loadDetail() }
    }

    @ViewBuilder private var installButton: some View {
        if let progress = model.installing[item.id] {
            ProgressView(value: progress ?? 0).frame(width: 100)
        } else if let installed = model.installedFile(for: item) {
            if installed.updateVersion != nil {
                Button(L10n.t("plugins.browser.update"), systemImage: "arrow.triangle.2.circlepath", action: install)
                    .buttonStyle(.borderedProminent)
            } else {
                Label(L10n.t("plugins.browser.installedBadge"), systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        } else {
            Button(L10n.t("plugins.install.button"), systemImage: "arrow.down.to.line", action: install)
                .buttonStyle(.borderedProminent)
                .disabled(item.record.compatibility == .incompatible)
        }
    }

    private func info(_ record: PluginProjectRecord) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        stat("plugins.browser.detailDownloads", systemImage: "arrow.down.circle") {
                            Text(Double(record.downloads), format: .number.locale(Locale(identifier: L10n.language)))
                                .contentTransition(.numericText(value: Double(record.downloads)))
                        }
                        stat("plugins.browser.detailSupportedMC", systemImage: "cube") {
                            Text(supported(record))
                        }
                    }
                    GridRow {
                        stat("plugins.browser.detailLoader", systemImage: "puzzlepiece.extension") {
                            Text(loader)
                        }
                        .gridCellColumns(2)
                    }
                }
                Text(record.summary.isEmpty ? L10n.t("plugins.browser.noDescription") : record.summary)
                    .font(.callout)
                    .textSelection(.enabled)
                Text(
                    "\(L10n.t("plugins.browser.detailProject")): \(record.id) · \(L10n.t("plugins.browser.detailSlug")): \(record.slug)"
                )
                .font(.caption)
                .foregroundStyle(.tertiary)
                .textSelection(.enabled)
            }
        }
    }

    private func stat(
        _ titleKey: String, systemImage: String, @ViewBuilder value: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(L10n.t(titleKey), systemImage: systemImage).font(.caption).foregroundStyle(.secondary)
            value().font(.body.weight(.semibold)).monospacedDigit().lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func supported(_ record: PluginProjectRecord) -> String {
        if let first = record.supportedVersions.first {
            return record.supportedVersions.count > 1
                ? "\(first) – \(record.supportedVersions.last ?? first)" : first
        }
        return L10n.t("plugins.browser.na")
    }

    private var loader: String {
        model.support.targetDirectory == "mods"
            ? model.support.loader.capitalized : L10n.t("plugins.browser.loaderDefault")
    }

    @ViewBuilder private var readme: some View {
        switch model.readme {
        case .idle, .loading:
            ProgressView(L10n.t("plugins.browser.readmeLoading")).frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed:
            ContentUnavailableView(
                L10n.t("plugins.browser.readmeFetchError"), systemImage: "exclamationmark.triangle")
        case .loaded:
            if let html = model.readmeHTML, !html.isEmpty {
                PluginReadmeView(html: html, baseURL: URL(string: item.record.projectUrl))
            } else {
                ContentUnavailableView(L10n.t("plugins.browser.noReadme"), systemImage: "doc.text")
            }
        }
    }

    @ViewBuilder private var versions: some View {
        switch model.versionsLoad {
        case .idle, .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let error):
            ContentUnavailableView(error.uiText, systemImage: "exclamationmark.triangle")
        case .loaded where model.versions.isEmpty:
            ContentUnavailableView(L10n.t("plugins.browser.versionsNotPublished"), systemImage: "tag")
        case .loaded:
            List(model.versions, id: \.id) { version in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(version.name).font(.body.weight(.medium))
                        Spacer()
                        if let published = version.published.flatMap(Self.parseDate) {
                            Text(published, format: .dateTime.year().month().day())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    let detail = (version.loaders + version.gameVersions.prefix(6)).joined(separator: " · ")
                    if !detail.isEmpty {
                        Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                .padding(.vertical, 2)
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        }
    }

    private static func parseDate(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
