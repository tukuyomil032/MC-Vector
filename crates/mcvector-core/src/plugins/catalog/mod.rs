//! Provider metadata belongs to the plugin feature, independently of Tauri IPC.
pub mod hangar;
pub mod http;
pub mod modrinth;
pub mod spiget;

use serde_json::{json, Value};

pub(super) fn string(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}

pub(super) fn optional_string(value: &Value) -> Value {
    let value = string(value);
    if value.is_empty() {
        Value::Null
    } else {
        json!(value)
    }
}

pub(super) fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Keep malformed metadata visible to the artifact boundary; never silently
/// downgrade a malformed checksum to an unverified download.
pub(super) fn checksum(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let mut malformed = None;
    for (algorithm, length, keys) in [
        ("sha512", 128, ["sha512", "sha512Hash", "sha512_hash"]),
        ("sha256", 64, ["sha256", "sha256Hash", "sha256_hash"]),
        ("sha1", 40, ["sha1", "sha1Hash", "sha1_hash"]),
    ] {
        if let Some(raw) = keys.iter().find_map(|key| object.get(*key)) {
            let hash = string(raw).trim().to_ascii_lowercase();
            let parsed = json!({"algorithm": algorithm, "value": hash});
            if hash.len() == length && hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Some(parsed);
            }
            if malformed.is_none() {
                malformed = Some(parsed);
            }
        }
    }
    malformed
}

pub(super) fn body(value: &Value) -> Option<String> {
    let value = string(value);
    (!value.trim().is_empty()).then(|| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_prefers_valid_strongest_but_preserves_malformed() {
        assert_eq!(
            checksum(&json!({"sha512": "bad", "sha256Hash": "A".repeat(64)})),
            Some(json!({"algorithm": "sha256", "value": "a".repeat(64)}))
        );
        assert_eq!(
            checksum(&json!({"sha256": 42})),
            Some(json!({"algorithm": "sha256", "value": ""}))
        );
        assert_eq!(checksum(&json!({})), None);
    }
}
