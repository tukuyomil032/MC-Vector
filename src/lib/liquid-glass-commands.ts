import {
  GlassMaterialVariant,
  type LiquidGlassConfig,
  isGlassSupported as isGlassSupportedApi,
  setLiquidGlassEffect as setLiquidGlassEffectApi,
} from 'tauri-plugin-liquid-glass-api';

export type { LiquidGlassConfig };
export { GlassMaterialVariant };

export async function isGlassSupported(): Promise<boolean> {
  return isGlassSupportedApi();
}

export async function setLiquidGlassEffect(config: LiquidGlassConfig): Promise<void> {
  await setLiquidGlassEffectApi(config);
}
