/* Security defense-in-depth layer explanations (m9), CP_INFO pattern:
   per-language HTML strings rendered via Html.jsx. */
export const SEC_LAYERS = {
 en: {
  rbac: "<b>RBAC</b> — who can do what. Roles grant verbs on resources; bindings attach them to users or ServiceAccounts. Every pod runs as a ServiceAccount, so least privilege applies to software too:<br><code>kubectl auth can-i delete pods --as=system:serviceaccount:prod:api</code>",
  podsec: "<b>Pod security</b> — what a running pod may do. <code>securityContext</code>: <code>runAsNonRoot: true</code>, drop capabilities, read-only root FS. Pod Security Standards enforce it per namespace:<br><code>kubectl label ns prod pod-security.kubernetes.io/enforce=restricted</code>",
  netpol: "<b>NetworkPolicy</b> — by default <i>every pod can talk to every pod</i>. NetworkPolicies are firewalls on labels: \"db accepts traffic only from app=api\". The first policy that selects a pod flips it to deny-by-default:<br><code>kubectl get netpol -n prod</code>",
  supply: "<b>Supply chain</b> — what gets into the cluster at all. Scan images (<code>trivy image web:v2</code>), pin digests, sign and verify (<code>cosign verify web@sha256:…</code>), minimal base images — Stage 2's distroless habit pays off here.",
 },
 ko: {
  rbac: "<b>RBAC</b> — 누가 무엇을 할 수 있나. Role이 리소스에 대한 동사를 부여하고, 바인딩이 사용자나 ServiceAccount에 연결합니다. 모든 파드는 ServiceAccount로 실행되므로 최소 권한은 소프트웨어에도 적용됩니다:<br><code>kubectl auth can-i delete pods --as=system:serviceaccount:prod:api</code>",
  podsec: "<b>파드 보안</b> — 실행 중인 파드가 무엇을 할 수 있나. <code>securityContext</code>: <code>runAsNonRoot: true</code>, capability 제거, 읽기 전용 루트 FS. Pod Security Standards가 네임스페이스별로 강제합니다:<br><code>kubectl label ns prod pod-security.kubernetes.io/enforce=restricted</code>",
  netpol: "<b>NetworkPolicy</b> — 기본값으로는 <i>모든 파드가 모든 파드와 통신 가능</i>. NetworkPolicy는 레이블 위의 방화벽: \"db는 app=api 트래픽만 받는다\". 파드를 선택하는 첫 정책이 그 파드를 기본 거부로 바꿉니다:<br><code>kubectl get netpol -n prod</code>",
  supply: "<b>공급망</b> — 애초에 무엇이 클러스터에 들어오나. 이미지 스캔(<code>trivy image web:v2</code>), 다이제스트 고정, 서명·검증(<code>cosign verify web@sha256:…</code>), 최소 베이스 이미지 — 2단계의 distroless 습관이 여기서 빛납니다.",
 },
};
