//! Bounded JSON Lines framing for the local Paper bridge.

use tokio::io::{AsyncBufRead, AsyncBufReadExt};

pub(crate) const MAX_BRIDGE_LINE_BYTES: usize = 1024 * 1024;

pub(crate) async fn read_bridge_line<R>(reader: &mut R) -> Result<Option<Vec<u8>>, String>
where
    R: AsyncBufRead + Unpin,
{
    let mut line = Vec::new();
    let bytes = reader
        .read_until(b'\n', &mut line)
        .await
        .map_err(|error| format!("Bridge read failed: {error}"))?;
    if bytes == 0 {
        return Ok(None);
    }
    if line.len() > MAX_BRIDGE_LINE_BYTES {
        return Err("Bridge message is too large".to_string());
    }
    Ok(Some(line))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use tokio::io::BufReader;

    use super::*;

    #[tokio::test]
    async fn reads_one_line_and_preserves_json_bytes() {
        let mut bytes = br#"{"type":"heartbeat"}"#.to_vec();
        bytes.push(b'\n');
        let mut reader = BufReader::new(Cursor::new(bytes));
        let mut expected = br#"{"type":"heartbeat"}"#.to_vec();
        expected.push(b'\n');

        assert_eq!(
            read_bridge_line(&mut reader)
                .await
                .expect("line should read"),
            Some(expected)
        );
    }

    #[tokio::test]
    async fn returns_none_at_end_of_stream() {
        let mut reader = BufReader::new(Cursor::new(Vec::<u8>::new()));

        assert_eq!(read_bridge_line(&mut reader).await, Ok(None));
    }

    #[tokio::test]
    async fn rejects_lines_over_the_protocol_limit() {
        let mut bytes = vec![b'x'; MAX_BRIDGE_LINE_BYTES + 1];
        bytes.push(b'\n');
        let mut reader = BufReader::new(Cursor::new(bytes));

        assert_eq!(
            read_bridge_line(&mut reader).await,
            Err("Bridge message is too large".to_string())
        );
    }
}
