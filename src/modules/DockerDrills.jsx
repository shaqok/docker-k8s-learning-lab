import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { createDockerSim } from '../sims/dockerSim.js';
import { DOCKER_LABS } from '../data/dockerLabs.js';

/** Live state panel for the Docker drills: images (with layer count + size), containers, volumes, networks. */
function DockerPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const images = engine.listImages();
  const containers = sim.state.containers;
  const volumes = [...sim.state.volumes.values()];
  const networks = [...sim.state.networks.values()].filter((n) => !n.builtin);

  return (
    <div className="statepanel">
      <h4>{c.panelImages}</h4>
      {images.length ? images.map((i) => (
        <div key={i.repo + ':' + i.tag} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🧊 {i.repo}:{i.tag}</span>
            <span className={'ckad-chip ' + (i.size < 60 ? 'ok' : i.size > 800 ? 'warn' : 'on')}>{engine.fmtSize(i.size)}</span>
          </div>
          <div className="ckad-row-body"><span className="ckad-muted">{i.layers.length} {lang === 'ko' ? '레이어' : 'layers'}</span></div>
        </div>
      )) : <div className="ckad-muted">{lang === 'ko' ? '아직 이미지가 없습니다 — docker build 또는 pull' : 'no images yet — docker build or pull'}</div>}

      <h4 style={{ marginTop: 12 }}>{c.panelContainers}</h4>
      {containers.length ? containers.map((ct) => (
        <div key={ct.id} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">📦 {ct.name}</span>
            <span className={'ckad-chip ' + (ct.status === 'running' ? 'ok' : 'warn')}>{ct.status}</span>
          </div>
          <div className="ckad-row-body">
            <span className="ckad-muted">{ct.image}</span>
            {ct.mounts.filter((m) => m.type === 'volume').map((m) => <span key={m.source} className="ckad-chip on">💾 {m.source}</span>)}
            {Object.keys(ct.networks).filter((n) => n !== 'bridge').map((n) => <span key={n} className="ckad-chip on">🕸 {n}</span>)}
          </div>
        </div>
      )) : <div className="ckad-muted">{lang === 'ko' ? '실행 중인 컨테이너 없음' : 'no containers'}</div>}

      {(volumes.length > 0 || networks.length > 0) && (
        <>
          <h4 style={{ marginTop: 12 }}>{c.panelInfra}</h4>
          {volumes.map((v) => (
            <div key={v.name} className="ckad-ep">
              💾 <code>{v.name}</code> <span className="ckad-muted">{v.data.size ? `${v.data.size} ${lang === 'ko' ? '파일' : 'file(s)'}` : (lang === 'ko' ? '비어 있음' : 'empty')}</span>
            </div>
          ))}
          {networks.map((n) => (
            <div key={n.name} className="ckad-ep">
              🕸 <code>{n.name}</code> <span className="ckad-muted">{n.containers.size} {lang === 'ko' ? '연결됨' : 'attached'}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Module 16 — Docker drills: build/cache, multi-stage, volumes, networks, compose (plan step 12). */
export default function DockerDrills() {
  const { lang } = useLang();
  const { dockerDrillDone, completeDockerMission, resetDockerLab } = useProgress();
  const c = content[lang].m16;
  const [sub, setTab] = useSubRoute('m16', (id) => DOCKER_LABS.some((l) => l.id === id));
  const tab = sub ?? DOCKER_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {DOCKER_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {DOCKER_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={DockerPanel}
            done={dockerDrillDone[lab.id] || []}
            complete={(mid) => completeDockerMission(lab.id, mid)}
            reset={() => resetDockerLab(lab.id)}
            createSim={createDockerSim}
            editorCmdHint="docker build -t app ."
            termPlaceholder="docker build -t app ."
          />
        </div>
      ))}
    </>
  );
}
