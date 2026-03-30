export default {
  'src/**/*.{ts,tsx}': (files) => [`biome check --write ${files.map((f) => `"${f}"`).join(' ')}`],
  'src-tauri/src/**/*.rs': () => 'cargo fmt --all --manifest-path src-tauri/Cargo.toml',
};
