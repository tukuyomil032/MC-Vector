# ADR-MAP-0008: Paper Snapshot Contract

Paper supplies verified chunk snapshots and lifecycle signals. Rust owns the
renderer. Bridge connectivity is separate from terrain readiness. Every
snapshot is checked for server, version, world, dimension, request ID, and
chunk coordinate consistency.
