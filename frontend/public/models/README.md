# 3D models for souvenir editor

Place production GLB files here (served as `/models/...` by Vite).

## Contract

- Named print mesh: `print_front` (t-shirt) or `print_wrap` (mug), matching `printAreas[].meshName`.
- UV island aspect ≈ `widthMm / heightMm` of the print area.
- Body/handle use separate materials (no print texture).

## Spike without GLB

If `modelUrl` is empty, the editor uses procedural mesh in `features/souvenir3d/ProceduralProduct.tsx`.

## Free sources (rework UV in Blender)

- https://poly.pizza — CC0 mugs (e.g. Kenney)
- https://sketchfab.com — filter Downloadable + CC0

Do not commit large unlicensed assets. Prefer CC0 or licensed production scans.
