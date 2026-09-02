// Minecraft Server List Ping (SLP 1.7+) implementation.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const IO_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_HOST_LENGTH: usize = 253;
const MAX_PACKET_LENGTH: i32 = 1024 * 1024;
const MAX_JSON_LENGTH: i32 = 512 * 1024;
const MAX_VARINT_BYTES: usize = 5;
const MAX_CONCURRENT_PROBES: usize = 8;
const MIN_PROBE_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Default)]
pub struct ProbeLimiter {
    active: AtomicUsize,
    last_probe: Mutex<HashMap<IpAddr, Instant>>,
}

struct ProbePermit<'a> {
    limiter: &'a ProbeLimiter,
}

impl ProbeLimiter {
    fn acquire(&self, address: IpAddr) -> Result<ProbePermit<'_>, String> {
        let mut last_probe = self
            .last_probe
            .lock()
            .map_err(|_| "Network probe limiter is unavailable".to_string())?;
        let now = Instant::now();
        if let Some(previous) = last_probe.get(&address) {
            if now.duration_since(*previous) < MIN_PROBE_INTERVAL {
                return Err("Network probe frequency limit exceeded".to_string());
            }
        }
        let active = self.active.fetch_add(1, Ordering::AcqRel);
        if active >= MAX_CONCURRENT_PROBES {
            self.active.fetch_sub(1, Ordering::AcqRel);
            return Err("Too many network probes are running".to_string());
        }
        last_probe.insert(address, now);
        Ok(ProbePermit { limiter: self })
    }
}

impl Drop for ProbePermit<'_> {
    fn drop(&mut self) {
        self.limiter.active.fetch_sub(1, Ordering::AcqRel);
    }
}

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let byte = (value & 0x7F) as u8;
        value >>= 7;
        buf.push(if value == 0 { byte } else { byte | 0x80 });
        if value == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, value: &str) {
    write_varint(buf, value.len() as i32);
    buf.extend_from_slice(value.as_bytes());
}

fn read_varint(stream: &mut TcpStream) -> Result<i32, String> {
    let mut result = 0_i32;
    for index in 0..MAX_VARINT_BYTES {
        let mut byte = [0_u8];
        stream
            .read_exact(&mut byte)
            .map_err(|_| "Failed to read VarInt".to_string())?;
        result |= ((byte[0] & 0x7F) as i32) << (7 * index);
        if byte[0] & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err("SLP VarInt exceeds five bytes".to_string())
}

fn is_allowed_local_target(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            (ip.is_private() || ip.is_loopback())
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_broadcast()
                && !ip.is_multicast()
        }
        IpAddr::V6(ip) => {
            (ip.is_loopback() || (ip.segments()[0] & 0xFE00) == 0xFC00)
                && !ip.is_unicast_link_local()
                && !ip.is_unspecified()
                && !ip.is_multicast()
        }
    }
}

fn resolve_local_target(host: &str, port: u16) -> Result<std::net::SocketAddr, String> {
    let normalized = host.trim().trim_end_matches('.');
    if normalized.is_empty()
        || normalized.len() > MAX_HOST_LENGTH
        || normalized.chars().any(char::is_control)
    {
        return Err("Invalid Minecraft server host".to_string());
    }
    let addresses = (normalized, port)
        .to_socket_addrs()
        .map_err(|_| "Failed to resolve Minecraft server host".to_string())?
        .collect::<Vec<_>>();
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| !is_allowed_local_target(address.ip()))
    {
        return Err("Only localhost and private LAN ping targets are allowed".to_string());
    }
    addresses
        .into_iter()
        .next()
        .ok_or_else(|| "Failed to resolve Minecraft server host".to_string())
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
pub async fn ping_server(
    state: tauri::State<'_, ProbeLimiter>,
    host: String,
    port: u16,
) -> Result<PingResult, String> {
    let addr = resolve_local_target(&host, port)?;
    let _permit = state.acquire(addr.ip())?;
    let start = Instant::now();
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT)
        .map_err(|_| "Connection timeout".to_string())?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|_| "Failed to set SLP read timeout".to_string())?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|_| "Failed to set SLP write timeout".to_string())?;
    let normalized_host = host.trim().trim_end_matches('.');
    let mut handshake = Vec::new();
    write_varint(&mut handshake, 0);
    write_varint(&mut handshake, 767);
    write_string(&mut handshake, normalized_host);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);
    if handshake.len() > MAX_PACKET_LENGTH as usize {
        return Err("SLP handshake exceeds packet limit".to_string());
    }
    let mut packet = Vec::new();
    write_varint(&mut packet, handshake.len() as i32);
    packet.extend_from_slice(&handshake);
    stream
        .write_all(&packet)
        .map_err(|_| "Failed to write SLP handshake".to_string())?;
    stream
        .write_all(&[1, 0])
        .map_err(|_| "Failed to write SLP status request".to_string())?;
    let packet_length = read_varint(&mut stream)?;
    if !(2..=MAX_PACKET_LENGTH).contains(&packet_length) {
        return Err("Invalid SLP response packet length".to_string());
    }
    if read_varint(&mut stream)? != 0 {
        return Err("Unexpected SLP response packet ID".to_string());
    }
    let json_length = read_varint(&mut stream)?;
    if !(0..=MAX_JSON_LENGTH).contains(&json_length) || json_length > packet_length {
        return Err("Invalid SLP JSON response length".to_string());
    }
    let mut json_bytes = vec![0_u8; json_length as usize];
    stream
        .read_exact(&mut json_bytes)
        .map_err(|_| "Failed to read SLP JSON response".to_string())?;
    let json_str =
        String::from_utf8(json_bytes).map_err(|_| "SLP JSON response is not UTF-8".to_string())?;
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|_| "SLP response JSON is invalid".to_string())?;
    Ok(PingResult {
        online: true,
        latency_ms: start.elapsed().as_millis() as u64,
        players_online: json["players"]["online"]
            .as_i64()
            .and_then(|value| i32::try_from(value).ok()),
        players_max: json["players"]["max"]
            .as_i64()
            .and_then(|value| i32::try_from(value).ok()),
        version: json["version"]["name"].as_str().map(ToOwned::to_owned),
        motd: json["description"]["text"]
            .as_str()
            .map(ToOwned::to_owned)
            .or_else(|| json["description"].as_str().map(ToOwned::to_owned)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_and_private_addresses_are_allowed() {
        for ip in ["127.0.0.1", "10.0.0.1", "192.168.1.1", "::1", "fc00::1"] {
            assert!(is_allowed_local_target(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["169.254.1.1", "224.0.0.1", "0.0.0.0", "8.8.8.8"] {
            assert!(!is_allowed_local_target(ip.parse().unwrap()), "{ip}");
        }
    }
    #[test]
    fn invalid_hosts_are_rejected_before_dns() {
        assert!(resolve_local_target("localhost", 25565).is_ok());
        assert!(resolve_local_target("", 25565).is_err());
        assert!(resolve_local_target(&"a".repeat(MAX_HOST_LENGTH + 1), 25565).is_err());
    }
    #[test]
    fn varint_writer_uses_canonical_encoding() {
        let mut bytes = Vec::new();
        write_varint(&mut bytes, 300);
        assert_eq!(bytes, [0xAC, 0x02]);
    }
}
