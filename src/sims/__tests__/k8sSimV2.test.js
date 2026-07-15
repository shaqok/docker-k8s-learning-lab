import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

let sim, missions, runner;

function settle(cycles = 25) {
  for (let i = 0; i < cycles; i++) {
    sim.reconcile();
    vi.advanceTimersByTime(2000);
  }
}

const podLines = (out) => out.split('\n').filter((l) => /\d\/\d\s+\w/.test(l));

beforeEach(() => {
  vi.useFakeTimers();
  missions = [];
  sim = createK8sSim({ onMission: (id) => missions.push(id) });
  runner = makeRunner(sim);
});

afterEach(() => vi.useRealTimers());

describe('namespaces', () => {
  it('creates a namespace and scopes resources to it', () => {
    expect(runner.run('kubectl create namespace prod').text).toContain('namespace/prod created');
    runner.run('kubectl create deployment api --image=nginx --replicas=2 -n prod');
    settle();
    expect(runner.run('kubectl get pods').text).toContain('No resources found in default namespace.');
    expect(podLines(runner.run('kubectl get pods -n prod').text).length).toBe(2);
    expect(runner.run('kubectl get ns').text).toContain('prod');
  });

  it('-A spans namespaces including kube-system', () => {
    const out = runner.run('kubectl get pods -A').text;
    expect(out).toContain('kube-system');
    expect(out).toContain('kube-apiserver-control-plane');
    expect(out).toContain('coredns');
  });

  it('unknown namespace errors', () => {
    expect(runner.run('kubectl create deployment web --image=nginx -n nope').errors.join('')).toContain('namespaces "nope" not found');
  });
});

describe('labels & selectors', () => {
  it('filters with -l and shows labels', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    runner.run('kubectl run tool --image=busybox --labels=team=debug -- sleep infinity');
    settle();
    expect(podLines(runner.run('kubectl get pods -l app=web').text).length).toBe(2);
    expect(podLines(runner.run('kubectl get pods -l team=debug').text).length).toBe(1);
    expect(runner.run('kubectl get pods --show-labels').text).toContain('app=web');
  });

  it('relabeling a pod out of the selector orphans it and the controller replaces it', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    const name = podLines(runner.run('kubectl get pods').text)[0].trim().split(/\s+/)[0];
    runner.run(`kubectl label pod ${name} app=oops --overwrite`);
    settle();
    // 2 owned + 1 orphan
    expect(podLines(runner.run('kubectl get pods').text).length).toBe(3);
    expect(podLines(runner.run('kubectl get pods -l app=web').text).length).toBe(2);
  });
});

describe('bare pods (kubectl run)', () => {
  it('creates a pod that does NOT self-heal', () => {
    runner.run('kubectl run solo --image=nginx');
    settle();
    expect(podLines(runner.run('kubectl get pods').text).length).toBe(1);
    runner.run('kubectl delete pod solo');
    settle();
    expect(runner.run('kubectl get pods').text).toContain('No resources found');
  });
});

describe('YAML workflow', () => {
  it('applies a Deployment manifest from the file store', () => {
    sim.files.write('web.yaml', [
      'apiVersion: apps/v1', 'kind: Deployment',
      'metadata:', '  name: web',
      'spec:', '  replicas: 3',
      '  selector:', '    matchLabels: {app: web}',
      '  template:', '    metadata:', '      labels: {app: web}',
      '    spec:', '      containers:', '      - name: nginx', '        image: nginx:1.27',
    ].join('\n'));
    expect(runner.run('kubectl apply -f web.yaml').text).toContain('deployment.apps/web created');
    settle();
    expect(podLines(runner.run('kubectl get pods').text).length).toBe(3);
    // re-apply with a change → configured
    sim.files.write('web.yaml', sim.files.read('web.yaml').replace('replicas: 3', 'replicas: 1'));
    expect(runner.run('kubectl apply -f web.yaml').text).toContain('deployment.apps/web configured');
    settle();
    expect(podLines(runner.run('kubectl get pods').text).length).toBe(1);
  });

  it('reports YAML parse errors and missing files', () => {
    sim.files.write('bad.yaml', 'kind: Deployment\n  bad indent: [');
    expect(runner.run('kubectl apply -f bad.yaml').errors.join('')).toContain('error parsing');
    expect(runner.run('kubectl apply -f ghost.yaml').errors.join('')).toContain('does not exist');
  });

  it('dry-run + redirect writes a file that can be applied', () => {
    const r = runner.run('kubectl create deployment gen --image=nginx --replicas=2 --dry-run=client -o yaml > gen.yaml');
    expect(r.text).toContain('wrote');
    expect(sim.files.read('gen.yaml')).toContain('kind: Deployment');
    expect(runner.run('kubectl apply -f gen.yaml').text).toContain('deployment.apps/gen created');
    settle();
    expect(podLines(runner.run('kubectl get pods').text).length).toBe(2);
  });

  it('kubectl get -o yaml round-trips through apply', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    runner.run('kubectl get deployment web -o yaml > copy.yaml');
    expect(sim.files.read('copy.yaml')).toContain('image: nginx');
  });
});

describe('rollout history & undo', () => {
  it('undo returns to the previous image as a new revision', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    runner.run('kubectl set image deployment/web nginx=nginx:1.27');
    settle(40);
    expect(runner.run('kubectl get deploy -o wide').text).toContain('nginx:1.27');
    runner.run('kubectl rollout undo deployment/web');
    settle(40);
    expect(runner.run('kubectl get deploy -o wide').text).not.toContain('nginx:1.27');
    const hist = runner.run('kubectl rollout history deployment/web').text;
    expect(hist.split('\n').filter((l) => /^\d/.test(l.trim())).length).toBe(3);
  });

  it('set image validates the container name', () => {
    runner.run('kubectl create deployment web --image=nginx');
    expect(runner.run('kubectl set image deployment/web wrong=nginx:1.27').errors.join('')).toContain('unable to find container');
  });
});

describe('broken pods (troubleshooting states)', () => {
  it('unknown image → ImagePullBackOff, logs explain why', () => {
    runner.run('kubectl create deployment web --image=ngnix');
    settle();
    expect(runner.run('kubectl get pods').text).toContain('ImagePullBackOff');
    const name = podLines(runner.run('kubectl get pods').text)[0].trim().split(/\s+/)[0];
    expect(runner.run(`kubectl logs ${name}`).errors.join('')).toContain('trying and failing to pull image');
    expect(runner.run(`kubectl describe pod ${name}`).text).toContain('Failed to pull image');
  });

  it('oneshot image in a Deployment → CrashLoopBackOff with restarts', () => {
    runner.run('kubectl create deployment boom --image=busybox');
    settle();
    const out = runner.run('kubectl get pods').text;
    expect(out).toContain('CrashLoopBackOff');
    expect(runner.run('kubectl get events').text).toContain('BackOff');
  });
});

describe('node operations', () => {
  it('cordon marks the node and drain reschedules pods', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=3');
    settle();
    runner.run('kubectl cordon worker-1');
    expect(runner.run('kubectl get nodes').text).toContain('SchedulingDisabled');
    runner.run('kubectl drain worker-1');
    settle();
    const wide = runner.run('kubectl get pods -o wide').text;
    expect(podLines(wide).length).toBe(3);
    expect(podLines(wide).every((l) => l.includes('worker-2'))).toBe(true);
    runner.run('kubectl uncordon worker-1');
    expect(runner.run('kubectl get nodes').text).not.toContain('SchedulingDisabled');
  });

  it('taints keep intolerant pods away', () => {
    runner.run('kubectl taint nodes worker-1 gpu=true:NoSchedule');
    runner.run('kubectl create deployment web --image=nginx --replicas=3');
    settle();
    const wide = runner.run('kubectl get pods -o wide').text;
    expect(podLines(wide).every((l) => l.includes('worker-2'))).toBe(true);
    expect(runner.run('kubectl describe node worker-1').text).toContain('gpu=true:NoSchedule');
  });
});

describe('configmaps & secrets', () => {
  it('creates and inspects them; secrets are base64 in yaml', () => {
    runner.run('kubectl create configmap app-config --from-literal=db_host=postgres');
    expect(runner.run('kubectl get cm').text).toContain('app-config');
    runner.run('kubectl create secret generic db-creds --from-literal=password=hunter2');
    const yaml = runner.run('kubectl get secret db-creds -o yaml').text;
    expect(yaml).toContain('aHVudGVyMg=='); // base64("hunter2")
    expect(yaml).not.toContain('hunter2\n');
  });
});

describe('services & in-cluster networking', () => {
  beforeEach(() => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    runner.run('kubectl expose deployment web --port=80');
    settle();
  });

  it('endpoints track ready pods', () => {
    expect(runner.run('kubectl get endpoints').text).toMatch(/web\s+10\.244/);
    runner.run('kubectl scale deployment web --replicas=0');
    settle();
    expect(runner.run('kubectl get endpoints').text).toContain('<none>');
  });

  it('exec wget reaches the service by name, fails on wrong port/name', () => {
    runner.run('kubectl run tool --image=busybox -- sleep infinity');
    settle();
    expect(runner.run('kubectl exec tool -- wget -qO- web').text).toContain('Welcome to nginx');
    expect(runner.run('kubectl exec tool -- wget -qO- web:8080').errors.join('')).toContain('Connection refused');
    expect(runner.run('kubectl exec tool -- wget -qO- nothere').errors.join('')).toContain('bad address');
  });
});

describe('get by name', () => {
  it('prints only the named object, not the whole list', () => {
    runner.run('kubectl create deployment web --image=nginx');
    runner.run('kubectl create deployment api --image=redis');
    settle();

    const out = runner.run('kubectl get deploy web').text;
    expect(out).toContain('web');
    expect(out).not.toContain('api');

    // and the plural list still shows both
    const all = runner.run('kubectl get deploy').text;
    expect(all).toContain('web');
    expect(all).toContain('api');
  });

  it('errors on a name that does not exist', () => {
    expect(runner.run('kubectl get deploy nope').errors.join('')).toContain('not found');
  });

  it('narrows services without dropping the kubernetes ClusterIP row', () => {
    runner.run('kubectl create deployment web --image=nginx');
    runner.run('kubectl expose deployment web --port=80');
    settle();

    const one = runner.run('kubectl get svc web').text;
    expect(one).toContain('web');
    expect(one).not.toContain('kubernetes');

    expect(runner.run('kubectl get svc').text).toContain('kubernetes');
  });

  it('narrows configmaps via the generic renderer', () => {
    runner.run('kubectl create configmap a --from-literal=x=1');
    runner.run('kubectl create configmap b --from-literal=y=2');
    const out = runner.run('kubectl get cm a').text;
    expect(out).toContain('a');
    expect(out).not.toMatch(/^b\s/m);
  });
});
