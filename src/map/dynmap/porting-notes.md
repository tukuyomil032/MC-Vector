# Dynmap Porting Notes

The previous Map implementation was removed in R00. This source boundary is
new evidence, not evidence that a renderer already exists.

The selected Java files are retained verbatim for review and attribution. R02
will define source-independent Rust data contracts before any translation is
written. R03 will provide saved Anvil data, R04 will translate the perspective
renderer, and R05 will compare fixed fixtures with a Dynmap reference.

No guessed color, transparent PNG, non-zero coverage value, or connected Paper
bridge is accepted as renderer parity. Unsupported model or asset cases must
remain explicit errors until their fixture is covered.
