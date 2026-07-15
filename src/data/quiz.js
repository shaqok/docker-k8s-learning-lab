/**
 * Quiz v2 — one bilingual bank, every question tagged with exam-domain ids
 * from examDomains.js (`d`). 'foundations' questions are the original
 * Docker/GPU material and count toward neither exam; everything else feeds
 * the per-domain accuracy that the readiness dashboard reads.
 * Shape: { d: [domainId…], q: {en,ko}, a: {en:[…],ko:[…]}, c: correctIndex, why: {en,ko} }
 */

export const QUIZ_BANK = [
  // ── the original 16 ────────────────────────────────────────────────────
  {
    d: ['foundations'],
    q: { en: 'A container is best described as…', ko: '컨테이너를 가장 잘 설명한 것은?' },
    a: {
      en: ['A lightweight virtual machine with its own kernel', 'A normal process isolated by namespaces and limited by cgroups', 'A zip file of an application', 'A type of hypervisor'],
      ko: ['자체 커널을 가진 가벼운 가상 머신', '네임스페이스로 격리되고 cgroups로 제한된 평범한 프로세스', '애플리케이션을 압축한 zip 파일', '하이퍼바이저의 일종'],
    },
    c: 1,
    why: {
      en: "No guest OS, no hypervisor — just a kernel-isolated process. That's why it starts in milliseconds.",
      ko: '게스트 OS도 하이퍼바이저도 없습니다 — 커널이 격리해 주는 프로세스일 뿐. 그래서 밀리초 만에 시작합니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'An image vs a container:', ko: '이미지 vs 컨테이너:' },
    a: {
      en: ['Same thing, two names', 'Image = running instance, container = template', 'Image = read-only layered template; container = image + writable layer, running', 'Containers are stored in registries'],
      ko: ['같은 것의 두 이름', '이미지 = 실행 인스턴스, 컨테이너 = 템플릿', '이미지 = 읽기 전용 레이어 템플릿; 컨테이너 = 이미지 + 쓰기 레이어, 실행 중', '컨테이너는 레지스트리에 저장된다'],
    },
    c: 2,
    why: {
      en: 'Class vs object. Registries store images, not containers.',
      ko: '클래스 vs 객체. 레지스트리에는 컨테이너가 아니라 이미지가 저장됩니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'You run docker stop web then docker rm web. What survives?', ko: 'docker stop web 후 docker rm web. 살아남는 것은?' },
    a: {
      en: ["The container's writable layer", 'Files the app wrote inside the container', 'The nginx image', 'Nothing at all'],
      ko: ['컨테이너의 쓰기 레이어', '앱이 컨테이너 안에 쓴 파일', 'nginx 이미지', '아무것도 없다'],
    },
    c: 2,
    why: {
      en: 'rm deletes the writable layer (and un-volumed data). The image remains for future containers.',
      ko: 'rm은 쓰기 레이어(볼륨에 없는 데이터 포함)를 삭제합니다. 이미지는 다음 컨테이너를 위해 남습니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'Why does docker run --gpus all work without installing a driver in the image?', ko: '이미지에 드라이버를 설치하지 않았는데 docker run --gpus all 이 동작하는 이유는?' },
    a: {
      en: ["CUDA doesn't need a driver", "The NVIDIA Container Toolkit injects the host's driver libraries and /dev/nvidia* into the container", 'Docker emulates the GPU', 'The image always bundles a driver'],
      ko: ['CUDA는 드라이버가 필요 없다', 'NVIDIA Container Toolkit이 호스트의 드라이버 라이브러리와 /dev/nvidia* 를 컨테이너에 주입한다', 'Docker가 GPU를 에뮬레이션한다', '이미지에 항상 드라이버가 들어있다'],
    },
    c: 1,
    why: {
      en: "Driver lives on the host; the CUDA runtime/toolkit lives in the image and must be ≤ the driver's supported version.",
      ko: '드라이버는 호스트에 삽니다. CUDA 런타임/툴킷은 이미지 안에 있고, 호스트 드라이버가 지원하는 버전 이하여야 합니다.',
    },
  },
  {
    d: ['workloads', 'design'],
    q: { en: 'In Kubernetes, you should normally create…', ko: '쿠버네티스에서 보통 직접 만들어야 하는 것은?' },
    a: {
      en: ['Pods directly', 'Deployments, which manage ReplicaSets, which manage pods', 'Containers directly on nodes', 'Nodes'],
      ko: ['Pod를 직접', 'Deployment — 이것이 ReplicaSet을, ReplicaSet이 파드를 관리', '노드 위에 컨테이너를 직접', 'Node'],
    },
    c: 1,
    why: {
      en: "Raw pods don't self-heal. A Deployment restores replicas and handles rolling updates.",
      ko: '생 파드는 자가 치유되지 않습니다. Deployment가 레플리카 복구와 롤링 업데이트를 담당합니다.',
    },
  },
  {
    d: ['workloads', 'design'],
    q: { en: 'You delete a pod owned by a Deployment. What happens?', ko: 'Deployment 소속 파드를 삭제하면?' },
    a: {
      en: ["It's gone; replicas drop by one permanently", 'K8s restarts the exact same pod', 'A controller notices desired ≠ actual and creates a replacement with a new name', 'The node reboots'],
      ko: ['영영 사라지고 레플리카가 하나 준다', 'K8s가 똑같은 파드를 재시작한다', '컨트롤러가 원함≠실제 를 감지하고 새 이름의 대체 파드를 만든다', '노드가 재부팅된다'],
    },
    c: 2,
    why: {
      en: 'The reconciliation loop — the single most important idea in Kubernetes.',
      ko: '조정 루프 — 쿠버네티스에서 가장 중요한 단 하나의 개념입니다.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'Which component decides WHICH node a pod runs on?', ko: '파드가 어느 노드에서 실행될지 결정하는 컴포넌트는?' },
    a: { en: ['kubelet', 'kube-apiserver', 'etcd', 'kube-scheduler'], ko: ['kubelet', 'kube-apiserver', 'etcd', 'kube-scheduler'] },
    c: 3,
    why: {
      en: "The scheduler scores nodes and writes the assignment; the node's kubelet then actually starts it.",
      ko: '스케줄러가 노드를 채점해 배정을 기록하고, 해당 노드의 kubelet이 실제로 시작합니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'A pod requests nvidia.com/gpu: 2 but every node has at most 1 GPU free. The pod…', ko: '파드가 nvidia.com/gpu: 2 를 요청했지만 모든 노드에 여유 GPU가 1개뿐. 파드는…' },
    a: {
      en: ['Gets 1 GPU now and 1 later', 'Shares GPUs with other pods', 'Stays Pending until 2 GPUs are free on ONE node', 'Is split across two nodes'],
      ko: ['지금 1개 받고 나중에 1개 더', '다른 파드와 GPU를 공유한다', '한 노드에 2개가 빌 때까지 Pending', '두 노드에 걸쳐 쪼개진다'],
    },
    c: 2,
    why: {
      en: 'GPU requests are whole, node-local, and never oversubscribed.',
      ko: 'GPU 요청은 통째로, 노드 단위로, 초과 할당 없이 처리됩니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'How do GPU nodes advertise nvidia.com/gpu to Kubernetes?', ko: 'GPU 노드는 nvidia.com/gpu 를 어떻게 광고하나?' },
    a: {
      en: ['kubelet detects GPUs natively', 'The NVIDIA device plugin (a DaemonSet) reports them', 'You label nodes by hand', 'etcd scans the hardware'],
      ko: ['kubelet이 기본으로 GPU를 감지', 'NVIDIA device plugin(DaemonSet)이 보고', '노드에 수동으로 레이블을 붙임', 'etcd가 하드웨어를 스캔'],
    },
    c: 1,
    why: {
      en: 'kubelet knows nothing about GPUs; device plugins extend it with vendor resources.',
      ko: 'kubelet은 GPU를 모릅니다. device plugin이 벤더 자원으로 kubelet을 확장합니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'MIG vs time-slicing for sharing a GPU:', ko: 'GPU 공유에서 MIG vs 타임슬라이싱:' },
    a: {
      en: ['Both give hardware isolation', "Time-slicing partitions memory; MIG doesn't", 'MIG = hardware-isolated partitions (A100/H100+); time-slicing = turns with no memory isolation', 'MIG works on any GPU'],
      ko: ['둘 다 하드웨어 격리를 제공', '타임슬라이싱이 메모리를 분할하고 MIG는 아님', 'MIG = 하드웨어 격리 파티션(A100/H100+); 타임슬라이싱 = 격리 없이 순번제', 'MIG는 아무 GPU에서나 동작'],
    },
    c: 2,
    why: {
      en: 'MIG for safe multi-tenant production; time-slicing for cheap dev/notebook sharing.',
      ko: '멀티테넌트 프로덕션엔 MIG, 저렴한 개발/노트북 공유엔 타임슬라이싱.',
    },
  },
  {
    d: ['design'],
    q: { en: 'The main point of a multi-stage Dockerfile is…', ko: '멀티 스테이지 Dockerfile의 핵심 목적은…' },
    a: {
      en: ['Building for multiple CPU architectures', 'Running multiple processes in one container', 'A small final image without compilers/build tools', 'Faster docker push'],
      ko: ['여러 CPU 아키텍처용 빌드', '한 컨테이너에서 여러 프로세스 실행', '컴파일러/빌드 도구 없는 작은 최종 이미지', 'docker push 가속'],
    },
    c: 2,
    why: {
      en: 'Only the last stage ships. Toolchains and source stay behind — smaller, faster, safer.',
      ko: '마지막 스테이지만 배포됩니다. 툴체인과 소스는 남겨두고 — 더 작고, 빠르고, 안전하게.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'A container writes results to /data (no volume). After docker rm, the data is…', ko: '컨테이너가 /data 에 결과를 씀(볼륨 없음). docker rm 후 데이터는…' },
    a: {
      en: ['In the image', 'On the host under /data', 'Gone — the writable layer was deleted', 'In the registry'],
      ko: ['이미지 안에 있다', '호스트의 /data 에 있다', '사라졌다 — 쓰기 레이어가 삭제됨', '레지스트리에 있다'],
    },
    c: 2,
    why: {
      en: 'Persistence requires a volume or bind mount. In K8s, the same logic drives PV/PVC.',
      ko: '영속성은 볼륨/바인드 마운트가 필요합니다. K8s에서는 같은 논리가 PV/PVC를 이끕니다.',
    },
  },
  {
    d: ['observe', 'troubleshooting'],
    q: { en: "A pod's readiness probe starts failing. Kubernetes will…", ko: '파드의 readiness 프로브가 실패하기 시작하면 쿠버네티스는…' },
    a: {
      en: ['Restart the container', 'Remove the pod from Service endpoints until it passes', 'Delete the pod', 'Scale up the deployment'],
      ko: ['컨테이너를 재시작', '통과할 때까지 Service 엔드포인트에서 파드를 제외', '파드를 삭제', '디플로이먼트를 스케일 업'],
    },
    c: 1,
    why: {
      en: "Readiness = 'can it take traffic'. Restarts are the liveness probe's job.",
      ko: "readiness = '지금 트래픽 받을 수 있나'. 재시작은 liveness 프로브의 일입니다.",
    },
  },
  {
    d: ['env', 'workloads'],
    q: { en: 'Which number does the scheduler use to place pods, and what happens when a container exceeds its memory limit?', ko: '스케줄러가 파드 배치에 쓰는 숫자와, 메모리 limit 초과 시 일어나는 일은?' },
    a: {
      en: ["limits; it's throttled", "requests; it's OOMKilled (exit 137)", 'limits; the node reboots', 'requests; nothing'],
      ko: ['limits; 스로틀링된다', 'requests; OOMKilled (exit 137)', 'limits; 노드가 재부팅', 'requests; 아무 일 없음'],
    },
    c: 1,
    why: {
      en: 'requests reserve capacity for scheduling (GPUs included); breaching a memory limit kills the container.',
      ko: 'requests가 스케줄링 용량을 예약하고(GPU 포함), 메모리 limit을 넘으면 컨테이너가 죽습니다.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'In GitOps (Argo CD / Flux), the desired state of the cluster lives in…', ko: 'GitOps(Argo CD/Flux)에서 클러스터의 원하는 상태는 어디에 사나?' },
    a: {
      en: ['etcd only', 'A git repository, continuously synced by an in-cluster agent', 'The CI server', "Helm's database"],
      ko: ['etcd에만', 'git 저장소 — 클러스터 내 에이전트가 지속적으로 동기화', 'CI 서버', 'Helm의 데이터베이스'],
    },
    c: 1,
    why: {
      en: 'Same reconciliation idea as ReplicaSets, applied to deployment: diff git vs cluster, sync, repeat.',
      ko: 'ReplicaSet과 같은 조정 루프를 배포에 적용한 것: git과 클러스터를 diff하고, sync하고, 반복.',
    },
  },
  {
    d: ['foundations'],
    q: { en: 'Why does a shared GPU cluster need gang scheduling (Kueue/Volcano)?', ko: '공유 GPU 클러스터에 갱 스케줄링(Kueue/Volcano)이 필요한 이유는?' },
    a: {
      en: ['GPUs overheat otherwise', 'To encrypt NCCL traffic', 'So multi-pod jobs start all-or-nothing instead of grabbing partial GPUs and deadlocking', 'To enable MIG'],
      ko: ['GPU 과열 방지', 'NCCL 트래픽 암호화', '여러 파드짜리 작업이 GPU를 부분 점유한 채 교착되지 않도록 전부-아니면-전무로 시작', 'MIG를 켜기 위해'],
    },
    c: 2,
    why: {
      en: 'Default scheduling is pod-by-pod; a 16-GPU job holding 12 GPUs blocks everyone and itself.',
      ko: '기본 스케줄링은 파드 단위입니다. 16-GPU 작업이 12개만 쥐고 있으면 모두가(자신도) 막힙니다.',
    },
  },

  // ── workloads · rollouts & controllers ─────────────────────────────────
  {
    d: ['workloads', 'deploy'],
    q: { en: 'A Deployment is at revision 2. You run kubectl rollout undo. The Deployment is now at…', ko: 'Deployment가 리비전 2입니다. kubectl rollout undo 를 실행하면 리비전은…' },
    a: {
      en: ['Revision 1', 'Revision 2 still', 'Revision 3 — the rollback is recorded as a NEW revision', 'Revision 0'],
      ko: ['리비전 1', '여전히 리비전 2', '리비전 3 — 롤백도 새 리비전으로 기록된다', '리비전 0'],
    },
    c: 2,
    why: {
      en: 'History only moves forward. Undo re-applies the old template as a fresh revision — check with rollout history.',
      ko: '히스토리는 앞으로만 쌓입니다. undo는 옛 템플릿을 새 리비전으로 다시 적용합니다 — rollout history로 확인하세요.',
    },
  },
  {
    d: ['workloads', 'deploy'],
    q: { en: 'During a rolling update, maxSurge and maxUnavailable control…', ko: '롤링 업데이트에서 maxSurge와 maxUnavailable이 제어하는 것은…' },
    a: {
      en: ['CPU limits during the rollout', 'How many extra pods may exist / how many may be down at once', 'The number of revisions kept', 'How fast images are pulled'],
      ko: ['롤아웃 중 CPU limit', '동시에 초과 생성될 수 있는 파드 수 / 동시에 내려갈 수 있는 파드 수', '보관되는 리비전 수', '이미지 pull 속도'],
    },
    c: 1,
    why: {
      en: 'Surge = temporary extra capacity, unavailable = how deep the rollout may cut. Together they make updates zero-downtime.',
      ko: 'surge = 일시적 초과 용량, unavailable = 롤아웃이 깎아도 되는 깊이. 둘이 함께 무중단 업데이트를 만듭니다.',
    },
  },
  {
    d: ['deploy', 'workloads'],
    q: { en: 'Strategy Recreate vs RollingUpdate:', ko: '전략 Recreate vs RollingUpdate:' },
    a: {
      en: ['Recreate is the default', 'Recreate kills ALL old pods before starting new ones — brief downtime', 'RollingUpdate requires a StatefulSet', 'They are identical for replicas=1'],
      ko: ['Recreate가 기본값', 'Recreate는 새 파드를 만들기 전에 옛 파드를 전부 죽인다 — 짧은 다운타임', 'RollingUpdate는 StatefulSet 필요', 'replicas=1이면 둘은 동일'],
    },
    c: 1,
    why: {
      en: 'Recreate is for apps that cannot run two versions at once (e.g. one writer on a volume). RollingUpdate is the default.',
      ko: 'Recreate는 두 버전이 동시에 못 도는 앱용(볼륨에 단일 writer 등). 기본값은 RollingUpdate입니다.',
    },
  },
  {
    d: ['deploy', 'design'],
    q: { en: 'kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml does what?', ko: 'kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml 은 무엇을 하나?' },
    a: {
      en: ['Creates the Deployment and saves a copy', 'Creates nothing — it prints valid YAML into web.yaml for you to edit and apply', 'Validates the cluster', 'Downloads the nginx image'],
      ko: ['Deployment를 만들고 사본을 저장', '아무것도 만들지 않는다 — 편집해서 apply할 유효한 YAML을 web.yaml로 출력', '클러스터를 검증', 'nginx 이미지를 다운로드'],
    },
    c: 1,
    why: {
      en: 'THE exam technique: generate YAML imperatively, edit the fields the task demands, then kubectl apply -f.',
      ko: '바로 그 시험 테크닉: 명령형으로 YAML을 생성 → 과제가 요구하는 필드만 수정 → kubectl apply -f.',
    },
  },
  {
    d: ['workloads', 'deploy'],
    q: { en: '4 pods run at 100% CPU. The HPA target is 50%. Desired replicas become…', ko: '파드 4개가 CPU 100%로 돌고 HPA 목표는 50%. 원하는 레플리카 수는…' },
    a: { en: ['5', '6', '8', '16'], ko: ['5', '6', '8', '16'] },
    c: 2,
    why: {
      en: 'desired = ceil(current × usage/target) = ceil(4 × 100/50) = 8.',
      ko: 'desired = ceil(현재 × 사용률/목표) = ceil(4 × 100/50) = 8.',
    },
  },
  {
    d: ['workloads', 'design'],
    q: { en: 'You need exactly one copy of a log shipper on every node. Use a…', ko: '모든 노드에 로그 수집기를 정확히 하나씩 띄우려면?' },
    a: { en: ['Deployment with many replicas', 'DaemonSet', 'StatefulSet', 'CronJob'], ko: ['레플리카 많은 Deployment', 'DaemonSet', 'StatefulSet', 'CronJob'] },
    c: 1,
    why: {
      en: 'DaemonSet = one pod per node, automatically covering nodes as they join. Monitoring agents, CNI, device plugins.',
      ko: 'DaemonSet = 노드당 파드 1개, 새 노드에도 자동 배치. 모니터링 에이전트, CNI, device plugin이 이렇게 돕니다.',
    },
  },
  {
    d: ['workloads', 'design'],
    q: { en: 'What does a StatefulSet give you that a Deployment does not?', ko: 'StatefulSet이 Deployment에는 없는 무엇을 주나?' },
    a: {
      en: ['Faster pods', 'Stable names (db-0, db-1), ordered startup, and a PVC per replica', 'Automatic backups', 'Higher resource limits'],
      ko: ['더 빠른 파드', '고정된 이름(db-0, db-1), 순서 있는 기동, 레플리카마다 자기 PVC', '자동 백업', '더 높은 resource limit'],
    },
    c: 1,
    why: {
      en: 'Identity + per-replica storage via volumeClaimTemplates — databases, Kafka, anything where replicas are not interchangeable.',
      ko: '정체성 + volumeClaimTemplates로 레플리카별 스토리지 — DB, Kafka 등 레플리카가 서로 교환 불가능한 것들.',
    },
  },
  {
    d: ['workloads', 'design'],
    q: { en: 'Labels vs annotations:', ko: '레이블 vs 어노테이션:' },
    a: {
      en: ['Interchangeable', 'Labels are for selection (selectors, -l); annotations hold non-identifying metadata for tools', 'Annotations are for selection', 'Labels can only hold numbers'],
      ko: ['서로 교환 가능', '레이블은 선택용(셀렉터, -l); 어노테이션은 도구용 비식별 메타데이터', '어노테이션이 선택용', '레이블에는 숫자만 넣을 수 있다'],
    },
    c: 1,
    why: {
      en: 'Everything that ROUTES or GROUPS (Services, Deployments, NetworkPolicies) matches on labels; annotations never select.',
      ko: '라우팅하거나 묶는 모든 것(Service, Deployment, NetworkPolicy)은 레이블로 매칭합니다. 어노테이션은 절대 선택에 쓰이지 않습니다.',
    },
  },
  {
    d: ['design'],
    q: { en: 'A Job keeps failing. Which field caps how many times Kubernetes retries it?', ko: 'Job이 계속 실패합니다. 재시도 횟수를 제한하는 필드는?' },
    a: { en: ['restartPolicy', 'backoffLimit', 'activeDeadlineSeconds', 'parallelism'], ko: ['restartPolicy', 'backoffLimit', 'activeDeadlineSeconds', 'parallelism'] },
    c: 1,
    why: {
      en: 'backoffLimit (default 6) caps retries; activeDeadlineSeconds caps total runtime; parallelism/completions shape the fan-out.',
      ko: 'backoffLimit(기본 6)이 재시도를 제한, activeDeadlineSeconds는 총 실행 시간을 제한, parallelism/completions는 병렬 폭을 정합니다.',
    },
  },

  // ── scheduling ──────────────────────────────────────────────────────────
  {
    d: ['workloads', 'arch'],
    q: { en: 'A NoExecute taint is added to a node. Pods without a matching toleration are…', ko: '노드에 NoExecute taint가 추가되면, 맞는 toleration이 없는 파드는…' },
    a: {
      en: ['Left running but marked', 'Evicted from the node (NoSchedule would only block NEW pods)', 'Restarted in place', 'Converted to DaemonSets'],
      ko: ['그대로 실행되며 표시만 됨', '노드에서 축출된다 (NoSchedule은 새 파드만 막는다)', '제자리에서 재시작', 'DaemonSet으로 변환'],
    },
    c: 1,
    why: {
      en: 'NoSchedule = fence for new pods. NoExecute = fence + evict what is already there. Node NotReady uses NoExecute taints.',
      ko: 'NoSchedule = 새 파드용 울타리. NoExecute = 울타리 + 이미 있는 파드도 축출. 노드 NotReady가 NoExecute taint를 씁니다.',
    },
  },
  {
    d: ['workloads'],
    q: { en: 'nodeSelector vs nodeAffinity:', ko: 'nodeSelector vs nodeAffinity:' },
    a: {
      en: ['Identical features', 'nodeSelector = exact label match only; nodeAffinity adds operators (In, Exists) and soft "preferred" rules', 'nodeAffinity is deprecated', 'nodeSelector supports anti-affinity'],
      ko: ['기능이 동일', 'nodeSelector = 정확한 레이블 일치만; nodeAffinity는 연산자(In, Exists)와 소프트 "preferred" 규칙 추가', 'nodeAffinity는 폐기됨', 'nodeSelector가 anti-affinity 지원'],
    },
    c: 1,
    why: {
      en: 'nodeSelector is the simple 90% tool; affinity is its expressive superset (required vs preferred, operators, anti-affinity for PODS).',
      ko: 'nodeSelector는 단순한 90% 도구, affinity는 표현력 있는 상위 집합(required vs preferred, 연산자, 파드용 anti-affinity)입니다.',
    },
  },
  {
    d: ['troubleshooting', 'workloads'],
    q: { en: 'A pod sits Pending. The FIRST place to read the exact reason is…', ko: '파드가 Pending입니다. 정확한 이유를 처음 읽어야 할 곳은…' },
    a: {
      en: ['kubectl logs POD', 'kubectl describe pod POD — the Events show FailedScheduling with per-node reasons', 'The node kernel log', 'kubectl top pod'],
      ko: ['kubectl logs 파드', 'kubectl describe pod 파드 — Events의 FailedScheduling에 노드별 사유가 나온다', '노드 커널 로그', 'kubectl top pod'],
    },
    c: 1,
    why: {
      en: 'Pending = not scheduled = no container = no logs. The scheduler writes its objections (taints, capacity, affinity) as Events.',
      ko: 'Pending = 스케줄 안 됨 = 컨테이너 없음 = 로그 없음. 스케줄러는 거부 사유(taint, 용량, affinity)를 Event로 남깁니다.',
    },
  },
  {
    d: ['arch', 'workloads'],
    q: { en: 'kubectl cordon vs kubectl drain:', ko: 'kubectl cordon vs kubectl drain:' },
    a: {
      en: ['Both evict pods', 'cordon only marks the node unschedulable; drain cordons AND evicts the pods', 'drain only marks the node', 'cordon deletes the node'],
      ko: ['둘 다 파드를 축출', 'cordon은 스케줄 불가 표시만; drain은 cordon + 파드 축출까지', 'drain은 표시만 한다', 'cordon은 노드를 삭제'],
    },
    c: 1,
    why: {
      en: 'Maintenance dance: drain (cordon + evict, politely via the eviction API) → maintain → uncordon.',
      ko: '유지보수 의식: drain(cordon + eviction API로 정중한 축출) → 작업 → uncordon.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'A PodDisruptionBudget has minAvailable: 2 and exactly 2 ready pods. kubectl drain on their node will…', ko: 'PDB가 minAvailable: 2 이고 준비된 파드가 정확히 2개. 그 노드에 kubectl drain 하면…' },
    a: {
      en: ['Evict them anyway', 'Refuse the evictions and hang/retry — the budget allows 0 disruptions', 'Delete the PDB', 'Reboot the node'],
      ko: ['그래도 축출한다', '축출을 거부하고 대기/재시도 — 예산상 허용 중단이 0', 'PDB를 삭제한다', '노드를 재부팅'],
    },
    c: 1,
    why: {
      en: 'drain uses the eviction API, which respects PDBs. (kubectl delete pod does NOT ask.) Fix: add capacity first, then drain.',
      ko: 'drain은 PDB를 존중하는 eviction API를 씁니다. (kubectl delete pod는 묻지 않습니다.) 해법: 먼저 여유 레플리카를 만들고 drain.',
    },
  },
  {
    d: ['workloads'],
    q: { en: 'To spread the replicas of one Deployment across different nodes, use…', ko: '한 Deployment의 레플리카를 서로 다른 노드에 분산하려면…' },
    a: {
      en: ['nodeSelector', 'podAntiAffinity (or topologySpreadConstraints) keyed on the app label', 'A taint per replica', 'More namespaces'],
      ko: ['nodeSelector', '앱 레이블 기준의 podAntiAffinity (또는 topologySpreadConstraints)', '레플리카마다 taint', '네임스페이스 추가'],
    },
    c: 1,
    why: {
      en: '"Do not schedule me next to pods that look like me" — anti-affinity on your own label survives single-node failures.',
      ko: '"나와 닮은 파드 옆에는 놓지 마" — 자기 레이블에 대한 anti-affinity가 단일 노드 장애를 견디게 합니다.',
    },
  },

  // ── cluster architecture & ops ──────────────────────────────────────────
  {
    d: ['arch'],
    q: { en: 'Where does the API server persist every object in the cluster?', ko: 'API 서버는 클러스터의 모든 오브젝트를 어디에 저장하나?' },
    a: { en: ['In each kubelet', 'etcd', 'The scheduler cache', 'A PersistentVolume'], ko: ['각 kubelet에', 'etcd', '스케줄러 캐시', 'PersistentVolume'] },
    c: 1,
    why: {
      en: 'etcd is the single source of truth — which is why an etcd snapshot is a full-cluster backup.',
      ko: 'etcd가 단일 진실 원천입니다 — 그래서 etcd 스냅샷 하나가 클러스터 전체 백업입니다.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'The only correct kubeadm upgrade order is…', ko: 'kubeadm 업그레이드의 유일한 올바른 순서는…' },
    a: {
      en: ['Workers first, control plane last', 'Control plane first, then workers one drained node at a time', 'All nodes simultaneously', 'etcd last'],
      ko: ['워커 먼저, 컨트롤 플레인 나중', '컨트롤 플레인 먼저, 그다음 워커를 drain 해가며 한 노드씩', '모든 노드 동시에', 'etcd를 마지막에'],
    },
    c: 1,
    why: {
      en: 'A kubelet may never be newer than its API server. kubeadm upgrade apply on the CP, then per worker: drain → upgrade → uncordon.',
      ko: 'kubelet은 API 서버보다 새 버전이면 안 됩니다. 컨트롤 플레인에 upgrade apply, 그다음 워커마다 drain → 업그레이드 → uncordon.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'etcdctl snapshot save on the exam requires --endpoints plus which flags?', ko: '시험에서 etcdctl snapshot save 에 --endpoints 외에 필요한 플래그는?' },
    a: {
      en: ['--force', '--cacert, --cert, --key (the etcd TLS files)', '--all-namespaces', '--kubeconfig'],
      ko: ['--force', '--cacert, --cert, --key (etcd TLS 파일들)', '--all-namespaces', '--kubeconfig'],
    },
    c: 1,
    why: {
      en: 'etcd speaks mutual TLS. The three files live under /etc/kubernetes/pki/etcd/. Restore uses etcdutl snapshot restore --data-dir.',
      ko: 'etcd는 상호 TLS를 씁니다. 세 파일은 /etc/kubernetes/pki/etcd/ 아래에. 복구는 etcdutl snapshot restore --data-dir.',
    },
  },
  {
    d: ['arch', 'troubleshooting'],
    q: { en: 'Static pods (kube-apiserver, etcd…) are managed by…', ko: '스태틱 파드(kube-apiserver, etcd…)를 관리하는 것은…' },
    a: {
      en: ['The Deployment controller', 'The kubelet, from manifest files in /etc/kubernetes/manifests', 'kubectl', 'The cloud provider'],
      ko: ['Deployment 컨트롤러', '/etc/kubernetes/manifests 의 매니페스트 파일을 읽는 kubelet', 'kubectl', '클라우드 제공자'],
    },
    c: 1,
    why: {
      en: 'The control plane bootstraps itself: kubelet watches that directory — edit a file there and the kubelet restarts the component.',
      ko: '컨트롤 플레인은 스스로를 부트스트랩합니다: kubelet이 그 디렉터리를 감시 — 파일을 수정하면 kubelet이 컴포넌트를 재시작합니다.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'To run a task against a different cluster listed in your kubeconfig:', ko: 'kubeconfig에 있는 다른 클러스터에 작업하려면:' },
    a: {
      en: ['Re-install kubectl', 'kubectl config use-context CONTEXT (check with kubectl config get-contexts)', 'ssh into its control plane', 'Edit /etc/hosts'],
      ko: ['kubectl 재설치', 'kubectl config use-context 컨텍스트 (kubectl config get-contexts 로 확인)', '컨트롤 플레인에 ssh', '/etc/hosts 수정'],
    },
    c: 1,
    why: {
      en: 'Every real exam task starts by telling you which context to use — switching (and verifying) is free points.',
      ko: '실제 시험의 모든 문제는 어느 컨텍스트를 쓸지부터 알려줍니다 — 전환(과 확인)은 공짜 점수입니다.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'Version skew: relative to the kube-apiserver, a kubelet may be…', ko: '버전 스큐: kube-apiserver 대비 kubelet은…' },
    a: {
      en: ['Any version', 'Up to three minor versions older, but never newer', 'One version newer', 'Exactly equal only'],
      ko: ['아무 버전이나', '마이너 3버전까지 낮아도 되지만, 절대 더 높으면 안 됨', '한 버전 높아도 됨', '정확히 같아야만 함'],
    },
    c: 1,
    why: {
      en: 'kubelet ≤ apiserver, up to 3 minors behind — the rule that forces "control plane first" upgrades.',
      ko: 'kubelet ≤ apiserver, 마이너 3까지 뒤처져도 OK — 이 규칙이 "컨트롤 플레인 먼저" 순서를 강제합니다.',
    },
  },
  {
    d: ['arch'],
    q: { en: 'The quickest way to see when every control-plane certificate expires:', ko: '컨트롤 플레인 인증서들의 만료 시각을 가장 빨리 보는 방법:' },
    a: {
      en: ['kubectl get certs', 'kubeadm certs check-expiration', 'systemctl status kubelet', 'cat /etc/kubernetes/admin.conf'],
      ko: ['kubectl get certs', 'kubeadm certs check-expiration', 'systemctl status kubelet', 'cat /etc/kubernetes/admin.conf'],
    },
    c: 1,
    why: {
      en: 'One table, every cert. For a single file: openssl x509 -in CERT.crt -noout -dates.',
      ko: '표 하나에 모든 인증서. 파일 하나만 보려면: openssl x509 -in 인증서.crt -noout -dates.',
    },
  },
  {
    d: ['arch', 'env'],
    q: { en: 'Role vs ClusterRole:', ko: 'Role vs ClusterRole:' },
    a: {
      en: ['Role is read-only', 'A Role grants inside ONE namespace; a ClusterRole is namespace-less (cluster-wide resources, or reusable per-namespace via RoleBindings)', 'ClusterRole is deprecated', 'Roles bind users, ClusterRoles bind ServiceAccounts'],
      ko: ['Role은 읽기 전용', 'Role은 한 네임스페이스 안에서만 부여; ClusterRole은 네임스페이스가 없다(클러스터 자원용, 또는 RoleBinding으로 네임스페이스마다 재사용)', 'ClusterRole은 폐기됨', 'Role은 사용자용, ClusterRole은 ServiceAccount용'],
    },
    c: 1,
    why: {
      en: 'Nodes and namespaces themselves are cluster-scoped — only a ClusterRole can grant them.',
      ko: 'Node와 Namespace 자체는 클러스터 범위 자원입니다 — ClusterRole만 부여할 수 있습니다.',
    },
  },
  {
    d: ['arch', 'env'],
    q: { en: 'A RoleBinding in namespace build references a ClusterRole. The subject can now…', ko: 'build 네임스페이스의 RoleBinding이 ClusterRole을 참조합니다. 대상(subject)은 이제…' },
    a: {
      en: ['Use those permissions cluster-wide', "Use the ClusterRole's permissions ONLY inside build — the binding's namespace caps the grant", 'Do nothing — invalid combination', 'Edit the ClusterRole'],
      ko: ['그 권한을 클러스터 전체에서 사용', 'ClusterRole의 권한을 build 안에서만 사용 — 바인딩의 네임스페이스가 범위를 제한', '아무것도 못 함 — 유효하지 않은 조합', 'ClusterRole을 수정'],
    },
    c: 1,
    why: {
      en: 'The classic pattern: define permissions once (ClusterRole), grant them namespace-by-namespace (RoleBindings).',
      ko: '고전 패턴: 권한은 한 번 정의(ClusterRole)하고, 네임스페이스별로 부여(RoleBinding)합니다.',
    },
  },
  {
    d: ['env', 'arch'],
    q: { en: 'A pod that specifies no serviceAccountName runs as…', ko: 'serviceAccountName을 지정하지 않은 파드는 어떤 계정으로 실행되나?' },
    a: {
      en: ['root', "The 'default' ServiceAccount of its namespace", 'The node identity', 'No identity at all'],
      ko: ['root', '자기 네임스페이스의 default ServiceAccount', '노드의 신원', '신원 없음'],
    },
    c: 1,
    why: {
      en: 'Every namespace gets a default SA at creation; RBAC deny-by-default means it can do almost nothing until bound.',
      ko: '모든 네임스페이스는 생성 시 default SA를 받습니다. RBAC은 기본 거부라 바인딩 전엔 거의 아무것도 못 합니다.',
    },
  },
  {
    d: ['arch', 'env'],
    q: { en: 'To test whether ServiceAccount ci in namespace build may list pods:', ko: 'build 네임스페이스의 ServiceAccount ci가 파드를 list 할 수 있는지 확인하려면:' },
    a: {
      en: ['kubectl auth can-i list pods --as=system:serviceaccount:build:ci -n build', 'kubectl get sa ci', 'kubectl describe role ci', 'kubectl login ci'],
      ko: ['kubectl auth can-i list pods --as=system:serviceaccount:build:ci -n build', 'kubectl get sa ci', 'kubectl describe role ci', 'kubectl login ci'],
    },
    c: 0,
    why: {
      en: 'can-i + --as impersonation answers yes/no instantly — the fastest way to verify RBAC work on the exam.',
      ko: 'can-i + --as 가장(impersonation)이 즉시 yes/no를 답합니다 — 시험에서 RBAC 작업을 검증하는 가장 빠른 길.',
    },
  },

  // ── services & networking ───────────────────────────────────────────────
  {
    d: ['net'],
    q: { en: 'Which Service type is reachable ONLY from inside the cluster?', ko: '클러스터 안에서만 접근 가능한 Service 타입은?' },
    a: { en: ['NodePort', 'LoadBalancer', 'ClusterIP', 'ExternalName'], ko: ['NodePort', 'LoadBalancer', 'ClusterIP', 'ExternalName'] },
    c: 2,
    why: {
      en: 'ClusterIP (the default) = internal virtual IP. NodePort opens 30000-32767 on every node; LoadBalancer rents a cloud LB.',
      ko: 'ClusterIP(기본값) = 내부 가상 IP. NodePort는 모든 노드의 30000-32767을 열고, LoadBalancer는 클라우드 LB를 빌립니다.',
    },
  },
  {
    d: ['net'],
    q: { en: 'The full DNS name of Service web in namespace prod is…', ko: 'prod 네임스페이스의 Service web의 전체 DNS 이름은…' },
    a: {
      en: ['web.prod.svc.cluster.local', 'prod.web.svc.cluster.local', 'web.svc.prod.cluster.local', 'svc.web.prod.cluster.local'],
      ko: ['web.prod.svc.cluster.local', 'prod.web.svc.cluster.local', 'web.svc.prod.cluster.local', 'svc.web.prod.cluster.local'],
    },
    c: 0,
    why: {
      en: 'NAME.NAMESPACE.svc.cluster.local. From inside prod, plain "web" works; from another namespace you need at least web.prod.',
      ko: '이름.네임스페이스.svc.cluster.local. prod 안에서는 그냥 "web"으로 되고, 다른 네임스페이스에서는 최소 web.prod가 필요합니다.',
    },
  },
  {
    d: ['net', 'troubleshooting'],
    q: { en: 'kubectl describe svc web shows Endpoints: <none>. Most likely cause?', ko: 'kubectl describe svc web 에 Endpoints: <none>. 가장 유력한 원인은?' },
    a: {
      en: ['DNS is down', "The Service selector doesn't match any READY pod labels", 'The Service has no ClusterIP', 'kube-proxy crashed'],
      ko: ['DNS 장애', 'Service 셀렉터가 어떤 READY 파드의 레이블과도 일치하지 않음', 'Service에 ClusterIP가 없음', 'kube-proxy 크래시'],
    },
    c: 1,
    why: {
      en: 'Empty endpoints = selector/label mismatch OR pods not Ready. Compare --show-labels with the selector. Half of all networking tickets.',
      ko: '빈 endpoints = 셀렉터/레이블 불일치 또는 파드가 not Ready. --show-labels와 셀렉터를 비교하세요. 네트워킹 문제의 절반입니다.',
    },
  },
  {
    d: ['net'],
    q: { en: 'In a Service spec, port vs targetPort:', ko: 'Service 스펙에서 port vs targetPort:' },
    a: {
      en: ['Must always be equal', 'port = where the Service listens; targetPort = the port the container actually serves on', 'targetPort is the NodePort', 'port is deprecated'],
      ko: ['항상 같아야 한다', 'port = Service가 듣는 곳; targetPort = 컨테이너가 실제로 듣는 포트', 'targetPort가 NodePort다', 'port는 폐기됨'],
    },
    c: 1,
    why: {
      en: 'Wrong selector ⇒ empty endpoints. Wrong targetPort ⇒ endpoints exist but connections are refused. Learn to tell them apart.',
      ko: '셀렉터 오류 ⇒ 빈 endpoints. targetPort 오류 ⇒ endpoints는 있는데 연결 거부. 이 둘을 구분하세요.',
    },
  },
  {
    d: ['net'],
    q: { en: 'With NO NetworkPolicy in a namespace, pod-to-pod traffic is…', ko: '네임스페이스에 NetworkPolicy가 하나도 없으면 파드 간 트래픽은…' },
    a: {
      en: ['Denied by default', 'Allowed — the pod network is flat until a policy selects a pod, then it becomes allow-list only', 'Allowed only within a node', 'Encrypted automatically'],
      ko: ['기본 거부', '허용 — 파드 네트워크는 평평하며, 정책이 파드를 선택하는 순간부터 허용 목록만 통과', '같은 노드 안에서만 허용', '자동 암호화'],
    },
    c: 1,
    why: {
      en: 'Policies are additive allow-lists: once any policy selects a pod for a direction, everything not explicitly allowed is dropped.',
      ko: '정책은 누적되는 허용 목록입니다: 어떤 정책이 파드의 한 방향을 선택하는 순간, 명시적으로 허용되지 않은 것은 전부 차단됩니다.',
    },
  },
  {
    d: ['net'],
    q: { en: 'In a NetworkPolicy, podSelector: {} (empty) means…', ko: 'NetworkPolicy에서 podSelector: {} (빈 값)의 의미는…' },
    a: {
      en: ['Selects no pods', 'Selects EVERY pod in the namespace — the standard default-deny trick', 'Invalid YAML', 'Selects pods without labels'],
      ko: ['아무 파드도 선택 안 함', '네임스페이스의 모든 파드 선택 — 표준 기본-거부(default-deny) 트릭', '유효하지 않은 YAML', '레이블 없는 파드만 선택'],
    },
    c: 1,
    why: {
      en: 'Empty selector + policyTypes [Ingress] and no rules = deny all inbound to every pod. Then you punch explicit holes.',
      ko: '빈 셀렉터 + policyTypes [Ingress] + 규칙 없음 = 모든 파드의 인바운드 전면 차단. 그다음 구멍을 명시적으로 뚫습니다.',
    },
  },
  {
    d: ['net'],
    q: { en: 'Ingress pathType Prefix with path /api matches…', ko: 'Ingress pathType Prefix, path /api 가 매칭하는 것은…' },
    a: {
      en: ['Only exactly /api', '/api and everything under it (/api/v1, /api/users…)', 'Any path containing "api"', 'Only /api/'],
      ko: ['정확히 /api 만', '/api 와 그 아래 전부 (/api/v1, /api/users…)', '"api"가 들어간 아무 경로', '/api/ 만'],
    },
    c: 1,
    why: {
      en: 'Prefix matches by path segments (longest prefix wins across rules); Exact matches the literal path only.',
      ko: 'Prefix는 경로 세그먼트 기준으로 매칭(규칙 간에는 최장 접두사 승리); Exact는 문자 그대로의 경로만.',
    },
  },
  {
    d: ['net'],
    q: { en: 'The Gateway API resource chain, in order:', ko: 'Gateway API 리소스 체인의 올바른 순서는:' },
    a: {
      en: ['HTTPRoute → Gateway → GatewayClass', 'GatewayClass → Gateway → HTTPRoute (route attaches via parentRefs)', 'Gateway → Ingress → Route', 'GatewayClass → HTTPRoute → Gateway'],
      ko: ['HTTPRoute → Gateway → GatewayClass', 'GatewayClass → Gateway → HTTPRoute (route가 parentRefs로 연결)', 'Gateway → Ingress → Route', 'GatewayClass → HTTPRoute → Gateway'],
    },
    c: 1,
    why: {
      en: 'Class = which implementation; Gateway = listeners (infra team); HTTPRoute = app routing rules (app team). Role separation is the point.',
      ko: 'Class = 어떤 구현체, Gateway = 리스너(인프라 팀), HTTPRoute = 앱 라우팅 규칙(앱 팀). 역할 분리가 핵심입니다.',
    },
  },
  {
    d: ['net', 'arch'],
    q: { en: 'kube-proxy on every node exists to…', ko: '모든 노드의 kube-proxy가 하는 일은…' },
    a: {
      en: ['Proxy the internet', 'Program iptables/IPVS so Service ClusterIPs actually route to pod IPs', 'Pull images', 'Run DNS'],
      ko: ['인터넷을 프록시', 'Service ClusterIP가 실제 파드 IP로 라우팅되도록 iptables/IPVS를 프로그래밍', '이미지 pull', 'DNS 실행'],
    },
    c: 1,
    why: {
      en: 'A ClusterIP is virtual — nothing listens on it. kube-proxy rewrites connections to a ready backend pod.',
      ko: 'ClusterIP는 가상입니다 — 아무도 그 IP에서 listen하지 않습니다. kube-proxy가 연결을 준비된 백엔드 파드로 재작성합니다.',
    },
  },

  // ── storage ─────────────────────────────────────────────────────────────
  {
    d: ['storage'],
    q: { en: 'A PVC stays Pending forever. The usual reason:', ko: 'PVC가 영원히 Pending입니다. 흔한 이유는:' },
    a: {
      en: ['The pod referencing it crashed', 'No PV matches it and no StorageClass exists to provision one dynamically', 'PVCs always start Pending for 10 minutes', 'The node is cordoned'],
      ko: ['참조하는 파드가 크래시', '조건에 맞는 PV가 없고, 동적으로 만들어 줄 StorageClass도 없음', 'PVC는 원래 10분간 Pending', '노드가 cordon 됨'],
    },
    c: 1,
    why: {
      en: 'Binding needs a matching PV (size, accessModes, class) or a provisioner. Also check volumeBindingMode: WaitForFirstConsumer — those bind only when a pod uses the claim.',
      ko: '바인딩에는 조건 맞는 PV(크기, accessModes, class)나 프로비저너가 필요합니다. volumeBindingMode: WaitForFirstConsumer면 파드가 쓸 때에야 바인딩됩니다.',
    },
  },
  {
    d: ['storage'],
    q: { en: 'Access mode ReadWriteOnce (RWO) means…', ko: '액세스 모드 ReadWriteOnce(RWO)의 의미는…' },
    a: {
      en: ['One pod may use it', 'One NODE may mount it read-write (pods on that node can share it)', 'It can be written exactly once', 'Read-only volume'],
      ko: ['파드 하나만 사용 가능', '한 노드가 읽기-쓰기로 마운트 가능(그 노드 위 파드들은 공유 가능)', '딱 한 번만 쓸 수 있음', '읽기 전용 볼륨'],
    },
    c: 1,
    why: {
      en: 'RWO is per-NODE, not per-pod — the classic trap. RWX = many nodes (NFS-like); ROX = many nodes read-only.',
      ko: 'RWO는 파드가 아니라 노드 단위입니다 — 고전 함정. RWX = 여러 노드(NFS류); ROX = 여러 노드 읽기 전용.',
    },
  },
  {
    d: ['storage'],
    q: { en: 'persistentVolumeReclaimPolicy: Retain means that after the PVC is deleted…', ko: 'persistentVolumeReclaimPolicy: Retain 이면 PVC 삭제 후…' },
    a: {
      en: ['The PV and data are deleted too', 'The PV survives (status Released) with data intact, until an admin handles it', 'The PV rebinds automatically', 'Data moves to etcd'],
      ko: ['PV와 데이터도 삭제된다', 'PV가 데이터 그대로 남는다(Released 상태) — 관리자가 처리할 때까지', 'PV가 자동 재바인딩된다', '데이터가 etcd로 이동'],
    },
    c: 1,
    why: {
      en: 'Delete (default for dynamic PVs) destroys the disk with the claim; Retain keeps the data for manual recovery.',
      ko: 'Delete(동적 PV 기본값)는 클레임과 함께 디스크를 지웁니다. Retain은 수동 복구를 위해 데이터를 남깁니다.',
    },
  },
  {
    d: ['storage', 'design'],
    q: { en: 'An emptyDir volume is deleted when…', ko: 'emptyDir 볼륨이 삭제되는 시점은…' },
    a: {
      en: ['A container in the pod restarts', 'The POD is removed from the node (container restarts keep it)', 'The Deployment is scaled', 'Never'],
      ko: ['파드의 컨테이너가 재시작될 때', '파드가 노드에서 제거될 때 (컨테이너 재시작에는 살아남음)', 'Deployment가 스케일될 때', '삭제되지 않음'],
    },
    c: 1,
    why: {
      en: 'emptyDir = pod-lifetime scratch space, ideal for sharing files between containers in one pod. Not persistence.',
      ko: 'emptyDir = 파드 수명의 스크래치 공간, 한 파드 안 컨테이너끼리 파일 공유에 적합. 영속성이 아닙니다.',
    },
  },
  {
    d: ['storage'],
    q: { en: 'Dynamic provisioning kicks in when…', ko: '동적 프로비저닝이 발동하는 조건은…' },
    a: {
      en: ['Any PVC is created', 'A PVC names (or defaults to) a StorageClass whose provisioner then creates a matching PV', 'An admin runs kubectl provision', 'A pod mounts hostPath'],
      ko: ['아무 PVC나 생성되면', 'PVC가 StorageClass를 지정(또는 기본값 사용)하면 그 프로비저너가 맞는 PV를 생성', '관리자가 kubectl provision 실행', '파드가 hostPath 마운트'],
    },
    c: 1,
    why: {
      en: 'Claim names the class → provisioner cuts a real disk (EBS, PD, Ceph…) → PV appears and binds. App YAML stays cloud-agnostic.',
      ko: '클레임이 클래스를 지정 → 프로비저너가 실제 디스크(EBS, PD, Ceph…)를 생성 → PV가 나타나 바인딩. 앱 YAML은 클라우드 중립로 남습니다.',
    },
  },

  // ── troubleshooting & observability ─────────────────────────────────────
  {
    d: ['troubleshooting', 'observe'],
    q: { en: 'A pod is in CrashLoopBackOff. Your FIRST command:', ko: '파드가 CrashLoopBackOff. 처음 칠 명령은:' },
    a: {
      en: ['kubectl delete pod', 'kubectl logs POD (add --previous to read the crashed attempt)', 'kubectl drain the node', 'kubectl scale --replicas=0'],
      ko: ['kubectl delete pod', 'kubectl logs 파드 (크래시한 직전 시도는 --previous로)', '노드를 kubectl drain', 'kubectl scale --replicas=0'],
    },
    c: 1,
    why: {
      en: "CrashLoop = the process starts and dies. Its last words are in the logs; --previous shows the attempt that just crashed.",
      ko: 'CrashLoop = 프로세스가 시작했다 죽는다는 뜻. 유언은 로그에 있고, --previous가 방금 크래시한 시도를 보여줍니다.',
    },
  },
  {
    d: ['troubleshooting'],
    q: { en: 'ImagePullBackOff is usually caused by…', ko: 'ImagePullBackOff의 주된 원인은…' },
    a: {
      en: ['Not enough CPU', 'A typo in image name/tag, a private registry without credentials, or a tag that does not exist', 'A failing liveness probe', 'Wrong Service selector'],
      ko: ['CPU 부족', '이미지 이름/태그 오타, 자격 증명 없는 프라이빗 레지스트리, 존재하지 않는 태그', 'liveness 프로브 실패', 'Service 셀렉터 오류'],
    },
    c: 1,
    why: {
      en: 'kubectl describe pod → Events names the exact image string it tried. Read it letter by letter.',
      ko: 'kubectl describe pod → Events에 시도한 이미지 문자열이 그대로 나옵니다. 한 글자씩 읽으세요.',
    },
  },
  {
    d: ['troubleshooting', 'env'],
    q: { en: 'A container terminated with exit code 137. That means…', ko: '컨테이너가 종료 코드 137로 죽었습니다. 의미는…' },
    a: {
      en: ['Segfault', 'OOMKilled — it breached its memory limit (137 = 128 + SIGKILL 9)', 'Image not found', 'Probe timeout'],
      ko: ['세그폴트', 'OOMKilled — 메모리 limit 초과 (137 = 128 + SIGKILL 9)', '이미지 없음', '프로브 타임아웃'],
    },
    c: 1,
    why: {
      en: 'kubectl describe shows Last State: OOMKilled. Fix: raise the limit or fix the leak; requests/limits are the CKAD bread and butter.',
      ko: 'kubectl describe에 Last State: OOMKilled가 보입니다. 해법: limit 상향 또는 누수 수정. requests/limits는 CKAD의 기본기입니다.',
    },
  },
  {
    d: ['troubleshooting', 'arch'],
    q: { en: 'A node shows NotReady. The first service to check ON that node:', ko: '노드가 NotReady입니다. 그 노드에서 처음 확인할 서비스는:' },
    a: {
      en: ['nginx', 'The kubelet (systemctl status kubelet / journalctl -u kubelet)', 'etcd', 'containerd only'],
      ko: ['nginx', 'kubelet (systemctl status kubelet / journalctl -u kubelet)', 'etcd', 'containerd만'],
    },
    c: 1,
    why: {
      en: 'The kubelet is the node agent that reports status; if it is dead or misconfigured the node goes NotReady and pods turn Unknown.',
      ko: 'kubelet이 상태를 보고하는 노드 에이전트입니다. 죽거나 설정이 틀리면 노드는 NotReady, 파드는 Unknown이 됩니다.',
    },
  },
  {
    d: ['observe'],
    q: { en: 'A liveness probe fails repeatedly. Kubernetes will…', ko: 'liveness 프로브가 반복 실패하면 쿠버네티스는…' },
    a: {
      en: ['Remove the pod from endpoints', 'Restart the container (backing off on repeated failures)', 'Delete the Deployment', 'Cordon the node'],
      ko: ['파드를 endpoint에서 제외', '컨테이너를 재시작 (반복 실패 시 백오프)', 'Deployment를 삭제', '노드를 cordon'],
    },
    c: 1,
    why: {
      en: 'liveness = "is it alive?" → restart. readiness = "can it serve?" → endpoints. Mixing them up causes restart storms.',
      ko: 'liveness = "살아있나?" → 재시작. readiness = "서비스 가능한가?" → endpoints. 혼동하면 재시작 폭풍이 옵니다.',
    },
  },
  {
    d: ['observe'],
    q: { en: 'A model server takes 3 minutes to boot and liveness keeps killing it. The right fix:', ko: '모델 서버 기동에 3분이 걸리는데 liveness가 자꾸 죽입니다. 올바른 해법은:' },
    a: {
      en: ['Remove all probes', 'Add a startupProbe — it holds off liveness/readiness until the app has booted', 'Raise CPU limits', 'Use a DaemonSet'],
      ko: ['프로브 전부 제거', 'startupProbe 추가 — 앱이 뜰 때까지 liveness/readiness를 보류시킨다', 'CPU limit 상향', 'DaemonSet 사용'],
    },
    c: 1,
    why: {
      en: 'startupProbe exists exactly for slow starters (big models!): until it passes, the other probes stay quiet.',
      ko: 'startupProbe는 정확히 느린 기동(큰 모델!)을 위해 존재합니다: 통과 전까지 다른 프로브는 조용히 기다립니다.',
    },
  },
  {
    d: ['observe', 'troubleshooting'],
    q: { en: 'kubectl top pod returns "error: Metrics API not available". Because…', ko: 'kubectl top pod 가 "error: Metrics API not available". 이유는…' },
    a: {
      en: ['The pod has no limits', 'metrics-server is not installed — top reads the Metrics API it provides', 'RBAC denies you', 'The node is full'],
      ko: ['파드에 limit이 없음', 'metrics-server 미설치 — top은 그것이 제공하는 Metrics API를 읽는다', 'RBAC이 거부', '노드가 가득 참'],
    },
    c: 1,
    why: {
      en: 'top (and the HPA!) needs metrics-server. No metrics → HPA shows <unknown> targets too.',
      ko: 'top(그리고 HPA!)은 metrics-server가 필요합니다. 메트릭이 없으면 HPA도 <unknown> 목표를 보여줍니다.',
    },
  },

  // ── app environment, configuration & security (CKAD) ───────────────────
  {
    d: ['env'],
    q: { en: 'Kubernetes Secrets are, by default…', ko: '쿠버네티스 Secret은 기본적으로…' },
    a: {
      en: ['AES-encrypted', 'Only base64-ENCODED — anyone who can read the object can decode the value', 'Hashed', 'Stored outside etcd'],
      ko: ['AES로 암호화됨', 'base64 인코딩일 뿐 — 오브젝트를 읽을 수 있으면 값을 디코드할 수 있다', '해시됨', 'etcd 밖에 저장됨'],
    },
    c: 1,
    why: {
      en: 'echo VALUE | base64 -d and it is plain text. Real protection: encryption-at-rest, RBAC, or an external secret manager.',
      ko: 'echo 값 | base64 -d 하면 평문입니다. 진짜 보호는 저장 시 암호화, RBAC, 외부 시크릿 매니저.',
    },
  },
  {
    d: ['env'],
    q: { en: 'envFrom.configMapRef vs env[].valueFrom.configMapKeyRef:', ko: 'envFrom.configMapRef vs env[].valueFrom.configMapKeyRef:' },
    a: {
      en: ['Identical', 'envFrom imports ALL keys as env vars; valueFrom picks ONE key into ONE variable', 'valueFrom imports all keys', 'envFrom mounts files'],
      ko: ['동일하다', 'envFrom은 모든 키를 환경 변수로 가져오고, valueFrom은 한 키를 한 변수로 가져온다', 'valueFrom이 모든 키를 가져온다', 'envFrom은 파일을 마운트한다'],
    },
    c: 1,
    why: {
      en: 'envFrom is the bulk import; valueFrom is surgical (and lets you rename). Both also work with Secrets.',
      ko: 'envFrom은 일괄 수입, valueFrom은 정밀 수입(이름 변경도 가능). 둘 다 Secret에도 동일하게 동작합니다.',
    },
  },
  {
    d: ['env'],
    q: { en: 'You edit a ConfigMap consumed as env vars by running pods. The pods…', ko: '실행 중인 파드가 환경 변수로 쓰는 ConfigMap을 수정했습니다. 파드는…' },
    a: {
      en: ['Pick it up instantly', 'Keep the OLD values until restarted — env vars are set at container start (mounted files DO update, eventually)', 'Crash', 'Get new values on next probe'],
      ko: ['즉시 반영한다', '재시작 전까지 옛 값 유지 — 환경 변수는 컨테이너 시작 시 고정 (마운트된 파일은 시간이 지나면 갱신됨)', '크래시한다', '다음 프로브 때 새 값을 받는다'],
    },
    c: 1,
    why: {
      en: 'The classic gotcha: env injection is start-time only. Roll the Deployment (rollout restart) to pick up changes.',
      ko: '고전 함정: 환경 변수 주입은 시작 시 1회. 변경 반영은 rollout restart로 파드를 굴려야 합니다.',
    },
  },
  {
    d: ['env', 'workloads'],
    q: { en: 'A pod gets QoS class Guaranteed when…', ko: '파드가 QoS 클래스 Guaranteed를 받는 조건은…' },
    a: {
      en: ['It has any limits', 'Every container sets requests = limits for both CPU and memory', 'It runs in kube-system', 'It has a PriorityClass'],
      ko: ['limit이 하나라도 있으면', '모든 컨테이너가 CPU와 메모리 모두 requests = limits로 설정', 'kube-system에서 실행되면', 'PriorityClass가 있으면'],
    },
    c: 1,
    why: {
      en: 'Guaranteed is evicted last under node pressure; BestEffort (nothing set) goes first; everything else is Burstable.',
      ko: 'Guaranteed는 노드 압박 시 가장 늦게 축출, BestEffort(아무것도 없음)가 가장 먼저, 나머지는 Burstable.',
    },
  },
  {
    d: ['env'],
    q: { en: 'To make a container run without root and refuse privilege escalation:', ko: '컨테이너를 root 없이 실행하고 권한 상승도 막으려면:' },
    a: {
      en: ['Use a bigger image', 'securityContext: runAsNonRoot: true + allowPrivilegeEscalation: false', 'RBAC on the pod', 'A NetworkPolicy'],
      ko: ['더 큰 이미지 사용', 'securityContext: runAsNonRoot: true + allowPrivilegeEscalation: false', '파드에 RBAC 적용', 'NetworkPolicy 적용'],
    },
    c: 1,
    why: {
      en: 'securityContext (pod- or container-level) is the CKAD security surface: runAsUser, capabilities drop, readOnlyRootFilesystem.',
      ko: 'securityContext(파드/컨테이너 수준)가 CKAD 보안의 핵심 표면: runAsUser, capabilities drop, readOnlyRootFilesystem.',
    },
  },
  {
    d: ['env'],
    q: { en: 'ResourceQuota vs LimitRange:', ko: 'ResourceQuota vs LimitRange:' },
    a: {
      en: ['Both cap single containers', 'Quota caps a NAMESPACE\'s total (sum of requests, object counts); LimitRange constrains/defaults EACH container', 'LimitRange caps namespaces', 'Quota only counts pods'],
      ko: ['둘 다 컨테이너 하나를 제한', 'Quota는 네임스페이스 총량(requests 합, 오브젝트 수)을 제한; LimitRange는 컨테이너 하나하나에 제약/기본값을 부여', 'LimitRange가 네임스페이스를 제한', 'Quota는 파드 수만 센다'],
    },
    c: 1,
    why: {
      en: 'Quota = the team budget; LimitRange = per-container guardrails (and it injects default requests/limits when authors forget).',
      ko: 'Quota = 팀 예산; LimitRange = 컨테이너별 가드레일(작성자가 잊으면 기본 requests/limits도 주입).',
    },
  },
  {
    d: ['design', 'deploy'],
    q: { en: 'imagePullPolicy defaults: when is Always the default?', ko: 'imagePullPolicy 기본값: 언제 Always가 기본이 되나?' },
    a: {
      en: ['Never — IfNotPresent always', 'When the tag is :latest (or no tag) — otherwise IfNotPresent', 'Only for private registries', 'When replicas > 1'],
      ko: ['절대 아님 — 항상 IfNotPresent', '태그가 :latest(또는 무태그)일 때 — 그 외엔 IfNotPresent', '프라이빗 레지스트리에서만', 'replicas > 1일 때'],
    },
    c: 1,
    why: {
      en: 'A moving :latest plus Always is how "the same YAML" deploys different bytes tomorrow. Pin versions in production.',
      ko: '움직이는 :latest + Always 조합이 "같은 YAML"이 내일 다른 바이트를 배포하게 만듭니다. 프로덕션은 버전을 고정하세요.',
    },
  },

  // ── application design (CKAD) ───────────────────────────────────────────
  {
    d: ['design'],
    q: { en: 'initContainers…', ko: 'initContainer는…' },
    a: {
      en: ['Run alongside app containers forever', 'Run one-by-one to completion BEFORE app containers start (setup: wait-for-db, fetch config, migrate)', 'Replace liveness probes', 'Only run on StatefulSets'],
      ko: ['앱 컨테이너와 영원히 나란히 실행', '앱 컨테이너 시작 전에 하나씩 끝까지 실행 (준비 작업: DB 대기, 설정 다운로드, 마이그레이션)', 'liveness 프로브를 대체', 'StatefulSet에서만 실행'],
    },
    c: 1,
    why: {
      en: 'Each must exit 0 before the next starts; if one fails, the kubelet retries per restartPolicy. Sidecars = restartPolicy: Always init containers.',
      ko: '각각 종료 코드 0으로 끝나야 다음이 시작됩니다. 실패하면 kubelet이 restartPolicy대로 재시도. 사이드카 = restartPolicy: Always인 init 컨테이너.',
    },
  },
  {
    d: ['design'],
    q: { en: 'Two containers in one pod share…', ko: '한 파드의 두 컨테이너가 공유하는 것은…' },
    a: {
      en: ['Nothing', 'The network namespace (localhost!) and any mounted volumes — but separate filesystems', 'One filesystem', 'CPU limits'],
      ko: ['아무것도 없음', '네트워크 네임스페이스(localhost!)와 마운트한 볼륨 — 파일시스템은 각자', '파일시스템 하나', 'CPU limit'],
    },
    c: 1,
    why: {
      en: 'That is what makes sidecars work: the log shipper reads a shared emptyDir; the proxy talks to the app on localhost.',
      ko: '사이드카가 성립하는 이유입니다: 로그 수집기는 공유 emptyDir을 읽고, 프록시는 localhost로 앱과 대화합니다.',
    },
  },
  {
    d: ['design', 'deploy'],
    q: { en: 'kubectl run web --image=nginx creates…', ko: 'kubectl run web --image=nginx 가 만드는 것은…' },
    a: {
      en: ['A Deployment', 'A single bare pod — no controller, no self-healing', 'A Service', 'A ReplicaSet'],
      ko: ['Deployment', '컨트롤러 없는 생(bare) 파드 하나 — 자가 치유 없음', 'Service', 'ReplicaSet'],
    },
    c: 1,
    why: {
      en: 'Since 1.18, run = one pod (great for quick tests / debug clients). Anything that must survive needs create deployment.',
      ko: '1.18부터 run = 파드 하나(빠른 테스트/디버그 클라이언트용). 살아남아야 하는 것은 create deployment로.',
    },
  },
];

/** Questions relevant to an exam: tagged with at least one of its domain ids. */
export const questionsForExam = (examDomains) => {
  const ids = new Set(examDomains.map((d) => d.id));
  return QUIZ_BANK.filter((q) => q.d.some((id) => ids.has(id)));
};
