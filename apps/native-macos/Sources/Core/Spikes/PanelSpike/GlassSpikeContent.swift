import SwiftUI

public struct GlassSpikeContent: View {
    private let title: String

    public init(title: String) {
        self.title = title
    }

    public var body: some View {
        VStack(spacing: 12) {
            Text(self.title)
                .font(.headline)
            Text("Move focus to another app and observe this panel.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(width: 320, height: 160)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }
}

#Preview {
    GlassSpikeContent(title: "NSPanel bridge")
}
