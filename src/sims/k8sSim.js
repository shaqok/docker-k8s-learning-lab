import { createEngine, K8S_NODE_CAP, K8S_IMAGES } from './k8s/engine.js';
import { createKubectl } from './k8s/kubectl.js';
import { createHostOps } from './k8s/hostops.js';

export { K8S_NODE_CAP, K8S_IMAGES };

const STARTER_POD = `# A manifest is desired state. Try: kubectl apply -f pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello
  labels:
    app: hello
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    ports:
    - containerPort: 80
`;

/** In-app "home directory" of YAML manifests shared by terminal and editor. */
export function createFileStore(initial) {
  const files = new Map(Object.entries(initial || {}));
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  return {
    read: (name) => (files.has(name) ? files.get(name) : null),
    write: (name, content) => { files.set(name, content); notify(); },
    remove: (name) => { files.delete(name); notify(); },
    list: () => [...files.keys()],
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/**
 * Simulated Kubernetes cluster, v2 — see k8s/engine.js (resource store +
 * controllers) and k8s/kubectl.js (CLI). This facade keeps the original
 * public surface: { exec, reconcile, subscribe } plus view/files/engine.
 */
export function createK8sSim({ onMission = () => {}, starterFiles = { 'pod.yaml': STARTER_POD } } = {}) {
  const engine = createEngine({ onMission });
  const files = createFileStore(starterFiles);
  let onEditCb = null;
  const host = createHostOps(engine, { onMission });
  const kubectl = createKubectl(engine, { files, onEdit: (f) => onEditCb && onEditCb(f), host });
  return {
    exec: kubectl.exec,
    reconcile: engine.reconcile,
    subscribe: engine.subscribe,
    view: engine.view,
    files,
    engine,
    host,
    setOnEdit: (fn) => { onEditCb = fn; },
  };
}
