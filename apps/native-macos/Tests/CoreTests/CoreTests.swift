import Testing
@testable import Core

@Test("Core.version is not empty")
func coreVersionIsSet() {
    #expect(!Core.version.isEmpty)
}
