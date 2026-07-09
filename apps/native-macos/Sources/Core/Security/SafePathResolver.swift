import Foundation

/// Joins an untrusted relative path onto a trusted base directory while
/// rejecting any attempt to escape it, ported from `security.rs`'s
/// `resolve_safe_path`.
///
/// Deliberately does **not** use `URL` or `NSString.standardizingPath`:
/// both *silently normalize away* `..` components (turning
/// `base/../etc/passwd` into `/etc/passwd` without complaint) rather than
/// rejecting the input, which is the opposite of what a path-safety gate
/// needs. This walks `input`'s `/`-separated components by hand, exactly
/// like Rust's `Path::components()` + `Component::ParentDir`/`CurDir`
/// check, so `..`/`.` anywhere in the input is caught and rejected
/// instead of resolved.
///
/// The Windows drive-letter-prefix check (`C:...`) is ported unconditionally,
/// even though this app only ships on macOS -- it's defensive logic in the
/// Rust original that doesn't depend on the host OS (a drive-relative path
/// like `C:windows\temp` has no leading `/` and no `..` component, so
/// without this explicit check it would otherwise slip past every other
/// guard here).
public func resolveSafePath(base: String, input: String) throws -> String {
    let normalizedBase = base.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedBase.isEmpty, !normalizedInput.isEmpty else {
        throw SecurityError.emptyPathInputs
    }

    guard normalizedBase.hasPrefix("/") else {
        throw SecurityError.baseMustBeAbsolute
    }

    if hasWindowsDriveLetterPrefix(normalizedInput) {
        throw SecurityError.pathTraversalDetected
    }

    guard !normalizedInput.hasPrefix("/") else {
        throw SecurityError.pathTraversalDetected
    }

    let components = normalizedInput.split(separator: "/", omittingEmptySubsequences: false)
    guard !components.contains(where: { $0 == "." || $0 == ".." }) else {
        throw SecurityError.pathTraversalDetected
    }

    let needsSeparator = !normalizedBase.hasSuffix("/")
    return normalizedBase + (needsSeparator ? "/" : "") + normalizedInput
}

/// Mirrors Rust's raw byte check: the first two bytes of `input` are an
/// ASCII letter followed by `:` (e.g. `C:windows\temp`). Checked on the
/// trimmed input's UTF-8 bytes, matching Rust's `bytes[0]`/`bytes[1]`
/// indexing on `normalized_input.as_bytes()`.
private func hasWindowsDriveLetterPrefix(_ input: String) -> Bool {
    let bytes = Array(input.utf8)
    guard bytes.count >= 2 else {
        return false
    }
    let isASCIIAlphabetic = (UInt8(ascii: "a") ... UInt8(ascii: "z")).contains(bytes[0])
        || (UInt8(ascii: "A") ... UInt8(ascii: "Z")).contains(bytes[0])
    return isASCIIAlphabetic && bytes[1] == UInt8(ascii: ":")
}
