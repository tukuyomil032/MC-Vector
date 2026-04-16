#[derive(serde::Serialize)]
pub struct AnsiSegmentDto {
    pub text: String,
    #[serde(rename = "color")]
    pub color: Option<String>,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<String>,
    #[serde(rename = "fontWeight")]
    pub font_weight: Option<u16>,
}

#[derive(Clone, Copy, Default)]
struct AnsiStyleState {
    color: Option<&'static str>,
    background_color: Option<&'static str>,
    font_weight: Option<u16>,
}

fn ansi_foreground_color(code: &str) -> Option<&'static str> {
    match code {
        "30" => Some("#000000"),
        "31" => Some("#ef4444"),
        "32" => Some("#22c55e"),
        "33" => Some("#eab308"),
        "34" => Some("#3b82f6"),
        "35" => Some("#a855f7"),
        "36" => Some("#06b6d4"),
        "37" => Some("#e5e7eb"),
        "90" => Some("#6b7280"),
        "91" => Some("#f87171"),
        "92" => Some("#4ade80"),
        "93" => Some("#facc15"),
        "94" => Some("#60a5fa"),
        "95" => Some("#c084fc"),
        "96" => Some("#22d3ee"),
        "97" => Some("#f8fafc"),
        _ => None,
    }
}

fn ansi_background_color(code: &str) -> Option<&'static str> {
    match code {
        "40" => Some("#000000"),
        "41" => Some("#7f1d1d"),
        "42" => Some("#14532d"),
        "43" => Some("#78350f"),
        "44" => Some("#1e3a8a"),
        "45" => Some("#4c1d95"),
        "46" => Some("#0f766e"),
        "47" => Some("#374151"),
        "100" => Some("#1f2937"),
        "101" => Some("#9f1239"),
        "102" => Some("#166534"),
        "103" => Some("#854d0e"),
        "104" => Some("#1e40af"),
        "105" => Some("#581c87"),
        "106" => Some("#115e59"),
        "107" => Some("#f3f4f6"),
        _ => None,
    }
}

fn apply_sgr_codes(params: &str, style: &mut AnsiStyleState) {
    let mut has_code = false;
    for code in params.split(';').filter(|code| !code.is_empty()) {
        has_code = true;
        match code {
            "0" => *style = AnsiStyleState::default(),
            "1" => style.font_weight = Some(700),
            "22" => style.font_weight = None,
            _ => {
                if let Some(color) = ansi_foreground_color(code) {
                    style.color = Some(color);
                } else if let Some(background_color) = ansi_background_color(code) {
                    style.background_color = Some(background_color);
                }
            }
        }
    }

    if !has_code {
        *style = AnsiStyleState::default();
    }
}

fn make_segment(text: String, style: AnsiStyleState) -> AnsiSegmentDto {
    AnsiSegmentDto {
        text,
        color: style.color.map(str::to_owned),
        background_color: style.background_color.map(str::to_owned),
        font_weight: style.font_weight,
    }
}

fn parse_ansi_line(line: String) -> Vec<AnsiSegmentDto> {
    let bytes = line.as_bytes();
    let mut style = AnsiStyleState::default();
    let mut segments: Vec<AnsiSegmentDto> = Vec::new();
    let mut index = 0usize;
    let mut text_start = 0usize;

    while index < bytes.len() {
        if bytes[index] == 0x1b && index + 1 < bytes.len() && bytes[index + 1] == b'[' {
            let mut end = index + 2;
            while end < bytes.len() && bytes[end] != b'm' {
                if !bytes[end].is_ascii_digit() && bytes[end] != b';' {
                    break;
                }
                end += 1;
            }

            if end < bytes.len() && bytes[end] == b'm' {
                if text_start < index {
                    segments.push(make_segment(line[text_start..index].to_string(), style));
                }

                apply_sgr_codes(&line[index + 2..end], &mut style);
                index = end + 1;
                text_start = index;
                continue;
            }
        }

        index += 1;
    }

    if text_start < line.len() {
        segments.push(make_segment(line[text_start..].to_string(), style));
    }

    if segments.is_empty() {
        return vec![make_segment(line, AnsiStyleState::default())];
    }

    segments
}

#[tauri::command]
pub async fn parse_ansi_lines(lines: Vec<String>) -> Result<Vec<Vec<AnsiSegmentDto>>, String> {
    Ok(lines.into_iter().map(parse_ansi_line).collect())
}

#[cfg(test)]
mod tests {
    use super::parse_ansi_line;

    #[test]
    fn keeps_plain_line_as_single_segment() {
        let segments = parse_ansi_line("server started".to_string());
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "server started");
        assert!(segments[0].color.is_none());
    }

    #[test]
    fn parses_color_and_reset_codes() {
        let line = "\u{1b}[31merror\u{1b}[0m ok".to_string();
        let segments = parse_ansi_line(line);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "error");
        assert_eq!(segments[0].color.as_deref(), Some("#ef4444"));
        assert_eq!(segments[1].text, " ok");
        assert!(segments[1].color.is_none());
    }

    #[test]
    fn parses_bold_and_background_codes() {
        let line = "\u{1b}[1;44mwarn\u{1b}[22m plain".to_string();
        let segments = parse_ansi_line(line);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "warn");
        assert_eq!(segments[0].background_color.as_deref(), Some("#1e3a8a"));
        assert_eq!(segments[0].font_weight, Some(700));
        assert_eq!(segments[1].text, " plain");
        assert_eq!(segments[1].font_weight, None);
    }

    #[test]
    fn handles_utf8_text_with_ansi_codes() {
        let line = "日本語 \u{1b}[32m成功\u{1b}[0m".to_string();
        let segments = parse_ansi_line(line);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "日本語 ");
        assert_eq!(segments[1].text, "成功");
        assert_eq!(segments[1].color.as_deref(), Some("#22c55e"));
    }
}
