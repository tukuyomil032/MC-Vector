//! Source-independent Dynmap renderer contracts.

pub mod hd_perspective;
pub mod iso_hd_perspective;
pub mod lighting;
pub mod model;
pub mod patch;
pub mod shader;
pub mod texture;
pub mod transform;
pub mod types;

#[cfg(test)]
mod golden;
