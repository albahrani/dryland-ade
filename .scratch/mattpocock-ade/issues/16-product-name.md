# Product name and branding

Type: grilling
Status: resolved
Blocked by: 

## Question

Choose the product name (ADE is a working name) and basic branding constraints (CLI binary name, package ids).


## Answer

- Official name **Dryland ADE**, short form **Dryland** (the last dry spot of land in Waterworld: solid ground in the fog). "ADE" stays as the category word so the name is searchable; "Landfall" and "Wayfinder" were rejected (game-studio brand friction; Wayfinder is Matt's skill name and implies affiliation).
- CLI binary `dryland`, no alias (`dl` is taken on npm).
- npm scope `@dryland/*` (`core`, `cli`, `desktop`); repo `dryland-ade`; electron-builder appId `dev.dryland.ade` (placeholder owner/domain, finalized in the GitHub project preparation ticket).
- Affiliation: no personal name in the name, binary or ids; explicitly "unofficial, community-made" with a visible love-letter to Matt Pocock's skills (tagline, About dialog, README credit linking upstream, skills named in UI where recommended).
- Existing docs and `.scratch/mattpocock-ade/` keep "ADE" as the generic term; a one-line note is added to the ADRs when the spec is authored.
- Checks done: npm `dryland`, `@dryland/*`, `dryland-cli` free; `dryland.dev`/`dryland.sh` no DNS (look free); `dryland.app`/`.io` registered. Formal trademark search not done; Waterworld is a film IP, so avoid its imagery/logos.
