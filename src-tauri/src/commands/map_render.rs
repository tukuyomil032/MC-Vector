//! Tauri boundary for the verified renderer diagnostics contract.
//!
//! Rendering is intentionally not started here until the source adapters and
//! scheduler are connected. A request that reaches this command is therefore
//! reported as blocked instead of being represented by a transparent PNG or a
//! false-ready status.

use std::collections::BTreeMap;
use std::sync::Mutex;

use map_renderer_core::ipc::{
    MapRenderProgressEvent, MapRenderRequest, MapRenderResponse, MAP_RENDER_PROGRESS_EVENT,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct MapRenderManager {
    generations: Mutex<BTreeMap<String, u64>>,
}

impl MapRenderManager {
    fn next_generation(&self, server_id: &str) -> Result<u64, &'static str> {
        let mut generations = self
            .generations
            .lock()
            .map_err(|_| "map_state_unavailable")?;
        let generation = generations.entry(server_id.to_owned()).or_insert(0);
        *generation = generation
            .checked_add(1)
            .ok_or("map_generation_exhausted")?;
        Ok(*generation)
    }
}

#[tauri::command]
pub fn request_map_render(
    app: AppHandle,
    state: State<'_, MapRenderManager>,
    request: MapRenderRequest,
) -> Result<MapRenderResponse, String> {
    request
        .validate()
        .map_err(|error| error.code().to_owned())?;
    let generation = state
        .next_generation(&request.server_id)
        .map_err(str::to_owned)?;
    let diagnostics =
        map_renderer_core::ipc::MapRenderDiagnostics::blocked(request.minecraft_version.clone());
    let progress = MapRenderProgressEvent {
        request_id: request.request_id.clone(),
        server_id: request.server_id.clone(),
        generation,
        diagnostics: diagnostics.clone(),
    };
    app.emit(MAP_RENDER_PROGRESS_EVENT, progress)
        .map_err(|_| "map_event_emit_failed".to_owned())?;
    Ok(MapRenderResponse {
        request_id: request.request_id,
        tile: request.tile,
        zoom: request.zoom,
        diagnostics,
    })
}
