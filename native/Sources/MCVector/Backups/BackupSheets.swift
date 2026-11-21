// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Create Backup (React create modal): file name, compression level, the
/// server folder's size and a time estimate. A running server asks first and
/// is stopped for the backup, then restarted.
struct CreateBackupSheet: View {
    let model: BackupsModel
    let serverName: String

    @Environment(\.dismiss) private var dismiss
    @Environment(FeedbackCenter.self) private var feedback
    @State private var name = ""
    @State private var compression = 5
    @State private var targetBytes: UInt64?
    @State private var estimateMs: UInt64?
    @State private var isMeasuring = true
    @State private var isCreating = false
    @State private var asksToStop = false
    @State private var failure: CoreError?

    private var defaultName: String {
        let stamp = Date.now.formatted(.iso8601.year().month().day().dateSeparator(.dash))
        return "Backup \(serverName) \(stamp).zip"
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                FormTitle(text: L10n.t("backups.modal.createTitle"))
                Section {
                    TextField(L10n.t("backups.modal.fileName"), text: $name, prompt: Text(defaultName))
                } footer: {
                    Text(L10n.t("backups.modal.fileNameHelp", ["default": defaultName]))
                }
                Section {
                    LabeledContent(L10n.t("backups.modal.compressionLevel")) {
                        HStack(spacing: 10) {
                            Slider(
                                value: Binding(get: { Double(compression) }, set: { compression = Int($0) }),
                                in: 1...9, step: 1
                            )
                            .frame(width: 180)
                            Text("\(compression)")
                                .monospacedDigit()
                                .contentTransition(.numericText(value: Double(compression)))
                                .animation(Motion.value, value: compression)
                                .frame(width: 18, alignment: .trailing)
                        }
                    }
                } footer: {
                    Text(L10n.t("backups.modal.compressionHelp"))
                }
                Section {
                    LabeledContent(L10n.t("backups.modal.targetSize")) {
                        if let targetBytes {
                            Text(Int64(targetBytes), format: .byteCount(style: .file))
                                .monospacedDigit()
                                .contentTransition(.numericText(value: Double(targetBytes)))
                        } else if isMeasuring {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("–")
                        }
                    }
                    if let estimateMs {
                        LabeledContent(L10n.t("backups.modal.estimatedTime")) {
                            Text(L10n.t("backups.modal.estimateValue", ["duration": Self.duration(estimateMs)]))
                                .monospacedDigit()
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .disabled(isCreating)
            .animation(Motion.standard, value: targetBytes)

            if let failure {
                InlineErrorBanner(title: L10n.t("backups.toast.createFailed"), message: failure.uiText)
                    .padding(.horizontal, 16)
            }
            HStack {
                Spacer()
                Button(L10n.t("common.cancel")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .disabled(isCreating)
                Button {
                    Task { await create(stopServer: false) }
                } label: {
                    ZStack {
                        Text(L10n.t("common.create")).opacity(isCreating ? 0 : 1)
                        if isCreating { ProgressView().controlSize(.small) }
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isCreating)
            }
            .controlSize(.large)
            .padding(16)
        }
        .frame(width: 480)
        .interactiveDismissDisabled(isCreating)
        .navigationTitle(L10n.t("backups.modal.createTitle"))
        .task {
            let measured = await model.estimate()
            withAnimation(Motion.standard) {
                targetBytes = measured.bytes
                estimateMs = measured.durationMs
                isMeasuring = false
            }
            #if DEBUG
                switch CaptureState.requestedID {
                case "BACKUPS-create-sheet":
                    guard measured.bytes != nil else {
                        CaptureState.note("[capture] create sheet size estimate is missing")
                        return
                    }
                    try? await Task.sleep(for: .milliseconds(450))
                    CaptureState.markViewReady(for: "BACKUPS-create-sheet")
                case "BACKUPS-create-stop-confirm":
                    guard measured.bytes != nil else {
                        CaptureState.note("[capture] stop-confirm size estimate is missing")
                        return
                    }
                    try? await Task.sleep(for: .milliseconds(250))
                    await create(stopServer: false)
                    for _ in 0..<30 where !asksToStop {
                        try? await Task.sleep(for: .milliseconds(100))
                    }
                    guard asksToStop else {
                        CaptureState.note("[capture] stop confirmation did not open")
                        return
                    }
                    try? await Task.sleep(for: .milliseconds(450))
                    CaptureState.markViewReady(for: "BACKUPS-create-stop-confirm")
                default:
                    break
                }
            #endif
        }
        .confirmationDialog(
            L10n.t("backups.stopForBackupTitle"), isPresented: $asksToStop
        ) {
            Button(L10n.t("common.confirm")) { Task { await create(stopServer: true) } }
            // Explicit, so it follows the app language rather than the system's.
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("backups.confirmStopForBackup", ["name": serverName]))
        }
    }

    private func create(stopServer: Bool) async {
        withAnimation(Motion.standard) { failure = nil }
        isCreating = true
        defer { isCreating = false }
        // The sheet stays up with a spinner while the backup runs (the view
        // behind shows the progress bar), then closes.
        let outcome = await model.create(
            name: name, compression: compression, stopServer: stopServer, feedback: feedback)
        switch outcome {
        case .needsStop: asksToStop = true
        case .done: dismiss()
        case let .failed(error): withAnimation(Motion.standard) { failure = error }
        }
    }

    private static func duration(_ milliseconds: UInt64) -> String {
        Duration.milliseconds(Int64(milliseconds)).formatted(
            .units(allowed: [.minutes, .seconds], width: .narrow).locale(Locale(identifier: L10n.language)))
    }
}

/// Edit backup tags and note (React tag editor).
struct BackupTagsSheet: View {
    let model: BackupsModel
    let item: BackupItem

    @Environment(\.dismiss) private var dismiss
    @Environment(FeedbackCenter.self) private var feedback
    @State private var tags: [String] = []
    @State private var newTag = ""
    @State private var note = ""
    @State private var isSaving = false
    @State private var saveError: CoreError?

    var body: some View {
        VStack(spacing: 0) {
            Form {
                FormTitle(text: L10n.t("backups.tagEditor.title"))
                Section {
                    HStack {
                        TextField(
                            L10n.t("backups.tagEditor.tagsLabel"), text: $newTag,
                            prompt: Text(L10n.t("backups.tagEditor.tagsPlaceholder"))
                        )
                        .onSubmit(addTag)
                        Button(L10n.t("backups.tagEditor.addTag"), action: addTag)
                            .disabled(newTag.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    if tags.isEmpty {
                        Text(L10n.t("backups.tagEditor.noTags")).foregroundStyle(.secondary)
                    } else {
                        FlowLayout(spacing: 6) {
                            ForEach(tags, id: \.self) { tag in
                                TagChip(text: tag) {
                                    withAnimation(Motion.snappy) { tags.removeAll { $0 == tag } }
                                }
                                .transition(.motionPop)
                            }
                        }
                    }
                } header: {
                    Text(item.name)
                }
                Section(L10n.t("backups.tagEditor.noteLabel")) {
                    TextEditor(text: $note)
                        .frame(minHeight: 80)
                        .overlay(alignment: .topLeading) {
                            if note.isEmpty {
                                Text(L10n.t("backups.tagEditor.notePlaceholder"))
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 1)
                                    .allowsHitTesting(false)
                            }
                        }
                }
            }
            .formStyle(.grouped)

            if let saveError {
                InlineErrorBanner(title: L10n.t("backups.toast.tagSaveFailed"), message: saveError.uiText)
                    .padding(.horizontal, 16)
            }
            HStack {
                Spacer()
                Button(L10n.t("common.cancel")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .disabled(isSaving)
                Button(L10n.t("common.save")) {
                    Task {
                        isSaving = true
                        defer { isSaving = false }
                        let error = await model.saveTags(item, tags: tags, note: note, feedback: feedback)
                        if let error {
                            withAnimation(Motion.standard) { saveError = error }
                        } else {
                            dismiss()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isSaving)
            }
            .controlSize(.large)
            .padding(16)
        }
        .frame(width: 460)
        .interactiveDismissDisabled(isSaving)
        // A failed save is about the old input; editing starts over.
        .onChange(of: tags) { saveError = nil }
        .onChange(of: note) { saveError = nil }
        .navigationTitle(L10n.t("backups.tagEditor.title"))
        .onAppear {
            tags = item.tags
            note = item.note
        }
    }

    private func addTag() {
        let tag = newTag.trimmingCharacters(in: .whitespaces)
        guard !tag.isEmpty, !tags.contains(tag) else { return }
        withAnimation(Motion.snappy) { tags.append(tag) }
        newTag = ""
    }
}
