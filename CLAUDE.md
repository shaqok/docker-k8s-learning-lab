# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server at http://localhost:5173
npm test             # vitest run (all suites, once)
npm run test:watch   # vitest interactive watch mode
npm run build        # production build → dist/
```

Run a single test file:
```bash
npx vitest run src/sims/__tests__/scenarios.test.js
```

## Architecture

This is a bilingual (EN/KO) CKA/CKAD exam-trainer built with Vite + React. The core value is in the pure-logic simulators, not the UI.

### Simulators (`@src/sims/`)

- **`dockerSim.js`** — facade: `createDockerSim({ onChange, onMission, files })` returns `{ exec, state, engine, files, setOnEdit }`. Thin wrapper over `docker/` (mirrors the k8s engine/kubectl split). `state.images` is a **Map** keyed `repo:tag` (not the old `Set`) — read images via `engine.listImages()`.
- **`docker/engine.js`** — image store (`repo:tag → { layers:[{id,instr,sizeMB}], config, size }`), container lifecycle, a per-container writable FS routed to volumes on mount, user-defined networks. `docker/catalog.js` = base-image sizes (`BASE_IMAGES`) + `runCost`/`copyCost` layer-size heuristics + `fmtSize`.
- **`docker/build.js`** — `docker build`: parses the Dockerfile, walks layers, caches by `parentLayerId + instruction (+ content hash for COPY)` so the first changed line busts everything below it; multi-stage (`FROM x AS y`, `COPY --from=y`) and the final image's size is computed from its stage's layers.
- **`docker/network.js`** — DNS + reachability: user-defined networks resolve container names (default `bridge` deliberately does not); `httpGet` backs in-container `curl`/`wget` and host `curl localhost:PORT`. **`docker/compose.js`** — `compose up/down/ps/logs` over a `compose.yaml` in the file store, fanning out to `engine.createContainer` on an implicit project network. **`docker/cli.js`** — the command layer (`build/run/ps/exec/volume/network/compose/tag/push/history/…`) that prints; `exec` tokenizes quote-aware so `sh -c 'echo x > f'` survives.
- **`k8sSim.js`** — facade: `createK8sSim()` returns `{ exec, reconcile, subscribe, view, files, engine }`. The `files` object is an in-app file store (`createFileStore`, reused by the Docker sim) for manifests/Dockerfiles (used by `ManifestEditor.jsx` and `> file.yaml` redirects in kubectl).
- **`k8s/engine.js`** — miniature API server: resource-object store keyed by `kind/namespace/name`, controllers (rolling updates, self-heal), scheduler (taints, cordon, capacity), pod lifecycle states (`ImagePullBackOff`, `CrashLoopBackOff`, probes).
- **`k8s/kubectl.js`** — the CLI layer over the engine: `get/describe/create/run/apply -f/delete/scale/expose/set image/rollout undo/logs/exec/label/taint/cordon/drain`, flags `-n -A -l -o yaml`, `--dry-run`, `> file.yaml` redirect, `k` alias.
- **`k8s/yaml.js`** — YAML serializer for `-o yaml` output (parsing uses `js-yaml`).

The sims expose `exec(cmd, print)` where `print(html, cls)` accepts HTML strings. Simulated **command output stays English** (like real tools); only teaching notes/narrator strings translate.

### i18n & content system

- **`@src/content/en.js` / `@src/content/ko.js`** — AUTO-GENERATED static rich-text per module, stored as **structured node trees** (text = plain string, element = `{ t, cls?, st?, c? }`), rendered by `@src/components/Rich.jsx` (per-type components: Card, CmpTable, CodeBlock — no `dangerouslySetInnerHTML`). Converted from the legacy HTML strings by `scripts/convert-content.mjs` (parser/serializer in `scripts/htmlNodes.mjs`). Edit content there; don't edit behavior there. Exception: `greeting` values stay raw HTML strings because they flow into `Terminal.print()` whose contract is HTML. Mission items are `{ id, text: <nodes> }`.
- **`@src/i18n/dynamic.js`** — `KO_STR` array of `[EN, KO]` string pairs (or `[regex, KO_template]` for parameterized strings). The `tr(str)` function walks this array to translate dynamic output. When adding new terminal teaching notes, add a `[EN, KO]` pair here. `tr()` output and data-file rich text (lab briefs/mission descs, scenario text, CP_INFO) are still HTML strings rendered via `@src/components/Html.jsx`.
- HTML in output must escape `<none>` as `&lt;none&gt;`.

### Routing

Hash-based: `#/<module-slug>[/<sub>]` (e.g. `#/k8s-lab`, `#/troubleshooting/svc-selector`, `#/ckad-drills/qos`). Pure helpers + slug map in `@src/router.js` (tested by `src/__tests__/router.test.js`); React side in `@src/context/RouteContext.jsx` — `useRoute()` for `{ route, navigate }`, `useSubRoute(moduleId, valid, { nullable })` for module-owned sub-paths (Troubleshooting's scenario id is `nullable` so back-button returns to the grid; lab tabs keep the last tab on a bare module hash). Raw ids (`#/m4`) also resolve. Modules stay mounted on route change (visibility toggle).

### Scenarios (`@src/data/scenarios.js`)

Each scenario: `{ id, difficulty, title, brief, hints, setup(engine), checks[], solve(sim, run) }`.
- `setup(engine)` seeds a broken cluster state using `engine.makeDeployment()`, `engine.makePod()`, etc.
- `checks[]` are functions over live engine state that return pass/fail — these grade the student's fix.
- `solve(sim, run)` is the reference solution, exercised by `scenarios.test.js` to prove every scenario is solvable.

### CKAD drill labs (`@src/data/ckadLabs.js` + `@src/modules/CkadLabs.jsx`, module m11)

Three fault-injection playgrounds — probes, resources/QoS, ConfigMap/Secret. Each lab: `{ id, setup(engine, files), missions: [{id, desc, check(engine, flags)}], solve(sim, run, settle) }`. Missions are graded **live** every reconcile tick (no Check button); `flags` is the set of `onMission` ids the terminal fired (for "run this command" missions like `top`/`exec`). Widget-facing engine ops: `setAppState(pod, 'ok'|'hang'|'503')`, `setLeak(pod, on)`. The per-lab runner (sim instance + live grading loop + terminal/panel/editor layout) is the shared `@src/components/LabRunner.jsx`. Its **"🏳 solve it for me"** button replays the lab's `solve()` against the live sim, echoing each command into the terminal (via Terminal's optional `printRef`); because that replay is synchronous, real timers can't fire inside it, so its `settle()` calls engine `flushTerminating()` to retire Terminating pods that a `solve` deletes and then recreates. **LabRunner is sim-agnostic**: it takes a `createSim` prop (default `createK8sSim`; the Docker drills pass `createDockerSim`), calls `reconcile`/`flushTerminating`/`subscribe`/`setup` optionally, and passes `sim.files` as the 3rd arg to `check(engine, flags, files)`. `editorCmdHint`/`termPlaceholder` props relabel the editor+terminal for non-kubectl sims.

### Docker drill labs (`@src/data/dockerLabs.js` + `@src/modules/DockerDrills.jsx`, module m16)

Same lab shape as the k8s drills but on the Docker sim (via `LabRunner`'s `createSim={createDockerSim}`). Five labs: **build & cache** (reorder the Dockerfile so `RUN npm ci` stays CACHED — checks the built image's layer order), **multi-stage** (slim the final image under 60 MB — `slim-image` flag), **volumes** (data survives `rm` — `vol-read` flag on `cat` from a mounted volume), **networks & DNS** (name resolution only on a user-defined network), **compose** (bring a stack up, reach api from web by service name). Mission checks read Docker engine state (`engine.listImages()`, `state.containers/volumes/networks`) + CLI flags (`build`/`build-cached`/`multistage`/`slim-image`/`vol-read`/`net-dns`/`compose-up`); `solve(sim, run)` edits `sim.files` (Dockerfile/compose.yaml) then runs. `DockerPanel` shows images (layers·size), containers (mounts/networks), volumes, networks.

### CKA drill labs (`@src/data/ckaLabs.js` + `@src/modules/CkaLabs.jsx`, module m12)

Same lab shape as m11, via the shared `LabRunner`. Two labs: **scheduler workbench** (extra nodes with labels/taints seeded in `setup`; engine supports required nodeAffinity + pod (anti-)affinity, and unschedulable pods carry `sim.pendingReasons` for the live "why Pending?" panel) and **RBAC simulator** (ServiceAccount/Role/ClusterRole/RoleBinding/ClusterRoleBinding as store objects; `kubectl create` for all five, `kubectl auth can-i VERB RES --as=system:serviceaccount:NS:NAME`; the deny-by-default evaluator lives in `@src/sims/k8s/rbac.js` — `canI(engine, {verb, resource, subject, ns})` — and is shared by kubectl and mission checks). Every namespace is created with a `default` ServiceAccount, like real clusters.

### Networking drill labs (`@src/data/netLabs.js` + `@src/modules/NetLabs.jsx`, module m13)

Same lab shape, via the shared `LabRunner`. Three labs: **NetworkPolicy** (allow-list evaluator in `@src/sims/k8s/netpol.js` — `canConnect(engine, {from, to, port})` over pod/namespace selectors, ports, ingress+egress — enforced by `kubectl exec … wget` (blocked = timeout + `net-blocked` flag) and rendered as a live connectivity matrix), **Ingress** (host/path rules with longest-prefix matching, `kubectl create ingress NAME --rule=host/path=svc:port`), and **Gateway API** (GatewayClass → Gateway listeners → HTTPRoute with `parentRefs`, hostnames, weighted `backendRefs` for canary splits). Routing resolution lives in `@src/sims/k8s/routing.js` — `resolveHttp(engine, {host, path})` → 200/404/503 + backends — shared by the panels, mission checks, and the terminal's `curl http://HOST/PATH` command (the "external client"; successful curls fire `curl-ok:HOST/PATH` flags). Namespaces carry the `kubernetes.io/metadata.name` label for `namespaceSelector`.

### Cluster-ops drill labs (`@src/data/opsLabs.js` + `@src/modules/OpsLabs.jsx`, module m14)

Same lab shape, via the shared `LabRunner`. Three labs: **drain vs PDB** (PodDisruptionBudget objects in the store; engine `pdbStatus(pdb)` / `evictionBlockedBy(pod)` drive both the live panel and a `kubectl drain` that refuses budget-violating evictions with the real error, firing `drain-blocked` / `drained:NODE` flags; `kubectl get/describe pdb` + imperative `create poddisruptionbudget --selector --min-available`), **kubeadm upgrade** (nodes carry `sim.version` shown by `kubectl get nodes`; the ordering — control plane before `kubeadm upgrade node`, new kubeadm package before `apply` — is enforced with real error messages; restarting the kubelet on a cordoned node fires `kubelet-cordoned:NODE`), and **etcd & certs** (`etcdctl snapshot save` demands the exam TLS flags; `etcdutl snapshot restore --data-dir` calls engine `restoreStore()` — a full deep-copy rollback; `kubeadm certs check-expiration` / `openssl x509 -dates` fire `cert-inspect`). The host-command layer lives in `@src/sims/k8s/hostops.js` (`createHostOps(engine)`, exposed as `sim.host`): `ssh NODE`/`exit` gate `kubeadm`/`apt-get`/`systemctl`/`etcdctl`/`etcdutl`/`openssl`, with per-node package state in `sim.host.state`. Engine `remove()` is identity-checked so stale Terminating timers can't delete restored objects.

### Certify layer: Exam Room (`@src/modules/MockExam.jsx`, module m15) + quiz v2

`@src/data/examDomains.js` — the official CKA/CKAD blueprint domains and weights (flat domain ids like `arch`, `net`, `observe`; shared by quiz tags, exam tasks and the dashboard). `@src/data/examTasks.js` — two mock sets (15 weighted tasks each), task shape = scenario shape + `{ domain, weight }`; checks get `(engine, sim)` (sim for host-level state like etcd snapshots); CKA reuses five Troubleshooting-Gym scenarios via `fromScenario()`; `gradeTask`/`gradeExam` compute fractional per-check credit, score % over total weight, 66% pass line, per-domain earned/total. The runner gives every task its own sim (created lazily, all kept mounted), a 2h countdown, flag-for-later, and ONE grading at the end — no Check button, like the real exam. Results persist via `ProgressContext.recordExamResult` (`localStorage: dk8sexam`).

**Readiness dashboard** — `@src/data/readiness.js` (pure, tested): per exam domain it folds up to three signals — practice (lab missions + scenarios via `PRACTICE_SOURCES`), quiz accuracy (`quizStats`, `localStorage: dk8squiz`), latest mock score — averaging what exists, then weight-sums to overall readiness. Storage has no practice surface (engine lacks PVC) — quiz carries it.

**Quiz v2** (`@src/data/quiz.js`, module m6) — one bilingual bank (`QUIZ_BANK`, 73 questions), each `{ d: [domainIds], q/a/why: {en,ko}, c }`; the module filters by exam/domain, grades, shows a wrong-answer review pane and records per-domain accuracy via `recordQuiz`.

### Tests (`@src/sims/__tests__/`)

- `helpers.js` — `makeRunner(sim)` wraps `sim.exec(cmd, print)` into `run(cmd) → { lines, text, errors }` for test assertions; `strip(html)` removes HTML tags.
- `dockerSim.test.js`, `k8sSim.test.js`, `k8sSimV2.test.js` — behavioral coverage of sim commands.
- `scenarios.test.js` — calls `solve()` on every scenario and asserts all `checks` pass.
- `ckadLabs.test.js` — engine coverage for probes/QoS/OOM/config refs + proves every CKAD lab mission solvable.
- `ckaLabs.test.js` — affinity/anti-affinity scheduling, RBAC evaluation + `auth can-i`, and proves every CKA lab mission solvable.
- `netLabs.test.js` — NetworkPolicy evaluation (deny/allow/egress/namespaceSelector), Ingress + Gateway routing via kubectl and `curl`, and proves every networking lab mission solvable.
- `opsLabs.test.js` — PDB accounting + PDB-aware drain, ssh/kubeadm upgrade ordering, etcd snapshot/restore round-trips (incl. the stale-timer guard), cert inspection, and proves every cluster-ops lab mission solvable.
- `examTasks.test.js` — proves every mock-exam task starts unsolved and is solvable by its `solve()`; validates set metadata (domains, weights, bilingual text), `gradeExam` math (partial credit, pass line, per-domain totals), quiz-bank integrity (tags, EN/KO parity, per-domain coverage), and the readiness fold.
- `src/__tests__/router.test.js` — hash-route parsing/building (slugs, raw ids, sub-paths, junk fallback).

### React structure

- `@src/App.jsx` — sidebar + module switching driven by the hash route; **all modules stay mounted** (visibility toggled, not unmount) so sims keep state and terminals keep history.
- `@src/components/Terminal.jsx` — reusable terminal (history, `print`, i18n).
- `@src/components/Rich.jsx` — renders structured content node trees (see i18n & content system above); `@src/components/Html.jsx` remains for trusted HTML strings (tr() output, data-file rich text).
- `@src/components/ManifestEditor.jsx` — in-app YAML editor shared with the terminal file store.
- `@src/context/ProgressContext.jsx` — roadmap/mission progress, persisted to `localStorage`.
- `@src/modules/` — one file per learning module (Roadmap, DockerLab, K8sLab, Troubleshooting, etc.).

### What's AUTO-GENERATED

`@src/content/en.js`, `@src/content/ko.js` (structured node trees since step 10), and most of `@src/data/*.js` are generated from the original monolithic HTML. Edit rich-text content there; edit simulator behavior in `@src/sims/` and UI behavior in `@src/modules/` and `@src/components/`.

## Improvement plan

`@docs/IMPROVEMENT_PLAN.md` tracks the roadmap from "concept lab" to full CKA/CKAD trainer. Steps 1–9 are complete (Vitest, k8sSim v2, YAML editor, scenario engine + 11 troubleshooting scenarios, CKAD drill labs for probes/QoS/ConfigMap-Secret, CKA drill labs for scheduling/RBAC, networking drill labs for NetworkPolicy/Ingress/Gateway API, cluster-ops drills for drain-vs-PDB/kubeadm-upgrade/etcd-backup, and the Certify layer: timed CKA/CKAD mock exams + per-domain readiness dashboard + domain-tagged quiz v2). Step 10 (routing + content-system refactor) is also complete: hash routes with deep-linkable scenarios/lab tabs, and content files converted to structured node trees rendered without `dangerouslySetInnerHTML`.
