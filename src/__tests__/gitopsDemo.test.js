import { describe, it, expect } from 'vitest';
import { initialGitops, gitopsDemoStep, gitopsStatus } from '../data/gitopsDemo.js';

const step = (s, ...actions) => actions.reduce(gitopsDemoStep, s);

describe('gitops demo reducer', () => {
  it('starts synced', () => {
    expect(gitopsStatus(initialGitops())).toBe('synced');
  });

  it('merge-pr changes the repo first; the cluster follows only on sync', () => {
    let s = step(initialGitops(), 'merge-pr');
    expect(s.repo.tag).toBe('v2');
    expect(s.cluster.tag).toBe('v1');
    expect(gitopsStatus(s)).toBe('drifted');
    s = step(s, 'sync');
    expect(s.cluster.tag).toBe('v2');
    expect(gitopsStatus(s)).toBe('synced');
  });

  it('sync reverts a manual kubectl edit back to what git says', () => {
    let s = step(initialGitops(), 'kubectl-edit');
    expect(s.cluster.replicas).toBe(5);
    expect(gitopsStatus(s)).toBe('drifted');
    s = step(s, 'sync');
    expect(s.cluster.replicas).toBe(3);
    expect(gitopsStatus(s)).toBe('synced');
  });

  it('git revert is a rollback: repo back to v1, converged by the same sync', () => {
    let s = step(initialGitops(), 'merge-pr', 'sync', 'git-revert');
    expect(s.repo.tag).toBe('v1');
    expect(s.cluster.tag).toBe('v2');
    expect(gitopsStatus(s)).toBe('drifted');
    s = step(s, 'sync');
    expect(s.cluster.tag).toBe('v1');
    expect(gitopsStatus(s)).toBe('synced');
  });

  it('toggle-autosync only flips the flag; convergence is still an explicit sync', () => {
    let s = step(initialGitops(), 'toggle-autosync', 'kubectl-edit');
    expect(s.autoSync).toBe(true);
    expect(gitopsStatus(s)).toBe('drifted');
    expect(step(s, 'toggle-autosync').autoSync).toBe(false);
  });

  it('ignores unknown actions', () => {
    const s = initialGitops();
    expect(gitopsDemoStep(s, 'nope')).toBe(s);
  });
});
