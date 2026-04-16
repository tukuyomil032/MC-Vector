use serde_json::{json, Value};

fn sanitize_log_input(input: &str) -> String {
    input.replace('<', "&lt;").replace('>', "&gt;")
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
        _ => Err(format!("Unsupported security action: {}", action)),
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_log_input;

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
}
