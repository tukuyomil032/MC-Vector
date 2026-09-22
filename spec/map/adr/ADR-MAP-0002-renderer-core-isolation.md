# ADR-MAP-0002: Isolate the Renderer Core

The renderer is implemented as an independent Rust library crate. The Tauri
application does not compile unfinished renderer modules into its normal
production target. The app depends on the renderer only through a verified
pipeline boundary.

The renderer crate uses warning-as-error checks. Blanket `dead_code` and
`unused` allowances are prohibited because an uncalled function is not proof
of a completed port.
