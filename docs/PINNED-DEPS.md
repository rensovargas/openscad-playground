# Pinned binary dependencies

## openscad.wasm

- Source: openscad/openscad-wasm CI artifact
- SHA-256 (openscad.wasm): f72ce246c02c0e501990837102be383326b153fd761774ebfacce5c80c5ecf26
- SHA-256 (openscad.js): 904a47f29e63afb597bedef747da3b457d8ea17cc793c462c6c8b444e918a62e
- Date obtained: 2026-06-25
- OpenSCAD version: 2025.03.25.wasm24456 (git ce5039f8a)
- Manifold enabled: yes (--enable=manifold)

## Notes

Canonical files live at `app/libs/openscad-wasm/`. The paths
`app/public/openscad.js` and `app/public/openscad.wasm` are symlinks
to those canonical files and share the same hashes.

## Policy

Do not update the WASM binary without:
1. Re-testing BOSL2 `cuboid` renders without errors
2. Re-running all Stage 1 acceptance criteria
3. Updating all hashes in this file
