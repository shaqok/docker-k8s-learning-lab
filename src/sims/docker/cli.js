import { esc, pad } from '../util.js';
import { fmtSize } from './catalog.js';
import { buildImage } from './build.js';
import { httpGet } from './network.js';
import { composeUp, composeDown, composeContainers } from './compose.js';

/**
 * The Docker CLI over the v2 engine: parses commands, mutates via the engine,
 * and prints. Command output stays English like the real tool (only teaching
 * asides in <span class='info'> are translatable via the terminal's tr()).
 */
export function createDockerCli(engine, { files, onMission = () => {} }) {
  const state = engine.state;
  const info = (s) => `<span class='info'>${s}</span>`;

  function exec(cmd, print) {
    const t = splitQuoted(cmd.trim()); // quote-aware, so `sh -c 'echo x > f'` stays one arg

    if (t[0] === 'help') return print(HELP, 'info');
    if (t[0] === 'clear') return; // handled by Terminal
    if (t[0] === 'nvidia-smi') return print("bash: nvidia-smi: command not found\n" + info('(This is the host — no GPU here. A container can have one: docker run --gpus all pytorch/pytorch nvidia-smi — see Module 5.)'), 'err');
    if (t[0] === 'curl' || t[0] === 'wget') return hostCurl(cmd, print);
    if (t[0] !== 'docker') return print(`bash: ${esc(t[0])}: command not found (this simulated host speaks docker — try 'help')`, 'err');

    const sub = t[1];
    const rest = t.slice(2);
    switch (sub) {
      case 'pull': return doPull(rest, print);
      case 'build': return doBuild(cmd, rest, print);
      case 'images': return doImages(rest, print);
      case 'run': return doRun(rest, print);
      case 'ps': return doPs(rest, print);
      case 'stop': return doStopStart('stop', rest, print);
      case 'start': return doStopStart('start', rest, print);
      case 'rm': return doRm(rest, print);
      case 'rmi': return doRmi(rest, print);
      case 'logs': return doLogs(rest, print);
      case 'exec': return doExec(rest, print);
      case 'inspect': return doInspect(rest, print);
      case 'tag': return doTag(rest, print);
      case 'push': return doPush(rest, print);
      case 'login': return doLogin(rest, print);
      case 'history': return doHistory(rest, print);
      case 'volume': return doVolume(rest, print);
      case 'network': return doNetwork(rest, print);
      case 'compose': return doCompose(cmd, rest, print);
      case 'image': return doImageSub(cmd, rest, print);
      default: return print(`docker: '${esc(sub || '')}' is not a docker command in this simulator. Try 'help'.`, 'err');
    }
  }

  /* ---------------- pull / images ---------------- */

  function doPull(args, print) {
    const ref = args.find((a) => !a.startsWith('-'));
    if (!ref) return print('"docker pull" requires exactly 1 argument.', 'err');
    const r = engine.pull(ref);
    if (r.error) return print('Error response from daemon: ' + r.error, 'err');
    const name = ref.includes('/') ? ref : 'library/' + ref.split(':')[0];
    print(`Using default tag: latest\nlatest: Pulling from ${name}\n${'a1b2c3d4e5f6'.slice(0, 12)}: Pull complete\nStatus: Downloaded newer image for ${engine.getImage(ref).repo}:${engine.getImage(ref).tag}`);
    onMission('pull');
  }

  function doImages(args, print) {
    const imgs = engine.listImages();
    const head = pad('REPOSITORY', 22) + pad('TAG', 12) + pad('IMAGE ID', 15) + 'SIZE';
    if (!imgs.length) return print(head);
    print(head + '\n' + imgs.map((i) => pad(i.repo, 22) + pad(i.tag, 12) + pad(i.id, 15) + fmtSize(i.size)).join('\n'));
  }

  function doImageSub(cmd, args, print) {
    if (args[0] === 'ls') return doImages(args.slice(1), print);
    if (args[0] === 'history') return doHistory(args.slice(1), print);
    if (args[0] === 'rm') return doRmi(args.slice(1), print);
    return print(`docker image: unknown subcommand '${esc(args[0] || '')}'`, 'err');
  }

  /* ---------------- build ---------------- */

  function doBuild(cmd, args, print) {
    let tag = null, dockerfileName = 'Dockerfile', noCache = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-t' || a === '--tag') tag = args[++i];
      else if (a === '-f' || a === '--file') dockerfileName = args[++i];
      else if (a === '--no-cache') noCache = true;
    }
    const dockerfile = files ? files.read(dockerfileName) : null;
    if (dockerfile == null) return print(`ERROR: failed to read ${dockerfileName}: no such file in the build context (edit it in the Manifests pane)`, 'err');

    const contextFiles = new Map();
    if (files) for (const n of files.list()) contextFiles.set(n, files.read(n));

    const res = buildImage(engine, { dockerfile, tag, contextFiles, noCache });
    if (res.error) return print('ERROR: ' + res.error, 'err');

    const n = res.steps.length;
    print(`<span class='ok'>[+] Building (${n}/${n}) FINISHED</span>`);
    let cachedCount = 0;
    res.steps.forEach((s, i) => {
      if (s.cached) cachedCount++;
      const marker = s.cached ? "<span class='ok'>CACHED</span> " : '';
      print(` => ${marker}[${i + 1}/${n}] ${esc(s.instr)}` + rightPad(s, i, n));
    });
    print(` => exporting to image`);
    print(` => => naming to ${res.image.repo}:${res.image.tag}  (${res.image.id})`);
    print(`<span class='ok'>Successfully tagged ${res.image.repo}:${res.image.tag}</span> — final image size <b>${fmtSize(res.image.size)}</b>`);
    if (cachedCount) print(info(`${cachedCount} layer(s) reused from cache — that's why the rebuild was fast. Change an early instruction and watch the cache below it disappear.`));
    onMission('build');
    if (cachedCount) onMission('build-cached');
    if (res.image.size < 60) onMission('slim-image');
    if (/FROM[\s\S]+FROM/i.test(dockerfile)) onMission('multistage');
  }
  const rightPad = (s, i, n) => (s.base || s.sizeMB ? '  ' + info(fmtSize(s.sizeMB)) : '');

  /* ---------------- run ---------------- */

  function parseRun(args) {
    const o = { ports: [], env: {}, mounts: [], networks: [], netAliases: [], command: [] };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-d' || a === '--detach') o.detach = true;
      else if (a === '--name') o.name = args[++i];
      else if (a === '-p' || a === '--publish') { const [h, c] = args[++i].split(':'); o.ports.push({ host: h, container: parseInt(c || h, 10), proto: 'tcp' }); }
      else if (a === '-e' || a === '--env') { const kv = args[++i]; const eq = kv.indexOf('='); o.env[kv.slice(0, eq)] = kv.slice(eq + 1); }
      else if (a === '-v' || a === '--volume') { const [src, tgt] = args[++i].split(':'); o.mounts.push({ type: src.startsWith('/') || src.startsWith('.') ? 'bind' : 'volume', source: src, target: tgt || src }); }
      else if (a === '--network' || a === '--net') o.networks.push(args[++i]);
      else if (a === '--network-alias') o.netAliases.push(args[++i]);
      else if (a === '--gpus') { o.gpus = true; i++; }
      else if (a === '-it' || a === '-i' || a === '-t' || a === '--rm' || a === '-itd' || a === '-dit') { if (a.includes('d')) o.detach = true; }
      else if (a.startsWith('-')) { /* ignore unknown single flags */ }
      else if (!o.image) o.image = a;
      else o.command.push(a);
    }
    return o;
  }

  function doRun(args, print) {
    const o = parseRun(args);
    if (!o.image) return print('"docker run" requires at least 1 argument (an image).', 'err');
    if (!engine.getImage(o.image)) {
      const r = engine.pull(o.image);
      if (r.error) return print(`Unable to find image '${o.image}' locally\ndocker: Error response from daemon: ${r.error}.`, 'err');
      print(`Unable to find image '${engine.getImage(o.image).repo}:${engine.getImage(o.image).tag}' locally\nlatest: Pulling from library/${o.image.split(':')[0]}\nStatus: Downloaded newer image`);
    }
    // GPU teaching path (unchanged behavior)
    if (o.command[0] === 'nvidia-smi') return gpuSmi(o, print);

    const r = engine.createContainer(o);
    if (r.error) return print('docker: Error response from daemon: ' + r.error, 'err');
    const c = r.container;

    if (c.status === 'exited' && !o.detach) {
      print((c.logs.join('\n')) || '(container ran its command and exited)');
      print(info(`${c.image} ran its command and exited — a container lives only as long as its main process (PID 1).`));
    } else if (o.detach) print(c.id);
    else { print(c.logs.map(esc).join('\n')); print(info("(attached — simulator detaches for you; use -d next time)")); }

    if (o.detach && o.ports.length && o.name) onMission('run');
    if (o.mounts.some((m) => m.type === 'volume')) onMission('run-volume');
    if (o.networks.length) onMission('run-network');
    engine.changed();
  }

  function gpuSmi(o, print) {
    engine.createContainer({ ...o, command: ['nvidia-smi'] });
    if (o.gpus) print("<span class='ok'>+---------------------------------------------------------------+\n| NVIDIA-SMI 560.35   Driver 560.35   CUDA 12.6                 |\n|  0  NVIDIA A100 80GB   0MiB / 81920MiB   0%                   |\n+---------------------------------------------------------------+</span>\n" + info('The toolkit injected the host driver + /dev/nvidia0. The image carries the CUDA runtime; the driver came from the host.'));
    else print("OCI runtime exec failed: nvidia-smi: no NVIDIA driver detected\n" + info('No --gpus flag → no driver injection → the container is blind to the GPU. Retry with --gpus all'), 'err');
  }

  /* ---------------- ps / lifecycle ---------------- */

  function doPs(args, print) {
    const all = args.includes('-a') || args.includes('--all');
    const list = engine.listContainers(all);
    const head = pad('CONTAINER ID', 15) + pad('IMAGE', 20) + pad('STATUS', 16) + pad('PORTS', 24) + 'NAMES';
    print(head + '\n' + list.map((c) => {
      const ports = c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`).join(', ');
      return pad(c.id.slice(0, 12), 15) + pad(c.image, 20) + pad(c.status === 'running' ? 'Up 2 minutes' : `Exited (${c.exitCode}) 1 min ago`, 16) + pad(ports, 24) + c.name;
    }).join('\n'));
    if (list.some((c) => c.status === 'running')) onMission('ps');
    if (!all && engine.state.containers.some((c) => c.status === 'exited')) print(info('(exited containers are hidden — docker ps -a shows them)'));
  }

  function doStopStart(kind, args, print) {
    const ref = args.find((a) => !a.startsWith('-'));
    const r = kind === 'stop' ? engine.stopContainer(ref) : engine.startContainer(ref);
    if (r.error) return print('Error response from daemon: ' + r.error, 'err');
    print(r.name);
  }

  function doRm(args, print) {
    const force = args.includes('-f') || args.includes('--force');
    const refs = args.filter((a) => !a.startsWith('-'));
    for (const ref of refs) {
      const r = engine.removeContainer(ref, force);
      if (r.error) print('Error response from daemon: ' + r.error, 'err');
      else print(r.name);
    }
    if (!engine.state.containers.length) onMission('clean');
  }

  function doRmi(args, print) {
    const refs = args.filter((a) => !a.startsWith('-'));
    for (const ref of refs) {
      const r = engine.removeImage(ref);
      if (r.error) print('Error response from daemon: ' + r.error, 'err');
      else print(`Untagged: ${r.untagged}\nDeleted: sha256:${r.deleted}`);
    }
  }

  function doLogs(args, print) {
    const ref = args.filter((a) => !a.startsWith('-')).pop();
    const c = engine.find(ref || '');
    if (!c) return print(`Error: No such container: ${esc(ref || '')}`, 'err');
    print(esc(c.logs.join('\n')) || '(no logs)');
    onMission('logs');
  }

  function doExec(args, print) {
    const a = args.filter((x) => x !== '-it' && x !== '-i' && x !== '-t');
    const c = engine.find(a[0] || '');
    if (!c) return print(`Error: No such container: ${esc(a[0] || '')}`, 'err');
    if (c.status !== 'running') return print(`Error response from daemon: container ${esc(a[0])} is not running`, 'err');
    onMission('exec');
    const inner = a.slice(1);
    return runInContainer(c, inner, print);
  }

  /** A tiny in-container shell: ls, cat, echo > file, and curl/wget by DNS name. */
  function runInContainer(c, argv, print) {
    // unwrap `sh -c "..."`
    if ((argv[0] === 'sh' || argv[0] === 'bash') && argv[1] === '-c') argv = splitQuoted(argv.slice(2).join(' '));
    const cmd = argv[0];
    const rest = argv.slice(1);

    if (cmd === 'curl' || cmd === 'wget') {
      const url = rest.find((x) => !x.startsWith('-')) || '';
      const r = httpGet(engine, c, url);
      if (r.ok) { print(esc(r.body)); onMission('net-dns'); }
      else print(r.error, 'err');
      return;
    }
    if (cmd === 'ls') {
      const path = rest.find((x) => !x.startsWith('-')) || '/';
      const names = engine.listDir(c, path);
      if (path === '/' || !names.length) return print('bin   dev   etc   home   proc   root   sys   tmp   usr   var' + (names.length ? '   ' + names.join('   ') : '') + '\n' + info("that's the container's own filesystem — image layers + writable layer (+ any mounted volume)."));
      return print(names.join('   '));
    }
    if (cmd === 'cat') {
      const path = rest[0]; const content = engine.readFile(c, path);
      if (content == null) return print(`cat: ${esc(path)}: No such file or directory`, 'err');
      if (engine.storeFor(c, path).mount) onMission('vol-read'); // read back from a mounted volume
      return print(esc(content));
    }
    // echo TEXT > /path  (also handles `echo TEXT >> path`)
    if (cmd === 'echo') {
      const redir = rest.indexOf('>') >= 0 ? rest.indexOf('>') : rest.indexOf('>>');
      if (redir >= 0) { const path = rest[redir + 1]; const text = rest.slice(0, redir).join(' ').replace(/^["']|["']$/g, ''); engine.writeFile(c, path, text); onMission('write-file'); return print(''); }
      return print(esc(rest.join(' ')));
    }
    if (cmd === 'env') return print(Object.entries(c.env).map(([k, v]) => `${k}=${v}`).join('\n') || '(no env)');
    if (cmd === 'ps') return print("PID   USER   COMMAND\n1     root   " + esc(c.command || 'sh') + "\n" + info('PID 1 inside — the PID namespace hides every other host process.'));
    print("(simulated) executed '" + esc(argv.join(' ')) + "' inside " + esc(c.name));
    onMission('exec');
  }

  function doInspect(args, print) {
    const ref = args.filter((a) => !a.startsWith('-')).pop();
    const c = engine.find(ref || '');
    if (c) {
      const net = Object.entries(c.networks)[0];
      return print(esc(JSON.stringify({
        Id: c.id.slice(0, 12), Name: '/' + c.name, Image: c.image,
        State: { Status: c.status, Pid: c.status === 'running' ? 12847 : 0 },
        Mounts: c.mounts.map((m) => ({ Type: m.type, Source: m.source, Destination: m.target })),
        NetworkSettings: { Networks: Object.fromEntries(Object.entries(c.networks).map(([n, e]) => [n, { IPAddress: e.ip }])) },
      }, null, 2)));
    }
    const img = engine.getImage(ref || '');
    if (img) return print(esc(JSON.stringify({ Id: img.id, RepoTags: [img.repo + ':' + img.tag], Size: img.size + 'MB', Config: img.config }, null, 2)));
    print(`Error: No such object: ${esc(ref || '')}`, 'err');
  }

  /* ---------------- registry: tag / push / login / history ---------------- */

  function doTag(args, print) {
    const [src, dst] = args.filter((a) => !a.startsWith('-'));
    if (!src || !dst) return print('"docker tag" requires exactly 2 arguments.', 'err');
    const r = engine.tagImage(src, dst);
    if (r.error) return print('Error response from daemon: ' + r.error, 'err');
    onMission('tag');
    print('');
  }

  function doPush(args, print) {
    const ref = args.find((a) => !a.startsWith('-'));
    const img = engine.getImage(ref || '');
    if (!img) return print(`An image does not exist locally with the tag: ${esc(ref || '')}`, 'err');
    if (!state.loggedIn && /\//.test(img.repo)) print(info('(pushing to a private repo usually needs docker login first)'));
    print(`The push refers to repository [${img.repo}]\n${img.layers.map((l) => l.id + ': Pushed').join('\n')}\n${img.tag}: digest: sha256:${img.id}${img.id} size: ${img.layers.length * 528}`);
    onMission('push');
  }

  function doLogin(args, print) {
    state.loggedIn = args.find((a) => !a.startsWith('-')) || 'docker.io';
    print('Login Succeeded');
    onMission('login');
  }

  function doHistory(args, print) {
    const ref = args.filter((a) => !a.startsWith('-')).pop();
    const img = engine.getImage(ref || '');
    if (!img) return print(`Error: No such image: ${esc(ref || '')}`, 'err');
    print(pad('CREATED BY', 46) + 'SIZE\n' + [...img.layers].reverse().map((l) => pad(esc(l.instr).slice(0, 44), 46) + fmtSize(l.sizeMB)).join('\n'));
  }

  /* ---------------- volume ---------------- */

  function doVolume(args, print) {
    const sub = args[0];
    if (sub === 'create') { const name = args[1] || 'vol_' + Math.random().toString(36).slice(2, 8); engine.createVolume(name); onMission('volume-create'); return print(name); }
    if (sub === 'ls') { const vs = [...state.volumes.values()]; return print(pad('DRIVER', 10) + 'VOLUME NAME\n' + vs.map((v) => pad('local', 10) + v.name).join('\n')); }
    if (sub === 'rm') { const r = engine.removeVolume(args[1]); return r.error ? print('Error response from daemon: ' + r.error, 'err') : print(r.name); }
    if (sub === 'inspect') { const v = state.volumes.get(args[1]); return v ? print(esc(JSON.stringify({ Name: v.name, Driver: 'local', Mountpoint: `/var/lib/docker/volumes/${v.name}/_data` }, null, 2))) : print(`Error: No such volume: ${esc(args[1] || '')}`, 'err'); }
    print(`docker volume: unknown subcommand '${esc(sub || '')}'`, 'err');
  }

  /* ---------------- network ---------------- */

  function doNetwork(args, print) {
    const sub = args[0];
    if (sub === 'create') { const name = args.filter((a) => !a.startsWith('-')).pop(); const r = engine.createNetwork(name); return r.error ? print('Error response from daemon: ' + r.error, 'err') : (onMission('network-create'), print(r.id)); }
    if (sub === 'ls') { const ns = [...state.networks.values()]; return print(pad('NETWORK ID', 14) + pad('NAME', 20) + pad('DRIVER', 10) + 'SCOPE\n' + ns.map((n) => pad('a' + n.name.slice(0, 11), 14) + pad(n.name, 20) + pad(n.driver, 10) + 'local').join('\n')); }
    if (sub === 'rm') { const r = engine.removeNetwork(args[1]); return r.error ? print('Error response from daemon: ' + r.error, 'err') : print(r.name); }
    if (sub === 'connect') { const r = engine.connect(args[1], args[2]); return r.error ? print('Error response from daemon: ' + r.error, 'err') : print(''); }
    if (sub === 'disconnect') { const r = engine.disconnect(args[1], args[2]); return r.error ? print('Error response from daemon: ' + r.error, 'err') : print(''); }
    if (sub === 'inspect') { const n = state.networks.get(args[1]); return n ? print(esc(JSON.stringify({ Name: n.name, Driver: n.driver, Containers: [...n.containers].length }, null, 2))) : print(`Error: No such network: ${esc(args[1] || '')}`, 'err'); }
    print(`docker network: unknown subcommand '${esc(sub || '')}'`, 'err');
  }

  /* ---------------- compose ---------------- */

  function doCompose(cmd, args, print) {
    // allow `-p project` and `-f file`
    let project = 'app', file = 'compose.yaml';
    const positional = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-p' || args[i] === '--project-name') project = args[++i];
      else if (args[i] === '-f' || args[i] === '--file') file = args[++i];
      else positional.push(args[i]);
    }
    const action = positional[0];
    if (action === 'up') {
      const text = files && (files.read(file) ?? files.read('docker-compose.yaml'));
      if (text == null) return print(`no configuration file provided: ${file} not found (edit it in the Manifests pane)`, 'err');
      const builder = (svc, s) => { // support build: services by building their Dockerfile
        const df = files.read(s.build?.dockerfile || 'Dockerfile');
        if (df == null) return { error: 'no Dockerfile for build' };
        const ctx = new Map(files.list().map((n) => [n, files.read(n)]));
        const r = buildImage(engine, { dockerfile: df, tag: `${project}-${svc}`, contextFiles: ctx });
        return r.error ? { error: r.error } : { tag: `${project}-${svc}:latest` };
      };
      const r = composeUp(engine, project, text, { detach: positional.includes('-d') || true, build: builder });
      if (r.error) return print('Error: ' + r.error, 'err');
      for (const c of r.created) print(`<span class='ok'>✔ Container ${c.container.name}  Started</span>`);
      for (const e of r.errors) print('Error: ' + e, 'err');
      if (r.created.length) print(info(`Network ${r.network} created; services reach each other by name (web → api) over it. Data lives in named volumes that survive 'compose down'.`));
      if (r.created.length && !r.errors.length) onMission('compose-up');
      return;
    }
    if (action === 'down') { const r = composeDown(engine, project); r.removed.forEach((n) => print(`<span class='ok'>✔ Container ${n}  Removed</span>`)); print(`<span class='ok'>✔ Network ${project}_default  Removed</span>`); onMission('compose-down'); return; }
    if (action === 'ps') {
      const cs = composeContainers(engine, project);
      return print(pad('NAME', 20) + pad('IMAGE', 18) + pad('STATUS', 14) + 'PORTS\n' + cs.map((c) => pad(c.name, 20) + pad(c.image, 18) + pad(c.status === 'running' ? 'running' : 'exited', 14) + c.ports.map((p) => `${p.host}->${p.container}`).join(',')).join('\n'));
    }
    if (action === 'logs') { const cs = composeContainers(engine, project); return print(cs.map((c) => c.logs.map((l) => `${c.name}  | ${esc(l)}`).join('\n')).join('\n') || '(no logs)'); }
    print(`docker compose: unknown command '${esc(action || '')}'`, 'err');
  }

  /* ---------------- host-side curl ---------------- */

  function hostCurl(cmd, print) {
    const url = cmd.split(/\s+/).slice(1).find((a) => !a.startsWith('-')) || '';
    const r = httpGet(engine, null, url);
    if (r.ok) print(esc(r.body) + '\n' + info(`← a container answered on that published port 🎉`));
    else print(`curl: (7) ${r.error}`, 'err');
  }

  return { exec, state };
}

function splitQuoted(s) {
  const out = []; let m;
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const HELP = "Commands:\n  docker pull|images|run|ps|stop|start|rm|rmi|logs|exec|inspect\n  docker build -t name .   (edit the Dockerfile in the Manifests pane)\n  docker tag|push|login|history\n  docker volume create|ls|rm|inspect\n  docker network create|ls|rm|connect|disconnect\n  docker compose up|down|ps|logs\n  curl localhost:PORT , nvidia-smi , clear\nExample: docker build -t web . && docker run -d -p 8080:80 --name web web";
