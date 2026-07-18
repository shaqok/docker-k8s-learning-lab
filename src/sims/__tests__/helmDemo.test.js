import { describe, it, expect } from 'vitest';
import { renderDemo, valuesText, diffLines } from '../../data/helmDemo.js';

describe('m9 helm widget chart', () => {
  it('renders the defaults: one v1 replica, no Ingress', () => {
    const { text, error } = renderDemo();
    expect(error).toBeUndefined();
    expect(text).toContain('replicas: 1');
    expect(text).toContain('image: shop/web:v1');
    expect(text).not.toContain('kind: Ingress');
  });

  it('replicaCount override changes exactly one line', () => {
    const base = renderDemo().text;
    const { text } = renderDemo({ replicaCount: 5 });
    expect(text).toContain('replicas: 5');
    const changed = diffLines(text, base);
    expect(changed.filter(Boolean)).toHaveLength(1);
    expect(text.split('\n')[changed.indexOf(true)]).toBe('  replicas: 5');
  });

  it('ingress.enabled=true switches a whole Ingress object on ({{ if }})', () => {
    const { text } = renderDemo({ ingress: { enabled: true } });
    expect(text).toContain('kind: Ingress');
    expect(text).toContain('host: shop.example.com');
    expect(renderDemo({ ingress: { enabled: false } }).text).not.toContain('kind: Ingress');
  });

  it('every knob combination renders without error', () => {
    for (const replicaCount of [1, 3, 5])
      for (const tag of ['v1', 'v2'])
        for (const enabled of [false, true]) {
          const { text, error } = renderDemo({ replicaCount, image: { tag }, ingress: { enabled } });
          expect(error, `r=${replicaCount} t=${tag} i=${enabled}`).toBeUndefined();
          expect(text).toContain(`replicas: ${replicaCount}`);
          expect(text).toContain(`image: shop/web:${tag}`);
        }
  });

  it('valuesText mirrors the knobs for the left pane', () => {
    expect(valuesText()).toContain('replicaCount: 1');
    const t = valuesText({ replicaCount: 3, image: { tag: 'v2' }, ingress: { enabled: true } });
    expect(t).toContain('replicaCount: 3');
    expect(t).toContain('tag: v2');
    expect(t).toContain('enabled: true');
  });
});
