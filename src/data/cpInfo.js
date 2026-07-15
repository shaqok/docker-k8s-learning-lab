/* AUTO-GENERATED — control-plane component explanations */
export const CP_INFO={
 en:{
  api:"<b>kube-apiserver</b> — the front door. EVERYTHING (kubectl, controllers, kubelets) talks only to it, via REST. It validates requests and persists state to etcd. No component talks directly to another.",
  etcd:"<b>etcd</b> — a small distributed key-value database. The ONLY place cluster state lives. Lose etcd without backup = lose the cluster's memory.",
  sched:"<b>kube-scheduler</b> — watches for pods with no node assigned, scores every node (free CPU/RAM/GPU, affinity rules, taints), and picks the best one. It only writes the decision — it doesn't start anything.",
  cm:"<b>controller-manager</b> — runs the reconciliation loops. e.g. the ReplicaSet controller: 'desired 3, actual 2 → create 1'. This loop is the heart of Kubernetes' self-healing.",
  kubelet:"<b>kubelet</b> — the agent on every node. Watches the API server for pods assigned to its node, tells the container runtime (containerd) to actually start containers, and reports health back.",
  proxy:"<b>kube-proxy</b> — programs the node's networking rules so Service virtual IPs load-balance to the right pods.",
},
 ko:{
  api:"<b>kube-apiserver</b> — 정문입니다. 모든 것(kubectl, 컨트롤러, kubelet)이 오직 REST로 이 서버와만 대화합니다. 요청을 검증하고 상태를 etcd에 저장합니다. 컴포넌트끼리 직접 대화하지 않습니다.",
  etcd:"<b>etcd</b> — 작은 분산 키-값 데이터베이스. 클러스터 상태가 사는 유일한 곳입니다. 백업 없이 etcd를 잃으면 = 클러스터의 기억을 잃습니다.",
  sched:"<b>kube-scheduler</b> — 노드가 배정되지 않은 파드를 감시하고, 모든 노드를 채점(여유 CPU/RAM/GPU, affinity, taint)한 뒤 최적의 노드를 고릅니다. 결정을 기록만 할 뿐, 직접 실행하지 않습니다.",
  cm:"<b>controller-manager</b> — 조정(reconciliation) 루프를 돌립니다. 예: ReplicaSet 컨트롤러는 '원함 3, 실제 2 → 1개 생성'. 이 루프가 쿠버네티스 자가 치유의 심장입니다.",
  kubelet:"<b>kubelet</b> — 모든 노드의 에이전트. 자기 노드에 배정된 파드를 API 서버에서 감시하고, 컨테이너 런타임(containerd)에 실제 실행을 지시하며, 상태를 보고합니다.",
  proxy:"<b>kube-proxy</b> — Service 가상 IP가 올바른 파드로 로드밸런싱되도록 노드의 네트워크 규칙을 설정합니다.",
}
};
