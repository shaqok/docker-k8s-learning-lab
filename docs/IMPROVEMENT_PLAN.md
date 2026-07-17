# Improvement Plan — from "concept lab" to CKA/CKAD trainer

_Last updated: 2026-07-15. Exam facts verified against the 2026 CKA/CKAD/CKS blueprints (K8s v1.35)._

> **Steps 1–10 are done.** The roadmap past them lives in [§9 · Roadmap v2](#9-roadmap-v2--from-ckackad-trainer-to-beginner--senior-trainer),
> which widens the target from "pass the exams" to the app's actual pitch: beginner → senior.

## 1. Where the project stands today

**Strengths worth protecting:**

- The two simulators (`src/sims/dockerSim.js`, `src/sims/k8sSim.js`) are pure logic with a real
  reconciliation loop — the single best teaching asset in the app. Deleting a pod and *watching*
  the controller replace it in the live cluster view is exactly the kind of intuition
  video courses can't give.
- Terminal + missions + live state panel side by side is the right core loop.
- Bilingual (EN/KO), zero-install, progress persistence.

**Gaps relative to the goal (CKA/CKAD readiness):**

| Gap | Why it matters |
|---|---|
| No YAML anywhere — the k8s sim is imperative-only (`create`, `scale`, `set image`) | Both exams are ~100% "edit YAML in a terminal, apply it, verify". This is the #1 gap. |
| Sim has no namespaces, labels/selectors, `-l`, `-n`, `apply`, `edit`, `rollout undo`, `logs` | These are the verbs used in nearly every exam task. |
| No troubleshooting content | Troubleshooting is **30% of CKA** — the largest domain — and the app currently has zero "something is broken, fix it" exercises. |
| Whole exam domains only exist as reading cards (m8/m9): probes, ConfigMaps/Secrets, RBAC, NetworkPolicy, storage, Ingress | Reading ≠ doing. Each of these needs an interactive counterpart. |
| No exam mode: no timed tasks, no task validation ("check my work"), no scoring | Performance-based exams are won on time management and muscle memory. |
| Quiz is a single 16-question bank | No per-domain coverage, no spaced repetition, no wrong-answer review. |
| Gateway API, Kustomize, Helm hands-on missing | New/current blueprint items (Gateway API entered CKA in the 2025 refresh). |

## 2. Target architecture: three learning layers

Keep every existing module, but organize everything the user does into three layers:

1. **Learn** — visual, animated concept modules (what exists today, deepened).
2. **Practice** — free-form sim labs with missions (today's Docker/K8s Labs, on a much bigger sim).
3. **Certify** — scenario engine + timed mock exams mapped to CKA/CKAD domains, with automatic
   validation against sim state and a per-domain readiness dashboard.

The order below is dependency order: everything in layers 2–3 rests on the simulator engine.

## 3. Phase 1 — Simulator engine v2 (the foundation)

Rewrite `k8sSim.js` from "a few arrays + string commands" into a miniature API server.
This is the highest-leverage work in the whole plan.

- **Resource-object model.** Store everything as real-shaped manifests
  (`{apiVersion, kind, metadata: {name, namespace, labels}, spec, status}`) in a store keyed by
  `kind/namespace/name`. Generic `get / describe / delete / -o yaml / -o wide` fall out for free,
  and `kubectl get deploy web -o yaml` becomes a *teaching* feature (that's how you learn schema
  in the real exam too).
- **Namespaces, labels, selectors.** `-n`, `-A`, `-l app=web`, `kubectl get pods --show-labels`.
  Services/Deployments select pods by labels for real inside the sim — which enables the classic
  troubleshooting bug: *selector doesn't match, endpoints empty*.
- **YAML in, YAML out.** Add a manifest editor pane (CodeMirror, `js-yaml`) plus a tiny in-app
  file tree (`~/manifests/…`), and support `kubectl apply -f pod.yaml`, `kubectl edit`,
  `kubectl create --dry-run=client -o yaml > pod.yaml`. The "generate with imperative command,
  then edit the YAML" workflow is *the* CKAD technique.
- **More controllers, same reconciliation loop.** ReplicaSet (already implicit), Job/CronJob,
  DaemonSet, StatefulSet (ordered, stable names), plus: pod restart policy + CrashLoopBackOff
  state machine, probes affecting readiness/endpoints, resource requests driving scheduling and
  OOMKill on limit breach, taints/tolerations/nodeSelector/affinity, PVC↔PV binding via
  StorageClass, HPA stepping replicas from a fake metrics signal.
- **Rollouts done right.** `rollout status / history / undo`, revision tracking, maxSurge/
  maxUnavailable visualized in the cluster view.
- **Cluster-admin verbs (CKA).** `cordon / drain / uncordon / taint`, node NotReady simulation,
  a scripted `kubeadm upgrade` + `etcdctl snapshot save/restore` guided sequence, kubeconfig
  contexts (`kubectl config use-context`) — multi-cluster context switching opens the door to
  exam-realistic "do this task on cluster k8s-c2" framing.
- **Fault injection API.** `sim.break('bad-image' | 'wrong-selector' | 'no-toleration' | …)`
  so scenarios (Phase 3) can seed broken states, and `sim.check(assertions)` so they can grade fixes.
- **Docker sim (smaller effort):** `docker build` driven by an editable Dockerfile with animated
  layer/cache visualization (extends the existing m1 layer stepper), volumes (`-v`), user-defined
  networks with DNS, and a minimal `docker compose up` for a 2–3 service stack.
- **Tests.** The sims are pure logic — add Vitest and lock in behavior before/while rewriting.

## 4. Phase 2 — Interactive modules for every exam domain

Turn the m8/m9 reading cards into doing. Each item below is a small interactive widget or lab
mission set, reusing the Terminal + live-view pattern:

**CKAD-weighted (developer path):**
- **Pod design playground** — multi-container pods: add a sidecar / initContainer and watch the
  pod startup sequence animate (init runs to completion → main + sidecar start).
- **Probes lab** — sliders for probe timing, a "make the app hang / return 500" button, watch
  liveness restart vs readiness endpoint-removal happen live in the Service view.
- **ConfigMap/Secret flow** — create via kubectl, mount as env/file, `exec` in and `cat` the result;
  show the base64-not-encryption gotcha interactively.
- **Resources & QoS sandbox** — set requests/limits, watch scheduling change and OOMKill (exit 137)
  fire; QoS class badge per pod.
- **NetworkPolicy visual editor** — a graph of pods; write/apply a policy and watch edges turn
  allowed/blocked; missions like "db accepts traffic only from app=api".
- **Ingress & Gateway API router** — host/path rules routed visually to Services; include the
  Gateway API objects (GatewayClass → Gateway → HTTPRoute) since they're now in the blueprint.
- **Helm & Kustomize mini-labs** — `helm install/upgrade/rollback` against a fake chart with a
  values editor; `kustomize` overlay diff viewer (base vs dev vs prod).

**CKA-weighted (admin path):**
- **Scheduler workbench** — taints/tolerations, nodeSelector, affinity/anti-affinity, and
  pod topology spread on a 4–5 node cluster; "why is this pod Pending?" explainer that prints the
  real scheduler-event reasons.
- **RBAC simulator** — Role/ClusterRole/Binding builder + `kubectl auth can-i` checker; missions
  like "give the ci ServiceAccount read-only pods in namespace build".
- **Storage lifecycle animation** — PVC created → StorageClass provisions PV → bind → pod mounts →
  pod dies → data survives; access modes and reclaim policies as toggles.
- **Cluster ops drills** — guided, checklisted sequences for: node drain + PDB blocking it,
  kubeadm control-plane→node upgrade order, etcd snapshot save/restore (with the exact `etcdctl`
  flags the exam wants), certificate inspection.
- **DNS & Service debugging** — `nslookup`/`curl` from a debug pod inside the sim; broken cases:
  wrong port, wrong targetPort, wrong selector, wrong namespace in the DNS name.

**Cross-cutting:** every module gets a "📖 in the real docs" link block — the exam allows
kubernetes.io, and *knowing where things live in the docs* is a trainable, testable skill.

## 5. Phase 3 — The Certify layer (scenario engine + exam mode)

This is what turns the app into actual CKA/CKAD prep, and it's what KodeKloud/killer.sh sell:

- **Scenario engine.** A scenario = `{setup(sim), instructions, hints[], validate(sim) → pass/fail
  per assertion, solution}`. Instructions render as an exam-style task ("Create a deployment `web`
  in namespace `prod` with 3 replicas of `nginx:1.27` and a readiness probe on `/healthz:8080`"),
  the student works in the terminal/YAML editor, then hits **Check** — assertions grade the live
  sim state exactly like the real exam's graders do.
- **Troubleshooting pack first** (30% of CKA): ship ~20 broken-cluster scenarios seeded via the
  fault-injection API — CrashLoopBackOff (bad command), ImagePullBackOff, Pending (taint /
  resources / no node), Service with empty endpoints (selector/port mismatch), RBAC denied,
  wrong namespace, failing probe, node NotReady, PVC stuck Pending.
- **Mock exam mode.** 15–17 weighted tasks, 2-hour countdown, per-task "flag for later",
  final score with the 66% pass line, and per-domain breakdown. Separate CKA and CKAD mock sets.
- **Speed drills.** Timed one-liners for imperative-command muscle memory
  (`k run`, `k create deploy --dry-run=client -o yaml`, `k expose`, `k label`, `--force
  --grace-period=0`…), with a WPM-style personal best. Optionally a tiny vim survival trainer
  (i, esc, :wq, dd, u) since the exam editor is vim.
- **Quiz v2.** Grow the bank to ~120 questions tagged by exam domain; per-module quizzes;
  wrong-answer review; a simple Leitner spaced-repetition deck for API-field flashcards
  (`readinessProbe.httpGet.path`, `volumeClaimTemplates`, …).
- **Readiness dashboard.** Replace the roadmap-only progress with a per-exam-domain view:
  each CKA/CKAD domain shows % from (concept read ✓, lab missions ✓, scenarios passed ✓,
  quiz accuracy) — "you're weakest in Services & Networking" is the actionable output.

## 6. Phase 4 — Platform & content architecture

- **Routing** (`react-router` or hash-based): URL per module/scenario, deep-linkable, back-button.
  Keep the all-modules-stay-mounted trick for the sims (route swaps visibility, not mount).
- **Content system.** The AUTO-GENERATED HTML-string content (`content/en.js`/`ko.js`) will not
  scale to 3× the content. Move to structured data + small components per card type
  (table/code/callout), keeping the EN/KO dictionary pattern. This also removes most
  `dangerouslySetInnerHTML`.
- **State.** Sim snapshots + scenario progress to IndexedDB; export/import progress as JSON.
- **Quality.** Vitest for sims + scenario validators (validators are pure functions on sim
  state — perfect test targets); Playwright smoke test for the core lab loop; CI later.
- **Nice-to-haves** (only after the above): PWA/offline, command palette (⌘K) search over all
  content, light theme, keyboard-only terminal focus flow.

## 7. What to borrow from existing courses (references)

| Resource | What it does well → what we adopt |
|---|---|
| [KodeKloud CKA/CKAD](https://kodekloud.com/learning-path/ckad) (and Mumshad Mannambeth's Udemy courses) | Lecture → immediate hands-on lab with automated validation after every concept. Adopt: 1 concept card = 1 mission set = 1 check, always. |
| [killer.sh](https://killer.sh) (the simulator bundled with exam registration) | Harder-than-exam scenarios with detailed written solutions. Adopt: every scenario ships a full solution walkthrough shown after pass/give-up. |
| [Killercoda](https://killercoda.com) | Step-based scenario format with per-step verification. Adopt: scenario = setup/steps/validate structure. |
| [CKA curriculum (Linux Foundation)](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) / [CKAD (CNCF)](https://www.cncf.io/training/certification/ckad/) | The authoritative domain lists — our dashboard maps to these verbatim. |
| kubernetes.io docs | Allowed in the exam. Adopt: "find it in the docs" micro-missions and doc deep links everywhere. |
| Kubernetes the Hard Way (Kelsey Hightower) | The mental model for the CKA cluster-ops drills (what kubeadm hides). |

## 8. Suggested execution order

| Step | Deliverable | Size | Status |
|---|---|---|---|
| 1 | Vitest + tests over current sims (safety net) | S | ✅ done (2026-07-11) |
| 2 | k8sSim v2: resource model, namespaces, labels/selectors, generic get/describe | L | ✅ done — `src/sims/k8s/engine.js` + `kubectl.js` |
| 3 | YAML editor pane + `apply -f` / `edit` / `--dry-run -o yaml` | M | ✅ done — `ManifestEditor.jsx`, `> file.yaml` redirects |
| 4 | Scenario engine + first troubleshooting scenarios | M | ✅ done — 11 graded scenarios in the Troubleshooting Gym (m10), solvability enforced by tests |
| 5 | Probes + resources/QoS + ConfigMap/Secret interactive labs | M | ✅ done — CKAD Drills (m11): 3 labs with live-graded missions; engine gained liveness probes + fault injection, requests/limits scheduling, OOMKill, `top`, env/volume resolution from ConfigMaps/Secrets |
| 6 | Scheduler workbench (taints/affinity) + RBAC simulator | M | ✅ done (2026-07-11) — CKA Drills (m12): scheduler lab (5-node cluster, nodeAffinity + pod (anti-)affinity in the engine, live "why is this pod Pending?" panel) and RBAC lab (ServiceAccount/Role/ClusterRole/Bindings, `kubectl auth can-i --as=…`, live can-i tester); `src/data/ckaLabs.js`, `src/sims/k8s/rbac.js` |
| 7 | NetworkPolicy / Ingress / Gateway API visual labs | M | ✅ done (2026-07-11) — Networking Drills (m13): NetworkPolicy lab (live connectivity matrix, default-deny → allow-one-hole), Ingress lab (host/path router panel, `kubectl create ingress --rule=…`), Gateway API lab (GatewayClass→Gateway→HTTPRoute chain + weighted-canary split); `src/data/netLabs.js`, `src/sims/k8s/netpol.js`, `src/sims/k8s/routing.js` |
| 8 | Cluster ops drills (drain, upgrade, etcd backup) | M | ✅ done (2026-07-12) — Cluster Ops Drills (m14): drain-vs-PDB lab (engine PDB accounting, eviction-aware `kubectl drain`), kubeadm-upgrade lab (`ssh NODE` host layer: apt-get/kubeadm/systemctl, control-plane-first ordering enforced), etcd lab (`etcdctl snapshot save` with exam TLS flags, `etcdutl … --data-dir` restore that rolls the live store back, `kubeadm certs check-expiration` + openssl); `src/data/opsLabs.js`, `src/sims/k8s/hostops.js` |
| 9 | Mock exam mode + readiness dashboard + quiz v2 | M | ✅ done (2026-07-12) — Exam Room (m15): timed CKA/CKAD mocks (15 tasks each, weighted, per-task sims, flag-for-later, one grading at the end vs the 66% line with partial credit per check) + per-domain readiness dashboard (labs ∪ scenarios ∪ quiz accuracy ∪ latest mock, folded over the official blueprint weights) + quiz v2 (73 bilingual questions tagged by domain, exam/domain focus filters, wrong-answer review, persisted per-domain accuracy); `src/data/examDomains.js`, `examTasks.js`, `readiness.js`, `src/modules/MockExam.jsx` |
| 10 | Routing + content-system refactor (can interleave earlier) | M | ✅ done (2026-07-12) — hash routing (`src/router.js` + `src/context/RouteContext.jsx`): `#/<module-slug>[/<sub>]` per module with scenario/lab-tab deep links, back-button works, modules stay mounted; content system: `src/content/{en,ko}.js` converted from HTML strings to structured node trees (`scripts/convert-content.mjs`, round-trip-verified) rendered by `src/components/Rich.jsx` — `dangerouslySetInnerHTML` now only remains for terminal output and `tr()`-translated dynamic strings |

Steps 1–4 alone already change the app's category: from "interactive explainer" to
"exam trainer with a troubleshooting gym", targeted at the single biggest exam domain.
Step 5 (2026-07-11) starts the Phase-2 "interactive counterpart for every domain" work:
probes, resources/QoS and ConfigMap/Secret each got a fault-injection playground with
missions graded live against engine state (`src/data/ckadLabs.js`, `src/modules/CkadLabs.jsx`).
Step 6 (2026-07-11) adds the CKA-weighted pair as module m12 (`src/data/ckaLabs.js`,
`src/modules/CkaLabs.jsx`, shared `src/components/LabRunner.jsx`): the engine gained
required nodeAffinity and pod (anti-)affinity plus per-pod `pendingReasons`, and a full
RBAC model — ServiceAccount/Role/ClusterRole/RoleBinding/ClusterRoleBinding objects,
imperative `kubectl create` for all five, `kubectl auth can-i` with `--as` impersonation,
and a deny-by-default evaluator (`src/sims/k8s/rbac.js`) shared by kubectl and mission checks.
Step 7 (2026-07-11) ships the Services & Networking trio as module m13 (`src/data/netLabs.js`,
`src/modules/NetLabs.jsx`): a NetworkPolicy evaluator (`src/sims/k8s/netpol.js` — allow-list
semantics, pod/namespace selectors, ports, ingress+egress) enforced by in-cluster
`kubectl exec … wget` probes and rendered as a live connectivity matrix; an HTTP routing
resolver (`src/sims/k8s/routing.js`) covering Ingress host/path rules (longest-prefix,
wildcards, `kubectl create ingress --rule=…`) and the Gateway API chain
(GatewayClass → Gateway listeners → HTTPRoute `parentRefs`/hostnames/weighted `backendRefs`);
plus a new terminal command — `curl http://HOST/PATH` — that plays the external client.
Step 9 (2026-07-12) ships the Certify layer as module m15 (`src/modules/MockExam.jsx`):
`src/data/examDomains.js` pins the official 2026 blueprint domains/weights; both mock sets
(`src/data/examTasks.js`, 15 weighted tasks each — CKA reuses five Troubleshooting-Gym
scenarios verbatim for its 30% troubleshooting share, CKAD leans on imperative + YAML-edit
tasks; every task's `solve()` is proven by `examTasks.test.js`) run with no Check button:
each task gets its own sim, and grading happens once — at "End exam" or timeout — with
fractional credit per check, a 66% pass line, and a per-domain breakdown that is saved to
localStorage. The readiness dashboard (`src/data/readiness.js`, pure/tested) folds three
signals per domain — lab-mission/scenario completion, cumulative quiz accuracy, latest
mock score — into blueprint-weighted per-exam readiness. Quiz v2 grows the bank to 73
domain-tagged bilingual questions with exam/domain focus filters, a wrong-answer review
pane, and per-domain accuracy persisted for the dashboard. Storage still has no sim tasks
(no PVC model in the engine yet) — the quiz carries that domain, and the m15 intro says so.
Step 8 (2026-07-12) ships the cluster-ops trio as module m14 (`src/data/opsLabs.js`,
`src/modules/OpsLabs.jsx`): the engine gained PodDisruptionBudgets (live
`pdbStatus`/`evictionBlockedBy` consulted by a rewritten `kubectl drain`, plus
`get/describe pdb` and imperative `create poddisruptionbudget`), per-node kubelet
versions, and etcd-style `snapshotStore()`/`restoreStore()` (identity-checked `remove`
so stale Terminating timers can't kill restored objects). A new host-command layer
(`src/sims/k8s/hostops.js`) hangs off every kubectl terminal: `ssh NODE`/`exit`,
`apt-get install kubeadm|kubelet=X`, `kubeadm upgrade plan|apply|node` (control-plane-
first ordering enforced with real error messages), `systemctl restart kubelet`,
`etcdctl snapshot save` (demands the exam's `--endpoints --cacert --cert --key`),
`etcdutl snapshot restore --data-dir` (rolls the live store back), `kubeadm certs
check-expiration`, and `openssl x509 -dates`.
Step 10 (2026-07-12) closes the plan's platform phase. Routing: hash routes
(`src/router.js` pure helpers + tests; `src/context/RouteContext.jsx` provider) give
every module a slugged URL (`#/k8s-lab`, `#/exam-room`) and a module-owned sub-path —
Troubleshooting scenarios (`#/troubleshooting/svc-selector`, back-button returns to the
grid) and the m11–m14 lab tabs (`#/ckad-drills/qos`) are deep-linkable via
`useSubRoute()`; all modules stay mounted (route swaps visibility, not mount).
Content system: the AUTO-GENERATED `src/content/{en,ko}.js` HTML strings were converted
one-time by `scripts/convert-content.mjs` (restricted-HTML parser in
`scripts/htmlNodes.mjs`; every value round-trip- and text-equality-checked) into
structured node trees — text is plain strings, elements are `{ t, cls?, st?, c? }` —
rendered by `src/components/Rich.jsx` with per-type components (Card, CmpTable,
CodeBlock). `greeting` values stay raw strings because Terminal's `print()` contract is
HTML. `dangerouslySetInnerHTML` survives only in `Terminal.jsx` (sim output) and
`Html.jsx` (now used only for `tr()`-translated dynamic strings and lab/scenario data
descriptions).

---

# 9. Roadmap v2 — from "CKA/CKAD trainer" to "beginner → senior" trainer

_Added 2026-07-15, after steps 1–10 closed the original plan._

## 9.1 Why there's more to do

Steps 1–10 had one target — pass CKA/CKAD — and they hit it. But the app's own pitch (m0 is
titled *"Roadmap: Beginner → Expert"*) is wider than the exams, and **both ends of that arc are
still thin.**

**The beginner end never got a v2.** `src/sims/dockerSim.js` is still the original 228-line
concept lab: a `Set` of image names and a list of containers. There is **no `docker build`, no
editable Dockerfile, no layer/cache model, no volumes, no networks or DNS, no compose, no
tags/registry.** Meanwhile m7 *teaches* layer caching, volumes, networking, compose and
registries as five static reading cards, and its one interactive element (`DockerDepth.jsx:8`)
is a button revealing a **hard-coded** "1.34 GB → 15.2 MB". The single most important thing a
beginner must internalize — *why your image is 1.3 GB and how to make it 15 MB* — is the one
thing they cannot actually do. Docker also has no drill module, no graded missions past m2's
six CLI verbs, and its quiz questions are tagged `foundations`, which feeds **no** readiness
signal at all.

**The expert end is capped by the engine.** Three absences block whole domains:

| Gap | Consequence |
|---|---|
| **No multi-container pods** — `spec.containers[0]` is hardcoded in ~15 sites | No initContainers, no sidecars, no `logs -c`, `READY` is a hardcoded `1/1` (`kubectl.js:129`). CKAD *Application Design* (20%) is unpracticeable. |
| **No storage** — no PV/PVC/StorageClass/emptyDir/volumeClaimTemplates | CKA *Storage* (10%) has zero practice surface; `readiness.js` leans on the quiz to cover it. |
| **No Job / CronJob / DaemonSet / StatefulSet** | Deployment is the only real controller (`engine.js:567`); ReplicaSets are synthesized for display (`kubectl.js:165`), not stored. |

And the senior layer — Helm, Kustomize, GitOps, security hardening, observability, incident
response — exists only as prose in m8/m9 (36 lines of code between them; both pure reading).

**Target:** a student goes from "what is a container" to holding CKA + CKAD + CKS *and* having
practiced what a senior actually does — slimming images, debugging a StatefulSet's storage,
catching a GitOps drift, hardening a cluster, running an incident — in one zero-install app.

## 9.2 Now / Next / Later

Sizes: S ≈ a sitting, M ≈ a weekend, L ≈ multiple weekends.

### NOW — close the two ceilings

| Step | Deliverable | Size | Status |
|---|---|---|---|
| Q | **Quick wins** — persist m2/m4 missions · Certify stage in the roadmap · solution reveal in drill labs · `get NAME` fidelity bug | S | ✅ 2026-07-16 |
| 11 | **Docker engine v2** — build/layers/cache, volumes, networks+DNS, compose, registry | L | ✅ 2026-07-16 — `src/sims/docker/{catalog,engine,build,network,compose,cli}.js`; `dockerSim.js` now a thin facade; `dockerEngine.test.js` |
| 12 | **Docker Drills (m16)** — 5 live-graded labs on the new engine | M | ✅ 2026-07-16 — `src/data/dockerLabs.js` + `DockerDrills.jsx`; `LabRunner` now sim-agnostic (`createSim` prop); `dockerLabs.test.js` |
| 13 | **Pod v2** — multi-container, initContainers, sidecars | L | ✅ 2026-07-16 — `src/sims/k8s/engine.js` (`containers[]`/`initContainers[]`, live `containerStatuses[]`/`initContainerStatuses[]`, `mainContainer()`), `kubectl.js` fidelity (READY N/M, `describe` Init Containers, `logs`/`exec -c`/`--previous`, multi-container `apply -f`/`set image`); Pod Design lab (m17) — `src/data/podLabs.js` + `PodLabs.jsx`; `podLabs.test.js` |
| 14 | **Workload kinds** — Job, CronJob, DaemonSet, StatefulSet | M | ✅ 2026-07-16 — `src/sims/k8s/engine.js`: ReplicaSet is now a real stored object with Deployment→ReplicaSet→Pod a genuine two-level controller chain (`rotateDeployment`/`rollbackDeployment`/`ensureCurrentReplicaSet` self-heals a deleted current RS); Job (`completions`/`parallelism`/`backoffLimit`, real `Succeeded`/`Failed` phases via `restartPolicy`), CronJob (real cron syntax incl. named weekdays/months, evaluated on an accelerated virtual clock), DaemonSet (kube-proxy is now genuinely DaemonSet-owned), StatefulSet (ordinal identity, OrderedReady); `kubectl.js` gained a `WORKLOAD_KINDS` registry (get/describe/apply for all 4 new kinds without repeating the "kubectl tax" per kind) + imperative `create job`/`create cronjob` + a quote-aware command tokenizer; `workloads.test.js` |
| 15 | **Storage** — PV / PVC / StorageClass / emptyDir / volumeClaimTemplates | M | ✅ done (2026-07-17) — `src/sims/k8s/engine.js`: `makePV`/`makePVC`/`makeStorageClass`, a `reconcilePVCBinding()` controller (static PV matching + StorageClass dynamic provisioning), a scheduler gate for pods with unbound PVCs (`pendingReasons`), `resolveVolumeStore()` unifying emptyDir/hostPath/PVC-backed mount resolution, and StatefulSet `volumeClaimTemplates` → one deterministically-named PVC per ordinal; `kubectl.js` gained `get`/`describe`/`apply`/`delete` fidelity for all three kinds (reclaim policy Delete/Retain on PVC delete) plus an `exec … sh -c 'echo TEXT > /path'` write path; Storage Drills (m18) — `src/data/storageLabs.js` + `StorageLabs.jsx`, two labs (PVC lifecycle incl. the pod-dies-data-survives vs. emptyDir contrast and the PVC-stuck-Pending fault, and StatefulSet per-ordinal storage identity); `storage.test.js` + `storageLabs.test.js` |

### NEXT — the senior layer

| Step | Deliverable | Size | Status |
|---|---|---|---|
| 16 | **Packaging & GitOps** — Helm install/upgrade/rollback, Kustomize overlays, drift-reconciliation lab | M | ✅ 2026-07-17 — module m19 (`src/data/packagingLabs.js` + `PackagingLabs.jsx`; renumbered from m18 after step 15 claimed that id for Storage Drills): a hand-written Go-template interpreter with real `if`/`else`/`range` control flow (`src/sims/k8s/helmTemplate.js`) drives Helm install/upgrade/rollback with release-scoped revision history; a Kustomize base/overlay builder (`src/sims/k8s/kustomize.js`) composes bases recursively and layers namePrefix/commonLabels/images/replicas transformers, then whole-object strategic-merge patches, then an independent RFC-6902 JSON-patch engine; a GitOps drift lab (`src/sims/k8s/gitops.js`) reverts hand-edited drift by re-calling kubectl's own `applyDoc` — auto-sync and manual `gitops sync` are the same code path, one automatic and one on request. A shared structural diff (`src/sims/k8s/diff.js`) backs both the Kustomize live diff panel and GitOps drift classification. `kubectl.js` gained a `-k`/`--kustomize` flag on `apply` and now exports `applyDoc`/`deleteObj` so the new `helm`/`kustomize`/`gitops` side-CLI (`src/sims/k8s/packaging.js`) reuses the real per-kind create/update logic instead of re-deriving it; `k8sSim.js` composes the GitOps tick into `reconcile()` via the same forward-ref idiom `onEdit` already used. |
| 17 | **Security track (CKS)** — six-domain drill set + a third exam in the Exam Room | L | ✅ 2026-07-17 — module m20 (`src/data/securityLabs.js` + `SecurityLabs.jsx`): one lab per official CKS domain — cluster-setup and system-hardening drive a new `kube-bench run`/`harden FLAG on|off` pair in `hostops.js` (a cluster-wide CIS-flag object, seeded at kubeadm's real insecure defaults); cluster-hardening is pure reuse of `rbac.js`/`netpol.js` (narrow an over-broad RoleBinding, layer a default-deny + one explicit-allow NetworkPolicy); pod-security introduces `src/sims/k8s/podSecurity.js` — a `pod-security.kubernetes.io/enforce` namespace label gates `securityContext` the same deny-by-default way RBAC/NetworkPolicy already do, wired into kubectl's two direct-Pod-creation paths; supply-chain gets a fake CVE catalog + `scanImage`/`signImage` on the Docker engine, `trivy image`/`cosign sign|verify` CLI commands, and a k8s-side `imagePolicy.js` gate — bridged by a new `src/sims/supplyChainSim.js` that runs a Docker sim and a k8s sim side by side over one shared file store (the only lab that isn't k8s-only); audit-log reuses `engine.events`/`addEvent`, now also firing on RBAC allow/deny and admission rejections. The third exam (`EXAMS.cks` in `examDomains.js`, 12 native tasks in `examTasks.js` including two on the combined sim) required teaching `examTasks.js` task objects an optional `createSim` override, honored by both `MockExam.jsx` and its test's `boot()`; `readiness.js` gained six new practice sources plus `cks:` domain tags on the RBAC/NetworkPolicy/etcd sources that already trained CKS content, and `quiz.js` grew 23 CKS-tagged questions. |
| 18 | **Observability & incident drills** — real `logs`, events, metrics, timed "3am pager" mode | M | ⏳ |
| 19 | **Pedagogy layer** — tracks, prerequisites, next-step, spaced repetition | M | ⏳ |

### LATER — strategic bets

Operators & CRDs (write a controller, watch it reconcile — the true senior capstone) ·
multi-cluster kubeconfig contexts (`kubectl config use-context`, exam-realistic "do this on
cluster `k8s-c2`") · cost & capacity drills · the `kubectl` fidelity long tail (`patch`,
`jsonpath`, `rollout restart`, `-w`) · PWA/offline · command palette.

## 9.3 NOW, in detail

### Q · Quick wins

1. **m2/m4 mission progress is not persisted.** `dockerDone`/`k8sDone` are plain `useState` in
   `ProgressContext.jsx` while every *other* progress type is persisted — reload and the two
   headline labs reset to 0.
2. **The roadmap omits half the app.** `src/data/roadmap.js` only references m1–m9; the whole
   Certify layer (m10–m15) is missing from the curriculum meant to describe it.
3. **No solution reveal in the drill labs.** m11–m14 each ship a `solve()` that only the tests
   ever call. m10 already has the pattern (`Troubleshooting.jsx:81`).
4. **`kubectl get deploy web` prints every deployment.** A named non-Pod get falls through to the
   list renderer (`kubectl.js:285`). A sim that teaches the wrong output is worse than no sim.

### Step 11 · Docker engine v2 — `src/sims/docker/`

Split the flat `dockerSim.js` into `engine.js` + `cli.js`, mirroring the proven
`k8s/engine.js` + `k8s/kubectl.js` split. Reuse `createFileStore` (`k8sSim.js:23`) as-is — it
already backs `ManifestEditor.jsx`, so the Dockerfile/compose editor comes nearly free.

- **Image & layer model.** Replace `images: Set<string>` with
  `{repo, tag, id, layers: [{id, instr, sizeMB}], config: {cmd, env, workdir, exposed}}`.
  Tags and digests become real; `:latest` stops being a lie.
- **`docker build -t app:v1 .`** — parse `FROM/RUN/COPY/ADD/CMD/ENTRYPOINT/ENV/WORKDIR/EXPOSE/ARG/USER`.
  Cache key = parent layer id + instruction text (+ content hash for `COPY`). Emit BuildKit-style
  output (`=> CACHED [2/5] RUN …`). Edit a late line → cache hits; move `COPY . .` above
  `RUN npm ci` → cache bust. **This is the lesson m7 currently only asserts.**
- **Multi-stage.** `FROM x AS builder` + `COPY --from=builder`; the final size is then *computed*
  from the layer store, replacing `DockerDepth.jsx`'s canned number with a build the student runs.
- **Volumes.** A minimal container filesystem (path → content; today `exec ls` prints a hardcoded
  string, `dockerSim.js:193`), `-v name:/path`, `docker volume create/ls/rm/inspect`. "The writable
  layer dies with the container, the volume survives" becomes a three-command demo.
- **Networks + DNS.** `docker network create/connect/ls`, `--network`, container-name resolution,
  and an `exec … curl http://api:3000` that really succeeds or fails. The k8s side already proves
  the shape (`kubectl.js:1075`'s `exec … wget` + the `netpol.js` matrix) — borrow it.
- **Compose.** `docker compose up -d / down / ps / logs` over a `compose.yaml` in the file store
  (`js-yaml` is already a dep). Mostly a fan-out to `run` once volumes + networks exist.
- **Registry.** `docker tag / push / login`, digests, `docker image history`.

### Step 12 · Docker Drills (m16)

A new module on the shared `LabRunner.jsx`, same `{id, setup, missions[], solve}` shape as
`ckadLabs.js`, so it inherits live grading, the editor, reset and doc links for free. Five labs:
**build & cache** (get a rebuild to 0 s by reordering), **multi-stage slimming** (image under
20 MB), **volumes & persistence**, **networks & DNS**, **compose stack**. `src/data/dockerLabs.js`
+ `dockerLabs.test.js` proving every mission solvable, as the other four drill sets do. This also
makes the `foundations` quiz tag mean something: Docker finally gets a practice signal.

### Step 13 · Pod v2 — multi-container, initContainers, sidecars

The most invasive change here, and the highest-leverage. `makePod` (`engine.js:149`) grows
`spec.containers[]` + `spec.initContainers[]` and a `status.containerStatuses[]`; add a
`mainContainer(pod)` helper and migrate the ~15 `containers[0]` call sites behind the existing
test suite — incrementally, not as a big bang. Then: the init sequence (`Init:0/2` →
`PodInitializing` → `Running`), a truthful `READY n/m`, `logs -c NAME`, and `logs --previous`
(a staple debugging move that today doesn't exist). Unlocks a **Pod Design lab** for CKAD's
*Application Design* domain.

### Step 14 · Workload kinds

Each gets a branch alongside the Deployment controller (`engine.js:567`): **Job**
(completions/parallelism/backoffLimit, plus a real `Succeeded` phase, which the engine also
lacks), **CronJob** (schedule ticking on the existing 800 ms loop), **DaemonSet** (one pod per
node — the seeded kube-proxy/coredns pods at `engine.js:233` become genuinely DaemonSet-owned),
**StatefulSet** (ordinal names, stable identity). Make ReplicaSet a real stored object rather
than a display-time synthesis.

⚠️ **The kubectl tax:** every new kind costs edits in `KIND_ALIASES`, `PLURAL`, `getGeneric`,
`cmdDescribe`, `applyDoc`, `cmdCreate`. `kubectl.js` is 1,405 lines of flat if/else. Budget a
per-kind registry refactor *inside* this step rather than paying the tax eight more times.

### Step 15 · Storage

PV / PVC / StorageClass, `emptyDir`, `hostPath`, `volumeClaimTemplates` (needs step 14's
StatefulSet). Binding, access modes, reclaim policies as toggles. A storage lab: PVC → SC
provisions PV → bind → pod mounts → **pod dies, data survives** — plus the classic broken case,
*PVC stuck Pending*. Payoff: the last CKA domain without a practice surface gets one, and
`PRACTICE_SOURCES` in `readiness.js` can emit a real `storage` signal.

## 9.4 NEXT, in brief

- **16 · Packaging & GitOps.** `helm install/upgrade/rollback` against a fake chart with a values
  editor; a Kustomize base/overlay diff viewer. Then the lab that actually teaches GitOps: **edit
  the live cluster by hand, watch the reconciler revert you.** The app's reconcile tick is already
  built to show exactly this.
- **17 · Security track (CKS).** The six official domains — Cluster Setup 10%, Cluster Hardening
  15%, System Hardening 15%, Minimize Microservice Vulnerabilities 20%, Supply Chain Security 20%,
  Monitoring/Logging/Runtime Security 20%. Substrate exists: `rbac.js`, `netpol.js`, the `ssh NODE`
  host layer (`hostops.js`). New: `securityContext` (runAsNonRoot, capabilities,
  readOnlyRootFilesystem), admission control, image scanning / supply chain (**depends on step 11's
  image + registry model**), audit logs, a Falco-ish runtime alert. `examDomains.js` and
  `readiness.js` are already generic over exams, so a third one is mostly data.
- **18 · Observability & incident drills.** Per-pod log accumulation (today two pods of the same
  image emit byte-identical canned logs, `kubectl.js:1049`), events with counts and `--sort-by`, a
  metrics/SLO panel. Then **incident mode**: a random fault fires, an MTTR clock runs, and you're
  graded on time-to-diagnose — the closest thing to the production experience hiring managers
  screen for.
- **19 · Pedagogy layer.** A goal-picker on first run (*just Docker* / CKAD / CKA / CKS / senior)
  that turns the sidebar into an ordered **track** with prerequisites and a "next →" button —
  today nothing links to the next module and nothing is ever gated. A Leitner spaced-repetition
  deck over the question bank + API-field flashcards (today `quizStats` is a cumulative
  `{right, wrong}` with no per-question history, so *nothing* can be scheduled for review). Doc
  links on scenarios, exam tasks and quiz answers, not just the drill labs.

## 9.5 Sequencing, dependencies & risk

- **11 → 12** and **13 → 14 → 15** are hard chains. 11 and 13 are independent, so they interleave.
- **17 (supply-chain security) depends on 11's image/registry model.** The one cross-branch
  dependency — and why Docker-first is not only a beginner-experience call.
- **15 (volumeClaimTemplates) depends on 14's StatefulSet.**
- **Biggest risk: step 13.** ~15 call sites across the two largest sim files. The 1,639 lines of
  existing sim tests are the safety net — every drill lab's `solve()` is an end-to-end regression
  test. Migrate behind them via `mainContainer()`.
- **Capacity honesty:** NOW is 2 L's and 3 M's. If that's too much, the cut line is step 12 — the
  engine work in 11 pays off immediately by making m1/m2/m7 real, and the drills can follow.
