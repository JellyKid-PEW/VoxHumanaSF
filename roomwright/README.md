# ROOMWRIGHT

Roomwright converts prose descriptions into evidence-backed, editable 3D
environments for fiction writers. It currently models the **Wild Huntress**
from the Vox Humana series — an old long-haul freighter across two decks,
thirty connected spaces, one continuous walkable interior. Main deck: the
bridge; the primary corridor that offsets before medbay so boarding traffic
never looks straight into the medical zone; the two-stage airlock ("two
steps past the bridge"); the legacy storage spine with starboard pocket
three, Storage Four, the half-hidden observation dome with its
scrape-your-head arch, and the deep walk-in engine bay; the lived-in galley
at the domestic junction; and a separate dry hygiene branch with its own
toilet and shower compartments and the secondary ladder. Down the primary
stair: Lower Operations and the skiff/mission bay, the commercial work
spine (work head, configurable flex bay, repair recesses, underdeck
engineering access), and the residential route that turns away early —
nav at the seam, Cabins One through Four staggered on the approach, the
wet-core dogleg with the domestic stores/future garden, the quiet run
where Cabin Five (Iri) and Cabin Six (Quenby) share a wall, and beyond it
the old aft-service fabric: the freight lock, the main cargo/training bay,
the lower aft spine, and Nova's port-side equipment crawl. First-person
walking descends the actual stairs; a Deck filter shows one level at a
time in editing views.

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
   manually, or defer. Rulings are remembered and re-applied. Six genuine
   contradictions ship with the seed: the bridge door's position ("behind her"
   vs. a profile view from the doorway — this one moves the whole aft wing),
   the rail between the two stations vs. knees that nearly touch, the
   "tiny galley" of Presence vs. the walk-around prep island of Next, the
   medbay's "two recessed wall beds" (Next) vs. the single cot with one chair
   that Presence and Book 3 agree on, engineering as a walk-in bay with a
   doorframe (Presence) vs. a belowdeck crawl down ringing ladder rungs
   (Next), and Iri's quarters — the half-angle cabin door on the lower row
   vs. the route "through the upper corridor, past the galley."
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
7. **Tests tab** — twenty-three reusable habit tests, green/amber/red:
   three seats occupiable, Nova's floor play doesn't block routes, feet reach a
   rail, passage behind the seats, doors open fully, consoles reachable,
   prose sightlines hold (drawn live in the viewport), no illegal overlaps,
   the bridge–corridor–galley route stays walkable, the airlock stays close
   to medical without sharing a sightline (the corridor offset does real
   privacy work), the galley holds five comfortably and seven crowded, the
   hygiene compartments stay separate from food space, pocket three keeps
   making you choose where to stand, the legacy spine keeps its narrow old
   depth, medbay supplies stay within blind reach of the door, the dome arch
   keeps scraping anyone who walks too proud, the airlock stays a true
   two-stage lock cramped for two, two steps still cross the engine bay to
   the bench, the decks keep believable structure between them, the
   stairwell honestly connects the decks, the residential approach passes
   the staggered cabins with bunks that fit their sleepers, the commercial
   route runs stair → work spine → freight node → cargo bay without cutting
   through anyone's bedroom, and the skiff bay stages the rigs.
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
js/acoustics.js       three-channel sound propagation (air, structure, duct)
js/scenereview.js     scene-review workbench: prose vs. ship, corrections queue
js/persist.js         autosave, versions, JSON i/o
js/atmosphere.js      starfield, lighting modes, ambient sound
js/ui.js              panels, inspector, modals
data/seed.js          curated Wild Huntress bridge evidence
vendor/               three.js r0.185 (webgpu build) + control addons
```

The layout generator keys every generated object with a `layoutKey`, so ruling
changes regenerate only the affected geometry and manual edits survive (and
deliberately deleted objects stay deleted). The door-position ruling
re-anchors both entire decks to wherever the bridge hatch lands — including
an L-bend corridor for the side-door option. Older autosaved projects are
migrated in place: new constraints, rooms, and scenes are added, and a
layout-version system force-regenerates only the generated pieces whose
definitions changed, without disturbing user edits or rulings.

The ship itself is now developed well beyond the app's seed evidence: see
`HUNTRESS_DESIGN_DECISIONS.md` (the running log of locked and open design
decisions), the engineering studies (`HUNTRESS_MASS_AND_TANK_STUDY.md`,
`HUNTRESS_THERMAL_PROPULSION_STUDY.md`, `HUNTRESS_VERTICAL_HULL_STUDY.md`,
`BOOK3_SHIP_SPACE_AUDIT.md`), and the art-facing
`HUNTRESS_COMIC_PRODUCTION_FLOORPLAN_V1.md`, whose freeze now rests on
geometry validated in the live app — every habit test green, and all six
declared evidence conflicts now resolved by author ruling and baked into
the generator as canon. Still waiting in the prose for a
future pass: the paneled-over observation passage, the wiring nest under
B.O.B.'s tertiary relay stack, Deck Three's exact footprint, and the deeper
underdeck crawl network.
