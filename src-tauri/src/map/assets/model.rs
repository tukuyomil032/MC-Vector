use std::collections::HashMap;

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ModelFace {
    pub(crate) texture: String,
    #[serde(default)]
    pub(crate) uv: Option<[f32; 4]>,
    #[serde(default)]
    pub(crate) rotation: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ModelElement {
    pub(crate) from: [f32; 3],
    pub(crate) to: [f32; 3],
    pub(crate) faces: HashMap<String, ModelFace>,
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

impl Model {
    pub(crate) fn merge_parent(mut child: Self, parent: Self) -> Self {
        let mut textures = parent.textures;
        textures.extend(child.textures);
        child.textures = textures;

        match (parent.elements, child.elements.take()) {
            (Some(mut parent_elements), Some(child_elements)) => {
                parent_elements.extend(child_elements);
                child.elements = Some(parent_elements);
            }
            (Some(parent_elements), None) => child.elements = Some(parent_elements),
            (None, Some(child_elements)) => child.elements = Some(child_elements),
            (None, None) => {}
        }
        child.parent = None;
        child
    }

    pub(crate) fn top_faces(&self) -> impl Iterator<Item = &ModelFace> {
        self.elements
            .iter()
            .flat_map(|elements| elements.iter())
            .filter(|element| {
                element.to[0] > element.from[0]
                    && element.to[1] > element.from[1]
                    && element.to[2] > element.from[2]
            })
            .filter_map(|element| element.faces.get("up"))
    }
}
