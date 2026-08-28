# ROOMWRIGHT

Roomwright converts prose descriptions into evidence-backed, editable 3D
environments for fiction writers. It currently models nine connected spaces
of the **Wild Huntress** from the Vox Humana series: the bridge, the main
corridor, the two-stage airlock ("two steps past the bridge"), the medbay
(to port), the storage spine with its two turns down to starboard pocket
three, the half-hidden observation dome with its scrape-your-head arch, the
galley, and the engine bay at the heat's center aft — one continuous
walkable interior.

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
   manually, or defer. Rulings are remembered and re-applied. Five genuine
   contradictions ship with the seed: the bridge door's position ("behind her"
   vs. a profile view from the doorway — this one moves the whole aft wing),
   the rail between the two stations vs. knees that nearly touch, the
   "tiny galley" of Presence vs. the walk-around prep island of Next, the
   medbay's "two recessed wall beds" (Next) vs. the single cot with one chair
   that Presence and Book 3 agree on, and engineering as a walk-in bay with a
   doorframe (Presence) vs. a belowdeck crawl down ringing ladder rungs
   (Next).
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
   prose sightlines hold (drawn live in the viewport), no illegal overlaps,
   the bridge–corridor–galley route stays walkable, the galley stays
   *tight but usable* (amber if roomier than the prose), pocket three keeps
   making you choose where to stand, medbay supplies stay within blind
   reach of the door, the dome arch keeps scraping anyone who walks too
   proud, the airlock stays a true two-stage lock cramped for two, and two
   steps still cross the engine bay to the bench.
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
changes regenerate only the affected geometry and manual edits survive (and
deliberately deleted objects stay deleted). The door-position ruling
re-anchors the whole aft wing (corridor, medbay, spine, pocket, galley) to
wherever the bridge hatch lands — including an L-bend corridor for the
side-door option. Older autosaved projects are migrated in place: new
constraints, rooms, and scenes are added, and a layout-version system
force-regenerates only the generated pieces whose definitions changed,
without disturbing user edits or rulings. What remains for the full ship is
the lower deck the prose keeps pointing at — the cabin row with Cabin Six,
crew quarters, the skiff/gear bay, and the underdeck engineering crawls —
which will need multi-level walking and stairs/ladders in the editor.
