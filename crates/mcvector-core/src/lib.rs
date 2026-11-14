//! Shared domain core for MC-Vector.
//!
//! Both the Tauri edition (`src-tauri`) and the Native SwiftUI edition (via
//! `mcvector-ffi`) depend on this crate. It must never depend on `tauri` or any
//! `tauri-plugin-*` crate.

pub mod config;
pub mod download;
pub mod error;
pub mod eula;
pub mod external_copy;
pub mod instance_lock;
pub mod java_policy;
pub mod lifecycle;
pub mod managed_path;
pub mod metric_history;
pub mod operations;
pub mod paths;
pub mod recovery_record;
pub mod registry;
pub mod server_creation;
pub mod server_import;
pub mod server_jar;
pub mod server_stdout;
pub mod shutdown;
