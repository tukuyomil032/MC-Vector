// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// MC-Vector's window in miniature on a desktop backdrop, drawn with the
/// current settings: its words follow the language, and the Backups view
/// shows the chosen layout (Snapzy's capture preview).
struct AppWindowPreview: View {
    let backupsLayout: BackupsLayout
    @Environment(\.colorScheme) private var scheme

    private static let canvas = CGSize(width: 560, height: 250)

    var body: some View {
        SettingsPreviewCanvas(size: Self.canvas) {
            ZStack {
                PreviewPalette.backdrop
                window
                    .frame(width: 470, height: 206)
                    .shadow(color: .black.opacity(0.35), radius: 14, y: 6)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var window: some View {
        HStack(spacing: 0) {
            sidebar
            detail
        }
        .background(PreviewPalette.window(scheme))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 0.5)
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                ForEach([Color.red, .yellow, .green], id: \.self) { color in
                    Circle().fill(color.opacity(0.9)).frame(width: 7, height: 7)
                }
            }
            .padding(.bottom, 6)
            ForEach(AppRoute.serverViews, id: \.self) { route in
                HStack(spacing: 5) {
                    Image(systemName: route.symbol)
                        .font(.system(size: 8, weight: .semibold))
                        .frame(width: 10)
                    Text(L10n.t(route.labelKey))
                        .font(.system(size: 8.5, weight: route == .backups ? .semibold : .regular))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(route == .backups ? Color.primary : Color.secondary)
                .padding(.horizontal, 5)
                .frame(height: 16)
                .background(
                    route == .backups ? PreviewPalette.faint(scheme) : .clear, in: RoundedRectangle(cornerRadius: 4))
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(width: 128)
        .frame(maxHeight: .infinity)
        .background(PreviewPalette.sidebar(scheme))
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.t(AppRoute.backups.labelKey))
                .font(.system(size: 11, weight: .bold))
            BackupsLayoutThumbnail(layout: backupsLayout)
                .frame(maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .id(backupsLayout)
                .transition(.opacity)
        }
        .padding(12)
        .animation(Motion.standard, value: backupsLayout)
    }
}
