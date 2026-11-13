// SPDX-License-Identifier: GPL-3.0-or-later

import Carbon.HIToolbox
import Foundation

/// System-wide ⌘⇧S (start / stop) and ⌘⇧R (restart), like the Tauri global
/// shortcuts (`src/lib/global-shortcut-commands.ts`). Carbon hot keys need no
/// extra permission. Unregistered on deinit.
@MainActor
final class GlobalHotKeys {
    enum Action: UInt32 {
        case startStop = 1
        case restart = 2
    }

    private var refs: [EventHotKeyRef] = []
    private var handlerRef: EventHandlerRef?
    private let onAction: @MainActor (Action) -> Void

    /// The Carbon callback has no context pointer we can type safely, so the
    /// single live instance is reached through this reference.
    nonisolated(unsafe) private static weak var current: GlobalHotKeys?

    init(onAction: @escaping @MainActor (Action) -> Void) {
        self.onAction = onAction
        Self.current = self
        installHandler()
        register(.startStop, keyCode: UInt32(kVK_ANSI_S))
        register(.restart, keyCode: UInt32(kVK_ANSI_R))
    }

    isolated deinit {
        for ref in refs { UnregisterEventHotKey(ref) }
        if let handlerRef { RemoveEventHandler(handlerRef) }
    }

    private func installHandler() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var hotKeyID = EventHotKeyID()
            GetEventParameter(
                event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID
            )
            let id = hotKeyID.id
            Task { @MainActor in
                if let action = Action(rawValue: id) {
                    GlobalHotKeys.current?.onAction(action)
                }
            }
            return noErr
        }, 1, &spec, nil, &handlerRef)
    }

    private func register(_ action: Action, keyCode: UInt32) {
        var ref: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x4D435643), id: action.rawValue) // "MCVC"
        let status = RegisterEventHotKey(
            keyCode, UInt32(cmdKey | shiftKey), id, GetApplicationEventTarget(), 0, &ref
        )
        if status == noErr, let ref { refs.append(ref) }
    }
}
