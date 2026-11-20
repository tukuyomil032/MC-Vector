use futures_util::StreamExt;
use reqwest::{redirect::Policy, Client, Url};
use serde_json::Value;
use std::{sync::OnceLock, time::Duration};

const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const PROVIDER_HOSTS: [&str; 3] = ["api.modrinth.com", "hangar.papermc.io", "api.spiget.org"];

fn check_body_size(current: usize, additional: usize) -> Result<(), String> {
    if current.saturating_add(additional) > MAX_BODY_BYTES {
        Err("Plugin API response exceeds the size limit".into())
    } else {
        Ok(())
    }
}

fn approved(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && url
            .host_str()
            .is_some_and(|host| PROVIDER_HOSTS.contains(&host))
}

fn client() -> Result<&'static Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(15))
                .user_agent(concat!("MC-Vector/", env!("CARGO_PKG_VERSION")))
                .redirect(Policy::custom(|attempt| {
                    if attempt.previous().len() >= 5 {
                        attempt.error("Too many provider redirects")
                    } else if approved(attempt.url()) {
                        attempt.follow()
                    } else {
                        attempt.error("Provider redirect is outside approved HTTPS hosts")
                    }
                }))
                .build()
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// A renderer-provided URL is never accepted. Every endpoint is assembled from
/// a fixed provider base and separately encoded, validated identifiers.
pub(in crate::plugins) fn endpoint(base: &str, segments: &[&str]) -> Result<Url, String> {
    let mut url = Url::parse(base).map_err(|error| error.to_string())?;
    if !approved(&url) {
        return Err("Invalid provider endpoint".into());
    }
    let mut path = url
        .path_segments_mut()
        .map_err(|_| "Invalid provider path")?;
    path.pop_if_empty();
    for segment in segments {
        if segment.trim().is_empty()
            || segment.len() > 256
            || segment.chars().any(|character| {
                character.is_control() || matches!(character, '/' | '\\' | '?' | '#')
            })
            || matches!(*segment, "." | "..")
        {
            return Err("Invalid provider identifier".into());
        }
        path.push(segment);
    }
    drop(path);
    Ok(url)
}

pub(in crate::plugins) async fn get(url: Url) -> Result<Value, String> {
    if !approved(&url) {
        return Err("Invalid provider endpoint".into());
    }
    fetch_json(client()?, url).await
}

async fn fetch_json(client: &Client, url: Url) -> Result<Value, String> {
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("Plugin API request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Plugin API request failed: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BODY_BYTES as u64)
    {
        return Err("Plugin API response exceeds the size limit".into());
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        check_body_size(bytes.len(), chunk.len())?;
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("Invalid plugin API JSON: {error}"))
}

pub(in crate::plugins) fn page_limit(value: u32, maximum: u32) -> Result<u32, String> {
    if value == 0 || value > maximum {
        Err("Invalid provider page size".into())
    } else {
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn catalog_http_decodes_chunked_json_from_loopback() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        let mock = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                request.push(stream.read_u8().await.unwrap());
            }
            assert!(request.starts_with(b"GET /tag/category HTTP/1.1"));
            assert!(String::from_utf8_lossy(&request)
                .to_lowercase()
                .contains("accept: application/json"));
            stream.write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n1\r\n[\r\n10\r\n{\"name\":\"tools\"}\r\n1\r\n]\r\n0\r\n\r\n").await.unwrap();
        });
        let client = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let url = Url::parse(&format!("http://{address}/tag/category")).unwrap();
        let result = fetch_json(&client, url).await.unwrap();
        mock.await.unwrap();
        assert_eq!(result, serde_json::json!([{"name": "tools"}]));
    }

    #[test]
    fn body_limit_covers_chunked_and_overflowing_sizes() {
        assert!(check_body_size(0, MAX_BODY_BYTES).is_ok());
        assert!(check_body_size(MAX_BODY_BYTES - 1, 2).is_err());
        assert!(check_body_size(0, MAX_BODY_BYTES + 1).is_err());
        assert!(check_body_size(usize::MAX, 1).is_err());
    }

    #[test]
    fn only_approved_https_metadata_hosts_are_allowed() {
        for url in [
            "http://api.modrinth.com/v2",
            "https://api.modrinth.com.evil.test/v2",
            "https://localhost/v2",
            "https://api.modrinth.com:444/v2",
            "https://user@api.modrinth.com/v2",
        ] {
            assert!(!approved(&Url::parse(url).unwrap()), "{url}");
        }
        assert!(approved(
            &Url::parse("https://api.modrinth.com/v2").unwrap()
        ));
    }

    #[test]
    fn identifiers_cannot_replace_host_or_traverse_paths() {
        for id in ["..", ".", "a/b", "https://evil.test", "a\\b", "a?b", ""] {
            assert!(
                endpoint("https://api.modrinth.com/v2/project", &[id]).is_err(),
                "{id}"
            );
        }
        assert_eq!(
            endpoint(
                "https://hangar.papermc.io/api/v1/projects",
                &["My Owner", "plugin"]
            )
            .unwrap()
            .as_str(),
            "https://hangar.papermc.io/api/v1/projects/My%20Owner/plugin"
        );
    }
}
