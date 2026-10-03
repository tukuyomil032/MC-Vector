//! Minimal source-independent shader colour contract.
//!
//! The eventual shader set can add biome multipliers and transparency modes
//! without changing perspective traversal.  This module keeps compositing
//! explicit and never turns an unresolved texture into an opaque fallback.

use std::collections::BTreeMap;

use crate::domain::{Material, MaterialOpacity};

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct ShaderColor(pub [u8; 4]);

impl ShaderColor {
    pub fn tinted(self, tint: [u8; 3]) -> Self {
        let [red, green, blue, alpha] = self.0;
        Self([
            ((u16::from(red) * u16::from(tint[0])) / 255) as u8,
            ((u16::from(green) * u16::from(tint[1])) / 255) as u8,
            ((u16::from(blue) * u16::from(tint[2])) / 255) as u8,
            alpha,
        ])
    }

    pub fn with_alpha(self, alpha: u8) -> Self {
        Self([self.0[0], self.0[1], self.0[2], alpha])
    }

    pub fn over(self, background: Self) -> Self {
        let source_alpha = u16::from(self.0[3]);
        let inverse = 255_u16.saturating_sub(source_alpha);
        let output_alpha = source_alpha + (u16::from(background.0[3]) * inverse) / 255;
        if output_alpha == 0 {
            return Self([0, 0, 0, 0]);
        }
        Self([
            composite_channel(
                self.0[0],
                background.0[0],
                source_alpha,
                u16::from(background.0[3]),
                inverse,
                output_alpha,
            ),
            composite_channel(
                self.0[1],
                background.0[1],
                source_alpha,
                u16::from(background.0[3]),
                inverse,
                output_alpha,
            ),
            composite_channel(
                self.0[2],
                background.0[2],
                source_alpha,
                u16::from(background.0[3]),
                inverse,
                output_alpha,
            ),
            output_alpha as u8,
        ])
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd)]
pub enum TintChannel {
    Grass,
    Foliage,
    Water,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ShaderError {
    MissingBiome { biome_id: u32, channel: TintChannel },
    MissingHeight,
    UnknownShader,
    InvalidTint,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct ShaderState {
    pub biome_id: Option<u32>,
    pub height: Option<i32>,
    pub sky_light: u8,
    pub block_light: u8,
    pub underwater: bool,
    pub cave: bool,
}

pub trait HdShader {
    fn shade(&self, color: ShaderColor, state: ShaderState) -> Result<ShaderColor, ShaderError>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DefaultHdShader;

impl HdShader for DefaultHdShader {
    fn shade(&self, color: ShaderColor, _state: ShaderState) -> Result<ShaderColor, ShaderError> {
        Ok(color)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TexturePackHdShader;

impl HdShader for TexturePackHdShader {
    fn shade(&self, color: ShaderColor, _state: ShaderState) -> Result<ShaderColor, ShaderError> {
        Ok(color)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TexturePackHdUnderwaterShader {
    pub tint: [u8; 3],
}

impl Default for TexturePackHdUnderwaterShader {
    fn default() -> Self {
        Self {
            tint: [128, 180, 255],
        }
    }
}

impl HdShader for TexturePackHdUnderwaterShader {
    fn shade(&self, color: ShaderColor, state: ShaderState) -> Result<ShaderColor, ShaderError> {
        Ok(if state.underwater {
            color.tinted(self.tint)
        } else {
            color
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TexturePackHdCaveShader {
    pub tint: [u8; 3],
}

impl Default for TexturePackHdCaveShader {
    fn default() -> Self {
        Self {
            tint: [128, 128, 128],
        }
    }
}

impl HdShader for TexturePackHdCaveShader {
    fn shade(&self, color: ShaderColor, state: ShaderState) -> Result<ShaderColor, ShaderError> {
        Ok(if state.cave {
            color.tinted(self.tint)
        } else {
            color
        })
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TopoHdShader;

impl HdShader for TopoHdShader {
    fn shade(&self, color: ShaderColor, state: ShaderState) -> Result<ShaderColor, ShaderError> {
        let height = state.height.ok_or(ShaderError::MissingHeight)?;
        let intensity = ((height + 64).clamp(0, 320) * 255 / 320) as u8;
        Ok(ShaderColor([intensity, intensity, intensity, color.0[3]]))
    }
}

#[derive(Debug, Clone, Default, Eq, PartialEq)]
pub struct BiomeTintMap {
    colors: BTreeMap<(u32, TintChannel), [u8; 3]>,
}

impl BiomeTintMap {
    pub fn insert(&mut self, biome_id: u32, channel: TintChannel, color: [u8; 3]) {
        self.colors.insert((biome_id, channel), color);
    }

    pub fn resolve(&self, biome_id: u32, channel: TintChannel) -> Result<[u8; 3], ShaderError> {
        self.colors
            .get(&(biome_id, channel))
            .copied()
            .ok_or(ShaderError::MissingBiome { biome_id, channel })
    }
}

pub fn shade_material(
    color: ShaderColor,
    material: &Material,
    biome_id: Option<u32>,
    tint_map: &BiomeTintMap,
) -> Result<ShaderColor, ShaderError> {
    let color = if material.tintable {
        let biome_id = biome_id.ok_or(ShaderError::MissingBiome {
            biome_id: 0,
            channel: TintChannel::Grass,
        })?;
        color.tinted(tint_map.resolve(biome_id, TintChannel::Grass)?)
    } else {
        color
    };
    let color = match material.opacity {
        MaterialOpacity::Opaque | MaterialOpacity::Translucent | MaterialOpacity::Emissive => color,
        MaterialOpacity::Cutout => color.with_alpha(if color.0[3] >= 128 { 255 } else { 0 }),
    };
    Ok(color)
}

fn composite_channel(
    foreground: u8,
    background: u8,
    foreground_alpha: u16,
    background_alpha: u16,
    inverse_alpha: u16,
    output_alpha: u16,
) -> u8 {
    ((u32::from(foreground) * u32::from(foreground_alpha)
        + u32::from(background) * u32::from(background_alpha) * u32::from(inverse_alpha) / 255)
        / u32::from(output_alpha)) as u8
}

#[cfg(test)]
mod tests {
    use super::{
        shade_material, BiomeTintMap, DefaultHdShader, HdShader, ShaderColor, ShaderError,
        ShaderState, TexturePackHdCaveShader, TexturePackHdUnderwaterShader, TintChannel,
        TopoHdShader,
    };
    use crate::domain::{Material, MaterialOpacity, TextureReference};

    #[test]
    fn alpha_compositing_keeps_transparent_pixels_transparent() {
        let foreground = ShaderColor([255, 0, 0, 0]);
        assert_eq!(
            foreground.over(ShaderColor([0, 0, 0, 0])),
            ShaderColor([0, 0, 0, 0])
        );
    }

    #[test]
    fn biome_tint_changes_rgb_but_not_alpha() {
        assert_eq!(
            ShaderColor([200, 100, 50, 128]).tinted([128, 255, 64]),
            ShaderColor([100, 100, 12, 128])
        );
    }

    #[test]
    fn missing_biome_is_not_replaced_with_a_default_tint() {
        let material = Material {
            texture: TextureReference::new("minecraft:block/grass"),
            opacity: MaterialOpacity::Opaque,
            tintable: true,
        };
        assert!(matches!(
            shade_material(
                ShaderColor([100, 100, 100, 255]),
                &material,
                Some(7),
                &BiomeTintMap::default(),
            ),
            Err(super::ShaderError::MissingBiome { .. })
        ));
    }

    #[test]
    fn cutout_and_emissive_materials_keep_distinct_alpha_rules() {
        let mut tints = BiomeTintMap::default();
        tints.insert(1, TintChannel::Grass, [255, 255, 255]);
        let cutout = Material {
            texture: TextureReference::new("minecraft:block/leaves"),
            opacity: MaterialOpacity::Cutout,
            tintable: true,
        };
        let result = shade_material(ShaderColor([1, 2, 3, 17]), &cutout, Some(1), &tints).unwrap();
        assert_eq!(result.0[3], 0);
        let emissive = Material {
            texture: TextureReference::new("minecraft:block/glowstone"),
            opacity: MaterialOpacity::Emissive,
            tintable: false,
        };
        assert_eq!(
            shade_material(ShaderColor([1, 2, 3, 17]), &emissive, None, &tints)
                .unwrap()
                .0[3],
            17
        );
    }

    fn state() -> ShaderState {
        ShaderState {
            biome_id: Some(1),
            height: Some(64),
            sky_light: 15,
            block_light: 0,
            underwater: true,
            cave: true,
        }
    }

    #[test]
    fn builtin_shader_states_have_explicit_transitions() {
        let color = ShaderColor([200, 100, 50, 128]);
        assert_eq!(DefaultHdShader.shade(color, state()).unwrap(), color);
        assert_ne!(
            TexturePackHdUnderwaterShader::default()
                .shade(color, state())
                .unwrap(),
            color
        );
        assert_ne!(
            TexturePackHdCaveShader::default()
                .shade(color, state())
                .unwrap(),
            color
        );
        assert_eq!(TopoHdShader.shade(color, state()).unwrap().0[0], 102);
    }

    #[test]
    fn topo_shader_does_not_guess_missing_height() {
        assert_eq!(
            TopoHdShader.shade(
                ShaderColor([1, 2, 3, 255]),
                ShaderState {
                    height: None,
                    ..state()
                },
            ),
            Err(ShaderError::MissingHeight)
        );
    }
}
