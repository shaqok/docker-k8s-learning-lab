import { useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TrackBar from './components/TrackBar.jsx';
import { useRoute } from './context/RouteContext.jsx';
import { useProgress } from './context/ProgressContext.jsx';
import { MODULES } from './data/modules.js';
import Roadmap from './modules/Roadmap.jsx';
import Containers101 from './modules/Containers101.jsx';
import DockerLab from './modules/DockerLab.jsx';
import DockerDepth from './modules/DockerDepth.jsx';
import DockerDrills from './modules/DockerDrills.jsx';
import K8sConcepts from './modules/K8sConcepts.jsx';
import K8sLab from './modules/K8sLab.jsx';
import OperatorToolkit from './modules/OperatorToolkit.jsx';
import Production from './modules/Production.jsx';
import GpuModule from './modules/GpuModule.jsx';
import Quiz from './modules/Quiz.jsx';
import Troubleshooting from './modules/Troubleshooting.jsx';
import CkadLabs from './modules/CkadLabs.jsx';
import CkaLabs from './modules/CkaLabs.jsx';
import NetLabs from './modules/NetLabs.jsx';
import OpsLabs from './modules/OpsLabs.jsx';
import PodLabs from './modules/PodLabs.jsx';
import StorageLabs from './modules/StorageLabs.jsx';
import PackagingLabs from './modules/PackagingLabs.jsx';
import SecurityLabs from './modules/SecurityLabs.jsx';
import ObsLabs from './modules/ObsLabs.jsx';
import MockExam from './modules/MockExam.jsx';

/**
 * id → component. The rest of a module's metadata (title, icon, slug, section,
 * prerequisites) lives in data/modules.js; only this map stays here, because a
 * data file can't import JSX components without pulling React into the data layer.
 */
const COMPONENTS = {
  m0: Roadmap,
  m1: Containers101,
  m2: DockerLab,
  m7: DockerDepth,
  m16: DockerDrills,
  m3: K8sConcepts,
  m4: K8sLab,
  m8: OperatorToolkit,
  m9: Production,
  m5: GpuModule,
  m10: Troubleshooting,
  m11: CkadLabs,
  m12: CkaLabs,
  m13: NetLabs,
  m14: OpsLabs,
  m17: PodLabs,
  m18: StorageLabs,
  m19: PackagingLabs,
  m20: SecurityLabs,
  m21: ObsLabs,
  m15: MockExam,
  m6: Quiz,
};

export default function App() {
  const { route, navigate } = useRoute();
  const { markVisited } = useProgress();
  const active = route.id;

  useEffect(() => { window.scrollTo(0, 0); }, [active]);
  // reading modules have no missions, so opening one is what marks it done
  useEffect(() => { markVisited(active); }, [active, markVisited]);

  return (
    <div id="app">
      <Sidebar active={active} setActive={navigate} />
      <main id="main">
        {/* all modules stay mounted so sims keep running & terminals keep history */}
        {MODULES.map(({ id }) => {
          const C = COMPONENTS[id];
          return (
            <section key={id} id={id} className={'module' + (active === id ? ' active' : '')}>
              <C setActive={navigate} />
            </section>
          );
        })}
        <TrackBar active={active} setActive={navigate} />
      </main>
    </div>
  );
}
