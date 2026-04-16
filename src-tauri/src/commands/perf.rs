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
            "39" => style.color = None,
            "49" => style.background_color = None,
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
        return vec![make_segment(String::new(), AnsiStyleState::default())];
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
    use std::time::Instant;

    #[derive(Clone, Copy)]
    enum BenchmarkLineKind {
        Plain,
        Color,
        MixedUtf8,
    }

    impl BenchmarkLineKind {
        fn from_index(index: usize) -> Self {
            match index % 3 {
                0 => Self::Plain,
                1 => Self::Color,
                _ => Self::MixedUtf8,
            }
        }
    }

    fn benchmark_line(kind: BenchmarkLineKind, index: usize) -> String {
        match kind {
            BenchmarkLineKind::Plain => format!("tick {}: player joined the server", index),
            BenchmarkLineKind::Color => {
                format!("\u{1b}[31mERROR {index}\u{1b}[0m fallback message {index}")
            }
            BenchmarkLineKind::MixedUtf8 => {
                format!("玩家 {index} - \u{1b}[92m成功\u{1b}[0m / \u{1b}[93m警告⚠\u{1b}[0m")
            }
        }
    }

    fn expected_segment_count(kind: BenchmarkLineKind) -> usize {
        match kind {
            BenchmarkLineKind::Plain => 1,
            BenchmarkLineKind::Color => 2,
            BenchmarkLineKind::MixedUtf8 => 4,
        }
    }

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

    #[test]
    fn keeps_empty_string_segment() {
        let segments = parse_ansi_line(String::new());
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "");
        assert!(segments[0].color.is_none());
        assert!(segments[0].background_color.is_none());
        assert!(segments[0].font_weight.is_none());
    }

    #[test]
    fn handles_only_ansi_codes() {
        let segments = parse_ansi_line("\u{1b}[31m".to_string());
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "");
        assert!(segments[0].color.is_none());
        assert!(segments[0].background_color.is_none());
        assert!(segments[0].font_weight.is_none());
    }

    #[test]
    fn handles_incomplete_escape_sequence() {
        let segments = parse_ansi_line("\u{1b}[31".to_string());
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "\u{1b}[31");
        assert!(segments[0].color.is_none());
        assert!(segments[0].background_color.is_none());
        assert!(segments[0].font_weight.is_none());
    }

    #[test]
    #[ignore = "Manual benchmark harness. Run with `cargo test -- --ignored`."]
    fn benchmark_parse_ansi_line_large_batch() {
        const BATCH_SIZE: usize = 120_000;
        let mut total_segments = 0usize;
        let mut expected_total_segments = 0usize;
        let mut styled_segments = 0usize;

        let started = Instant::now();
        for index in 0..BATCH_SIZE {
            let kind = BenchmarkLineKind::from_index(index);
            let segments = parse_ansi_line(benchmark_line(kind, index));
            assert!(!segments.is_empty(), "line {index} returned no segments");
            assert!(
                segments.iter().any(|segment| !segment.text.is_empty()),
                "line {index} returned only empty segment text"
            );

            total_segments += segments.len();
            expected_total_segments += expected_segment_count(kind);
            styled_segments += segments
                .iter()
                .filter(|segment| {
                    segment.color.is_some()
                        || segment.background_color.is_some()
                        || segment.font_weight.is_some()
                })
                .count();
        }
        let elapsed = started.elapsed();
        let elapsed_secs = elapsed.as_secs_f64();
        let lines_per_sec = if elapsed_secs > 0.0 {
            BATCH_SIZE as f64 / elapsed_secs
        } else {
            f64::INFINITY
        };

        println!(
            "benchmark_parse_ansi_line_large_batch: lines={BATCH_SIZE} elapsed_ms={:.2} lines_per_sec={lines_per_sec:.0} total_segments={total_segments} styled_segments={styled_segments}",
            elapsed.as_secs_f64() * 1_000.0
        );

        assert_eq!(total_segments, expected_total_segments);
        assert!(styled_segments > 0);
    }
}
