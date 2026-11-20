//! Test-only loopback HTTP server. Each route answers a request whose path
//! (without the query) matches; unknown paths get 404. The server stops after
//! answering `requests` connections.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;

pub(crate) struct Route {
    pub path: String,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

impl Route {
    pub fn json(path: &str, value: serde_json::Value) -> Self {
        Self {
            path: path.to_owned(),
            content_type: "application/json",
            body: serde_json::to_vec(&value).unwrap(),
        }
    }

    pub fn bytes(path: &str, body: Vec<u8>) -> Self {
        Self {
            path: path.to_owned(),
            content_type: "application/octet-stream",
            body,
        }
    }
}

pub(crate) struct LoopbackServer {
    /// `http://127.0.0.1:<port>`
    pub base: String,
    thread: Option<thread::JoinHandle<Vec<String>>>,
}

impl LoopbackServer {
    /// Starts serving. `{base}` inside a JSON route body is replaced with this
    /// server's base URL, so metadata can link to other routes.
    pub fn start(routes: Vec<Route>, requests: usize) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener.local_addr().unwrap();
        let base = format!("http://{address}");
        let routes: Vec<Route> = routes
            .into_iter()
            .map(|mut route| {
                if route.content_type == "application/json" {
                    route.body = String::from_utf8_lossy(&route.body)
                        .replace("{base}", &base)
                        .into_bytes();
                }
                route
            })
            .collect();
        let (ready, ready_rx) = mpsc::channel();
        let thread = thread::spawn(move || {
            ready.send(()).unwrap();
            let mut seen = Vec::new();
            for _ in 0..requests {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let mut request = Vec::new();
                let mut buffer = [0_u8; 4096];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    match stream.read(&mut buffer) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => request.extend_from_slice(&buffer[..read]),
                    }
                }
                let line = String::from_utf8_lossy(&request)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_owned();
                let target = line.split_whitespace().nth(1).unwrap_or("/").to_owned();
                let path = target.split('?').next().unwrap_or("/").to_owned();
                seen.push(target);
                let response = match routes.iter().find(|route| route.path == path) {
                    Some(route) => {
                        let mut response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            route.content_type,
                            route.body.len()
                        )
                        .into_bytes();
                        response.extend_from_slice(&route.body);
                        response
                    }
                    None => {
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            .to_vec()
                    }
                };
                let _ = stream.write_all(&response);
                let _ = stream.flush();
            }
            seen
        });
        ready_rx.recv().unwrap();
        Self {
            base,
            thread: Some(thread),
        }
    }

    pub fn url(&self, path: &str) -> reqwest::Url {
        reqwest::Url::parse(&format!("{}{path}", self.base)).unwrap()
    }

    /// Waits for the server to answer every expected request and returns the
    /// request targets it saw.
    pub fn finish(mut self) -> Vec<String> {
        self.thread.take().unwrap().join().unwrap()
    }
}

impl Drop for LoopbackServer {
    fn drop(&mut self) {
        // A test that failed before `finish` must not hang on an accept loop.
        drop(self.thread.take());
    }
}

/// A client without proxies or redirects, for loopback requests.
pub(crate) fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap()
}
