//! Version-specific saved-world adapters.
//!
//! The common Anvil decoder owns region and NBT mechanics.  These adapters own
//! exact Minecraft-version acceptance rules and must not silently accept a
//! neighboring release with a different data version.

pub mod v1_21_4;
