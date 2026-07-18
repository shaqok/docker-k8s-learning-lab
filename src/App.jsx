import { useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import { useRoute } from './context/RouteContext.jsx';
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

const MODULES = [
  { id: 'm0', C: Roadmap },
  { id: 'm1', C: Containers101 },
  { id: 'm2', C: DockerLab },
  { id: 'm7', C: DockerDepth },
  { id: 'm16', C: DockerDrills },
  { id: 'm3', C: K8sConcepts },
  { id: 'm4', C: K8sLab },
  { id: 'm8', C: OperatorToolkit },
  { id: 'm9', C: Production },
  { id: 'm5', C: GpuModule },
  { id: 'm10', C: Troubleshooting },
  { id: 'm11', C: CkadLabs },
  { id: 'm12', C: CkaLabs },
  { id: 'm13', C: NetLabs },
  { id: 'm14', C: OpsLabs },
  { id: 'm17', C: PodLabs },
  { id: 'm18', C: StorageLabs },
  { id: 'm19', C: PackagingLabs },
  { id: 'm20', C: SecurityLabs },
  { id: 'm21', C: ObsLabs },
  { id: 'm15', C: MockExam },
  { id: 'm6', C: Quiz },
];

export default function App() {
  const { route, navigate } = useRoute();
  const active = route.id;

  useEffect(() => { window.scrollTo(0, 0); }, [active]);

  return (
    <div id="app">
      <Sidebar active={active} setActive={navigate} />
      <main id="main">
        {/* all modules stay mounted so sims keep running & terminals keep history */}
        {MODULES.map(({ id, C }) => (
          <section key={id} id={id} className={'module' + (active === id ? ' active' : '')}>
            <C setActive={navigate} />
          </section>
        ))}
      </main>
    </div>
  );
}
