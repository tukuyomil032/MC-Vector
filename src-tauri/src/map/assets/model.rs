use std::collections::HashMap;

use serde::Deserialize;

use super::texture::DEFAULT_UV;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum FaceDirection {
    Down,
    Up,
    North,
    South,
    West,
    East,
}

impl FaceDirection {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "down" => Some(Self::Down),
            "up" => Some(Self::Up),
            "north" => Some(Self::North),
            "south" => Some(Self::South),
            "west" => Some(Self::West),
            "east" => Some(Self::East),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ModelFace {
    pub(crate) texture: String,
    #[serde(default)]
    pub(crate) uv: Option<[f32; 4]>,
    #[serde(default)]
    pub(crate) rotation: u32,
    #[serde(default)]
    pub(crate) tintindex: Option<u8>,
    #[serde(default)]
    pub(crate) cullface: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ModelRotation {
    #[serde(default = "default_origin")]
    pub(crate) origin: [f32; 3],
    pub(crate) axis: String,
    pub(crate) angle: f32,
    #[serde(default)]
    pub(crate) rescale: bool,
}

fn default_origin() -> [f32; 3] {
    [8.0, 8.0, 8.0]
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ModelElement {
    pub(crate) from: [f32; 3],
    pub(crate) to: [f32; 3],
    pub(crate) faces: HashMap<String, ModelFace>,
    #[serde(default)]
    pub(crate) rotation: Option<ModelRotation>,
    #[serde(default = "default_true")]
    pub(crate) shade: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct Model {
    #[serde(default)]
    pub(crate) parent: Option<String>,
    #[serde(default)]
    pub(crate) textures: HashMap<String, String>,
    #[serde(default)]
    pub(crate) elements: Option<Vec<ModelElement>>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ResolvedFace {
    pub(crate) direction: FaceDirection,
    pub(crate) vertices: [[f32; 3]; 4],
    pub(crate) texture: String,
    pub(crate) uv: [f32; 4],
    pub(crate) rotation: u32,
    pub(crate) tint_index: Option<u8>,
    pub(crate) shade: bool,
}

impl Model {
    pub(crate) fn merge_parent(mut child: Self, parent: Self) -> Self {
        let mut textures = parent.textures;
        textures.extend(child.textures);
        child.textures = textures;

        if child.elements.is_none() {
            child.elements = parent.elements;
        }
        child.parent = None;
        child
    }

    pub(crate) fn resolve_faces(
        &self,
        model_rotation_x: u32,
        model_rotation_y: u32,
        uvlock: bool,
    ) -> Vec<(FaceDirection, ModelFace, [[f32; 3]; 4], bool)> {
        self.elements
            .iter()
            .flat_map(|elements| elements.iter())
            .flat_map(|element| {
                element.faces.iter().filter_map(|(name, face)| {
                    let direction = FaceDirection::parse(name)?;
                    let mut vertices = face_vertices(direction, element.from, element.to);
                    if let Some(rotation) = element.rotation.as_ref() {
                        vertices = vertices.map(|point| rotate_element(point, rotation));
                    }
                    vertices = vertices
                        .map(|point| rotate_model(point, model_rotation_x, model_rotation_y));
                    let mut face = face.clone();
                    if uvlock {
                        face.rotation =
                            uv_lock_rotation(face.rotation, model_rotation_x, model_rotation_y);
                    }
                    Some((direction, face, vertices, element.shade))
                })
            })
            .collect()
    }
}

/// Keep the face texture aligned to world orientation for the blockstate's
/// supported quarter-turn model rotations. Geometry applies x then y; the
/// texture receives the inverse accumulated turn, while an explicit face
/// rotation remains part of the final result. Non-quarter input is rounded
/// down to the nearest supported turn, matching blockstate's integer contract.
fn uv_lock_rotation(face_rotation: u32, model_rotation_x: u32, model_rotation_y: u32) -> u32 {
    let model_turns = (model_rotation_x / 90 + model_rotation_y / 90) % 4;
    let inverse_turns = (4 - model_turns) % 4;
    (face_rotation + inverse_turns * 90) % 360
}

fn face_vertices(direction: FaceDirection, from: [f32; 3], to: [f32; 3]) -> [[f32; 3]; 4] {
    let (x0, y0, z0) = (from[0], from[1], from[2]);
    let (x1, y1, z1) = (to[0], to[1], to[2]);
    match direction {
        FaceDirection::Up => [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
        FaceDirection::Down => [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
        FaceDirection::North => [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
        FaceDirection::South => [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
        FaceDirection::West => [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
        FaceDirection::East => [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    }
}

fn rotate_element(point: [f32; 3], rotation: &ModelRotation) -> [f32; 3] {
    let mut point = point;
    if rotation.rescale {
        let angle = rotation.angle.abs();
        let factor = if (angle - 22.5).abs() < f32::EPSILON {
            1.0 / 22.5_f32.to_radians().cos()
        } else if (angle - 45.0).abs() < f32::EPSILON {
            1.0 / 45.0_f32.to_radians().cos()
        } else {
            1.0
        };
        let mut translated = [
            point[0] - rotation.origin[0],
            point[1] - rotation.origin[1],
            point[2] - rotation.origin[2],
        ];
        match rotation.axis.as_str() {
            "x" => {
                translated[1] *= factor;
                translated[2] *= factor;
            }
            "y" => {
                translated[0] *= factor;
                translated[2] *= factor;
            }
            "z" => {
                translated[0] *= factor;
                translated[1] *= factor;
            }
            _ => return point,
        }
        point = [
            translated[0] + rotation.origin[0],
            translated[1] + rotation.origin[1],
            translated[2] + rotation.origin[2],
        ];
    }
    rotate_around(
        point,
        rotation.origin,
        rotation.axis.as_str(),
        rotation.angle,
    )
}

fn rotate_model(point: [f32; 3], x: u32, y: u32) -> [f32; 3] {
    let point = rotate_around(point, [8.0, 8.0, 8.0], "x", x as f32);
    rotate_around(point, [8.0, 8.0, 8.0], "y", y as f32)
}

fn rotate_around(point: [f32; 3], origin: [f32; 3], axis: &str, degrees: f32) -> [f32; 3] {
    let radians = degrees.to_radians();
    let (sin, cos) = radians.sin_cos();
    let mut translated = [
        point[0] - origin[0],
        point[1] - origin[1],
        point[2] - origin[2],
    ];
    match axis {
        "x" => {
            let y = translated[1] * cos - translated[2] * sin;
            let z = translated[1] * sin + translated[2] * cos;
            translated[1] = y;
            translated[2] = z;
        }
        "y" => {
            let x = translated[0] * cos + translated[2] * sin;
            let z = -translated[0] * sin + translated[2] * cos;
            translated[0] = x;
            translated[2] = z;
        }
        "z" => {
            let x = translated[0] * cos - translated[1] * sin;
            let y = translated[0] * sin + translated[1] * cos;
            translated[0] = x;
            translated[1] = y;
        }
        _ => return point,
    }
    [
        translated[0] + origin[0],
        translated[1] + origin[1],
        translated[2] + origin[2],
    ]
}

pub(crate) fn default_uv(face: &ModelFace) -> [f32; 4] {
    face.uv.unwrap_or(DEFAULT_UV)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_up_face_geometry_from_a_full_cube() {
        let model: Model = serde_json::from_value(serde_json::json!({
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 16, 16],
                "faces": {"up": {"texture": "#all"}}
            }]
        }))
        .expect("model fixture");
        let faces = model.resolve_faces(0, 0, false);
        assert_eq!(faces.len(), 1);
        assert_eq!(faces[0].0, FaceDirection::Up);
        assert_eq!(faces[0].2[0], [0.0, 16.0, 0.0]);
    }

    #[test]
    fn applies_model_rotation_to_face_vertices() {
        let model: Model = serde_json::from_value(serde_json::json!({
            "elements": [{
                "from": [0, 0, 0],
                "to": [4, 4, 4],
                "faces": {"up": {"texture": "#all"}}
            }]
        }))
        .expect("model fixture");
        let faces = model.resolve_faces(0, 90, false);
        assert_ne!(faces[0].2[0], [0.0, 4.0, 0.0]);
    }

    #[test]
    fn rescales_rotated_element_on_axes_perpendicular_to_rotation_axis() {
        let rotation = ModelRotation {
            origin: [8.0, 8.0, 8.0],
            axis: "x".to_string(),
            angle: 45.0,
            rescale: true,
        };
        let point = rotate_element([8.0, 0.0, 8.0], &rotation);

        assert!((point[0] - 8.0).abs() < 0.001);
        assert!(point[1].abs() < 0.001);
        assert!(point[2].abs() < 0.001);
    }

    #[test]
    fn child_elements_replace_parent_elements_when_both_are_defined() {
        let parent: Model = serde_json::from_value(serde_json::json!({
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 16, 16],
                "faces": {"up": {"texture": "#parent"}}
            }]
        }))
        .expect("parent model fixture");
        let child: Model = serde_json::from_value(serde_json::json!({
            "parent": "minecraft:block/parent",
            "elements": [{
                "from": [2, 2, 2],
                "to": [14, 14, 14],
                "faces": {"down": {"texture": "#child"}}
            }]
        }))
        .expect("child model fixture");

        let merged = Model::merge_parent(child, parent);
        let faces = merged.resolve_faces(0, 0, false);

        assert_eq!(faces.len(), 1);
        assert_eq!(faces[0].0, FaceDirection::Down);
        assert_eq!(faces[0].1.texture, "#child");
    }

    #[test]
    fn uvlock_compensates_model_rotation_but_false_preserves_face_rotation() {
        let model: Model = serde_json::from_value(serde_json::json!({
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 16, 16],
                "faces": {"up": {"texture": "#all", "rotation": 90}}
            }]
        }))
        .expect("model fixture");

        let unlocked = model.resolve_faces(0, 90, false);
        let locked = model.resolve_faces(0, 90, true);

        assert_eq!(unlocked[0].1.rotation, 90);
        assert_eq!(locked[0].1.rotation, 0);
        assert_eq!(unlocked[0].2, locked[0].2);
    }
}
