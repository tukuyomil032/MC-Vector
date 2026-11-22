// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Segments on a strip of glass with one piece of glass, apart from the
/// segments, that slides and stretches to the chosen one. Moving a single view
/// keeps Liquid Glass continuous; handing it from segment to segment would
/// make it vanish and reappear.
public struct GlassSegmentedPicker<Value: Hashable>: View {
    private let options: [Value]
    @Binding private var selection: Value
    private let title: (Value) -> String
    private let symbol: ((Value) -> String)?
    @State private var frames: [Value: CGRect] = [:]

    public init(
        _ options: [Value], selection: Binding<Value>, title: @escaping (Value) -> String,
        symbol: ((Value) -> String)? = nil
    ) {
        self.options = options
        self._selection = selection
        self.title = title
        self.symbol = symbol
    }

    public var body: some View {
        GlassMotionReader { motion in
            GlassGroup(spacing: 4) {
                ZStack(alignment: .topLeading) {
                    if let frame = frames[selection] {
                        Color.clear
                            .glassSurface(Capsule(), interactive: true, tint: .white.opacity(0.18))
                            .frame(width: frame.width, height: frame.height)
                            .offset(x: frame.minX, y: frame.minY)
                            .animation(motion.slide, value: selection)
                    }
                    HStack(spacing: 2) {
                        ForEach(options, id: \.self) { segment($0, motion: motion) }
                    }
                }
                .coordinateSpace(.named(Self.space))
                .padding(3)
                .glassSurface(Capsule())
            }
            .accessibilityElement(children: .contain)
        }
    }

    private static var space: String { "GlassSegmentedPicker" }

    private func segment(_ option: Value, motion: GlassMotion) -> some View {
        let chosen = option == selection
        return Button {
            withAnimation(motion.slide) { selection = option }
        } label: {
            HStack(spacing: 5) {
                if let symbol { Image(systemName: symbol(option)) }
                Text(title(option))
            }
            .font(.callout.weight(chosen ? .semibold : .regular))
            .foregroundStyle(chosen ? .primary : .secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? .isSelected : [])
        .onGeometryChange(for: CGRect.self) {
            $0.frame(in: .named(Self.space))
        } action: {
            frames[option] = $0
        }
    }
}
