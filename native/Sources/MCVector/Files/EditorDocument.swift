// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import STTextView

/// One file open in the editor: loading (FILE-001, FILE-003), the unsaved state,
/// the cursor position for the status bar (FILE-006) and saving (FILE-004).
/// The text itself lives in the STTextView; this object reads it from there
/// without copying, so a 5 MiB file is not duplicated on every keystroke.
@MainActor
@Observable
final class EditorDocument {
    /// Files above 5 MiB are not read at all (FILE-001); exactly 5 MiB opens.
    static let maxEditableBytes: UInt64 = 5 * 1024 * 1024

    enum Phase: Equatable {
        case loading
        /// Not editable; the reason is shown and nothing was read or will be saved.
        case unsupported(String)
        case failed(CoreError)
        case ready
    }

    let serverID: String
    let relativePath: String
    let fileName: String
    let size: UInt64
    let language: EditorLanguage

    private(set) var phase: Phase = .loading
    private(set) var isDirty = false
    private(set) var isSaving = false
    private(set) var line = 1
    private(set) var column = 1
    private(set) var hasBOM = false
    private(set) var lineEnding: LineEnding = .lf
    private(set) var mixedLineEndings = false

    /// The text the view starts with.
    @ObservationIgnored private(set) var initialText = ""
    /// The text as last saved (or loaded), compared with the view's text.
    @ObservationIgnored private var baseline: NSString = ""
    @ObservationIgnored private weak var textView: STTextView?
    /// Last computed cursor line, so moving the cursor counts only the lines in between.
    @ObservationIgnored private var lineCache: (location: Int, line: Int, lineStart: Int)?

    init(serverID: String, relativePath: String, fileName: String, size: UInt64) {
        self.serverID = serverID
        self.relativePath = relativePath
        self.fileName = fileName
        self.size = size
        language = EditorLanguage.detect(fileName: fileName)
    }

    var isEditable: Bool { phase == .ready }

    // MARK: Loading

    func load() async {
        if FileKind.isBinary(fileName) {
            phase = .unsupported(L10n.t("files.editor.binaryDescription"))
            return
        }
        if size > Self.maxEditableBytes {
            phase = .unsupported(L10n.t("files.editor.largeDescription", ["megabytes": 5]))
            return
        }
        phase = .loading
        do throws(CoreError) {
            let document = try await CoreClient.readTextDocument(serverID: serverID, relative: relativePath)
            hasBOM = document.hasBom
            lineEnding = document.lineEnding
            mixedLineEndings = document.mixedLineEndings
            initialText = document.text
            baseline = document.text as NSString
            isDirty = false
            phase = .ready
        } catch where error.code == "files.not_text" {
            phase = .unsupported(L10n.t("native.files.editor.notUtf8"))
        } catch where error.code == "files.too_large" {
            phase = .unsupported(L10n.t("files.editor.largeDescription", ["megabytes": 5]))
        } catch {
            phase = .failed(error)
        }
    }

    // MARK: Text view events

    func attach(_ textView: STTextView) {
        self.textView = textView
        lineCache = nil
        updatePosition()
    }

    /// The view's text without a copy.
    private var currentText: NSString? {
        (textView?.textContentManager as? NSTextContentStorage)?.textStorage?.mutableString
    }

    func textDidChange() {
        lineCache = nil
        guard let text = currentText else { return }
        let dirty = text.length != baseline.length || !text.isEqual(to: baseline as String)
        if dirty != isDirty { isDirty = dirty }
        updatePosition()
    }

    func selectionDidChange() {
        updatePosition()
    }

    /// 1-based line and column of the insertion point; columns count UTF-16 units.
    private func updatePosition() {
        guard let text = currentText, let textView else { return }
        let location = min(textView.textSelection.location, text.length)
        var (from, current, lineStart) = (0, 1, 0)
        if let cache = lineCache, cache.location <= location {
            (from, current, lineStart) = (cache.location, cache.line, cache.lineStart)
        }
        var search = NSRange(location: from, length: location - from)
        while search.length > 0 {
            let found = text.range(of: "\n", options: .literal, range: search)
            guard found.location != NSNotFound else { break }
            current += 1
            lineStart = found.location + 1
            search = NSRange(location: lineStart, length: location - lineStart)
        }
        lineCache = (location, current, lineStart)
        let newColumn = location - lineStart + 1
        if current != line { line = current }
        if newColumn != column { column = newColumn }
    }

    #if DEBUG
    /// Capture tooling: types `text` at the end of the document, one character
    /// at a time like a person would, through the same path as the keyboard.
    func typeForCapture(_ text: String) async {
        guard let textView, let length = currentText?.length else { return }
        textView.textSelection = NSRange(location: length, length: 0)
        for character in text {
            textView.insertText(String(character), replacementRange: NSRange(location: NSNotFound, length: 0))
            try? await Task.sleep(for: .milliseconds(45))
        }
    }
    #endif

    // MARK: Saving

    /// Writes the text with the file's BOM and line endings. Only a successful
    /// write updates the saved baseline; on failure the edits stay (FILE-004).
    @discardableResult
    func save(feedback: FeedbackCenter) async -> Bool {
        guard isEditable, isDirty, !isSaving, let text = currentText else { return !isDirty }
        let snapshot = String(text)
        isSaving = true
        defer { isSaving = false }
        do throws(CoreError) {
            try await CoreClient.writeTextDocument(
                serverID: serverID,
                relative: relativePath,
                document: TextDocumentInfo(
                    text: snapshot, hasBom: hasBOM, lineEnding: lineEnding, mixedLineEndings: mixedLineEndings
                )
            )
            baseline = snapshot as NSString
            textDidChange()
            feedback.toast(.success, L10n.t("files.toast.saved"))
            return true
        } catch {
            feedback.showError(L10n.t("files.toast.saveFailed"), message: error.uiText)
            return false
        }
    }
}
