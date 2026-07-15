import { useReducer, useRef } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import Terminal from '../components/Terminal.jsx';
import Missions from '../components/Missions.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';
import { createDockerSim } from '../sims/dockerSim.js';

const GREETING = "Simulated Docker engine ready. Type 'help' or start with: docker pull nginx";

/** Module 2 — simulated Docker engine with live image/container panels. */
export default function DockerLab() {
  const { lang } = useLang();
  const { dockerDone, completeMission } = useProgress();
  const c = content[lang].m2;
  const [, bump] = useReducer((x) => x + 1, 0);

  const simRef = useRef(null);
  if (!simRef.current) {
    simRef.current = createDockerSim({
      onChange: () => {},
      onMission: (id) => completeMission('docker', id),
    });
  }
  const sim = simRef.current;

  const onCommand = (cmd, print) => {
    sim.exec(cmd, print);
    bump(); // re-render panels after every command
  };

  const images = sim.engine.listImages();
  const containers = sim.state.containers;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <Missions title={c.missionsTitle} items={c.missions} done={dockerDone} />

      <div className="lab">
        <Terminal headText={c.termHead} placeholder={c.placeholder} greeting={GREETING} onCommand={onCommand} />
        <div>
          <div className="statepanel">
            <Rich tag="h4" content={c.panelTitles[0]} />
            {images.length ? (
              images.map((i) => (
                <span key={i.repo + ':' + i.tag} className="img-chip">
                  {i.repo}:{i.tag} <span className="sz">{sim.engine.fmtSize(i.size)}</span>
                </span>
              ))
            ) : (
              <Html tag="span" className="empty" html={tr(lang, 'none — try docker pull nginx')} />
            )}
          </div>
          <div className="statepanel" style={{ marginTop: 12 }}>
            <Rich tag="h4" content={c.panelTitles[1]} />
            {containers.length ? (
              containers.map((ct) => (
                <div key={ct.id} className={'ctr-card' + (ct.status === 'exited' ? ' exited' : '') + (ct.gpus ? ' gpu' : '')}>
                  <b>{ct.name}</b> <span className={'tag ' + (ct.status === 'running' ? 'g' : 'r')}>{ct.status}</span>
                  {ct.gpus && <span className="tag" style={{ background: 'rgba(118,185,0,.15)', color: 'var(--nvidia)' }}>GPU</span>}
                  <div className="cid">
                    {ct.id.slice(0, 12)} · {ct.image}
                    {ct.ports && ct.ports.length ? ' · ' + ct.ports.map((p) => `${p.host}→${p.container}`).join(',') : ''}
                  </div>
                </div>
              ))
            ) : (
              <Html tag="span" className="empty" html={tr(lang, 'none running')} />
            )}
          </div>
        </div>
      </div>
      <Rich tag="p" className="hint" content={c.hint} />
    </>
  );
}
