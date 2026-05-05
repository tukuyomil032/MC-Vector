// Minecraft Server List Ping (SLP 1.7+) implementation
// https://wiki.vg/Server_List_Ping
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let byte = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            buf.push(byte | 0x80);
        } else {
            buf.push(byte);
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    write_varint(buf, bytes.len() as i32);
    buf.extend_from_slice(bytes);
}

fn read_varint(stream: &mut TcpStream) -> std::io::Result<i32> {
    let mut result = 0i32;
    let mut shift = 0;
    loop {
        let mut byte = [0u8];
        stream.read_exact(&mut byte)?;
        result |= ((byte[0] & 0x7F) as i32) << shift;
        shift += 7;
        if byte[0] & 0x80 == 0 {
            break;
        }
    }
    Ok(result)
}

#[derive(serde::Serialize)]
pub struct PingResult {
    pub online: bool,
    pub latency_ms: u64,
    pub players_online: Option<i32>,
    pub players_max: Option<i32>,
    pub version: Option<String>,
    pub motd: Option<String>,
}

#[tauri::command]
pub async fn ping_server(host: String, port: u16) -> Result<PingResult, String> {
    let addr = format!("{}:{}", host, port);
    let start = Instant::now();

    let mut stream = TcpStream::connect_timeout(
        &addr
            .parse()
            .map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_secs(3),
    )
    .map_err(|_| "Connection timeout".to_string())?;

    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();

    // Handshake packet
    let mut handshake = Vec::new();
    write_varint(&mut handshake, 0x00); // packet id
    write_varint(&mut handshake, 767); // protocol version (1.21)
    write_string(&mut handshake, &host);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1); // next state: status

    let mut packet = Vec::new();
    write_varint(&mut packet, handshake.len() as i32);
    packet.extend_from_slice(&handshake);
    stream.write_all(&packet).map_err(|e| e.to_string())?;

    // Status Request packet
    stream.write_all(&[0x01, 0x00]).map_err(|e| e.to_string())?;

    // Read response
    let _length =
        read_varint(&mut stream).map_err(|_| "Failed to read response length".to_string())?;
    let _packet_id =
        read_varint(&mut stream).map_err(|_| "Failed to read packet ID".to_string())?;
    let str_len = read_varint(&mut stream).map_err(|_| "Failed to read JSON length".to_string())?;

    let mut json_bytes = vec![0u8; str_len as usize];
    stream
        .read_exact(&mut json_bytes)
        .map_err(|_| "Failed to read JSON body".to_string())?;
    let json_str = String::from_utf8(json_bytes).map_err(|_| "UTF-8 decode failed".to_string())?;

    let latency_ms = start.elapsed().as_millis() as u64;
    let json: serde_json::Value = serde_json::from_str(&json_str).unwrap_or_default();

    Ok(PingResult {
        online: true,
        latency_ms,
        players_online: json["players"]["online"].as_i64().map(|v| v as i32),
        players_max: json["players"]["max"].as_i64().map(|v| v as i32),
        version: json["version"]["name"].as_str().map(|s| s.to_string()),
        motd: json["description"]["text"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| json["description"].as_str().map(|s| s.to_string())),
    })
}
