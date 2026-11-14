// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The text editor inside the Files view. Phase 8c replaces this placeholder
/// with STTextView.
struct FileEditorView: View {
    let serverID: String
    let relativePath: String
    let close: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(L10n.t("files.editor.close"), systemImage: "chevron.left", action: close)
                Text(relativePath).font(.headline)
                Spacer()
            }
            .padding(12)
            Divider()
            ContentUnavailableView(relativePath, systemImage: "doc.text", description: Text(L10n.t("native.notPorted")))
        }
    }
}
