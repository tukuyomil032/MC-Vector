// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import SwiftUI

    /// Both icon styles side by side, one name per row, at an adjustable size,
    /// with the SVG each name maps to.
    struct IconComparisonSample: View {
        @Bindable var state: PlaygroundState

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Text(playgroundText("大きさ", "Size"))
                    Slider(value: $state.iconSize, in: 16...64, step: 4)
                        .frame(width: 220)
                    Text("\(Int(state.iconSize)) pt")
                        .monospacedDigit()
                        .contentTransition(.numericText(value: state.iconSize))
                        .animation(.snappy, value: state.iconSize)
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8, pinnedViews: [.sectionHeaders]) {
                        ForEach(IconSampleGroup.allCases) { group in
                            Section {
                                ForEach(group.samples) { sample in row(sample) }
                            } header: {
                                header(group.title)
                            }
                        }
                    }
                    .padding(16)
                }
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }

        private func header(_ title: String) -> some View {
            HStack(spacing: 0) {
                Text(title).frame(width: 220, alignment: .leading)
                ForEach(FileIconStyle.allCases) { style in
                    Text(L10n.t(style.titleKey)).frame(width: columnWidth)
                }
                Text("SVG").frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.callout.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.vertical, 6)
            .background(.regularMaterial)
        }

        private func row(_ sample: IconSample) -> some View {
            HStack(spacing: 0) {
                Text(sample.name)
                    .font(.system(.body, design: .monospaced))
                    .frame(width: 220, alignment: .leading)
                ForEach(FileIconStyle.allCases) { style in
                    FileIconView(name: sample.name, isDirectory: sample.isFolder, size: state.iconSize, style: style)
                        .frame(width: columnWidth)
                }
                Text(sample.iconName)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: state.iconSize + 6)
        }

        private var columnWidth: CGFloat { max(110, state.iconSize + 40) }
    }
#endif
