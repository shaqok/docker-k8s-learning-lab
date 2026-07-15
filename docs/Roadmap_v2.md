# Roadmap v2 — from "CKA/CKAD trainer" to "beginner → senior" trainer

## Context

`docs/IMPROVEMENT_PLAN.md` steps 1–10 are all ✅. That plan had one target — pass CKA/CKAD — and it hit it: a real API-server sim, 11 troubleshooting scenarios, 4 drill modules (m11–m14), timed mock exams, a readiness dashboard, hash routing, structured content.

But the app's own pitch (m0 is literally titled *"Roadmap: Beginner → Expert"*) is wider than the exams, and **both ends of that arc are currently thin**:

**The beginner end never got a v2.** `src/sims/dockerSim.js` is still the original 228-line concept lab: a `Set` of image names and a list of containers. There is **no `docker build`, no Dockerfile anywhere the student can edit, no layer/cache model, no volumes, no networks or DNS, no compose, no tags/registry**. Meanwhile `m7 Docker in Depth` *teaches* layer caching, volumes, networking, compose and registries as five static reading cards — and its one interactive element (`DockerDepth.jsx:8`) is a button that reveals a **hard-coded** "1.34 GB → 15.2 MB" number. The single most important thing a beginner must internalize — *why your image is 1.3 GB and how to make it 15 MB* — is the one thing they cannot do. Docker also has no drill module, no graded missions past m2's 6 CLI verbs, and its quiz questions are tagged `foundations`, which counts toward **no** readiness signal at all.

**The expert end is capped by the engine.** Three absences block whole domains:
- **No multi-container pods.** `spec.containers[0]` is hardcoded in ~15 sites across `engine.js`/`kubectl.js`. So: no initContainers, no sidecars, no `logs -c`, and the `READY` column is a hardcoded `1/1` (`kubectl.js:129`). CKAD's *Application Design* domain (20%) cannot be practiced.
- **No storage.** No PV, PVC, StorageClass, emptyDir, or volumeClaimTemplates — volumes exist only as ConfigMap/Secret sources. CKA's *Storage* domain (10%) has **zero** practice surface; `readiness.js` admits this and lets the quiz carry it.
- **No Job / CronJob / DaemonSet / StatefulSet.** The Deployment controller (`engine.js:567`) is the only real controller; ReplicaSets are *synthesized* for display (`kubectl.js:165`) and don't exist as objects.

And the senior layer — Helm, Kustomize, GitOps, security hardening, observability, incident response — exists only as prose in m8/m9 (36 lines of code between them; both are pure reading).

**Decisions taken:** scope = exams **+** production depth; attack the Docker sim **and** the K8s engine depth first; format = Now / Next / Later.

**Intended outcome:** a student can go from "what is a container" to holding CKA + CKAD + CKS *and* having practiced the things a senior actually does — slimming images, debugging a StatefulSet's storage, catching a GitOps drift, hardening a cluster, running an incident — all in one zero-install app.

---

## The roadmap

Sizes: S ≈ a sitting, M ≈ a weekend, L ≈ multiple weekends.

### NOW — close the two ceilings

| Step | Deliverable | Size |
|---|---|---|
| **11** | **Docker engine v2** — build/layers/cache, volumes, networks+DNS, compose, registry | **L** |
| **12** | **Docker Drills (m16)** — 5 live-graded labs on the new engine | M |
| **13** | **Pod v2** — multi-container, initContainers, sidecars | **L** |
| **14** | **Workload kinds** — Job, CronJob, DaemonSet, StatefulSet | M |
| **15** | **Storage** — PV / PVC / StorageClass / emptyDir / volumeClaimTemplates | M |
| **Q** | **Quick wins** — 4 small fixes, listed below; do these first, they're each ~an hour | S |

### NEXT — the senior layer (1–3 months)

| Step | Deliverable | Size |
|---|---|---|
| **16** | **Packaging & GitOps** — Helm install/upgrade/rollback + Kustomize overlays + a drift-reconciliation lab | M |
| **17** | **Security track (CKS)** — six-domain drill set + a third exam in the Exam Room | **L** |
| **18** | **Observability & incident drills** — real `logs`, events, metrics, and a timed "3am pager" mode | M |
| **19** | **Pedagogy layer** — tracks, prerequisites, next-step, spaced repetition, solution reveal | M |

### LATER — strategic bets

Operators & CRDs (write a controller, watch it reconcile — the true "senior" capstone) · multi-cluster kubeconfig contexts (`kubectl config use-context`, exam-realistic "do this on cluster `k8s-c2`" framing) · cost & capacity drills · the `kubectl` fidelity long tail (`patch`, `jsonpath`, `rollout restart`, `-w`) · PWA/offline · command palette.

---

## NOW, in detail

### Q · Quick wins (do these first)

Four things that are cheap and currently embarrassing:

1. **m2/m4 mission progress is not persisted.** `dockerDone`/`k8sDone` are plain `useState` in [ProgressContext.jsx:7](src/context/ProgressContext.jsx:7) while every *other* progress type is persisted. Reload → the two headline labs reset to 0. Fix: same `localStorage` treatment as the rest.
2. **The roadmap omits half the app.** [roadmap.js](src/data/roadmap.js) only references m1–m9 — the entire Certify layer (m10–m15) is absent from the curriculum it's supposed to describe. Add a Certify stage.
3. **No solution reveal in the drill labs.** Every lab in m11–m14 already ships a `solve()` — but it's only ever called by the tests. Wire a "🏳 Reveal solution" button in the shared [LabRunner.jsx](src/components/LabRunner.jsx), mirroring what m10 already does ([Troubleshooting.jsx:76](src/modules/Troubleshooting.jsx:76)).
4. **`kubectl get deploy web` prints every deployment.** In [kubectl.js:285](src/sims/k8s/kubectl.js:285) a named non-Pod get falls through to the list renderer. Real bug, teaches the wrong thing.

### Step 11 · Docker engine v2 — `src/sims/docker/`

Split the flat 228-line `dockerSim.js` into `engine.js` + `cli.js`, **mirroring the proven `k8s/engine.js` + `k8s/kubectl.js` split**. Reuse `createFileStore` from [k8sSim.js:23](src/sims/k8sSim.js:23) as-is — it already backs `ManifestEditor.jsx`, so the Dockerfile/compose editor comes almost free.

- **Image & layer model.** Replace `images: Set<string>` with a store of `{repo, tag, id, layers: [{id, instr, sizeMB}], config: {cmd, env, workdir, exposed}}`. Tags and digests become real; `:latest` stops being a lie.
- **`docker build -t app:v1 .`** — parse `FROM/RUN/COPY/ADD/CMD/ENTRYPOINT/ENV/WORKDIR/EXPOSE/ARG/USER`. Cache key = parent layer id + instruction text (+ a content hash for `COPY`). Emit real BuildKit-style output (`=> CACHED [2/5] RUN apt-get …`). Rebuild after editing a late line → cache hits; move `COPY . .` above `RUN npm ci` → cache bust. **This is the lesson m7 currently only asserts.**
- **Multi-stage.** `FROM x AS builder` + `COPY --from=builder`. The final size is then *computed from the layer store* — so `DockerDepth.jsx`'s canned 1.34 GB → 15.2 MB button gets replaced by a build the student actually runs.
- **Volumes.** A minimal container filesystem (path → content map; today `exec ls` prints a hardcoded string, [dockerSim.js:193](src/sims/dockerSim.js:193)), `-v name:/path`, `docker volume create/ls/rm/inspect`. Now "the writable layer dies with the container, the volume survives" is demonstrable in three commands.
- **Networks + DNS.** `docker network create/connect/ls`, `--network`, resolve container names to IPs, and make `exec … curl http://api:3000` actually succeed or fail. The k8s side already proves this shape — [kubectl.js:1075](src/sims/k8s/kubectl.js:1075)'s `exec … wget` handler and the `netpol.js` connectivity matrix — borrow it.
- **Compose.** `docker compose up -d / down / ps / logs` over a `compose.yaml` in the file store (`js-yaml` is already a dependency). Mostly a fan-out to `run` once volumes + networks exist: implicit project network, `depends_on` ordering.
- **Registry.** `docker tag / push / login`, digests, `docker image history` (which now has real layers to show).
- **Tests.** `src/sims/__tests__/dockerEngine.test.js` — cache hit/miss on reorder, multi-stage size delta, volume survives `rm`, DNS resolution, compose stack up.

### Step 12 · Docker Drills (m16)

A new module on the shared [LabRunner.jsx](src/components/LabRunner.jsx) — same `{id, setup, missions: [{id, desc, check}], solve}` shape as `ckadLabs.js`, so it inherits live grading, the editor, reset, and doc links for free. Five labs: **build & cache** (get a rebuild to 0 s by reordering), **multi-stage slimming** (get the image under 20 MB), **volumes & persistence**, **networks & DNS**, **compose stack**. Add `src/data/dockerLabs.js` + `dockerLabs.test.js` proving every mission solvable, exactly as the other four drill sets do.

This also finally makes the `foundations` quiz tag mean something: Docker gets a real practice signal in `readiness.js`.

### Step 13 · Pod v2 — multi-container, initContainers, sidecars

The most invasive change in the plan, and the highest-leverage one. `spec.containers[0]` is assumed in ~15 places (`qosOf`, `effectiveRequests`, `tickPod`, `podFromTemplate`, `cmdLogs`, `cmdExec`, `manifest()`, …).

Approach: `makePod` ([engine.js:149](src/sims/k8s/engine.js:149)) builds `spec.containers[]` + `spec.initContainers[]` and a `status.containerStatuses[]`; add a `mainContainer(pod)` helper and migrate call sites to it one at a time behind the existing test suite. Then: init sequence (`Init:0/2` → `PodInitializing` → `Running`), a truthful `READY n/m` column ([kubectl.js:129](src/sims/k8s/kubectl.js:129)), `logs -c NAME`, and `logs --previous` (a staple debugging move that today doesn't exist).

Unlocks a **Pod Design lab** — the CKAD *Application Design* domain (20%), currently unpracticeable: add a sidecar, watch the init container run to completion before the main one starts.

### Step 14 · Workload kinds

Each gets its own branch alongside the Deployment controller at [engine.js:567](src/sims/k8s/engine.js:567): **Job** (completions/parallelism/backoffLimit, a real `Succeeded` phase — which the engine also lacks today), **CronJob** (schedule ticking on the existing 800 ms reconcile loop), **DaemonSet** (one pod per node — and the seeded kube-proxy/coredns pods at `engine.js:233` become *actually* DaemonSet-owned instead of hand-placed), **StatefulSet** (ordinal names, stable identity). Also make ReplicaSet a real stored object rather than a display-time synthesis ([kubectl.js:165](src/sims/k8s/kubectl.js:165)).

Note the kubectl tax: every new kind costs edits in `KIND_ALIASES`, `PLURAL`, `getGeneric`, `cmdDescribe`, `applyDoc`, `cmdCreate`. Worth a small refactor to a per-kind registry table while doing this — five kinds is the point where the flat if/else chain stops paying.

### Step 15 · Storage

PV / PVC / StorageClass, `emptyDir`, `hostPath`, and `volumeClaimTemplates` (which needs Step 14's StatefulSet). Binding, access modes, reclaim policies as toggles. A storage lab: PVC created → SC provisions PV → bind → pod mounts → **pod dies, data survives** → plus the classic broken case, *PVC stuck Pending*.

Payoff: the last CKA domain with no practice surface gets one, and `PRACTICE_SOURCES` in [readiness.js](src/data/readiness.js) can finally emit a real `storage` signal instead of leaning on the quiz.

---

## NEXT, in brief

- **16 · Packaging & GitOps.** `helm install/upgrade/rollback` against a fake chart with a values editor; a Kustomize base/overlay diff viewer. Then the lab that actually teaches GitOps: **edit the live cluster by hand, watch the reconciler revert you.** That loop is the whole idea, and it's one the app's existing reconcile tick is perfectly built to show.
- **17 · Security track (CKS).** The six official domains — Cluster Setup 10%, Cluster Hardening 15%, System Hardening 15%, Minimize Microservice Vulnerabilities 20%, Supply Chain Security 20%, Monitoring/Logging/Runtime 20%. Much of the substrate exists: RBAC (`rbac.js`), NetworkPolicy (`netpol.js`), the `ssh NODE` host layer (`hostops.js`). New: `securityContext` (runAsNonRoot, capabilities, readOnlyRootFilesystem), admission control, image scanning / supply chain (which **depends on Step 11's image + registry model** — do not attempt before it), audit logs, a Falco-ish runtime alert. `examDomains.js`/`readiness.js` are already generic over exams, so adding a third is mostly data.
- **18 · Observability & incident drills.** Per-pod log accumulation (today two pods of the same image emit byte-identical canned logs, [kubectl.js:1049](src/sims/k8s/kubectl.js:1049)), events with counts and `--sort-by`, a fake metrics/SLO panel. Then **incident mode**: a random fault fires, an MTTR clock runs, and you're graded on time-to-diagnose — the closest thing to the production experience hiring managers actually screen for.
- **19 · Pedagogy layer.** A goal-picker on first run (*just Docker* / CKAD / CKA / CKS / senior) that turns the sidebar into an ordered **track** with prerequisites and a "next →" button (today nothing links to the next module, and nothing is ever gated). A Leitner spaced-repetition deck over the 73-question bank + API-field flashcards (today `quizStats` is cumulative `{right, wrong}` — no per-question history, so *nothing* can be scheduled for review). Doc links on scenarios, exam tasks and quiz answers, not just the drill labs.

---

## Sequencing, dependencies & risk

- **11 → 12** and **13 → 14 → 15** are hard chains. 11 and 13 are independent of each other, so they can interleave.
- **17 (supply-chain security) depends on 11's image/registry model.** This is the one cross-branch dependency in the plan; it's why Docker-first is not just a beginner-experience call.
- **15 (volumeClaimTemplates) depends on 14's StatefulSet.**
- **Biggest risk: Step 13.** Multi-container touches ~15 call sites across the two largest sim files. Mitigation: the 1,639 lines of existing sim tests are the safety net — they were built for exactly this, and every drill lab's `solve()` is an end-to-end regression test. Migrate behind them incrementally via `mainContainer()`; do not big-bang it.
- **Second risk: `kubectl.js` is at 1,405 lines and is a flat if/else chain.** Steps 14–15 add ~8 kinds to it. Budget the per-kind-registry refactor inside Step 14 rather than paying the tax eight more times.
- **Capacity honesty:** NOW is ~2 L's and 3 M's. If that's too much, the cut line is Step 12 (Docker Drills) — the engine work in 11 still pays off immediately by making m1/m2/m7 real, and the drills can follow later.

---

## Files

**New:** `src/sims/docker/{engine,cli,build,network,compose}.js` · `src/data/dockerLabs.js` · `src/modules/DockerDrills.jsx` · `src/sims/k8s/controllers/{job,daemonset,statefulset}.js` · `src/sims/k8s/storage.js` · tests alongside each.

**Modified, load-bearing:** [engine.js](src/sims/k8s/engine.js) (pod model, controllers, storage) · [kubectl.js](src/sims/k8s/kubectl.js) (per-kind registry, new kinds, `logs -c/-p`) · [dockerSim.js](src/sims/dockerSim.js) (becomes a thin facade over `docker/`) · [LabRunner.jsx](src/components/LabRunner.jsx) (solution reveal) · [ProgressContext.jsx](src/context/ProgressContext.jsx) (persist m2/m4) · [roadmap.js](src/data/roadmap.js) (Certify stage) · [readiness.js](src/data/readiness.js) (Docker + storage signals) · `src/content/{en,ko}.js` + `src/i18n/dynamic.js` (EN/KO pairs for all new terminal output).

**First commit of all:** rewrite `docs/IMPROVEMENT_PLAN.md` with this roadmap (steps 11–19, Now/Next/Later), so the doc stops claiming the plan is finished.

---

## Verification

Per step, not at the end:

1. **`npm test`** must stay green throughout — it is the migration safety net, especially for Step 13. Every new lab ships a `solve()` and a test that proves every mission is solvable, matching the existing convention in `ckadLabs.test.js` / `opsLabs.test.js`.
2. **New behavioral tests** for each engine feature: cache hit-then-bust on Dockerfile reorder; multi-stage final size < single-stage; volume survives `docker rm`; container-name DNS resolves; Job reaches `Succeeded`; StatefulSet pods get ordinals `web-0, web-1`; PVC binds a PV and data survives pod deletion.
3. **Drive it in the browser** (`npm run dev`, preview tools): run the m16 build lab end to end — edit the Dockerfile, `docker build`, confirm the cache line changes and the mission checklist ticks live. Screenshot as proof.
4. **Bilingual check:** every new terminal teaching note needs its `[EN, KO]` pair in `src/i18n/dynamic.js`, and `<none>` must be escaped as `&lt;none&gt;` in any HTML output (per CLAUDE.md).
5. **Regression on the Exam Room:** `examTasks.test.js` must still pass — the CKA set reuses five Troubleshooting scenarios verbatim, so pod-model changes surface there first.
