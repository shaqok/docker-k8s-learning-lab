import { esc, pad } from '../util.js';

/**
 * Host-level operations for the cluster-ops drills (improvement-plan step 8):
 * `ssh NODE` puts you "on" a node, where kubeadm / apt-get / systemctl /
 * etcdctl / etcdutl / openssl work — the commands the CKA exam runs outside
 * kubectl. Pure state over the engine, no DOM. Wired into the kubectl
 * dispatcher so every k8s terminal understands them.
 */

export const K8S_CURRENT = '1.33.2';
export const K8S_TARGET = '1.34.0';

const ETCD_PKI = '/etc/kubernetes/pki/etcd/';
const PKI_CERTS = ['apiserver.crt', 'apiserver-kubelet-client.crt', 'front-proxy-ca.crt', 'ca.crt', 'etcd/ca.crt', 'etcd/server.crt', 'etcd/peer.crt'];

const DAY = 864e5;
const fmtDate = (t) => new Date(t).toUTCString().replace(/^\w+, /, '').replace(/ \d\d:\d\d:\d\d GMT$/, '');

function parseFlags(tokens) {
  const flags = {};
  const args = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq > 0) flags[t.slice(2, eq)] = t.slice(eq + 1);
      else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) flags[t.slice(2)] = tokens[++i];
      else flags[t.slice(2)] = true;
    } else args.push(t);
  }
  return { args, flags };
}

const HANDLED = new Set(['ssh', 'exit', 'logout', 'hostname', 'kubeadm', 'apt', 'apt-get', 'systemctl', 'etcdctl', 'etcdutl', 'openssl', 'kube-bench', 'harden']);

/** A CIS-Benchmark-flavored subset of component flags, cluster-wide for simplicity (kube-bench's
 * "master"/"node" split is real; per-node divergence isn't modeled). Each starts at the insecure
 * default an unhardened kubeadm cluster ships with. */
const BENCH_CHECKS = [
  { id: '1.2.1', target: 'master', flag: 'anonymousAuth', secureWhen: false, desc: 'Ensure that the --anonymous-auth argument is set to false' },
  { id: '1.2.20', target: 'master', flag: 'profiling', secureWhen: false, desc: 'Ensure that the --profiling argument is set to false' },
  { id: '2.1', target: 'master', flag: 'etcdClientCertAuth', secureWhen: true, desc: 'Ensure that the --client-cert-auth argument is set to true (etcd)' },
  { id: '4.2.4', target: 'node', flag: 'kubeletReadOnlyPort', secureWhen: false, desc: 'Ensure that the --read-only-port argument is set to 0 (kubelet)' },
];

/** `harden FLAG on|off` — on/off map 1:1 onto the real --flag=true/false, same as kube-bench reports. */
const HARDEN_FLAGS = {
  'anonymous-auth': { key: 'anonymousAuth', node: 'control-plane' },
  profiling: { key: 'profiling', node: 'control-plane' },
  'etcd-client-cert-auth': { key: 'etcdClientCertAuth', node: 'control-plane' },
  'kubelet-read-only-port': { key: 'kubeletReadOnlyPort', node: null }, // any node
};

export function createHostOps(engine, { onMission = () => {} } = {}) {
  const state = {
    host: null, // null = the exam terminal; else a node name
    pkgs: {}, // nodeName -> { kubeadm, kubelet } package versions
    nodeConfigUpgraded: {}, // nodeName -> true once `kubeadm upgrade node` ran there
    cpVersion: 'v' + K8S_CURRENT, // what `kubeadm upgrade apply` has been run up to
    snapshots: {}, // path -> { at, objects, data } — etcdctl snapshot save results
    clusterConfig: { anonymousAuth: true, profiling: true, etcdClientCertAuth: false, kubeletReadOnlyPort: true },
  };
  const pkg = (node) => state.pkgs[node] || (state.pkgs[node] = { kubeadm: K8S_CURRENT, kubelet: K8S_CURRENT });
  const bornAt = () => {
    const cp = engine.get('Node', null, 'control-plane');
    return cp ? cp.metadata.creationTimestamp : Date.now();
  };

  const notOnANode = (print, cmd) => {
    print(`bash: ${esc(cmd)}: command not found`, 'err');
    print(`<span class='info'>Host commands run ON a node, not in the exam terminal. SSH into one first: ssh control-plane (then 'exit' to come back).</span>`);
  };

  /* ----- ssh / exit ----- */

  function cmdSsh(print, args) {
    const target = args[1];
    if (!target) return print('usage: ssh NODE   (kubectl get nodes lists them)', 'err');
    if (state.host) return print(`ssh: nested ssh is not supported here — 'exit' back to the exam terminal first`, 'err');
    const n = engine.get('Node', null, target);
    if (!n) return print(`ssh: Could not resolve hostname ${esc(target)}: Name or service not known`, 'err');
    state.host = target;
    const p = pkg(target);
    print(`Welcome to ${target} (${n.sim.role}) — kubelet ${n.sim.version}, kubeadm v${p.kubeadm} installed`, 'ok');
    print(`<span class='info'>You are ON the node now: kubeadm, apt-get, systemctl${target === 'control-plane' ? ', etcdctl/etcdutl and openssl (the pki files live here)' : ''} work here. 'exit' returns to the exam terminal.</span>`);
    engine.notify();
  }

  function cmdExit(print) {
    if (!state.host) return print('logout: not inside an ssh session', 'err');
    print(`logout\nConnection to ${state.host} closed.`);
    state.host = null;
    engine.notify();
  }

  /* ----- apt-get ----- */

  function cmdApt(print, tokens) {
    if (!state.host) return notOnANode(print, tokens[0]);
    const { args } = parseFlags(tokens.slice(1).filter((t) => t !== '-y' && t !== '-qq'));
    const sub = args[0];
    if (sub === 'update') return print('Reading package lists... Done');
    if (sub !== 'install') return print(`E: Invalid operation ${esc(sub || '')} (this sim knows: apt-get update, apt-get install -y PKG=VERSION)`, 'err');
    const p = pkg(state.host);
    const installed = [];
    for (const spec of args.slice(1)) {
      const m = String(spec).match(/^(kubeadm|kubelet|kubectl)=(\d+\.\d+\.\d+)/);
      if (!m) return print(`E: Unable to locate package ${esc(spec)} — pin the version: apt-get install -y kubeadm=${K8S_TARGET}-1.1`, 'err');
      const [, name, ver] = m;
      if (name !== 'kubectl') p[name] = ver;
      installed.push(`Setting up ${name} (${ver}-1.1) ...`);
      if (name === 'kubelet') installed.push(`<span class='info'>The kubelet BINARY is now ${ver}, but the running process is still the old one — systemctl restart kubelet makes it take effect.</span>`);
    }
    if (!installed.length) return print('E: no packages given (apt-get install -y kubeadm=VERSION-1.1)', 'err');
    print(installed.join('\n'));
    engine.notify();
  }

  /* ----- kubeadm ----- */

  function upgradePlanTable(target) {
    const rows = engine.list('Node').map((n) =>
      '  ' + pad('kubelet', 12) + pad(n.metadata.name, 16) + pad(n.sim.version, 10) + 'v' + target);
    return pad('  COMPONENT', 14) + pad('NODE', 16) + pad('CURRENT', 10) + 'TARGET\n' + rows.join('\n');
  }

  function cmdKubeadm(print, tokens) {
    if (!state.host) return notOnANode(print, tokens[0]);
    const { args } = parseFlags(tokens.slice(1));
    const p = pkg(state.host);
    if (args[0] === 'version') return print(`kubeadm version: &amp;version.Info{Major:"1", GitVersion:"v${p.kubeadm}"}`);

    if (args[0] === 'certs' && args[1] === 'check-expiration') {
      if (state.host !== 'control-plane') return print('failed to load admin kubeconfig: open /etc/kubernetes/admin.conf: no such file or directory (the certificates live on the control-plane)', 'err');
      const born = bornAt();
      const exp = born + 365 * DAY;
      const residual = Math.round((exp - Date.now()) / DAY) + 'd';
      const line = (name, ca) => pad(name, 27) + pad(fmtDate(exp), 22) + pad(residual, 16) + pad(ca, 24) + 'no';
      print(
        pad('CERTIFICATE', 27) + pad('EXPIRES', 22) + pad('RESIDUAL TIME', 16) + pad('CERTIFICATE AUTHORITY', 24) + 'EXTERNALLY MANAGED\n' +
        [line('admin.conf', 'ca'), line('apiserver', 'ca'), line('apiserver-etcd-client', 'etcd-ca'), line('apiserver-kubelet-client', 'ca'), line('controller-manager.conf', 'ca'), line('etcd-healthcheck-client', 'etcd-ca'), line('etcd-peer', 'etcd-ca'), line('etcd-server', 'etcd-ca'), line('front-proxy-client', 'front-proxy-ca'), line('scheduler.conf', 'ca')].join('\n') +
        '\n\n' + pad('CERTIFICATE AUTHORITY', 27) + pad('EXPIRES', 22) + 'RESIDUAL TIME\n' +
        ['ca', 'etcd-ca', 'front-proxy-ca'].map((c) => pad(c, 27) + pad(fmtDate(born + 3650 * DAY), 22) + Math.round((born + 3650 * DAY - Date.now()) / DAY) + 'd').join('\n'),
      );
      print("<span class='info'>Leaf certs live 1 year (kubeadm renews them on every upgrade), CAs live 10. 'kubeadm certs renew all' would renew by hand; openssl x509 -in CERT -noout -dates inspects a single file.</span>");
      onMission('cert-inspect');
      return;
    }

    if (args[0] !== 'upgrade') return print(`kubeadm: unknown command "${esc(args[0] || '')}" (this sim knows: kubeadm version | upgrade plan|apply vX.Y.Z|node | certs check-expiration)`, 'err');
    const sub = args[1];

    if (sub === 'plan') {
      if (state.host !== 'control-plane') return print(`[preflight] Some fatal errors occurred:\n\t[ERROR] the 'upgrade plan' command runs on a control plane node`, 'err');
      const target = p.kubeadm;
      print(
        `[preflight] Running pre-flight checks.\n[upgrade/config] Reading configuration from the cluster...\n[upgrade/versions] Cluster version: ${state.cpVersion}\n[upgrade/versions] kubeadm version: v${p.kubeadm}\n[upgrade/versions] Target version: v${target}\n\nComponents that must be upgraded manually (with apt + systemctl) after the control plane:\n` +
        upgradePlanTable(target) +
        (target !== K8S_CURRENT
          ? `\n\nUpgrade to the latest stable version:\n${pad('  COMPONENT', 26) + pad('CURRENT', 12) + 'TARGET'}\n  ${pad('kube-apiserver', 24) + pad(state.cpVersion, 12) + 'v' + target}\n\nYou can now apply the upgrade by executing the following command:\n\n        kubeadm upgrade apply v${target}`
          : ''),
      );
      if (target === K8S_CURRENT)
        print(`<span class='info'>This kubeadm (v${p.kubeadm}) can only plan upgrades up to its own version — install the new one first: apt-get install -y kubeadm=${K8S_TARGET}-1.1, then plan again.</span>`);
      onMission('upgrade-plan');
      return;
    }

    if (sub === 'apply') {
      if (state.host !== 'control-plane') return print(`[preflight] Some fatal errors occurred:\n\t[ERROR] 'kubeadm upgrade apply' runs on a control plane node ('kubeadm upgrade node' is the worker command)`, 'err');
      const want = String(args[2] || '').replace(/^v/, '');
      if (!want) return print('kubeadm: usage: kubeadm upgrade apply vX.Y.Z', 'err');
      if (want !== K8S_TARGET) return print(`[upgrade/version] FATAL: this sim's registry only has v${K8S_TARGET}`, 'err');
      if (p.kubeadm !== want)
        return print(`[upgrade/version] FATAL: the specified version to upgrade to "v${want}" is higher than the kubeadm version "v${p.kubeadm}". Upgrade kubeadm first (apt-get install -y kubeadm=${K8S_TARGET}-1.1)`, 'err');
      state.cpVersion = 'v' + want;
      // the control-plane static pods + kube-proxy roll to the new image tags
      for (const pod of engine.list('Pod', { ns: 'kube-system' })) {
        const c = pod.spec.containers[0];
        c.image = c.image.replace(/:v\d+\.\d+\.\d+$/, ':v' + want);
      }
      print(`[upgrade/version] You have chosen to change the cluster version to "v${want}"\n[upgrade/prepull] Pulling images required for setting up a Kubernetes cluster\n[upgrade/staticpods] Moving new manifests to "/etc/kubernetes/manifests" — the kubelet restarts each control-plane pod\n[upgrade/successful] SUCCESS! Your cluster was upgraded to "v${want}". Enjoy!\n[upgrade/kubelet] Now that your control plane is upgraded, please proceed with upgrading your kubelets if you haven't already done so.`, 'ok');
      print("<span class='info'>Check kubectl get nodes — the VERSION column still shows the OLD version! It reports each node's kubelet, and kubeadm does not touch kubelets: apt-get install -y kubelet=" + K8S_TARGET + "-1.1 && systemctl restart kubelet, node by node, draining each first.</span>");
      onMission('upgrade-apply');
      engine.notify();
      return;
    }

    if (sub === 'node') {
      if (state.host === 'control-plane') return print(`[upgrade] this control plane was upgraded with 'kubeadm upgrade apply' — 'kubeadm upgrade node' is for the OTHER nodes`, 'err');
      if (state.cpVersion !== 'v' + K8S_TARGET)
        return print(`[upgrade] FATAL: the control plane is still ${state.cpVersion} — a kubelet must never be newer than the API server. Run 'kubeadm upgrade apply v${K8S_TARGET}' on the control-plane FIRST.`, 'err');
      if (p.kubeadm !== K8S_TARGET)
        return print(`[upgrade] FATAL: this node's kubeadm is v${p.kubeadm} — install the new package first: apt-get install -y kubeadm=${K8S_TARGET}-1.1`, 'err');
      state.nodeConfigUpgraded[state.host] = true;
      print(`[upgrade] Reading configuration from the cluster...\n[upgrade] Upgrading your Static Pod-hosted control plane instance to version "v${K8S_TARGET}"... skipped (not a control plane node)\n[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"\n[upgrade] The configuration for this node was successfully updated!`, 'ok');
      print("<span class='info'>Config updated — the kubelet binary is still old. Finish with: apt-get install -y kubelet=" + K8S_TARGET + "-1.1 && systemctl restart kubelet (node drained, right?), then uncordon.</span>");
      onMission('kubeadm-node:' + state.host);
      engine.notify();
      return;
    }

    print('kubeadm: usage: kubeadm upgrade plan | apply vX.Y.Z | node', 'err');
  }

  /* ----- systemctl ----- */

  function cmdSystemctl(print, tokens) {
    if (!state.host) return notOnANode(print, 'systemctl');
    const sub = tokens[1];
    const unit = tokens[2];
    if (sub === 'daemon-reload') return print('');
    if ((sub === 'status' || sub === 'restart') && unit !== 'kubelet')
      return print(`Unit ${esc(unit || '')}.service could not be found. (the drill only manages the kubelet)`, 'err');
    const n = engine.get('Node', null, state.host);
    const p = pkg(state.host);
    if (sub === 'status') return print(`● kubelet.service - kubelet: The Kubernetes Node Agent\n     Active: active (running)\n     Version: ${n.sim.version} (installed package: v${p.kubelet})`);
    if (sub !== 'restart') return print('systemctl: usage: systemctl daemon-reload | restart kubelet | status kubelet', 'err');
    const before = n.sim.version;
    n.sim.version = 'v' + p.kubelet;
    print(`(kubelet restarted on ${state.host} — now reporting ${n.sim.version})`, 'ok');
    if (n.spec.unschedulable) onMission('kubelet-cordoned:' + state.host);
    else if (n.sim.version !== before)
      print("<span class='info'>You restarted the kubelet on a node that was NOT drained — its pods briefly ran unsupervised. Exam habit: kubectl drain NODE first, uncordon after.</span>");
    if (n.sim.role !== 'control-plane' && p.kubelet === K8S_TARGET && !state.nodeConfigUpgraded[state.host])
      print("<span class='info'>Heads up: this kubelet jumped versions without 'kubeadm upgrade node' — its node config is still the old generation. Run it (order: kubeadm upgrade node, THEN restart the kubelet).</span>");
    engine.notify();
  }

  /* ----- etcdctl / etcdutl ----- */

  function cmdEtcd(print, tokens) {
    const tool = tokens[0];
    if (!state.host) return notOnANode(print, tool);
    if (state.host !== 'control-plane') {
      print('{"level":"warn","msg":"retrying of unary invoker failed","error":"rpc error: code = DeadlineExceeded"}\nError: context deadline exceeded', 'err');
      print("<span class='info'>etcd (and its pki files) live on the control-plane — ssh there.</span>");
      return;
    }
    const { args, flags } = parseFlags(tokens.slice(1));
    if (args[0] === 'version') return print(`${tool} version: 3.6.0\nAPI version: 3.6`);
    if (args[0] !== 'snapshot') return print(`${tool}: unknown command "${esc(args[0] || '')}" (this sim knows: snapshot save|restore|status)`, 'err');
    const sub = args[1];
    const path = args[2];

    if (sub === 'save') {
      if (tool === 'etcdutl') return print("Error: 'save' talks to the LIVE etcd over the network — that is etcdctl's job (etcdutl works on snapshot files)", 'err');
      if (!path) return print('Error: snapshot save requires a file path: etcdctl snapshot save /backup/snap.db --endpoints=… --cacert=… --cert=… --key=…', 'err');
      const missing = ['cacert', 'cert', 'key'].filter((f) => !flags[f]);
      if (missing.length) {
        print('{"level":"warn","msg":"retrying of unary invoker failed","error":"rpc error: code = DeadlineExceeded desc = latest balancer error: connection error: transport: authentication handshake failed"}\nError: context deadline exceeded', 'err');
        print(`<span class='info'>etcd serves TLS and verifies the CLIENT too — this fails without ${missing.map((f) => '--' + f).join(', ')}. The exam-standard flags: --endpoints=https://127.0.0.1:2379 --cacert=${ETCD_PKI}ca.crt --cert=${ETCD_PKI}server.crt --key=${ETCD_PKI}server.key</span>`);
        return;
      }
      const bad = ['cacert', 'cert', 'key'].find((f) => !String(flags[f]).startsWith(ETCD_PKI));
      if (bad) return print(`Error: open ${esc(String(flags[bad]))}: no such file or directory\n<span class='info'>etcd's certs live in ${ETCD_PKI} (ca.crt, server.crt, server.key) — not the general pki dir.</span>`, 'err');
      const data = engine.snapshotStore();
      state.snapshots[path] = { at: Date.now(), objects: data.length, data };
      print(`{"level":"info","msg":"created temporary db file","path":"${esc(path)}.part"}\n{"level":"info","msg":"fetching snapshot","endpoint":"${esc(String(flags.endpoints || 'https://127.0.0.1:2379'))}"}\n{"level":"info","msg":"fetched snapshot","size":"2.1 MB","took":"now"}\nSnapshot saved at ${esc(path)}`, 'ok');
      print("<span class='info'>That file IS the whole cluster: every object (" + data.length + " right now) at this instant. Anything you break after this moment can be rolled back with snapshot restore.</span>");
      onMission('etcd-save');
      engine.notify();
      return;
    }

    if (sub === 'restore') {
      if (tool === 'etcdctl') print("Deprecated: Use `etcdutl snapshot restore` instead. (etcdctl still obliges — but the exam's docs page shows etcdutl.)", 'info');
      if (!path) return print('Error: snapshot restore requires a file path: etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore', 'err');
      const snap = state.snapshots[path];
      if (!snap) return print(`Error: stat ${esc(path)}: no such file or directory (no snapshot was saved at that path)`, 'err');
      const dir = flags['data-dir'];
      if (!dir || dir === '/var/lib/etcd')
        return print(`Error: data-dir "/var/lib/etcd" exists and is not empty\n<span class='info'>Restore unpacks into a NEW directory — pass --data-dir /var/lib/etcd-restore, then point the etcd static pod at it.</span>`, 'err');
      print(`{"level":"info","msg":"restoring snapshot","path":"${esc(path)}","wal-dir":"${esc(String(dir))}/member/wal"}\n{"level":"info","msg":"added member","cluster-id":"cdf818194e3a8c32","local-member-id":"0"}\n{"level":"info","msg":"restored snapshot","path":"${esc(path)}"}`, 'ok');
      engine.restoreStore(snap.data);
      print(`<span class='info'>In a real cluster you would now edit /etc/kubernetes/manifests/etcd.yaml so its hostPath volume points at ${esc(String(dir))} — the kubelet restarts etcd, and the API server sees the OLD data. The sim just did that part: watch the cluster state roll back →</span>`);
      onMission('etcd-restore');
      return;
    }

    if (sub === 'status') {
      const snap = state.snapshots[path || ''];
      if (!snap) return print(`Error: stat ${esc(path || '')}: no such file or directory`, 'err');
      return print(pad('HASH', 12) + pad('REVISION', 10) + pad('TOTAL KEYS', 12) + 'TOTAL SIZE\n' + pad('fe01cf57', 12) + pad('4271', 10) + pad(String(snap.objects), 12) + '2.1 MB');
    }

    print(`${tool}: usage: ${tool} snapshot save|restore|status PATH [flags]`, 'err');
  }

  /* ----- openssl ----- */

  function cmdOpenssl(print, tokens) {
    if (!state.host) return notOnANode(print, 'openssl');
    if (tokens[1] !== 'x509') return print('openssl: this sim only knows: openssl x509 -in CERT.crt -noout -dates|-text', 'err');
    const inIdx = tokens.indexOf('-in');
    const file = inIdx > 0 ? tokens[inIdx + 1] : null;
    if (!file) return print('openssl: usage: openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates', 'err');
    if (state.host !== 'control-plane' || !PKI_CERTS.some((c) => file === '/etc/kubernetes/pki/' + c))
      return print(`Can't open "${esc(file)}" for reading, No such file or directory`, 'err');
    const born = bornAt();
    const isCA = file.endsWith('ca.crt');
    const exp = born + (isCA ? 3650 : 365) * DAY;
    print(`notBefore=${fmtDate(born)} GMT\nnotAfter=${fmtDate(exp)} GMT`);
    print(`<span class='info'>${isCA ? 'CAs get 10 years.' : 'kubeadm issues leaf certs for 1 year — every kubeadm upgrade renews them, so clusters upgraded at least yearly never expire.'} The bulk view is: kubeadm certs check-expiration</span>`);
    onMission('cert-inspect');
  }

  /* ----- kube-bench / harden ----- */

  function cmdKubeBench(print, tokens) {
    if (!state.host) return notOnANode(print, tokens[0]);
    const { flags } = parseFlags(tokens.slice(1));
    const targets = String(flags.targets || 'master,node').split(',');
    if (targets.includes('master') && state.host !== 'control-plane')
      return print("kube-bench: no 'master' checks apply here — ssh control-plane to audit the API server/etcd (or pass --targets=node)", 'err');
    const checks = BENCH_CHECKS.filter((c) => targets.includes(c.target));
    let pass = 0, fail = 0;
    const lines = checks.map((c) => {
      const ok = state.clusterConfig[c.flag] === c.secureWhen;
      ok ? pass++ : fail++;
      return `[${ok ? 'PASS' : 'FAIL'}] ${c.id} ${c.desc} (Automated)`;
    });
    print(`[INFO] Kubernetes CIS Benchmark — targets: ${targets.join(', ')}\n` + lines.join('\n') + `\n\n== Summary ==\n${pass} checks PASS\n${fail} checks FAIL\n0 checks WARN`, fail ? 'err' : 'ok');
    onMission('kube-bench');
    if (checks.length && !fail) onMission('kube-bench-pass:' + targets.join(','));
  }

  function cmdHarden(print, tokens) {
    if (!state.host) return notOnANode(print, tokens[0]);
    const name = tokens[1];
    const val = tokens[2];
    const def = HARDEN_FLAGS[name];
    if (!def || (val !== 'on' && val !== 'off'))
      return print(`usage: harden FLAG on|off  (flags: ${Object.keys(HARDEN_FLAGS).join(', ')})`, 'err');
    if (def.node && state.host !== def.node) return print(`harden: --${name} is a ${def.node} flag — ssh there first`, 'err');
    state.clusterConfig[def.key] = val === 'on';
    print(`(${state.host}) rewrote the static pod manifest: --${name}=${val === 'on'} — the kubelet picks it up automatically`, 'ok');
    onMission('harden:' + name);
    engine.notify();
  }

  /* ----- dispatcher ----- */

  function exec(rawCmd, print) {
    const t = rawCmd.split(/\s+/).filter(Boolean);
    const w = t[0];
    if (w === 'ssh') return cmdSsh(print, t);
    if (w === 'exit' || w === 'logout') return cmdExit(print);
    if (w === 'hostname') return print(state.host || 'exam-terminal');
    if (w === 'apt' || w === 'apt-get') return cmdApt(print, t);
    if (w === 'kubeadm') return cmdKubeadm(print, t);
    if (w === 'systemctl') return cmdSystemctl(print, t);
    if (w === 'etcdctl' || w === 'etcdutl') return cmdEtcd(print, t);
    if (w === 'openssl') return cmdOpenssl(print, t);
    if (w === 'kube-bench') return cmdKubeBench(print, t);
    if (w === 'harden') return cmdHarden(print, t);
    print(`bash: ${esc(w)}: command not found`, 'err');
  }

  return { exec, state, handles: (word) => HANDLED.has(word) };
}
