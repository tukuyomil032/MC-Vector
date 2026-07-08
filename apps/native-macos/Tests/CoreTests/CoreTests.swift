import Testing
@testable import Core

@Test
func `Core.version is not empty`() {
    #expect(!Core.version.isEmpty)
}
