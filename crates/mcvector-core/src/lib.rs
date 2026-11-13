//! Shared domain core for MC-Vector.
//!
//! Both the Tauri edition (`src-tauri`) and the Native SwiftUI edition (via
//! `mcvector-ffi`) depend on this crate. It must never depend on `tauri` or any
//! `tauri-plugin-*` crate.

pub mod error;
pub mod instance_lock;
pub mod paths;
pub mod recovery_record;
pub mod registry;
pub mod shutdown;
