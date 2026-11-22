// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import GlassKit
    import SwiftUI

    /// The UI Playground (debug builds only): every GlassKit part on its own,
    /// over a colorful backdrop, with switches for the look and the speed.
    struct PlaygroundWindow: View {
        static let windowID = "playground"
        /// Capture tooling: the part, look and selection to open with.
        static var capturePreset: (part: PlaygroundPart, fallback: Bool, selection: PlaygroundState.Selection)?
        @State private var state = PlaygroundState()

        var body: some View {
            NavigationSplitView {
                List(PlaygroundPart.allCases, selection: $state.part) { part in
                    Label(part.title, systemImage: part.symbol).tag(part)
                }
                .navigationSplitViewColumnWidth(220)
            } detail: {
                ZStack(alignment: .topLeading) {
                    PlaygroundBackdrop()
                    VStack(alignment: .leading, spacing: 28) {
                        controls
                        Text(state.part.title).font(.title2.weight(.semibold))
                        PlaygroundSample(state: state)
                        Spacer(minLength: 0)
                    }
                    .padding(28)
                }
            }
            .environment(\.glassAppearance, state.appearance)
            .preferredColorScheme(state.isDark ? .dark : .light)
            .frame(minWidth: 960, minHeight: 640)
            .onChange(of: state.reducesMotion) { _, reduces in Motion.forceReducedMotion = reduces }
            .onDisappear { Motion.forceReducedMotion = false }
            .onAppear {
                guard let preset = Self.capturePreset else { return }
                Self.capturePreset = nil
                state.part = preset.part
                state.forcesFallback = preset.fallback
                state.selection = preset.selection
            }
        }

        private var controls: some View {
            HStack(spacing: 18) {
                Toggle(playgroundText("ダーク", "Dark"), isOn: $state.isDark)
                Toggle(playgroundText("視差効果を減らす", "Reduce Motion"), isOn: $state.reducesMotion)
                Toggle(playgroundText("macOS 15 の見た目", "macOS 15 look"), isOn: $state.forcesFallback)
                Picker(playgroundText("速さ", "Speed"), selection: $state.slowdown) {
                    Text(playgroundText("普通", "Normal")).tag(1.0)
                    Text("½").tag(2.0)
                    Text("¼").tag(4.0)
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }
            .toggleStyle(.checkbox)
            .padding(10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    /// Colorful shapes behind the glass, so blur and refraction show.
    private struct PlaygroundBackdrop: View {
        var body: some View {
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.12, green: 0.18, blue: 0.35), Color(red: 0.32, green: 0.12, blue: 0.3)],
                    startPoint: .topLeading, endPoint: .bottomTrailing)
                Canvas { context, size in
                    let colors: [Color] = [.orange, .green, .blue, .pink, .yellow, .teal]
                    for index in 0..<36 {
                        let rect = CGRect(
                            x: CGFloat((index * 97) % 1000) / 1000 * size.width,
                            y: CGFloat((index * 61) % 1000) / 1000 * size.height, width: 140, height: 60)
                        context.fill(
                            Path(roundedRect: rect, cornerRadius: 12),
                            with: .color(colors[index % colors.count].opacity(0.35)))
                    }
                }
            }
            .ignoresSafeArea()
        }
    }
#endif
