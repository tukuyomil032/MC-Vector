# ADR-MAP-0003: Symbol-Level Source Coverage

Source coverage is tracked per method, resource, and built-in renderer, not
only per Java class or Rust file. A row is complete only when it has a Rust
destination, fixture, reference trace, focused test, and evidence entry.

The coverage checker fails on unclassified or pending required rows.
