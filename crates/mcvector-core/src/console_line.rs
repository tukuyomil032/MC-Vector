//! Console lines as the Native UI shows them: ANSI escape sequences and
//! Minecraft `§` color codes removed, and a level found the same way as the
//! React console (`detectLogLevel`).

/// The level a console line is shown and filtered with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Fatal,
}

/// Removes ANSI CSI sequences (`ESC [ … letter`) and `§x` color codes.
pub fn strip_formatting(line: &str) -> String {
    let mut characters = line.chars().peekable();
    let mut result = String::with_capacity(line.len());
    while let Some(character) = characters.next() {
        if character == '\u{1b}' && characters.peek() == Some(&'[') {
            characters.next();
            for escape_character in characters.by_ref() {
                if escape_character.is_ascii_alphabetic() {
                    break;
                }
            }
            continue;
        }
        if character == '§' {
            characters.next();
            continue;
        }
        result.push(character);
    }
    result
}

/// FATAL, then ERROR/SEVERE, then WARN, otherwise INFO (case-insensitive).
pub fn detect_level(text: &str) -> LogLevel {
    let upper = text.to_uppercase();
    if upper.contains("FATAL") {
        LogLevel::Fatal
    } else if upper.contains("ERROR") || upper.contains("SEVERE") {
        LogLevel::Error
    } else if upper.contains("WARN") {
        LogLevel::Warn
    } else {
        LogLevel::Info
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_ansi_and_section_codes_but_keeps_text() {
        assert_eq!(
            strip_formatting("\u{1b}[33;1m[12:00 WARN]\u{1b}[m §aHello & world"),
            "[12:00 WARN] Hello & world"
        );
    }

    #[test]
    fn detects_levels_in_react_order() {
        assert_eq!(
            detect_level("[Server thread/INFO]: Done (3.2s)!"),
            LogLevel::Info
        );
        assert_eq!(
            detect_level("[Server thread/WARN]: Can't keep up!"),
            LogLevel::Warn
        );
        assert_eq!(detect_level("[main/SEVERE] crash"), LogLevel::Error);
        assert_eq!(detect_level("FATAL error while ticking"), LogLevel::Fatal);
    }
}
