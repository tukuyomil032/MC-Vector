use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

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

#[tauri::command]
pub async fn security_gateway(action: String, payload: Value) -> Result<Value, String> {
    match action.trim() {
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
        _ => Err(format!("Unsupported security action: {}", action)),
    }
}

#[cfg(test)]
mod tests {
    use super::{authorize, check_rate_limit_with_state, sanitize_log_input, Role, RATE_LIMIT_WINDOW};
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

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
}
