/**
 * RBAC evaluation over the engine's store — shared by `kubectl auth can-i`
 * and the CKA drill-lab mission checks. Deny-by-default, like the real thing:
 * permission exists only if some bound Role/ClusterRole rule allows it.
 */

/** `--as` string → subject. system:serviceaccount:NS:NAME is a ServiceAccount. */
export function parseAsSubject(as) {
  if (!as) return null;
  const m = String(as).match(/^system:serviceaccount:([^:]+):(.+)$/);
  return m ? { kind: 'ServiceAccount', name: m[2], namespace: m[1] } : { kind: 'User', name: String(as) };
}

const subjectMatches = (s, subject) =>
  s.kind === subject.kind && s.name === subject.name &&
  (s.kind !== 'ServiceAccount' || (s.namespace || 'default') === subject.namespace);

/** Normalize a resource word for comparison: 'Pod'/'pod'/'pods' → 'pods'. */
export const normResource = (r) => {
  const s = String(r || '').toLowerCase().split('.')[0];
  if (s === '*') return '*';
  return s.endsWith('s') ? s : s + 's';
};

const ruleAllows = (rule, verb, resource) =>
  ((rule.verbs || []).includes('*') || (rule.verbs || []).includes(verb)) &&
  ((rule.resources || []).map(normResource).includes('*') || (rule.resources || []).map(normResource).includes(normResource(resource)));

/**
 * Can `subject` do `verb` on `resource` in `ns`?
 * RoleBindings grant inside their namespace (their roleRef may be a Role or a
 * ClusterRole); ClusterRoleBindings grant everywhere.
 */
export function canI(engine, { verb, resource, subject, ns = 'default' }) {
  const rules = [];
  for (const rb of engine.list('RoleBinding', { ns })) {
    if (!(rb.subjects || []).some((s) => subjectMatches(s, subject))) continue;
    const role = rb.roleRef.kind === 'ClusterRole'
      ? engine.get('ClusterRole', null, rb.roleRef.name)
      : engine.get('Role', ns, rb.roleRef.name);
    if (role) rules.push(...(role.rules || []));
  }
  for (const crb of engine.list('ClusterRoleBinding', { all: true })) {
    if (!(crb.subjects || []).some((s) => subjectMatches(s, subject))) continue;
    const role = engine.get('ClusterRole', null, crb.roleRef.name);
    if (role) rules.push(...(role.rules || []));
  }
  return rules.some((r) => ruleAllows(r, verb, resource));
}
