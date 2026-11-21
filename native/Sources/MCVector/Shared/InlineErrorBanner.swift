// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// An error shown inside a sheet or a step, next to what failed. A window
/// alert cannot appear while a sheet covers its window, so sheets report
/// failures with this instead.
struct InlineErrorBanner: View {
    let title: String
    let message: String?

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.callout.weight(.semibold))
                if let message, !message.isEmpty {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
