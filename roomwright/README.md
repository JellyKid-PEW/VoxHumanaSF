# ROOMWRIGHT

Roomwright converts prose descriptions into evidence-backed, editable 3D
environments for fiction writers. This first milestone builds the **bridge of
the Wild Huntress** from the Vox Humana series.

**Run it:** serve this folder over HTTP (any static server) and open
`index.html` — e.g. `python3 -m http.server` then
`http://localhost:8000/roomwright/`. Everything is self-contained; no build
step, no network dependencies. Rendering uses WebGPU when the browser supports
it and falls back to WebGL2 automatically.

## The workflow

1. **Docs tab** — the bundled excerpt documents (Next, Presence, Book 3) are
   already imported. Add your own with *Import .txt* or *Paste text*, then
   *Extract statements* to pull candidate spatial statements out of the prose.
   Nothing enters the database without your confirmation.
2. **Constraints tab** — every extracted statement with its verbatim quote,
   source, category, interpretation, and evidence level
   (*direct textual evidence · inference from passages · user decision ·
   temporary assumption*). *Show passage* opens the source document with the
   quote highlighted.
3. **Conflicts tab** — statements that cannot both be literally true are shown
   side by side with their sources, a plain-language explanation of the
   physical problem, and candidate spatial solutions. Accept one, fix the model
   manually, or defer. Rulings are remembered and re-applied.
4. **The 3D bridge** — generated from the constraint database. Orbit / Walk /
   Overhead / Plan / Elevation views; Move/Rotate/Resize gizmos with snapping;
   the Measure tool; cutaway slicing; navigable-space overlay; lighting modes
   (normal, dim, emergency, powerless); optional ambient ship hum; manual
   doors (an `open` parameter animates them).
5. **Click any object** — the inspector shows what it is, why it exists, the
   quotes that determine it, and its editable parameters. Lock objects you
   consider settled.
6. **Scenes tab** — pose the mannequins (Quenby, Iri, Nova) with
   stand/walk/sit/crouch/recline/lean/reach/feet-up/floor-play poses, give Nova
   her bolts, record movement paths by clicking the floor, save named scenes,
   and ghost-compare two arrangements in the same room. *Walk as* any character
   at their eye height (WASD + drag to look, C to crouch).
7. **Tests tab** — reusable habit tests, green/amber/red:
   three seats occupiable, Nova's floor play doesn't block routes, feet reach a
   rail, passage behind the seats, doors open fully, consoles reachable,
   prose sightlines hold, no illegal overlaps.
8. **Check new writing** (Docs tab) — paste a new passage; it's checked
   against the constraint database and your rulings.
9. **Save/Export** — autosave to the browser, named versions, JSON project
   export/import, high-resolution PNG screenshots.

## Structure

```
index.html            UI shell + import map
css/roomwright.css
js/main.js            bootstrap
js/state.js           project model, undo/redo
js/objects.js         parametric ship objects (walls, doors, consoles, …)
js/mannequin.js       articulated character mannequins + poses
js/editor.js          renderer (WebGPU→WebGL2), views, tools, picking
js/layout.js          constraint-driven bridge generator
js/constraints.js     claims, conflict detection, evidence tracing
js/extract.js         rule-based spatial statement extractor
js/tests.js           habit tests, nav grid, sightlines, door sweeps
js/persist.js         autosave, versions, JSON i/o
js/atmosphere.js      starfield, lighting modes, ambient sound
js/ui.js              panels, inspector, modals
data/seed.js          curated Wild Huntress bridge evidence
vendor/               three.js r0.185 (webgpu build) + control addons
```

The layout generator keys every generated object with a `layoutKey`, so ruling
changes regenerate only the affected geometry and manual edits survive.
Additional rooms can be added as further `layout.js` definitions sharing the
same constraint database — the intended path to the full ship.
