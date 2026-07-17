import { describe, it, expect } from 'vitest';
import { renderTemplateString, renderChart } from '../k8s/helmTemplate.js';
import { createFileStore } from '../k8sSim.js';

const ctx = { Values: { a: { b: 'hi' }, list: ['x', 'y'], envs: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }], on: true, off: false }, Release: { Name: 'rel1', Namespace: 'default' }, Chart: { Name: 'mychart' } };

describe('renderTemplateString', () => {
  it('substitutes dotted Values/Release/Chart paths', () => {
    expect(renderTemplateString('{{ .Values.a.b }}-{{ .Release.Name }}-{{ .Chart.Name }}', ctx).text).toBe('hi-rel1-mychart');
  });

  it('if/else picks the right branch on truthy/falsy', () => {
    expect(renderTemplateString('{{ if .Values.on }}Y{{ else }}N{{ end }}', ctx).text).toBe('Y');
    expect(renderTemplateString('{{ if .Values.off }}Y{{ else }}N{{ end }}', ctx).text).toBe('N');
    expect(renderTemplateString('{{ if .Values.missing }}Y{{ end }}', ctx).text).toBe('');
  });

  it('not/eq/ne conditions', () => {
    expect(renderTemplateString('{{ if not .Values.off }}Y{{ end }}', ctx).text).toBe('Y');
    expect(renderTemplateString('{{ if eq .Release.Name "rel1" }}Y{{ end }}', ctx).text).toBe('Y');
    expect(renderTemplateString('{{ if ne .Release.Name "rel1" }}Y{{ end }}', ctx).text).toBe('');
  });

  it('range over a scalar list rebinds . to each item', () => {
    expect(renderTemplateString('{{ range .Values.list }}[{{ . }}]{{ end }}', ctx).text).toBe('[x][y]');
  });

  it('range over a list of objects accesses item fields', () => {
    expect(renderTemplateString('{{ range .Values.envs }}{{ .name }}={{ .value }};{{ end }}', ctx).text).toBe('A=1;B=2;');
  });

  it('nested if inside range, and range inside if, both resolve correctly', () => {
    const t = '{{ range .Values.envs }}{{ if eq .name "A" }}FIRST{{ else }}OTHER{{ end }};{{ end }}';
    expect(renderTemplateString(t, ctx).text).toBe('FIRST;OTHER;');
  });

  it('.Values inside a range no longer refers to root (the real Helm gotcha) — $.Values does', () => {
    const t = '{{ range .Values.list }}[{{ $.Release.Name }}]{{ end }}';
    expect(renderTemplateString(t, ctx).text).toBe('[rel1][rel1]');
  });

  it('reports a syntax error for a missing {{ end }}', () => {
    const r = renderTemplateString('{{ if .Values.on }}Y', ctx);
    expect(r.error).toMatch(/missing its \{\{ end \}\}/);
  });
});

describe('renderChart', () => {
  function chartFiles() {
    return createFileStore({
      'chart/Chart.yaml': 'name: demo\nversion: 1.0.0\n',
      'chart/values.yaml': 'replicaCount: 1\nimage:\n  tag: v1\nservice:\n  enabled: false\nextraEnv: []\n',
      'chart/templates/deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-web
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
      - name: web
        image: nginx:{{ .Values.image.tag }}
        env:
        {{ range .Values.extraEnv }}
        - name: {{ .name }}
          value: "{{ .value }}"
        {{ end }}
`,
      'chart/templates/service.yaml': `{{ if .Values.service.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-web
spec:
  selector:
    app: web
  ports:
  - port: 80
{{ end }}
`,
    });
  }

  it('renders a Deployment with substituted values', () => {
    const { docs, error } = renderChart(chartFiles(), 'chart', { releaseName: 'myrelease' });
    expect(error).toBeUndefined();
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.metadata.name).toBe('myrelease-web');
    expect(dep.spec.replicas).toBe(1);
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:v1');
  });

  it('drops a template that renders to nothing under a false if', () => {
    const { docs } = renderChart(chartFiles(), 'chart', { releaseName: 'myrelease' });
    expect(docs.find((d) => d.kind === 'Service')).toBeUndefined();
  });

  it('a flipped conditional value produces the Service on upgrade', () => {
    const { docs } = renderChart(chartFiles(), 'chart', { releaseName: 'myrelease', valuesOverride: { service: { enabled: true } } });
    expect(docs.find((d) => d.kind === 'Service')).toBeTruthy();
  });

  it('range over a values-driven list produces every item', () => {
    const { docs } = renderChart(chartFiles(), 'chart', { releaseName: 'myrelease', valuesOverride: { extraEnv: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }] } });
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.spec.template.spec.containers[0].env).toEqual([{ name: 'A', value: '1' }, { name: 'B', value: '2' }]);
  });

  it('a render error leaves docs undefined and reports which template failed', () => {
    const files = chartFiles();
    files.write('chart/templates/deployment.yaml', 'replicas: {{ .Values.replicaCount');
    const { docs, error } = renderChart(files, 'chart', { releaseName: 'myrelease' });
    expect(docs).toBeUndefined();
    expect(error).toMatch(/deployment\.yaml/);
  });
});
