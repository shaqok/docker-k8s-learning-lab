/**
 * Doc links per exam domain, for quiz answers.
 *
 * Scenarios and exam tasks carry their own `docs` array, because a specific
 * broken cluster deserves a specific page. A quiz question is narrower than a
 * task but broader than a single page, so it inherits the links for the
 * domains it is tagged with — one table of 16 entries covers the whole bank,
 * and stays correct as questions are added.
 *
 * Deliberately top-level doc pages rather than deep anchors: anchors rot as
 * kubernetes.io restructures, and the skill being taught is "find the page".
 */

export const DOMAIN_DOCS = {
  // CKA
  arch: [
    { label: 'Cluster administration', url: 'https://kubernetes.io/docs/concepts/cluster-administration/' },
    { label: 'kubeadm', url: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/' },
  ],
  workloads: [
    { label: 'Workloads', url: 'https://kubernetes.io/docs/concepts/workloads/' },
    { label: 'Assigning pods to nodes', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/' },
  ],
  storage: [
    { label: 'Persistent volumes', url: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/' },
    { label: 'Storage classes', url: 'https://kubernetes.io/docs/concepts/storage/storage-classes/' },
  ],
  troubleshooting: [
    { label: 'Debug running pods', url: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/' },
    { label: 'Troubleshoot clusters', url: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/' },
  ],
  // shared
  net: [
    { label: 'Services', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
    { label: 'Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
    { label: 'Network policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' },
  ],
  // CKAD
  design: [
    { label: 'Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
    { label: 'Init containers', url: 'https://kubernetes.io/docs/concepts/workloads/pods/init-containers/' },
    { label: 'Jobs', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/job/' },
  ],
  deploy: [
    { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
    { label: 'Declarative management', url: 'https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/' },
  ],
  observe: [
    { label: 'Probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
    { label: 'Monitoring, logging and debugging', url: 'https://kubernetes.io/docs/tasks/debug/' },
  ],
  env: [
    { label: 'ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
    { label: 'Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
    { label: 'Resource management', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' },
  ],
  // CKS
  clusterSetup: [
    { label: 'Securing a cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/' },
    { label: 'CIS benchmark', url: 'https://kubernetes.io/docs/concepts/security/security-checklist/' },
  ],
  clusterHardening: [
    { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
    { label: 'Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
  ],
  systemHardening: [
    { label: 'Security checklist', url: 'https://kubernetes.io/docs/concepts/security/security-checklist/' },
    { label: 'Seccomp', url: 'https://kubernetes.io/docs/tutorials/security/seccomp/' },
  ],
  microserviceVuln: [
    { label: 'Pod security standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
    { label: 'Security context', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/' },
  ],
  supplyChain: [
    { label: 'Supply chain security', url: 'https://kubernetes.io/docs/concepts/security/supply-chain-security/' },
    { label: 'Images', url: 'https://kubernetes.io/docs/concepts/containers/images/' },
  ],
  monitoring: [
    { label: 'Auditing', url: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/' },
    { label: 'Logging architecture', url: 'https://kubernetes.io/docs/concepts/cluster-administration/logging/' },
  ],
  // not on the exams
  foundations: [
    { label: 'Docker: build images', url: 'https://docs.docker.com/build/' },
    { label: 'Docker: storage', url: 'https://docs.docker.com/engine/storage/' },
  ],
};

/**
 * Links for one question, deduped by URL — a question tagged with two domains
 * that share a page should show it once.
 */
export function docsForDomains(domainIds) {
  const seen = new Set();
  const out = [];
  for (const id of domainIds || []) {
    for (const d of DOMAIN_DOCS[id] || []) {
      if (seen.has(d.url)) continue;
      seen.add(d.url);
      out.push(d);
    }
  }
  return out;
}
