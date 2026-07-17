import { createK8sSim } from './k8sSim.js';
import { createDockerSim } from './dockerSim.js';

const DOCKER_WORDS = new Set(['docker', 'trivy', 'cosign']);

/**
 * The Supply Chain Security lab needs both engines live at once: build/scan/
 * sign an image in Docker, then have kubectl's admission gate
 * (k8s/imagePolicy.js) refuse to run it until it's clean and signed. One
 * terminal, one shared file store (Dockerfile + k8s manifests coexist);
 * commands route to whichever engine owns their first word.
 *
 * `k8s.engine.docker` is the bolt-on reference imagePolicy.js looks for —
 * every other k8s sim has no such property, so this lab's admission gate is
 * the only place it ever fires.
 */
export function createSupplyChainSim({ starterFiles, onMission = () => {} } = {}) {
  const k8s = createK8sSim({ onMission, starterFiles });
  const docker = createDockerSim({ onMission, files: k8s.files });
  k8s.engine.docker = docker.engine;

  function exec(cmd, print) {
    const word = cmd.trim().split(/\s+/)[0];
    return (DOCKER_WORDS.has(word) ? docker.exec : k8s.exec)(cmd, print);
  }

  return { ...k8s, exec, docker: docker.engine };
}
