// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// The text editor inside the Files view (React FileEditorWorkspace): a header
/// with Close, the file name, the unsaved dot and Save (⌘S); the text; and a
/// status bar with the language, encoding, line endings, cursor position and
/// save state.
struct FileEditorView: View {
    let close: () -> Void

    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
    @Environment(\.colorScheme) private var colorScheme
    private let editorSettings = EditorSettings.shared
    @State private var document: EditorDocument

    init(
        serverID: String, file: OpenedFile, software: String? = nil, version: String? = nil,
        close: @escaping () -> Void
    ) {
        self.close = close
        _document = State(
            initialValue: EditorDocument(
                serverID: serverID, relativePath: file.relative, fileName: file.name, size: file.size,
                software: software, version: version
            ))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            statusBar
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(document.fileName)
        .focusedSceneValue(\.isEditorActive, document.isEditable)
        .task {
            await document.load()
            #if DEBUG
                await runCaptureScript()
            #endif
        }
        .onChange(of: document.isGoToLineRequested) { _, requested in
            guard requested else { return }
            document.isGoToLineRequested = false
            Task { await promptGoToLine() }
        }
        .onChange(of: document.isDirty) { _, dirty in app.hasUnsavedEditor = dirty }
        .onChange(of: document.isSaving) { _, saving in app.isEditorSaving = saving }
        .onDisappear {
            app.hasUnsavedEditor = false
            app.isEditorSaving = false
        }
        .alert(
            L10n.t("files.confirm.discardChangesTitle"),
            isPresented: Binding(
                get: { app.pendingLeave != nil },
                set: { if !$0 { app.pendingLeave = nil } }
            ),
            presenting: app.pendingLeave
        ) { leave in
            Button(L10n.t("common.save")) {
                Task {
                    if await document.save(feedback: feedback) { finish(leave) }
                }
            }
            .keyboardShortcut(.defaultAction)
            Button(L10n.t("files.confirm.discardButton"), role: .destructive) { finish(leave) }
            Button(L10n.t("common.cancel"), role: .cancel) { app.pendingLeave = nil }
        } message: { leave in
            Text(L10n.t(leave == .closeEditor ? "files.confirm.discardChanges" : "unsavedChanges.description"))
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 8) {
            Button {
                requestClose()
            } label: {
                Label(L10n.t("files.editor.close"), systemImage: "chevron.left")
            }
            .labelStyle(.iconOnly)
            .help(L10n.t("files.editor.close"))
            .disabled(document.isSaving)

            Image(systemName: FileKind.symbol(for: document.fileName))
                .foregroundStyle(.secondary)
            Text(document.fileName)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
                .help(document.relativePath)
            if document.isDirty {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 7, height: 7)
                    .help(L10n.t("files.editor.unsaved"))
                    .accessibilityLabel(Text(L10n.t("files.editor.unsaved")))
                    .transition(.motionPop)
            }

            Spacer(minLength: 8)

            Button {
                Task { await document.save(feedback: feedback) }
            } label: {
                HStack(spacing: 6) {
                    if document.isSaving {
                        ProgressView().controlSize(.mini)
                            .transition(.motionFade)
                    }
                    Text(L10n.t(document.isSaving ? "files.editor.saving" : "common.save"))
                        .contentTransition(.interpolate)
                }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut("s", modifiers: .command)
            .help(L10n.t("files.editor.saveShortcut", ["shortcut": "⌘S"]))
            .disabled(!document.isEditable || !document.isDirty || document.isSaving)
        }
        .controlSize(.regular)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .animation(Motion.snappy, value: document.isDirty)
        .animation(Motion.snappy, value: document.isSaving)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        ZStack {
            switch document.phase {
            case .loading:
                ProgressView(L10n.t("files.loading"))
                    .transition(.motionFade)
            case .unsupported(let reason):
                ContentUnavailableView {
                    Label(L10n.t("files.editor.unsupportedTitle"), systemImage: "doc.questionmark")
                } description: {
                    Text(reason)
                }
                .transition(.motionFade)
            case .failed(let error):
                ContentUnavailableView {
                    Label(L10n.t("files.toast.readFailed"), systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error.uiText)
                } actions: {
                    Button(L10n.t("properties.retry")) { Task { await document.load() } }
                }
                .transition(.motionFade)
            case .ready:
                // No SwiftUI animation reaches the AppKit text view itself.
                CodeTextView(
                    document: document,
                    style: .init(
                        themeID: editorSettings.themeID,
                        isDark: colorScheme == .dark,
                        fontSize: editorSettings.fontSize,
                        wrapLines: editorSettings.wrapLines,
                        showInvisibles: editorSettings.showInvisibles
                    )
                )
                .transition(.motionFade)
            }
        }
        .animation(Motion.standard, value: document.phase)
    }

    // MARK: Status bar

    private var statusBar: some View {
        HStack(spacing: 14) {
            Text(document.language.displayName)
            if document.isEditable {
                Text(document.hasBOM ? L10n.t("native.files.editor.utf8Bom") : L10n.t("files.editor.encoding"))
                HStack(spacing: 4) {
                    Text(document.lineEnding == .crlf ? "CRLF" : "LF")
                    if document.mixedLineEndings {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .help(
                                L10n.t(
                                    "native.files.editor.mixedLineEndings",
                                    [
                                        "ending": document.lineEnding == .crlf ? "CRLF" : "LF"
                                    ])
                            )
                            .accessibilityLabel(
                                Text(
                                    L10n.t(
                                        "native.files.editor.mixedLineEndings",
                                        [
                                            "ending": document.lineEnding == .crlf ? "CRLF" : "LF"
                                        ])))
                    }
                }
                Text(L10n.t("files.editor.lineColumn", ["line": document.line, "column": document.column]))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(Motion.snappy, value: document.line)
                    .animation(Motion.snappy, value: document.column)
            }
            Spacer()
            if !document.diagnostics.isEmpty {
                Label("\(document.diagnostics.count)", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .contentTransition(.numericText())
                    .help(L10n.t("native.editor.diagnostic.count", ["count": document.diagnostics.count]))
                    .transition(.motionFade)
            }
            saveState
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .animation(Motion.snappy, value: document.diagnostics.count)
        .accessibilityElement(children: .combine)
    }

    private var saveState: some View {
        Group {
            if !document.isEditable {
                Label(L10n.t("files.editor.readOnly"), systemImage: "lock")
            } else if document.isSaving {
                Label(L10n.t("files.editor.saving"), systemImage: "arrow.triangle.2.circlepath")
            } else if document.isDirty {
                Label(L10n.t("files.editor.unsaved"), systemImage: "circle.fill")
                    .foregroundStyle(Color.accentColor)
            } else {
                Label(L10n.t("files.editor.saved"), systemImage: "checkmark")
            }
        }
        .contentTransition(.symbolEffect(.replace))
        .animation(Motion.snappy, value: document.isDirty)
        .animation(Motion.snappy, value: document.isSaving)
    }

    // MARK: Go to line

    private func promptGoToLine() async {
        guard
            let text = await feedback.prompt(
                title: L10n.t("native.editor.goToLine.title"),
                label: L10n.t("native.editor.goToLine.label"),
                defaultValue: String(document.line),
                confirmLabel: L10n.t("native.editor.goToLine.confirm"),
                validate: { value in
                    guard let line = Int(value.trimmingCharacters(in: .whitespaces)), line >= 1 else {
                        return L10n.t("native.editor.goToLine.invalid")
                    }
                    return nil
                }
            ), let line = Int(text.trimmingCharacters(in: .whitespaces))
        else { return }
        document.goTo(line: line)
    }

    // MARK: Leaving

    private func requestClose() {
        guard !document.isSaving else { return }
        if document.isDirty {
            app.pendingLeave = .closeEditor
        } else {
            close()
        }
    }

    #if DEBUG
        /// Capture tooling: what to do once the file has loaded.
        struct CaptureScript {
            var type: String?
            var save = false
            var confirmClose = false
            /// Opens the suggestion list after typing.
            var showSuggestions = false
            /// Shows the hover card for the first occurrence of this text.
            var hover: String?
            /// Opens the suggestion list after the hover card is up.
            var suggestAfterHover = false
        }

        static var captureScript: CaptureScript?

        private func runCaptureScript() async {
            guard let script = Self.captureScript, document.isEditable else { return }
            Self.captureScript = nil
            try? await Task.sleep(for: .milliseconds(900))
            if let text = script.type { await document.typeForCapture(text) }
            try? await Task.sleep(for: .milliseconds(500))
            if script.showSuggestions { EditorAssistController.current?.textViewForCapture?.complete(nil) }
            if let hover = script.hover { EditorAssistController.current?.showHoverForCapture(on: hover) }
            if script.suggestAfterHover {
                try? await Task.sleep(for: .milliseconds(1500))
                EditorAssistController.current?.textViewForCapture?.complete(nil)
            }
            if script.save { await document.save(feedback: feedback) }
            if script.confirmClose { requestClose() }
        }
    #endif

    private func finish(_ leave: AppState.PendingLeave) {
        app.hasUnsavedEditor = false
        app.pendingLeave = nil
        if leave == .closeEditor {
            close()
        } else {
            app.performLeave(leave)
        }
    }
}

/// The file the editor shows, with the size from the listing (FILE-001 checks
/// it before anything is read).
struct OpenedFile: Equatable {
    let relative: String
    let name: String
    let size: UInt64
}
