/**
 * Pure state machine behind m9's GitOps loop widget. The repo holds desired
 * state, the cluster holds actual state; nothing converges on its own — the
 * widget (or the auto-sync timer it runs) must dispatch 'sync', mirroring how
 * an Argo/Flux agent is the only thing that writes to the cluster.
 */
export const initialGitops = () => ({
  repo: { tag: 'v1', replicas: 3 },
  cluster: { tag: 'v1', replicas: 3 },
  autoSync: false,
});

export function gitopsDemoStep(state, action) {
  switch (action) {
    case 'merge-pr':
      return { ...state, repo: { ...state.repo, tag: 'v2' } };
    case 'git-revert':
      return { ...state, repo: { ...state.repo, tag: 'v1' } };
    case 'kubectl-edit':
      return { ...state, cluster: { ...state.cluster, replicas: 5 } };
    case 'sync':
      return { ...state, cluster: { ...state.repo } };
    case 'toggle-autosync':
      return { ...state, autoSync: !state.autoSync };
    default:
      return state;
  }
}

export const gitopsStatus = (s) =>
  s.repo.tag === s.cluster.tag && s.repo.replicas === s.cluster.replicas ? 'synced' : 'drifted';
