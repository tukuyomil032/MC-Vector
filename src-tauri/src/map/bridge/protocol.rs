//! JSON Lines contracts for the Paper bridge.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::config::{BridgeConfig, MAP_PROTOCOL_VERSION};

pub(crate) const MAX_CHAT_MESSAGE_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug)]
pub(crate) struct HelloRequest {
    pub(crate) protocol_version: u32,
    pub(crate) server_id: String,
    pub(crate) token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BridgeStatusPayload {
    pub(crate) server_id: String,
    pub(crate) status: String,
    pub(crate) last_heartbeat: Option<u64>,
    pub(crate) message: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorldStatusEventPayload {
    pub(crate) server_id: String,
    pub(crate) message: Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessageContract {
    #[serde(rename = "type")]
    message_type: String,
    player_id: String,
    name: String,
    pub(crate) message: String,
    #[serde(rename = "capturedAt")]
    _captured_at: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatMessageEventPayload {
    pub(crate) server_id: String,
    pub(crate) message: Value,
}

pub(crate) fn parse_world_status_message(value: Value) -> Result<Value, &'static str> {
    let Some(object) = value.as_object() else {
        return Err("world_status payload must be a JSON object");
    };

    if object.get("type").and_then(Value::as_str) != Some("world_status") {
        return Err("world_status payload has an invalid type");
    }

    Ok(value)
}

pub(crate) fn parse_chat_message(value: Value) -> Result<Value, String> {
    if !value.is_object() {
        return Err("chat_message payload must be a JSON object".to_string());
    }

    let contract: ChatMessageContract = serde_json::from_value(value.clone())
        .map_err(|error| format!("invalid chat_message fields: {error}"))?;
    if contract.message_type != "chat_message" {
        return Err("chat_message payload has an invalid type".to_string());
    }
    if contract.player_id.is_empty() {
        return Err("chat_message playerId must not be empty".to_string());
    }
    if contract.name.is_empty() {
        return Err("chat_message name must not be empty".to_string());
    }
    if contract.message.is_empty() {
        return Err("chat_message message must not be empty".to_string());
    }
    if contract.message.as_bytes().len() > MAX_CHAT_MESSAGE_BYTES {
        return Err(format!(
            "chat_message message exceeds {MAX_CHAT_MESSAGE_BYTES} bytes"
        ));
    }

    Ok(value)
}

pub(crate) fn parse_hello(value: &Value) -> Result<HelloRequest, String> {
    if value.get("type").and_then(Value::as_str) != Some("hello") {
        return Err("The first bridge message must be hello".to_string());
    }
    let protocol_version = value
        .get("protocolVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Bridge hello is missing protocolVersion".to_string())?
        as u32;
    let server_id = value
        .get("serverId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Bridge hello is missing serverId".to_string())?
        .to_string();
    let token = value
        .get("token")
        .and_then(Value::as_str)
        .ok_or_else(|| "Bridge hello is missing token".to_string())?
        .to_string();
    Ok(HelloRequest {
        protocol_version,
        server_id,
        token,
    })
}

pub(crate) fn validate_hello(hello: &HelloRequest, config: &BridgeConfig) -> Result<(), String> {
    if hello.protocol_version != MAP_PROTOCOL_VERSION
        || hello.protocol_version != config.protocol_version
    {
        return Err("Unsupported bridge protocol version".to_string());
    }
    if hello.server_id != config.server_id {
        return Err("Bridge server ID does not match the listener".to_string());
    }
    if hello.token != config.token {
        return Err("Bridge authentication failed".to_string());
    }
    Ok(())
}

pub(crate) fn hello_rejection_reason(error: &str) -> &'static str {
    if error.contains("Unsupported bridge protocol version") {
        "protocol_mismatch"
    } else if error.contains("server ID") {
        "server_mismatch"
    } else if error.contains("authentication failed") {
        "authentication_failed"
    } else {
        "invalid_hello"
    }
}

pub(crate) fn hello_ack(accepted: bool, reason: Option<&str>) -> String {
    if accepted {
        return format!(
            "{{\"type\":\"hello_ack\",\"accepted\":true,\"protocolVersion\":{MAP_PROTOCOL_VERSION}}}\n"
        );
    }

    format!(
        "{{\"type\":\"hello_ack\",\"accepted\":false,\"reason\":\"{}\"}}\n",
        reason.unwrap_or("invalid_hello")
    )
}
