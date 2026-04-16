use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};

const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(1);

static RATE_LIMITER: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

#[derive(Clone, Copy)]
enum Role {
    Admin,
    User,
    Viewer,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::User => "user",
            Self::Viewer => "viewer",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "admin" => Ok(Self::Admin),
            "user" => Ok(Self::User),
            "viewer" => Ok(Self::Viewer),
            _ => Err(
                "security_gateway authorize_action requires payload.role as \"admin\"|\"user\"|\"viewer\""
                    .to_string(),
            ),
        }
    }
}

fn sanitize_log_input(input: &str) -> String {
    input.replace('<', "&lt;").replace('>', "&gt;")
}

fn authorize(role: Role, action: &str) -> Result<(), String> {
    let normalized_action = action.trim();
    if normalized_action.is_empty() {
        return Err("security_gateway authorize_action requires non-empty payload.action".to_string());
    }

    let role_name = role.as_str();
    let allowed = match role {
        Role::Admin => Ok(()),
        Role::User => {
            if normalized_action == "start_server" || normalized_action == "stop_server" {
                Ok(())
            } else {
                Err(format!(
                    "Forbidden: role {} is not allowed to perform action {}",
                    role_name, normalized_action
                ))
            }
        }
        Role::Viewer => {
            if is_mutating_action(normalized_action) {
                Err(format!(
                    "Forbidden: role {} is not allowed to perform action {}",
                    role_name, normalized_action
                ))
            } else {
                Ok(())
            }
        }
    };

    allowed
}

fn is_mutating_action(action: &str) -> bool {
    let normalized_action = action.trim();
    if normalized_action.is_empty() {
        return true;
    }

    !(normalized_action.starts_with("get_")
        || normalized_action.starts_with("list_")
        || normalized_action.starts_with("read_")
        || normalized_action.starts_with("fetch_")
        || normalized_action.starts_with("sanitize_")
        || normalized_action == "authorize_action"
        || normalized_action == "rate_limit_check")
}

fn check_rate_limit(user_id: &str) -> Result<(), String> {
    let limiter = RATE_LIMITER.get_or_init(|| Mutex::new(HashMap::new()));
    let mut state = limiter
        .lock()
        .map_err(|_| "security_gateway rate_limit_check internal lock error".to_string())?;
    check_rate_limit_with_state(&mut state, user_id, Instant::now())
}

fn check_rate_limit_with_state(
    state: &mut HashMap<String, Instant>,
    user_id: &str,
    now: Instant,
) -> Result<(), String> {
    let normalized_user_id = user_id.trim();
    if normalized_user_id.is_empty() {
        return Err("security_gateway rate_limit_check requires non-empty payload.userId".to_string());
    }

    if let Some(last_call) = state.get(normalized_user_id) {
        if now.duration_since(*last_call) < RATE_LIMIT_WINDOW {
            return Err(format!(
                "Forbidden: rate limit exceeded for user {}",
                normalized_user_id
            ));
        }
    }

    state.insert(normalized_user_id.to_string(), now);
    Ok(())
}

fn sanitize_command_arg(arg: &str) -> String {
    arg.replace(';', "").replace('&', "")
}

fn validate_safe_command(program: &str, args: &[String]) -> Result<(String, Vec<String>), String> {
    let normalized_program = program.trim();
    if normalized_program.is_empty() {
        return Err("security_gateway validate_safe_command requires non-empty payload.program".to_string());
    }

    let file_name = Path::new(normalized_program)
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "security_gateway validate_safe_command program is invalid".to_string())?;

    if file_name != "java" && file_name != "java.exe" {
        return Err("Forbidden: program is not in allowlist".to_string());
    }

    let sanitized_args = args.iter().map(|arg| sanitize_command_arg(arg)).collect();
    Ok((normalized_program.to_string(), sanitized_args))
}

fn resolve_safe_path(base: &str, input: &str) -> Result<String, String> {
    let normalized_base = base.trim();
    let normalized_input = input.trim();
    if normalized_base.is_empty() || normalized_input.is_empty() {
        return Err("security_gateway resolve_safe_path requires non-empty payload.base and payload.input".to_string());
    }

    let base_path = PathBuf::from(normalized_base);
    if !base_path.is_absolute() {
        return Err("security_gateway resolve_safe_path payload.base must be absolute".to_string());
    }

    let input_path = PathBuf::from(normalized_input);
    if input_path.is_absolute() {
        return Err("Path traversal detected".to_string());
    }

    if input_path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err("Path traversal detected".to_string());
    }

    Ok(base_path.join(input_path).to_string_lossy().to_string())
}

fn build_audit_entry(user: &str, action: &str) -> Result<Value, String> {
    let normalized_user = user.trim();
    let normalized_action = action.trim();
    if normalized_user.is_empty() || normalized_action.is_empty() {
        return Err("security_gateway audit_log requires non-empty payload.user and payload.action".to_string());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Failed to create audit timestamp".to_string())?
        .as_secs();

    log::info!(
        target: "security.audit",
        "[AUDIT] user={} action={} timestamp={}",
        normalized_user,
        normalized_action,
        timestamp
    );

    Ok(json!({
        "user": normalized_user,
        "action": normalized_action,
        "timestamp": timestamp,
    }))
}

fn execute_security_action(action: &str, payload: &Value) -> Result<Value, String> {
    match action {
        "sanitize_log" => {
            let input = payload
                .get("input")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway sanitize_log requires string payload.input".to_string())?;
            Ok(json!({
                "sanitized": sanitize_log_input(input),
            }))
        }
        "authorize_action" => {
            let role_raw = payload
                .get("role")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway authorize_action requires string payload.role".to_string())?;
            let action = payload
                .get("action")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway authorize_action requires string payload.action".to_string())?;
            authorize(Role::parse(role_raw)?, action)?;
            Ok(json!({
                "allowed": true,
            }))
        }
        "rate_limit_check" => {
            let user_id = payload
                .get("userId")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway rate_limit_check requires string payload.userId".to_string())?;
            check_rate_limit(user_id)?;
            Ok(json!({
                "allowed": true,
            }))
        }
        "validate_safe_command" => {
            let program = payload
                .get("program")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway validate_safe_command requires string payload.program".to_string())?;
            let args = payload
                .get("args")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|item| {
                            item.as_str().map(|value| value.to_string()).ok_or_else(|| {
                                "security_gateway validate_safe_command payload.args must be string[]".to_string()
                            })
                        })
                        .collect::<Result<Vec<String>, String>>()
                })
                .transpose()?
                .unwrap_or_default();
            let (validated_program, sanitized_args) = validate_safe_command(program, &args)?;
            Ok(json!({
                "allowed": true,
                "program": validated_program,
                "args": sanitized_args,
            }))
        }
        "resolve_safe_path" => {
            let base = payload
                .get("base")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway resolve_safe_path requires string payload.base".to_string())?;
            let input = payload
                .get("input")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway resolve_safe_path requires string payload.input".to_string())?;
            let resolved = resolve_safe_path(base, input)?;
            Ok(json!({
                "resolvedPath": resolved,
            }))
        }
        "audit_log" => {
            let user = payload
                .get("user")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway audit_log requires string payload.user".to_string())?;
            let action = payload
                .get("action")
                .and_then(Value::as_str)
                .ok_or_else(|| "security_gateway audit_log requires string payload.action".to_string())?;
            let entry = build_audit_entry(user, action)?;
            Ok(json!({
                "logged": true,
                "entry": entry,
            }))
        }
        _ => Err(format!("Unsupported security action: {}", action)),
    }
}

fn handle_command_gateway(payload: &Value) -> Result<Value, String> {
    let user_id = payload
        .get("userId")
        .and_then(Value::as_str)
        .ok_or_else(|| "security_gateway handle_command requires string payload.userId".to_string())?;
    let role_raw = payload
        .get("role")
        .and_then(Value::as_str)
        .ok_or_else(|| "security_gateway handle_command requires string payload.role".to_string())?;
    let action = payload
        .get("commandAction")
        .and_then(Value::as_str)
        .ok_or_else(|| "security_gateway handle_command requires string payload.commandAction".to_string())?;
    let command_payload = payload
        .get("commandPayload")
        .cloned()
        .unwrap_or_else(|| json!({}));

    check_rate_limit(user_id)?;
    authorize(Role::parse(role_raw)?, action)?;
    execute_security_action(action, &command_payload)
}

#[tauri::command]
pub async fn security_gateway(action: String, payload: Value) -> Result<Value, String> {
    let normalized_action = action.trim();
    if normalized_action == "handle_command" {
        return handle_command_gateway(&payload);
    }
    execute_security_action(normalized_action, &payload)
}

#[cfg(test)]
mod tests {
    use super::{
        authorize, build_audit_entry, check_rate_limit_with_state, resolve_safe_path, sanitize_log_input,
        validate_safe_command, Role, RATE_LIMIT_WINDOW,
    };
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    fn unique_user_id(label: &str) -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        format!("contract-test-{}-{}", label, nonce)
    }

    #[test]
    fn escapes_html_angle_brackets() {
        let input = "<script>alert('xss')</script>";
        let sanitized = sanitize_log_input(input);
        assert_eq!(sanitized, "&lt;script&gt;alert('xss')&lt;/script&gt;");
    }

    #[test]
    fn keeps_plain_text() {
        let input = "minecraft server started";
        assert_eq!(sanitize_log_input(input), input);
    }

    #[test]
    fn admin_can_execute_any_action() {
        assert!(authorize(Role::Admin, "delete_world").is_ok());
    }

    #[test]
    fn user_can_start_and_stop_only() {
        assert!(authorize(Role::User, "start_server").is_ok());
        assert!(authorize(Role::User, "stop_server").is_ok());
        assert!(authorize(Role::User, "delete_world").is_err());
    }

    #[test]
    fn viewer_can_read_non_mutating_action() {
        assert!(authorize(Role::Viewer, "get_server_status").is_ok());
    }

    #[test]
    fn viewer_is_forbidden_for_mutating_action() {
        assert!(authorize(Role::Viewer, "start_server").is_err());
    }

    #[test]
    fn rate_limit_blocks_rapid_repeated_calls() {
        let now = Instant::now();
        let mut state = HashMap::new();
        assert!(check_rate_limit_with_state(&mut state, "rate-limit-test-user", now).is_ok());
        assert!(check_rate_limit_with_state(
            &mut state,
            "rate-limit-test-user",
            now + (RATE_LIMIT_WINDOW - Duration::from_millis(1))
        )
        .is_err());
    }

    #[test]
    fn rate_limit_allows_after_window() {
        let now = Instant::now();
        let mut state = HashMap::new();
        assert!(check_rate_limit_with_state(&mut state, "rate-limit-test-user-2", now).is_ok());
        assert!(check_rate_limit_with_state(
            &mut state,
            "rate-limit-test-user-2",
            now + RATE_LIMIT_WINDOW
        )
        .is_ok());
    }

    #[test]
    fn validate_safe_command_allows_java_and_sanitizes_args() {
        let args = vec!["foo;bar".to_string(), "x&y".to_string()];
        let (program, sanitized_args) = validate_safe_command("java", &args).expect("should pass");
        assert_eq!(program, "java");
        assert_eq!(sanitized_args[0], "foobar");
        assert_eq!(sanitized_args[1], "xy");
    }

    #[test]
    fn validate_safe_command_rejects_non_allowlisted_program() {
        let args = vec!["--help".to_string()];
        assert!(validate_safe_command("/bin/sh", &args).is_err());
    }

    #[test]
    fn resolve_safe_path_rejects_traversal() {
        let result = resolve_safe_path("/app/data", "../etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn resolve_safe_path_builds_absolute_path() {
        let resolved = resolve_safe_path("/app/data", "servers/a").expect("should resolve");
        assert_eq!(resolved, "/app/data/servers/a");
    }

    #[test]
    fn build_audit_entry_contains_required_fields() {
        let entry = build_audit_entry("user-1", "start_server").expect("should build");
        assert_eq!(entry.get("user").and_then(Value::as_str), Some("user-1"));
        assert_eq!(entry.get("action").and_then(Value::as_str), Some("start_server"));
        assert!(entry.get("timestamp").and_then(Value::as_u64).is_some());
    }

    #[test]
    fn handle_command_allows_admin_dispatch() {
        let payload = json!({
            "userId": "admin-1",
            "role": "admin",
            "commandAction": "sanitize_log",
            "commandPayload": { "input": "<b>ok</b>" }
        });
        let result = super::handle_command_gateway(&payload).expect("should pass");
        assert_eq!(result.get("sanitized").and_then(Value::as_str), Some("&lt;b&gt;ok&lt;/b&gt;"));
    }

    #[test]
    fn handle_command_blocks_forbidden_action() {
        let payload = json!({
            "userId": "viewer-1",
            "role": "viewer",
            "commandAction": "validate_safe_command",
            "commandPayload": { "program": "java", "args": [] }
        });
        assert!(super::handle_command_gateway(&payload).is_err());
    }

    #[test]
    fn ipc_contract_sanitize_log_response_shape() {
        let result = super::execute_security_action("sanitize_log", &json!({ "input": "<b>ok</b>" }))
            .expect("sanitize_log should succeed");
        assert_eq!(result.get("sanitized").and_then(Value::as_str), Some("&lt;b&gt;ok&lt;/b&gt;"));
    }

    #[test]
    fn ipc_contract_sanitize_log_missing_field_error() {
        let error =
            super::execute_security_action("sanitize_log", &json!({})).expect_err("missing input should fail");
        assert_eq!(
            error,
            "security_gateway sanitize_log requires string payload.input"
        );
    }

    #[test]
    fn ipc_contract_authorize_action_response_shape() {
        let result = super::execute_security_action(
            "authorize_action",
            &json!({
                "role": "user",
                "action": "start_server"
            }),
        )
        .expect("authorize_action should succeed");
        assert_eq!(result.get("allowed").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn ipc_contract_authorize_action_missing_fields_error() {
        let role_error = super::execute_security_action("authorize_action", &json!({ "action": "start_server" }))
            .expect_err("missing role should fail");
        assert_eq!(
            role_error,
            "security_gateway authorize_action requires string payload.role"
        );

        let action_error = super::execute_security_action("authorize_action", &json!({ "role": "admin" }))
            .expect_err("missing action should fail");
        assert_eq!(
            action_error,
            "security_gateway authorize_action requires string payload.action"
        );
    }

    #[test]
    fn ipc_contract_rate_limit_check_response_shape() {
        let result = super::execute_security_action(
            "rate_limit_check",
            &json!({ "userId": unique_user_id("rate-limit-ok") }),
        )
        .expect("rate_limit_check should succeed");
        assert_eq!(result.get("allowed").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn ipc_contract_rate_limit_check_missing_field_error() {
        let error =
            super::execute_security_action("rate_limit_check", &json!({})).expect_err("missing userId should fail");
        assert_eq!(
            error,
            "security_gateway rate_limit_check requires string payload.userId"
        );
    }

    #[test]
    fn ipc_contract_validate_safe_command_response_shape() {
        let result = super::execute_security_action(
            "validate_safe_command",
            &json!({
                "program": "java",
                "args": ["foo;bar", "x&y"]
            }),
        )
        .expect("validate_safe_command should succeed");
        assert_eq!(result.get("allowed").and_then(Value::as_bool), Some(true));
        assert_eq!(result.get("program").and_then(Value::as_str), Some("java"));

        let args = result
            .get("args")
            .and_then(Value::as_array)
            .expect("args should be an array");
        assert_eq!(args.len(), 2);
        assert_eq!(args[0].as_str(), Some("foobar"));
        assert_eq!(args[1].as_str(), Some("xy"));
    }

    #[test]
    fn ipc_contract_validate_safe_command_missing_program_error() {
        let error = super::execute_security_action("validate_safe_command", &json!({ "args": [] }))
            .expect_err("missing program should fail");
        assert_eq!(
            error,
            "security_gateway validate_safe_command requires string payload.program"
        );
    }

    #[test]
    fn ipc_contract_resolve_safe_path_response_shape() {
        let result = super::execute_security_action(
            "resolve_safe_path",
            &json!({
                "base": "/app/data",
                "input": "servers/a"
            }),
        )
        .expect("resolve_safe_path should succeed");
        assert_eq!(
            result.get("resolvedPath").and_then(Value::as_str),
            Some("/app/data/servers/a")
        );
    }

    #[test]
    fn ipc_contract_resolve_safe_path_missing_fields_error() {
        let base_error = super::execute_security_action("resolve_safe_path", &json!({ "input": "servers/a" }))
            .expect_err("missing base should fail");
        assert_eq!(
            base_error,
            "security_gateway resolve_safe_path requires string payload.base"
        );

        let input_error = super::execute_security_action("resolve_safe_path", &json!({ "base": "/app/data" }))
            .expect_err("missing input should fail");
        assert_eq!(
            input_error,
            "security_gateway resolve_safe_path requires string payload.input"
        );
    }

    #[test]
    fn ipc_contract_audit_log_response_shape() {
        let result = super::execute_security_action(
            "audit_log",
            &json!({
                "user": "audit-user",
                "action": "read_logs"
            }),
        )
        .expect("audit_log should succeed");
        assert_eq!(result.get("logged").and_then(Value::as_bool), Some(true));

        let entry = result
            .get("entry")
            .and_then(Value::as_object)
            .expect("entry should be an object");
        assert_eq!(entry.get("user").and_then(Value::as_str), Some("audit-user"));
        assert_eq!(entry.get("action").and_then(Value::as_str), Some("read_logs"));
        assert!(entry.get("timestamp").and_then(Value::as_u64).is_some());
    }

    #[test]
    fn ipc_contract_audit_log_missing_fields_error() {
        let user_error = super::execute_security_action("audit_log", &json!({ "action": "read_logs" }))
            .expect_err("missing user should fail");
        assert_eq!(user_error, "security_gateway audit_log requires string payload.user");

        let action_error = super::execute_security_action("audit_log", &json!({ "user": "audit-user" }))
            .expect_err("missing action should fail");
        assert_eq!(
            action_error,
            "security_gateway audit_log requires string payload.action"
        );
    }

    #[test]
    fn ipc_contract_handle_command_response_shape() {
        let payload = json!({
            "userId": unique_user_id("handle-command-ok"),
            "role": "admin",
            "commandAction": "sanitize_log",
            "commandPayload": { "input": "<ok>" }
        });
        let result = super::handle_command_gateway(&payload).expect("handle_command should succeed");
        assert_eq!(result.get("sanitized").and_then(Value::as_str), Some("&lt;ok&gt;"));
    }

    #[test]
    fn ipc_contract_handle_command_missing_fields_error() {
        let user_error = super::handle_command_gateway(&json!({
            "role": "admin",
            "commandAction": "sanitize_log",
            "commandPayload": { "input": "<ok>" }
        }))
        .expect_err("missing userId should fail");
        assert_eq!(
            user_error,
            "security_gateway handle_command requires string payload.userId"
        );

        let role_error = super::handle_command_gateway(&json!({
            "userId": unique_user_id("handle-command-missing-role"),
            "commandAction": "sanitize_log",
            "commandPayload": { "input": "<ok>" }
        }))
        .expect_err("missing role should fail");
        assert_eq!(
            role_error,
            "security_gateway handle_command requires string payload.role"
        );

        let action_error = super::handle_command_gateway(&json!({
            "userId": unique_user_id("handle-command-missing-action"),
            "role": "admin",
            "commandPayload": { "input": "<ok>" }
        }))
        .expect_err("missing commandAction should fail");
        assert_eq!(
            action_error,
            "security_gateway handle_command requires string payload.commandAction"
        );
    }
}
