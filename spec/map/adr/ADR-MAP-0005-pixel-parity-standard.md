# ADR-MAP-0005: Differential and Pixel Parity

The pinned Dynmap Java reference produces fixed intermediate traces and fixed
PNG goldens. Rust compares ray, face, patch, UV, lighting, alpha, projected
pixel, and normalized RGBA output. Tests never generate their own expected
golden during execution.
