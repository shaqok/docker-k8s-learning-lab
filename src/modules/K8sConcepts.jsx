import { useRef, useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';
import { CP_INFO } from '../data/cpInfo.js';

const DEMO_NODES = ['node-1', 'node-2', 'node-3'];

const NARR = {
  deployed: 'Already deployed — try the other buttons, or Reset.',
  deploy: '📜 You → API server: <code>Deployment web, replicas: 3</code>. Scheduler assigns each pod to the least-loaded node; kubelets pull the image and start containers (yellow → green).',
  noKill: 'No running pods to kill — deploy first.',
  kill: '💥 A pod just died (node crash, OOM, whatever). Watch: the ReplicaSet controller sees actual=2 &lt; desired=3 and creates a replacement within seconds. <b>You did nothing.</b>',
  deployFirst: 'Deploy first.',
  at6: 'Already at 6.',
  scale: '📈 <code>kubectl scale --replicas=6</code> — one line. Desired state changed from 3→6, controller creates 3 more, scheduler spreads them. Imagine doing this across 500 machines by hand.',
  allV2: 'Everything is already v2 — Reset to replay.',
  update: '🔄 <code>kubectl set image ... app=web:v2</code> — a <b>rolling update</b>: replace pods one at a time (purple = v2), so some replicas always serve traffic. Zero downtime, and <code>rollout undo</code> can reverse it.',
  reset: 'Cluster reset. Start with 1 · Deploy.',
};

const LEGEND_COLORS = ['var(--green)', 'var(--yellow)', 'var(--red)', 'var(--purple)'];

function DemoCluster({ c, lang }) {
  const [pods, setPods] = useState([]);
  const [narr, setNarr] = useState(null); // null → default narrator text from content
  const idRef = useRef(1);
  const podsRef = useRef(pods);
  podsRef.current = pods;

  const setStatus = (id, status) => setPods((ps) => ps.map((p) => (p.id === id ? { ...p, status } : p)));
  const remove = (id) => setPods((ps) => ps.filter((p) => p.id !== id));

  const addPod = (v2 = false, delay = 0) => {
    setTimeout(() => {
      setPods((ps) => {
        const load = (n) => ps.filter((p) => p.node === n && p.status !== 'Terminating').length;
        const node = DEMO_NODES.reduce((a, b) => (load(a) <= load(b) ? a : b));
        const id = idRef.current++;
        setTimeout(() => setStatus(id, 'Running'), 900 + Math.random() * 600);
        return [...ps, { id, node, status: 'ContainerCreating', v2 }];
      });
    }, delay);
  };

  const killPod = (id, cb) => {
    setStatus(id, 'Terminating');
    setTimeout(() => { remove(id); cb && cb(); }, 800);
  };

  const actions = {
    deploy: () => {
      if (podsRef.current.length) return setNarr(NARR.deployed);
      setNarr(NARR.deploy);
      for (let i = 0; i < 3; i++) addPod(false, i * 450);
    },
    kill: () => {
      const victim = podsRef.current.find((p) => p.status === 'Running');
      if (!victim) return setNarr(NARR.noKill);
      setNarr(NARR.kill);
      killPod(victim.id, () => addPod(victim.v2, 200));
    },
    scale: () => {
      if (!podsRef.current.length) return setNarr(NARR.deployFirst);
      const cur = podsRef.current.filter((p) => p.status !== 'Terminating').length;
      if (cur >= 6) return setNarr(NARR.at6);
      setNarr(NARR.scale);
      for (let i = 0; i < 6 - cur; i++) addPod(false, i * 350);
    },
    update: () => {
      const olds = podsRef.current.filter((p) => !p.v2 && p.status === 'Running');
      if (!olds.length) return setNarr(podsRef.current.length ? NARR.allV2 : NARR.deployFirst);
      setNarr(NARR.update);
      const next = () => {
        const p = podsRef.current.find((x) => !x.v2 && x.status === 'Running');
        if (!p) return;
        addPod(true, 0);
        setTimeout(() => killPod(p.id, () => setTimeout(next, 300)), 1100);
      };
      next();
    },
    reset: () => { setPods([]); idRef.current = 1; setNarr(NARR.reset); },
  };

  const demoActions = ['deploy', 'kill', 'scale', 'update', 'reset'];

  return (
    <div className="card">
      <Rich tag="h4" content={c.demoTitle} />
      <Rich tag="p" content={c.demoIntro} />
      <div>
        {demoActions.map((a, i) => (
          <button key={a} className={'act' + (a === 'deploy' ? ' primary' : '')} onClick={actions[a]}>
            <Rich tag="span" content={c.demoBtns[i]} />
          </button>
        ))}
      </div>
      <div className="cluster">
        {DEMO_NODES.map((n) => (
          <div key={n} className="knode">
            <h5>⬢ {n} <span style={{ color: 'var(--muted)' }}>{lang === 'ko' ? '워커' : 'worker'}</span></h5>
            <div className="podbox">
              {pods.filter((p) => p.node === n).map((p) => (
                <div key={p.id} className={'pod ' + p.status + (p.v2 ? ' v2' : '')} title={`web-${p.id} · ${p.status}`}>▣</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="legend">
        {c.legend.map((label, i) => (
          <span key={i}><span className="ldot" style={{ background: LEGEND_COLORS[i] }} />{label}</span>
        ))}
      </div>
      {narr
        ? <Html tag="p" className="hint" html={tr(lang, narr)} />
        : <Rich tag="p" className="hint" content={c.narrator0} />}
    </div>
  );
}

/** Module 3 — cluster anatomy + watch-the-controllers-work animation. */
export default function K8sConcepts() {
  const { lang } = useLang();
  const c = content[lang].m3;
  const [sel, setSel] = useState(null);

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="card">
        <Rich tag="h4" content={c.clusterTitle} />
        <div className="grid2">
          <div>
            {c.cpLabels.map(({ cp, label }) => (
              <div key={cp} className={'cpcomp' + (sel === cp ? ' sel' : '')} onClick={() => setSel(cp)}>
                <Rich tag="span" content={label} />
              </div>
            ))}
          </div>
          <div className="card" style={{ margin: 0 }}>
            {sel ? <Html tag="p" html={CP_INFO[lang][sel]} /> : <Rich content={c.cpEmpty} />}
          </div>
        </div>
      </div>

      <DemoCluster c={c} lang={lang} />
      <PracticeLink
        to="m4"
        blurb={{ en: 'Deploy, kill, scale and roll out for real — with kubectl', ko: '배포·삭제·스케일·롤아웃을 kubectl로 직접 해 보기' }}
      />

      <Rich content={c.objects} />
      <PracticeLink
        to="m10"
        blurb={{ en: 'Now break it on purpose in the Troubleshooting Gym', ko: '이제 트러블슈팅 짐에서 일부러 망가뜨려 보기' }}
      />
    </>
  );
}
