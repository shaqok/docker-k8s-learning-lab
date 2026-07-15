import { useEffect, useReducer, useRef } from 'react';
import Rich from '../components/Rich.jsx';
import Terminal from '../components/Terminal.jsx';
import Missions from '../components/Missions.jsx';
import ManifestEditor from '../components/ManifestEditor.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { createK8sSim, K8S_NODE_CAP } from '../sims/k8sSim.js';

const GREETING = "kubectl configured for sim-cluster (3 nodes). Type 'help' or start with: kubectl get nodes";

const LEGEND = [
  { color: 'var(--green)', en: 'Running', ko: 'Running' },
  { color: 'var(--yellow)', en: 'Creating', ko: '생성 중' },
  { color: 'var(--red)', en: 'Terminating / crashed', ko: '종료 중 / 크래시' },
  { color: 'var(--purple)', en: 'New revision', ko: '새 리비전' },
];

export function ClusterView({ sim, lang, title }) {
  const { nodes, pods } = sim.view();
  const pending = pods.filter((p) => !p.node && p.status === 'Pending');

  return (
    <div className="statepanel">
      <Rich tag="h4" content={title || content[lang].m4.panelTitles[0]} />
      <div className="cluster" style={{ flexDirection: 'column' }}>
        {nodes.map((n) => {
          const nodePods = pods.filter((p) => p.node === n.name);
          const liveCount = nodePods.filter((p) => p.status !== 'Terminating').length;
          const cp = n.role === 'control-plane';
          const flags = [
            !n.ready && 'NotReady',
            n.unschedulable && 'SchedulingDisabled',
            !cp && n.taints.length > 0 && 'tainted',
          ].filter(Boolean);
          return (
            <div
              key={n.name}
              className={'knode' + (cp ? ' cp' : '') + (!n.ready ? ' notready' : '') + (n.unschedulable ? ' cordoned' : '')}
              style={{ minHeight: 70 }}
            >
              <h5>
                ⬢ {n.name} <span className="role">{n.role}</span>{' '}
                {cp ? (
                  <span style={{ color: 'var(--muted)' }}>— tainted: NoSchedule</span>
                ) : (
                  <span style={{ color: flags.length ? 'var(--yellow)' : 'var(--muted)' }}>
                    {liveCount}/{K8S_NODE_CAP} {lang === 'ko' ? '파드' : 'pods'}
                    {flags.length ? ' · ' + flags.join(' · ') : ''}
                  </span>
                )}
              </h5>
              <div className="podbox">
                {cp ? (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>apiserver · etcd · scheduler · controllers</span>
                ) : (
                  nodePods.map((p) => (
                    <div
                      key={p.name}
                      className={'pod ' + p.status + (p.v2 ? ' v2' : '') + (p.status === 'Running' && !p.ready ? ' notready' : '')}
                      title={`${p.ns}/${p.name} · ${p.status}${p.status === 'Running' && !p.ready ? ' (not ready)' : ''}`}
                    >▣</div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pending.length > 0 && (
        <div className="pendrow show">
          <div className="lbl">{lang === 'ko' ? '⏳ Pending (스케줄 불가 — kubectl get events 로 이유 확인)' : '⏳ Pending (unschedulable — check kubectl get events)'}</div>
          <div className="podbox">
            {pending.map((p) => (
              <div key={p.name} className="pod Pending" title={`${p.ns}/${p.name} · Pending`}>▣</div>
            ))}
          </div>
        </div>
      )}
      <div className="legend">
        {LEGEND.map((l) => (
          <span key={l.en}>
            <span className="ldot" style={{ background: l.color }} />
            {l[lang]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Module 4 — kubectl terminal + manifest editor + live cluster with a real reconciliation loop. */
export default function K8sLab() {
  const { lang } = useLang();
  const { k8sDone, completeMission } = useProgress();
  const c = content[lang].m4;
  const [, bump] = useReducer((x) => x + 1, 0);

  const simRef = useRef(null);
  if (!simRef.current) {
    simRef.current = createK8sSim({ onMission: (id) => completeMission('k8s', id) });
  }
  const sim = simRef.current;

  useEffect(() => {
    const unsub = sim.subscribe(bump);
    const interval = setInterval(() => sim.reconcile(), 800);
    return () => { unsub(); clearInterval(interval); };
  }, [sim]);

  const onCommand = (cmd, print) => {
    sim.exec(cmd, print);
    bump();
  };

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <Missions title={c.missionsTitle} items={c.missions} done={k8sDone} />

      <div className="lab">
        <Terminal headText={c.termHead} placeholder={c.placeholder} greeting={GREETING} onCommand={onCommand} />
        <ClusterView sim={sim} lang={lang} />
      </div>
      <ManifestEditor sim={sim} lang={lang} />
      <Rich tag="p" className="hint" content={c.hint} />
    </>
  );
}
