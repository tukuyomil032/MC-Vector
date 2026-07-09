import Foundation

/// Wraps a failure surfaced by `ServerListViewModel` (`load()`,
/// `startSelectedServer()`, `stopSelectedServer()`) so it can drive a real
/// SwiftUI alert.
///
/// Task 3-12's swiftui-pro review flagged the original `errorMessage:
/// String?` for having no View that ever read it -- a failed start/stop had
/// zero user-visible signal beyond the status reverting. The straightforward
/// fix of presenting an alert off a raw `String?` invites a `Binding(get:set:)`
/// synthesized from "is this optional non-nil", which is exactly the
/// anti-pattern the review called out: it reconstructs a throwaway `Bool`
/// from the optional's presence on every access, rather than letting the
/// optional itself carry a stable, typed identity through the alert's
/// lifecycle.
///
/// Wrapping the message in this `Identifiable` struct instead lets
/// `RootView` pass a snapshot of the failure into `.alert(_:isPresented:
/// presenting:actions:message:)`'s `presenting:` parameter -- the value used
/// to render the alert's message is captured once, at presentation time,
/// rather than re-read from the (possibly-already-cleared) view model on
/// every body evaluation.
public struct ServerListViewModelError: Identifiable, Equatable, Sendable {
    public let id = UUID()
    public let message: String

    public init(message: String) {
        self.message = message
    }
}
