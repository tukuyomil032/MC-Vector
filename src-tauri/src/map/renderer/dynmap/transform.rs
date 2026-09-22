//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Removes JSON and Java mutable-vector dependencies and adds checked inversion.

use super::types::Vec3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix3D {
    values: [[f64; 3]; 3],
}

impl Matrix3D {
    pub const fn identity() -> Self {
        Self::from_rows([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
    }

    pub const fn from_rows(values: [[f64; 3]; 3]) -> Self {
        Self { values }
    }

    pub const fn rows(self) -> [[f64; 3]; 3] {
        self.values
    }

    /// Matches Dynmap's `this = mat * this` multiplication order.
    pub fn pre_multiply(&mut self, mat: Self) {
        *self = mat * *self;
    }

    pub fn post_multiply(&mut self, mat: Self) {
        *self = *self * mat;
    }

    pub fn scaled(mut self, x: f64, y: f64, z: f64) -> Self {
        self.pre_multiply(Self::from_rows([
            [x, 0.0, 0.0],
            [0.0, y, 0.0],
            [0.0, 0.0, z],
        ]));
        self
    }

    pub fn rotate_xy(mut self, degrees: f64) -> Self {
        let (sin, cos) = degrees.to_radians().sin_cos();
        self.pre_multiply(Self::from_rows([
            [cos, sin, 0.0],
            [-sin, cos, 0.0],
            [0.0, 0.0, 1.0],
        ]));
        self
    }

    pub fn rotate_xz(mut self, degrees: f64) -> Self {
        let (sin, cos) = degrees.to_radians().sin_cos();
        self.pre_multiply(Self::from_rows([
            [cos, 0.0, -sin],
            [0.0, 1.0, 0.0],
            [sin, 0.0, cos],
        ]));
        self
    }

    pub fn rotate_yz(mut self, degrees: f64) -> Self {
        let (sin, cos) = degrees.to_radians().sin_cos();
        self.pre_multiply(Self::from_rows([
            [1.0, 0.0, 0.0],
            [0.0, cos, sin],
            [0.0, -sin, cos],
        ]));
        self
    }

    pub fn sheared_z(mut self, x_factor: f64, y_factor: f64) -> Self {
        self.pre_multiply(Self::from_rows([
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [x_factor, y_factor, 1.0],
        ]));
        self
    }

    pub fn transform(self, point: Vec3) -> Vec3 {
        Vec3::new(
            self.values[0][0] * point.x + self.values[0][1] * point.y + self.values[0][2] * point.z,
            self.values[1][0] * point.x + self.values[1][1] * point.y + self.values[1][2] * point.z,
            self.values[2][0] * point.x + self.values[2][1] * point.y + self.values[2][2] * point.z,
        )
    }

    pub fn determinant(self) -> f64 {
        let m = self.values;
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    }

    pub fn inverse(self) -> Option<Self> {
        let m = self.values;
        let determinant = self.determinant();
        if determinant.abs() <= f64::EPSILON {
            return None;
        }

        let inverse_determinant = 1.0 / determinant;
        Some(Self::from_rows([
            [
                (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * inverse_determinant,
                (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * inverse_determinant,
                (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * inverse_determinant,
            ],
            [
                (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * inverse_determinant,
                (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * inverse_determinant,
                (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * inverse_determinant,
            ],
            [
                (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * inverse_determinant,
                (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * inverse_determinant,
                (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * inverse_determinant,
            ],
        ]))
    }
}

impl std::ops::Mul for Matrix3D {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        let mut values = [[0.0; 3]; 3];
        for (row, output_row) in values.iter_mut().enumerate() {
            for (column, output) in output_row.iter_mut().enumerate() {
                *output = (0..3)
                    .map(|index| self.values[row][index] * rhs.values[index][column])
                    .sum();
            }
        }
        Self::from_rows(values)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Transform3D {
    forward: Matrix3D,
    inverse: Matrix3D,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct SingularTransform;

impl Transform3D {
    pub fn new(forward: Matrix3D) -> Result<Self, SingularTransform> {
        let inverse = forward.inverse().ok_or(SingularTransform)?;
        Ok(Self { forward, inverse })
    }

    pub const fn forward(self) -> Matrix3D {
        self.forward
    }

    pub const fn inverse(self) -> Matrix3D {
        self.inverse
    }

    pub fn transform(self, point: Vec3) -> Vec3 {
        self.forward.transform(point)
    }

    pub fn inverse_transform(self, point: Vec3) -> Vec3 {
        self.inverse.transform(point)
    }
}

#[cfg(test)]
mod tests {
    use super::{Matrix3D, Transform3D};
    use crate::map::renderer::dynmap::types::Vec3;

    fn assert_close(actual: Vec3, expected: Vec3) {
        assert!(
            (actual.x - expected.x).abs() < 1e-9,
            "x: {actual:?} != {expected:?}"
        );
        assert!(
            (actual.y - expected.y).abs() < 1e-9,
            "y: {actual:?} != {expected:?}"
        );
        assert!(
            (actual.z - expected.z).abs() < 1e-9,
            "z: {actual:?} != {expected:?}"
        );
    }

    #[test]
    fn matrix_round_trip_preserves_negative_coordinates() {
        let matrix = Matrix3D::identity()
            .scaled(2.0, 0.5, -3.0)
            .rotate_xy(37.0)
            .sheared_z(0.25, -0.5);
        let transform = Transform3D::new(matrix).expect("matrix is invertible");
        let point = Vec3::new(-17.25, -0.5, -2048.125);
        assert_close(
            transform.inverse_transform(transform.transform(point)),
            point,
        );
    }

    #[test]
    fn dynmap_pre_multiply_order_is_stable() {
        let mut matrix = Matrix3D::identity();
        matrix.pre_multiply(Matrix3D::identity().scaled(2.0, 3.0, 4.0));
        assert_close(
            matrix.transform(Vec3::new(-1.0, -2.0, -3.0)),
            Vec3::new(-2.0, -6.0, -12.0),
        );
    }
}
