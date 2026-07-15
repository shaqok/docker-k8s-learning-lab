/**
 * Cluster-ops drill labs (improvement-plan step 8): node maintenance vs PDB,
 * the kubeadm upgrade sequence, and etcd disaster recovery + cert inspection.
 * Same shape as the m11–m13 drills — `{ id, setup(engine, files), missions:
 * [{id, desc, check(engine, flags)}], solve(sim, run, settle) }` — missions
 * graded live every reconcile tick. `flags` collects onMission ids fired by
 * the terminal ('drain-blocked', 'upgrade-apply', 'etcd-save', …).
 */

const SNAP_SAVE = 'etcdctl snapshot save /backup/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key';

const node = (e, name) => e.get('Node', null, name);
const userPodsOn = (e, name) =>
  e.list('Pod', { all: true }).filter((p) => p.spec.nodeName === name && !p.sim.system && p.status.state !== 'Terminating');

/** Worker upgraded the exam way: config bumped, kubelet restarted while cordoned, back in service. */
const workerUpgraded = (e, flags, name) => {
  const n = node(e, name);
  return !!(n && n.sim.version === 'v1.34.0' && n.status.ready && !n.spec.unschedulable &&
    flags && flags.has('kubeadm-node:' + name) && flags.has('kubelet-cordoned:' + name));
};

export const OPS_LABS = [
  {
    id: 'pdb',
    tab: { en: '🚧 Drain vs PDB', ko: '🚧 Drain vs PDB' },
    title: { en: 'Node maintenance — drain, cordon, and the budget that says no', ko: '노드 유지보수 — drain, cordon, 그리고 거부하는 예산' },
    brief: {
      en: 'Deployment <code>web</code> (2 replicas) is protected by PodDisruptionBudget <code>web-pdb</code> with <code>minAvailable: 2</code> — the eviction API may never take a ready replica away. <code>kubectl drain</code> evicts (politely); <code>kubectl delete pod</code> does not ask. Your maintenance job: get every pod off <code>worker-2</code> <b>without ever dropping below 2 ready replicas and without touching the PDB</b>. The <b>node panel</b> shows allowed disruptions live. This exact trap — drain hangs, nobody knows why — is a CKA classic.',
      ko: 'Deployment <code>web</code>(레플리카 2)은 <code>minAvailable: 2</code>인 PodDisruptionBudget <code>web-pdb</code>의 보호를 받습니다 — 축출(eviction) API는 준비된 레플리카를 2개 밑으로 절대 내리지 못합니다. <code>kubectl drain</code>은 (정중하게) 축출하고, <code>kubectl delete pod</code>는 묻지 않습니다. 유지보수 임무: <b>준비된 레플리카를 2개 밑으로 떨어뜨리지 않고, PDB도 건드리지 않고</b> <code>worker-2</code>의 모든 파드를 비우세요. <b>노드 패널</b>이 허용 중단 수를 실시간으로 보여줍니다. drain이 멈춰 있는데 아무도 이유를 모르는 이 함정이 바로 CKA 단골 문제입니다.',
    },
    docs: [
      { label: 'Safely Drain a Node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
      { label: 'Specifying a Disruption Budget', url: 'https://kubernetes.io/docs/tasks/run-application/configure-pdb/' },
    ],
    starterFiles: {},
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
      engine.put({
        apiVersion: 'policy/v1', kind: 'PodDisruptionBudget',
        metadata: { name: 'web-pdb', namespace: 'default', creationTimestamp: Date.now() },
        spec: { minAvailable: 2, selector: { matchLabels: { app: 'web' } } },
        status: {}, sim: {},
      });
    },
    missions: [
      {
        id: 'pdb-see',
        desc: { en: '🔎 Find the budget before it finds you: <code>kubectl get pdb</code> — read ALLOWED DISRUPTIONS (also try <code>kubectl describe pdb web-pdb</code>)', ko: '🔎 예산이 당신을 찾기 전에 먼저 찾으세요: <code>kubectl get pdb</code> — ALLOWED DISRUPTIONS를 읽으세요 (<code>kubectl describe pdb web-pdb</code>도 시도)' },
        check: (e, flags) => !!(flags && flags.has('pdb')),
      },
      {
        id: 'pdb-blocked',
        desc: { en: '🚫 Try <code>kubectl drain worker-2</code> and watch the eviction get REFUSED — the node still ends up cordoned', ko: '🚫 <code>kubectl drain worker-2</code>를 실행해 축출이 거부되는 것을 확인하세요 — 그래도 노드는 cordon 됩니다' },
        check: (e, flags) => !!(flags && flags.has('drain-blocked')),
      },
      {
        id: 'pdb-drain',
        desc: { en: '🚚 Empty <code>worker-2</code> without violating the budget: make more replicas available (<code>kubectl scale deployment web --replicas=3</code>), wait Ready, drain again — the PDB must survive untouched', ko: '🚚 예산을 어기지 않고 <code>worker-2</code>를 비우세요: 가용 레플리카를 늘리고(<code>kubectl scale deployment web --replicas=3</code>) Ready를 기다렸다가 다시 drain — PDB는 그대로 남아야 합니다' },
        check: (e, flags) => {
          if (!flags || !flags.has('drained:worker-2') || userPodsOn(e, 'worker-2').length) return false;
          const pdb = e.get('PodDisruptionBudget', 'default', 'web-pdb');
          if (!pdb || pdb.spec.minAvailable !== 2) return false;
          const d = e.get('Deployment', 'default', 'web');
          return !!(d && e.ownedPods(d).filter((p) => p.status.ready).length >= 2);
        },
      },
      {
        id: 'pdb-back',
        desc: { en: '✅ Maintenance done — <code>kubectl uncordon worker-2</code> and put the fleet back to normal', ko: '✅ 유지보수 끝 — <code>kubectl uncordon worker-2</code>로 노드를 복귀시키세요' },
        check: (e, flags) => {
          const n = node(e, 'worker-2');
          const d = e.get('Deployment', 'default', 'web');
          return !!(flags && flags.has('drain-blocked') && flags.has('drained:worker-2') &&
            n && n.status.ready && !n.spec.unschedulable &&
            d && e.ownedPods(d).filter((p) => p.status.ready).length >= 2);
        },
      },
    ],
    solve(sim, run, settle) {
      settle(8);
      run('kubectl get pdb');
      run('kubectl drain worker-2');
      run('kubectl scale deployment web --replicas=3');
      settle(10);
      run('kubectl drain worker-2');
      settle(5);
      run('kubectl uncordon worker-2');
      settle(3);
    },
  },

  {
    id: 'upgrade',
    tab: { en: '⬆️ kubeadm upgrade', ko: '⬆️ kubeadm 업그레이드' },
    title: { en: 'Cluster upgrade — control plane first, then one node at a time', ko: '클러스터 업그레이드 — 컨트롤 플레인 먼저, 그다음 노드 하나씩' },
    brief: {
      en: 'The cluster runs <b>v1.33.2</b>; take it to <b>v1.34.0</b> in the only order that works: <b>control plane first</b> (a kubelet may never be newer than its API server). New here: <code>ssh NODE</code> puts you ON a node, where <code>apt-get</code>, <code>kubeadm</code> and <code>systemctl</code> live (<code>exit</code> comes back). Per node the ritual is: drain → <code>apt-get install -y kubeadm=1.34.0-1.1</code> → <code>kubeadm upgrade apply v1.34.0</code> (control-plane) or <code>kubeadm upgrade node</code> (workers) → upgrade + restart the kubelet → uncordon. The VERSION column in <code>kubectl get nodes</code> is each node\'s <b>kubelet</b> — watch it lag behind until you restart.',
      ko: '클러스터는 <b>v1.33.2</b>입니다. 유일하게 통하는 순서로 <b>v1.34.0</b>까지 올리세요: <b>컨트롤 플레인 먼저</b>(kubelet은 API 서버보다 새 버전이면 안 됩니다). 이 랩의 새 명령: <code>ssh 노드</code>로 노드에 올라가면 <code>apt-get</code>, <code>kubeadm</code>, <code>systemctl</code>을 쓸 수 있습니다(<code>exit</code>로 복귀). 노드마다 의식은 같습니다: drain → <code>apt-get install -y kubeadm=1.34.0-1.1</code> → <code>kubeadm upgrade apply v1.34.0</code>(컨트롤 플레인) 또는 <code>kubeadm upgrade node</code>(워커) → kubelet 업그레이드 + 재시작 → uncordon. <code>kubectl get nodes</code>의 VERSION 열은 각 노드의 <b>kubelet</b> 버전입니다 — 재시작 전까지 뒤처져 있는 걸 지켜보세요.',
    },
    docs: [
      { label: 'Upgrading kubeadm clusters', url: 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/' },
      { label: 'Version skew policy', url: 'https://kubernetes.io/releases/version-skew-policy/' },
    ],
    starterFiles: {},
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
    },
    missions: [
      {
        id: 'up-plan',
        desc: { en: '🗺 On the control-plane (<code>ssh control-plane</code>), install the new kubeadm (<code>apt-get install -y kubeadm=1.34.0-1.1</code>) and read <code>kubeadm upgrade plan</code>', ko: '🗺 컨트롤 플레인에서(<code>ssh control-plane</code>) 새 kubeadm을 설치하고(<code>apt-get install -y kubeadm=1.34.0-1.1</code>) <code>kubeadm upgrade plan</code>을 읽으세요' },
        check: (e, flags) => !!(flags && flags.has('upgrade-plan')),
      },
      {
        id: 'up-apply',
        desc: { en: '🧠 Upgrade the control plane: <code>kubeadm upgrade apply v1.34.0</code> — then check <code>kubectl get pods -n kube-system -o wide</code>: the static pods run new images', ko: '🧠 컨트롤 플레인 업그레이드: <code>kubeadm upgrade apply v1.34.0</code> — 그 후 <code>kubectl get pods -n kube-system -o wide</code>로 스태틱 파드의 새 이미지를 확인하세요' },
        check: (e) => {
          const api = e.list('Pod', { ns: 'kube-system' }).find((p) => p.metadata.labels.component === 'kube-apiserver');
          return !!(api && api.spec.containers[0].image.endsWith(':v1.34.0'));
        },
      },
      {
        id: 'up-cp-kubelet',
        desc: { en: '🤖 The control-plane node STILL says v1.33.2 — VERSION is its kubelet. Fix it: <code>apt-get install -y kubelet=1.34.0-1.1</code> + <code>systemctl restart kubelet</code> (on the node)', ko: '🤖 컨트롤 플레인 노드는 아직 v1.33.2 — VERSION은 kubelet 버전입니다. 고치세요: 노드 위에서 <code>apt-get install -y kubelet=1.34.0-1.1</code> + <code>systemctl restart kubelet</code>' },
        check: (e) => {
          const n = node(e, 'control-plane');
          return !!(n && n.sim.version === 'v1.34.0' && n.status.ready && !n.spec.unschedulable);
        },
      },
      {
        id: 'up-w1',
        desc: { en: '🔧 Upgrade <code>worker-1</code> the exam way: <code>kubectl drain worker-1</code> → ssh in → kubeadm 1.34.0 → <code>kubeadm upgrade node</code> → kubelet 1.34.0 + restart → exit → <code>kubectl uncordon worker-1</code>', ko: '🔧 시험 방식으로 <code>worker-1</code> 업그레이드: <code>kubectl drain worker-1</code> → ssh 접속 → kubeadm 1.34.0 → <code>kubeadm upgrade node</code> → kubelet 1.34.0 + 재시작 → exit → <code>kubectl uncordon worker-1</code>' },
        check: (e, flags) => workerUpgraded(e, flags, 'worker-1'),
      },
      {
        id: 'up-w2',
        desc: { en: '🔁 Same dance for <code>worker-2</code> — the whole fleet reports v1.34.0, Ready, schedulable. Congratulations, you just did the most feared CKA task', ko: '🔁 <code>worker-2</code>도 같은 순서로 — 전체가 v1.34.0, Ready, 스케줄 가능 상태여야 합니다. 축하합니다, CKA에서 가장 겁나는 과제를 해냈습니다' },
        check: (e, flags) => workerUpgraded(e, flags, 'worker-2'),
      },
    ],
    solve(sim, run, settle) {
      settle(8);
      run('ssh control-plane');
      run('apt-get update');
      run('apt-get install -y kubeadm=1.34.0-1.1');
      run('kubeadm upgrade plan');
      run('kubeadm upgrade apply v1.34.0');
      run('apt-get install -y kubelet=1.34.0-1.1');
      run('systemctl restart kubelet');
      run('exit');
      for (const w of ['worker-1', 'worker-2']) {
        run(`kubectl drain ${w} --ignore-daemonsets`);
        settle(8);
        run(`ssh ${w}`);
        run('apt-get install -y kubeadm=1.34.0-1.1');
        run('kubeadm upgrade node');
        run('apt-get install -y kubelet=1.34.0-1.1');
        run('systemctl restart kubelet');
        run('exit');
        run(`kubectl uncordon ${w}`);
        settle(5);
      }
    },
  },

  {
    id: 'etcd',
    tab: { en: '💾 etcd & certs', ko: '💾 etcd & 인증서' },
    title: { en: 'Disaster recovery — etcd snapshot, restore, and certificate checks', ko: '재해 복구 — etcd 스냅샷, 복구, 인증서 점검' },
    brief: {
      en: 'Everything the API server knows lives in <b>etcd</b> on the control-plane — a snapshot of it is a full-cluster undo button. The exam wants the exact incantation: <code>etcdctl snapshot save</code> needs <code>--endpoints</code> plus the <b>three TLS flags</b> (<code>--cacert --cert --key</code>, files under <code>/etc/kubernetes/pki/etcd/</code>), and restore is <code>etcdutl snapshot restore --data-dir NEW_DIR</code>. Namespace <code>default</code> runs a precious <code>payments</code> Deployment. Take a backup, cause the disaster yourself, roll it back. Then poke at the other control-plane fright: certificate expiry.',
      ko: 'API 서버가 아는 모든 것은 컨트롤 플레인의 <b>etcd</b>에 있습니다 — 그 스냅샷 하나가 클러스터 전체의 되돌리기 버튼입니다. 시험은 정확한 주문을 요구합니다: <code>etcdctl snapshot save</code>에는 <code>--endpoints</code>와 <b>TLS 플래그 3종</b>(<code>--cacert --cert --key</code>, <code>/etc/kubernetes/pki/etcd/</code> 아래 파일)이 필요하고, 복구는 <code>etcdutl snapshot restore --data-dir 새_디렉터리</code>입니다. <code>default</code> 네임스페이스에는 소중한 <code>payments</code> Deployment가 돌고 있습니다. 백업하고, 직접 사고를 내고, 되돌리세요. 그다음 컨트롤 플레인의 또 다른 공포인 인증서 만료를 점검하세요.',
    },
    docs: [
      { label: 'Backing up an etcd cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster' },
      { label: 'Certificate Management with kubeadm', url: 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/' },
    ],
    starterFiles: {},
    setup(engine) {
      engine.makeDeployment({ name: 'payments', replicas: 2, image: 'nginx:1.27' });
      engine.put({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'payments-config', namespace: 'default', creationTimestamp: Date.now() }, data: { RATE: '0.03' }, spec: {}, status: {}, sim: {} });
    },
    missions: [
      {
        id: 'et-save',
        desc: { en: '📸 On the control-plane, snapshot etcd to <code>/backup/snap.db</code> with the full TLS flag set — try leaving the flags off first and read the timeout', ko: '📸 컨트롤 플레인에서 TLS 플래그를 모두 갖춰 etcd를 <code>/backup/snap.db</code>로 스냅샷하세요 — 먼저 플래그 없이 실행해 타임아웃도 읽어보세요' },
        check: (e, flags) => !!(flags && flags.has('etcd-save')),
      },
      {
        id: 'et-oops',
        desc: { en: '💥 Cause the disaster (AFTER the snapshot!): <code>kubectl delete deployment payments</code> — and note that <code>kubectl delete</code> never asked any PDB', ko: '💥 (스냅샷을 찍은 다음!) 사고를 내세요: <code>kubectl delete deployment payments</code> — <code>kubectl delete</code>는 PDB에게 묻지도 않는다는 점도 기억하세요' },
        check: (e, flags) => !!(flags && flags.has('etcd-save') && flags.has('deleted:Deployment/payments')),
      },
      {
        id: 'et-restore',
        desc: { en: '⏪ Roll the whole cluster back: <code>etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore</code> — payments returns from the dead', ko: '⏪ 클러스터 전체를 되돌리세요: <code>etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore</code> — payments가 되살아납니다' },
        check: (e, flags) => {
          if (!flags || !flags.has('etcd-restore')) return false;
          const d = e.get('Deployment', 'default', 'payments');
          return !!(d && e.ownedPods(d).filter((p) => p.status.ready).length >= 2);
        },
      },
      {
        id: 'et-certs',
        desc: { en: '🔏 The other 3am page: when do the control-plane certs expire? <code>kubeadm certs check-expiration</code>, or <code>openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates</code>', ko: '🔏 또 하나의 새벽 3시 호출: 컨트롤 플레인 인증서는 언제 만료될까요? <code>kubeadm certs check-expiration</code> 또는 <code>openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates</code>' },
        check: (e, flags) => !!(flags && flags.has('cert-inspect')),
      },
    ],
    solve(sim, run, settle) {
      settle(8);
      run('ssh control-plane');
      run(SNAP_SAVE);
      run('exit');
      run('kubectl delete deployment payments');
      settle(3);
      run('ssh control-plane');
      run('etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore');
      run('kubeadm certs check-expiration');
      run('exit');
      settle(5);
    },
  },
];

export const OPS_MISSION_TOTAL = OPS_LABS.reduce((s, l) => s + l.missions.length, 0);
