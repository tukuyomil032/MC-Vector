pub type Rgba = [u8; 4];

#[derive(Debug)]
pub struct RgbaTileBuffer {
    width: usize,
    height: usize,
    sums: Vec<[u64; 4]>,
    counts: Vec<u64>,
}

impl RgbaTileBuffer {
    pub fn new(width: usize, height: usize) -> Self {
        let length = width.saturating_mul(height);
        Self {
            width,
            height,
            sums: vec![[0; 4]; length],
            counts: vec![0; length],
        }
    }

    pub fn add_rect(
        &mut self,
        x_range: std::ops::RangeInclusive<usize>,
        z_range: std::ops::RangeInclusive<usize>,
        colour: Rgba,
    ) -> usize {
        if colour[3] == 0 || self.width == 0 || self.height == 0 {
            return 0;
        }
        let mut added = 0;
        for z in z_range {
            if z >= self.height {
                continue;
            }
            for x in x_range.clone() {
                if x >= self.width {
                    continue;
                }
                let index = z * self.width + x;
                for (sum, value) in self.sums[index].iter_mut().zip(colour) {
                    *sum += u64::from(value);
                }
                self.counts[index] += 1;
                added += 1;
            }
        }
        added
    }

    pub fn covered_pixels(&self) -> usize {
        self.counts.iter().filter(|count| **count > 0).count()
    }

    pub fn coverage_ratio(&self) -> f32 {
        let total = self.width.saturating_mul(self.height);
        if total == 0 {
            return 0.0;
        }
        self.covered_pixels() as f32 / total as f32
    }

    pub fn into_scanlines(self) -> Vec<u8> {
        let mut scanlines = Vec::with_capacity(self.height * (1 + self.width * 4));
        for z in 0..self.height {
            scanlines.push(0);
            for x in 0..self.width {
                let index = z * self.width + x;
                let count = self.counts[index];
                if count == 0 {
                    scanlines.extend_from_slice(&[0, 0, 0, 0]);
                    continue;
                }
                scanlines.extend_from_slice(&[
                    (self.sums[index][0] / count) as u8,
                    (self.sums[index][1] / count) as u8,
                    (self.sums[index][2] / count) as u8,
                    (self.sums[index][3] / count) as u8,
                ]);
            }
        }
        scanlines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregates_overlapping_chunk_footprints() {
        let mut buffer = RgbaTileBuffer::new(2, 2);
        assert_eq!(buffer.add_rect(0..=0, 0..=0, [10, 20, 30, 255]), 1);
        assert_eq!(buffer.add_rect(0..=0, 0..=0, [30, 40, 50, 255]), 1);
        assert_eq!(buffer.covered_pixels(), 1);
        assert_eq!(buffer.coverage_ratio(), 0.25);
        let scanlines = buffer.into_scanlines();
        assert_eq!(&scanlines[1..5], &[20, 30, 40, 255]);
    }

    #[test]
    fn transparent_colours_do_not_create_terrain_coverage() {
        let mut buffer = RgbaTileBuffer::new(2, 2);
        assert_eq!(buffer.add_rect(0..=1, 0..=1, [0, 0, 0, 0]), 0);
        assert_eq!(buffer.covered_pixels(), 0);
        assert_eq!(buffer.coverage_ratio(), 0.0);
    }
}
