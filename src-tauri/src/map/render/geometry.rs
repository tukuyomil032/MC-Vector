#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Face {
    Down,
    Up,
    North,
    South,
    West,
    East,
}

impl Face {
    pub(crate) const fn shade(self) -> f32 {
        match self {
            Self::Up => 1.0,
            Self::Down => 0.5,
            Self::North | Self::South => 0.78,
            Self::West | Self::East => 0.88,
        }
    }
}
