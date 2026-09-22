# ADR-MAP-0007: Cache and Failure Tile Semantics

MC-Vector owns its cache format. Empty, failed, stale, retryable, and verified
tiles are distinct states. A zero-source result cannot become fresh successful
cache. A valid old layer remains visible while a replacement tile is pending
or failed.
