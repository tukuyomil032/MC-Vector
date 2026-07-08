import Testing

@testable import Core

@Test func coreVersionIsSet() {
    #expect(!Core.version.isEmpty)
}
