//! Shared resource and execution limits for untrusted map inputs.
//!
//! These limits are part of the renderer boundary: adapters must reject input
//! before allocating beyond them, and callers must report the typed failure
//! instead of converting malformed data into an empty or guessed tile.

pub const MAX_ARCHIVE_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_ARCHIVE_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_ARCHIVE_ENTRY_COUNT: usize = 100_000;
pub const MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES: u64 = 192 * 1024 * 1024;
pub const MAX_REGION_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_CHUNK_NBT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_MODEL_INHERITANCE_DEPTH: usize = 32;
pub const MAX_TEXTURE_PIXELS: u64 = 16_777_216;
pub const MAX_RENDER_PIXELS: u64 = 16_777_216;
pub const MAX_VOXEL_STEPS: usize = 65_536;
pub const MAX_SCHEDULER_PENDING_JOBS: usize = 4_096;

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum SecurityViolation {
    ArchiveTooLarge,
    ArchiveEntryTooLarge,
    ArchiveEntryCountExceeded,
    ArchiveUncompressedSizeExceeded,
    RegionTooLarge,
    ChunkTooLarge,
    ModelDepthExceeded,
    TextureTooLarge,
    RenderTooLarge,
    SchedulerCapacityExceeded,
}

pub fn checked_render_pixel_count(width: u32, height: u32) -> Result<usize, SecurityViolation> {
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(SecurityViolation::RenderTooLarge)?;
    if pixels == 0 || pixels > MAX_RENDER_PIXELS {
        return Err(SecurityViolation::RenderTooLarge);
    }
    usize::try_from(pixels).map_err(|_| SecurityViolation::RenderTooLarge)
}

pub fn validate_scheduler_capacity(
    max_in_flight: usize,
    max_pending: usize,
) -> Result<(), SecurityViolation> {
    if max_in_flight == 0 || max_pending < max_in_flight {
        return Err(SecurityViolation::SchedulerCapacityExceeded);
    }
    if max_pending > MAX_SCHEDULER_PENDING_JOBS {
        return Err(SecurityViolation::SchedulerCapacityExceeded);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_budget_rejects_zero_overflow_and_excessive_dimensions() {
        assert_eq!(
            checked_render_pixel_count(0, 1),
            Err(SecurityViolation::RenderTooLarge)
        );
        assert_eq!(
            checked_render_pixel_count(4097, 4097),
            Err(SecurityViolation::RenderTooLarge)
        );
        assert_eq!(checked_render_pixel_count(1024, 1024), Ok(1_048_576));
    }

    #[test]
    fn scheduler_budget_rejects_unbounded_pending_work() {
        assert_eq!(
            validate_scheduler_capacity(1, MAX_SCHEDULER_PENDING_JOBS + 1),
            Err(SecurityViolation::SchedulerCapacityExceeded)
        );
        assert_eq!(validate_scheduler_capacity(4, 16), Ok(()));
    }
}
