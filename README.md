# Docker & Kubernetes Interactive Lab (React)

Interactive, bilingual (EN/한국어) learning app for Docker, Kubernetes, and GPU infrastructure — refactored from a single-file HTML app into a Vite + React project.

## Run it

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
npm test         # vitest — sim engine + kubectl + scenario solvability tests
```

## Structure

```
src/
  main.jsx                 entry; wraps App in Language + Progress providers
  App.jsx                  sidebar + module switching (all modules stay mounted
                           so sims keep running and terminals keep history)
  index.css                global theme (extracted from the original app)
  i18n/
    LanguageContext.jsx    lang state (persisted), EN ↔ KO toggle
    dynamic.js             tr() — dictionary for dynamic strings (terminal
                           teaching notes, narrator, GPU events). Simulated
                           command OUTPUT stays English like real tools.
  context/
    ProgressContext.jsx    lab mission progress + roadmap checklist (persisted)
  content/
    en.js / ko.js          static rich-text content per module (generated from
                           the original HTML — see note below)
  data/
    quiz.js roadmap.js     quiz questions, roadmap stages, control-plane info,
    cpInfo.js images.js    simulator image registry
  sims/
    dockerSim.js           simulated Docker engine (pure logic, no DOM)
    k8sSim.js              facade for the k8s sim: createK8sSim() + file store
    k8s/
      engine.js            miniature API server: manifest-shaped resources,
                           namespaces, labels/selectors, scheduler (taints,
                           cordon, capacity), controllers (rolling updates
                           with surge/availability, self-heal), pod lifecycle
                           (ImagePullBackOff, CrashLoopBackOff, probes), events
      kubectl.js           the CLI: get/describe/create/run/apply -f/delete/
                           scale/expose/set image/rollout undo/logs/exec/label/
                           taint/cordon/drain, -n -A -l -o yaml, dry-run,
                           `> file.yaml` redirects, `k` alias
      yaml.js              YAML serializer for -o yaml (parsing = js-yaml)
    __tests__/             vitest suites: docker sim, k8s v1 behavior,
                           k8s v2 features, scenario solvability
  data/
    scenarios.js           troubleshooting scenarios: setup(engine) seeds a
                           broken cluster, checks[] grade live sim state,
                           solve() is the tested reference fix
  components/
    Terminal.jsx           reusable terminal (history, print, i18n)
    ManifestEditor.jsx     in-app YAML file editor shared with the terminal
    Sidebar.jsx            staged nav + progress pills + language toggle
    Missions.jsx Html.jsx  mission checklist; rich-text renderer
  modules/
    Roadmap.jsx Containers101.jsx DockerLab.jsx DockerDepth.jsx
    K8sConcepts.jsx K8sLab.jsx OperatorToolkit.jsx Production.jsx
    GpuModule.jsx Quiz.jsx Troubleshooting.jsx
```

## CKA/CKAD track

- **K8s Lab (m4)** now runs on a resource-object simulator: real manifests,
  namespaces, label selectors, YAML apply/edit/dry-run round-trips, rollout
  history/undo, node ops — the muscle memory the exams test.
- **Troubleshooting Gym (m10)**: 11 broken-cluster scenarios mapped to the
  CKA's largest domain (Troubleshooting, 30%). Fixes are graded against live
  cluster state; every scenario's solvability is enforced by tests.
- Longer-term plan: [docs/IMPROVEMENT_PLAN.md](docs/IMPROVEMENT_PLAN.md).

## Notes

- `content/*.js` and most of `data/*.js` are **generated** from the original
  `docker-k8s-lab.html` and marked AUTO-GENERATED. Edit content there; edit
  behavior in `sims/` and `modules/`.
- Rich text renders through the `Html` component (`dangerouslySetInnerHTML`);
  all strings are app-bundled, never user input.
- Progress (roadmap checkboxes, language) persists in `localStorage`.
