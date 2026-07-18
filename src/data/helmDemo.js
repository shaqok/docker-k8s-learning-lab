import { renderChart } from '../sims/k8s/helmTemplate.js';
import { toYaml } from '../sims/k8s/yaml.js';

/**
 * The tiny chart behind m9's Helm widget — rendered by the REAL template
 * engine (the one m19's helm drills use), so the widget can never disagree
 * with `helm template` in the lab. Three knobs: replicaCount, image.tag,
 * ingress.enabled ({{ if }} — a whole object switching on and off).
 */
const DEMO_CHART = {
  'mychart/Chart.yaml': 'name: web\nversion: 0.1.0\n',
  'mychart/values.yaml':
    'replicaCount: 1\nimage:\n  repo: shop/web\n  tag: v1\ningress:\n  enabled: false\n  host: shop.example.com\n',
  'mychart/templates/deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: web
          image: {{ .Values.image.repo }}:{{ .Values.image.tag }}
`,
  'mychart/templates/service.yaml': `apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: 80
`,
  'mychart/templates/ingress.yaml': `{{ if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}
spec:
  rules:
    - host: {{ .Values.ingress.host }}
{{ end }}`,
};

/** {read, list} stub over the plain object — all renderChart needs. */
export const demoFiles = () => ({
  read: (n) => DEMO_CHART[n] ?? null,
  list: () => Object.keys(DEMO_CHART),
});

/** The values.yaml the left pane shows, with the knobs applied. */
export function valuesText({ replicaCount = 1, image = {}, ingress = {} } = {}) {
  return (
    `replicaCount: ${replicaCount}\n` +
    `image:\n  repo: shop/web\n  tag: ${image.tag ?? 'v1'}\n` +
    `ingress:\n  enabled: ${ingress.enabled ?? false}\n  host: shop.example.com`
  );
}

/** Render the chart with overrides → {text} (joined manifests) or {error}. */
export function renderDemo(valuesOverride = {}) {
  const { docs, error } = renderChart(demoFiles(), 'mychart', { releaseName: 'web', valuesOverride });
  if (error) return { error };
  return { text: docs.map((d) => toYaml(d)).join('\n---\n') };
}

/** Per-line changed-flags of `text` vs `baseline` (line not present in baseline). */
export function diffLines(text, baseline) {
  const base = new Set(baseline.split('\n'));
  return text.split('\n').map((l) => !base.has(l));
}
