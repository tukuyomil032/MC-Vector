// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Draws `content` on a fixed-size canvas and scales it to the width it is
/// given, so a preview keeps its proportions in any window size (Snapzy's
/// capture preview).
struct SettingsPreviewCanvas<Content: View>: View {
    let size: CGSize
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { proxy in
            content()
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .scaleEffect(proxy.size.width / size.width, anchor: .topLeading)
        }
        .aspectRatio(size.width / size.height, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// The card a page-top preview sits in: a rounded, softly framed panel with
/// room around the picture.
struct SettingsPreviewSection<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        Section {
            content()
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
        }
    }
}

/// Colors the previews share, readable in light and dark.
enum PreviewPalette {
    /// The miniature window's background and chrome.
    static func window(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(white: 0.15) : Color(white: 0.97)
    }

    static func sidebar(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(white: 0.2) : Color(white: 0.9)
    }

    static func line(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? .white.opacity(0.22) : .black.opacity(0.16)
    }

    static func faint(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? .white.opacity(0.08) : .black.opacity(0.06)
    }

    /// An indigo backdrop with soft light, like a desktop behind the window.
    static let backdrop = LinearGradient(
        colors: [Color(red: 0.2, green: 0.27, blue: 0.72), Color(red: 0.36, green: 0.22, blue: 0.66)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}
