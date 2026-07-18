---
name: new-lab
description: Scaffold a new drill lab set (data file, module, registry, tracks, progress state, tests) following the LabRunner pattern used by m11-m21.
disable-model-invocation: true
---

# New drill lab

Adding a drill lab touches eight places. Miss one and the lab either doesn't
appear, doesn't persist progress, or ships ungraded. Work through them in
order; do not stop after the data file.

Ask the user for the module id (next free `mNN`), slug, icon, EN/KO title,
which sim (`createK8sSim` default, or `createDockerSim`), and what the labs
teach — then confirm the plan before writing.

## 1. Data file — `src/data/<name>Labs.js`

Export `<NAME>_LABS` (array) and `<NAME>_MISSION_TOTAL` (sum of mission counts,
consumed by `pedagogy.js`). Each lab:

```js
{
  id: 'kebab-id',
  tab:   { en: '…', ko: '…' },
  title: { en: '…', ko: '…' },
  brief: { en: '…', ko: '…' },      // HTML string, rendered via Html.jsx
  docs:  [{ label: '…', url: 'https://kubernetes.io/docs/…' }],  // >= 1, top-level page not a deep anchor
  starterFiles: { 'app.yaml': '…' },   // optional; seeds sim.files
  setup(engine, files) { /* seed state via engine.makeDeployment/makePod/… */ },
  missions: [
    { id: 'mission-id',
      desc: { en: '…', ko: '…' },
      check(engine, flags, files) { return /* boolean over LIVE state */; } },
  ],                                 // >= 3 missions
  solve(sim, run, settle) { /* reference solution; edits sim.files then runs commands */ },
}
```

Rules that the tests enforce:
- Every mission must be **false** immediately after `setup` — a mission that
  starts satisfied grades nothing.
- Missions are graded **live on every reconcile tick**, so `check` must read
  current engine state, never accumulate.
- For "run this command" missions, fire an `onMission` flag from the CLI layer
  and check membership in `flags` (e.g. `flags.has('vol-read')`).
- `solve` runs **synchronously**, so real timers never fire inside it. Call the
  passed `settle()` after deletes so `flushTerminating()` retires Terminating pods.

## 2. Module — `src/modules/<Name>Labs.jsx`

Copy the shape of `src/modules/PodLabs.jsx`: a `Panel` component rendering live
engine state plus fault-injection buttons, then a default export that renders
tabs and one `LabRunner` per lab. `LabRunner` is sim-agnostic — pass
`createSim={createDockerSim}` and the `editorCmdHint` / `termPlaceholder` props
for a non-kubectl sim.

Tabs must use `useSubRoute('mNN', (id) => LABS.some(l => l.id === id))` so
`#/<slug>/<lab-id>` deep-links.

## 3. Progress state — `src/context/ProgressContext.jsx`

Add `<name>Done` state backed by a new `localStorage` key (`dk8s<name>`), a
`complete<Name>Mission(labId, missionId)`, a `reset<Name>Lab` via `makeReset`,
and add all three to the provider `value` object at the bottom.

## 4. Registry — `src/data/modules.js`

One entry in default sidebar order:
`{ id, slug, icon, title: {en, ko}, section, pill: '<name>', requires: ['mNN'] }`.
`requires` must resolve to existing ids and must not create a cycle.

## 5. Pill counts — `src/data/pedagogy.js`

Import `<NAME>_MISSION_TOTAL` and add `<name>: { done: sum(p.<name>Done), total: … }`
to `pillCounts`.

## 6. Component map — `src/App.jsx`

Import the module and add the `mNN: <Name>Labs` line. This is the only place
that needs JSX, which is why it can't live in the data file.

## 7. Tracks — `src/data/tracks.js`

Insert the id at the right position in each track that should teach it. Order
lives with the track, not the module.

## 8. Test — `src/sims/__tests__/<name>Labs.test.js`

Copy the `describe.each` block from `podLabs.test.js`. Three cases per lab,
non-negotiable:
1. every mission starts incomplete after `setup`
2. `solve()` makes every mission pass
3. bilingual content complete (`tab`/`title`/`brief` EN+KO, >= 3 missions each
   with EN+KO desc, >= 1 doc link)

Plus engine-level coverage for any new engine capability the lab needs.

## Finally

- Run `npx vitest run src/sims/__tests__/<name>Labs.test.js` and
  `npx vitest run src/__tests__/pedagogy.test.js src/__tests__/router.test.js
  src/__tests__/docLinks.test.js` — the registry, routing and doc-link suites
  all assert over the new entry.
- Any new **teaching note** the lab prints needs an `[EN, KO]` pair in
  `src/i18n/dynamic.js`. Simulated command output stays English.
- Add a section to `CLAUDE.md` describing the lab set, matching the existing
  per-module sections.
