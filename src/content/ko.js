/* AUTO-GENERATED — structured rich-text content (ko).
 * Node trees rendered by src/components/Rich.jsx; converted from the
 * legacy HTML strings by scripts/convert-content.mjs. Edit content here
 * (text nodes are plain strings; elements are { t, cls?, st?, c? }). */
export default {
 "m0": {
  "title": "로드맵: 입문자 → 전문가",
  "sub": "Docker, 쿠버네티스, GPU 인프라를 관통하는 전체 경로입니다. 익힌 항목을 체크하세요 — 진행 상황은 이 브라우저에 저장됩니다. 오른쪽 칩을 누르면 해당 스킬을 가르치는 모듈로 이동합니다.",
  "_ncards": 2,
  "ladder": [
   {
    "t": "div",
    "cls": "card",
    "st": {
     "borderLeft": "4px solid var(--green)"
    },
    "c": [
     "\n",
     {
      "t": "h4",
      "st": {
       "color": "var(--green)"
      },
      "c": [
       "🪜 이 앱에서 실전까지"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "1 · 이 앱"
        ]
       },
       " — 개념과 명령어 근육 기억, 설치 없이."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "2 · Docker Desktop"
        ]
       },
       "(개인 사용 무료) — Docker 실습의 모든 명령이 노트북에서 그대로 동작합니다. Docker는 노트북에서 충분히 잘 돌아갑니다. 사람들이 걱정하는 건 클러스터죠."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "3 · 노트북 위의 진짜 클러스터"
        ]
       },
       " — 반전입니다: ",
       {
        "t": "code",
        "c": [
         "kind"
        ]
       },
       "(Kubernetes-in-Docker)나 ",
       {
        "t": "code",
        "c": [
         "minikube"
        ]
       },
       "는 RAM 약 2GB로 진짜 단일 머신 클러스터를 돌립니다. K8s 실습의 모든 명령이 거기서 동작합니다. ",
       {
        "t": "code",
        "c": [
         "k3s/k3d"
        ]
       },
       "는 더 가벼운 선택지."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "4 · 브라우저 놀이터"
        ]
       },
       " — Play with Docker, Play with Kubernetes, Killercoda가 설치 없이 일회용 멀티 노드 클러스터를 무료로 줍니다."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "5 · 매니지드 클라우드"
        ]
       },
       " — GKE/EKS/AKS 무료 크레딧으로 노트북이 못 하는 것들을: 진짜 LoadBalancer, 클러스터 오토스케일링, 그리고 6단계 연습용 저렴한 스팟 GPU(T4는 시간당 약 $0.10–0.30)."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "6 · 자격증"
        ]
       },
       " — CKAD(개발자) → CKA(관리자) → CKS(보안). 전부 터미널 기반 실기 시험이고, 여기 K8s 실습의 명령어가 바로 그 시험이 요구하는 근육 기억입니다."
      ]
     },
     "\n"
    ]
   }
  ]
 },
 "m1": {
  "title": "컨테이너 101",
  "sub": "컨테이너의 실체, 그리고 VM이 아닌 이유.",
  "_ncards": 4,
  "vm": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "컨테이너 vs 가상 머신"
      ]
     },
     "\n",
     {
      "t": "table",
      "cls": "cmp",
      "c": [
       "\n",
       {
        "t": "tr",
        "c": [
         {
          "t": "th",
          "c": []
         },
         {
          "t": "th",
          "c": [
           "가상 머신"
          ]
         },
         {
          "t": "th",
          "c": [
           "컨테이너"
          ]
         }
        ]
       },
       "\n",
       {
        "t": "tr",
        "c": [
         {
          "t": "td",
          "c": [
           "가상화 대상"
          ]
         },
         {
          "t": "td",
          "c": [
           "하드웨어 — VM마다 완전한 게스트 OS"
          ]
         },
         {
          "t": "td",
          "c": [
           "OS — 프로세스가 호스트 커널을 공유하고 네임스페이스 & cgroups로 격리"
          ]
         }
        ]
       },
       "\n",
       {
        "t": "tr",
        "c": [
         {
          "t": "td",
          "c": [
           "크기"
          ]
         },
         {
          "t": "td",
          "c": [
           "GB 단위"
          ]
         },
         {
          "t": "td",
          "c": [
           "MB 단위"
          ]
         }
        ]
       },
       "\n",
       {
        "t": "tr",
        "c": [
         {
          "t": "td",
          "c": [
           "시작 시간"
          ]
         },
         {
          "t": "td",
          "c": [
           "분 단위"
          ]
         },
         {
          "t": "td",
          "c": [
           "밀리초–초 단위"
          ]
         }
        ]
       },
       "\n",
       {
        "t": "tr",
        "c": [
         {
          "t": "td",
          "c": [
           "격리"
          ]
         },
         {
          "t": "td",
          "c": [
           "강함 (하이퍼바이저)"
          ]
         },
         {
          "t": "td",
          "c": [
           "좋음 (커널 기능)"
          ]
         }
        ]
       },
       "\n"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "컨테이너는 커널에게 속고 있는 ",
       {
        "t": "b",
        "c": [
         "평범한 리눅스 프로세스"
        ]
       },
       "입니다: 자기만의 파일시스템, 네트워크, 프로세스 트리가 보이고(",
       {
        "t": "b",
        "c": [
         "네임스페이스"
        ]
       },
       "), 쓸 수 있는 CPU/RAM이 제한됩니다(",
       {
        "t": "b",
        "c": [
         "cgroups"
        ]
       },
       "). 부팅할 것이 없으니 즉시 시작하는 거죠."
      ]
     },
     "\n"
    ]
   }
  ],
  "vocab": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "꼭 필요한 어휘"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "이미지"
        ]
       },
       " — 얼려진 템플릿(클래스 같은 것). ",
       {
        "t": "b",
        "c": [
         "컨테이너"
        ]
       },
       " — 실행 중인 인스턴스(객체 같은 것). ",
       {
        "t": "b",
        "c": [
         "레지스트리"
        ]
       },
       " — 이미지가 사는 곳(Docker Hub, GHCR). ",
       {
        "t": "b",
        "c": [
         "Dockerfile"
        ]
       },
       " — 이미지를 빌드하는 레시피. ",
       {
        "t": "b",
        "c": [
         "태그"
        ]
       },
       " — 버전 라벨, 예: ",
       {
        "t": "code",
        "c": [
         "nginx:1.27"
        ]
       },
       "; ",
       {
        "t": "code",
        "c": [
         "latest"
        ]
       },
       "는 그저 기본 태그일 뿐 \"마법처럼 최신\"이 아닙니다."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "준비됐나요? ",
       {
        "t": "b",
        "c": [
         "Docker 실습"
        ]
       },
       "을 열고 진짜 명령을 입력해 보세요. →"
      ]
     },
     "\n"
    ]
   }
  ],
  "layersTitle": "이미지는 레이어입니다 🥞",
  "layersIntro": [
   {
    "t": "b",
    "c": [
     "이미지"
    ]
   },
   "는 ",
   {
    "t": "code",
    "c": [
     "Dockerfile"
    ]
   },
   "로 빌드된 읽기 전용 파일시스템 레이어 스택입니다. ",
   {
    "t": "b",
    "c": [
     "컨테이너"
    ]
   },
   " = 이미지 + 맨 위의 얇은 쓰기 레이어 하나. Dockerfile 빌드를 한 단계씩 눌러보세요:"
  ],
  "layerLabels": [
   "레이어 1 · python:3.12-slim 베이스 (≈120 MB)",
   "레이어 2 · flask 설치 (≈12 MB)",
   "레이어 3 · app.py 복사 (2 kB)",
   "메타데이터 · CMD (0 B — 설정만)",
   [
    "▲ 쓰기 가능한 컨테이너 레이어 (",
    {
     "t": "code",
     "c": [
      "docker run"
     ]
    },
    " 시 추가)"
   ]
  ],
  "layersBtn": "▶ docker build — 다음 단계",
  "layersReset": "초기화",
  "layersHint0": "Dockerfile 명령 하나가 레이어 하나를 만듭니다. 레이어는 캐시되고 이미지끼리 공유됩니다 — pull이 빠른 이유죠.",
  "lcTitle": "컨테이너 생명주기",
  "lcHint0": "순서대로 — 또는 순서를 어겨서 — 눌러보고 실제 Docker라면 뭐라고 할지 확인하세요."
 },
 "m2": {
  "title": "Docker 실습",
  "sub": [
   "시뮬레이션된 Docker 엔진입니다. 명령을 입력하면 오른쪽 상태가 실시간으로 바뀝니다. ",
   {
    "t": "code",
    "c": [
     "help"
    ]
   },
   "부터."
  ],
  "_ncards": 0,
  "missions": [
   {
    "id": "pull",
    "text": [
     "이미지 받기: ",
     {
      "t": "code",
      "c": [
       "docker pull nginx"
      ]
     }
    ]
   },
   {
    "id": "run",
    "text": [
     "포트를 열고 백그라운드 실행: ",
     {
      "t": "code",
      "c": [
       "docker run -d -p 8080:80 --name web nginx"
      ]
     }
    ]
   },
   {
    "id": "ps",
    "text": [
     "실행 중인 컨테이너 목록: ",
     {
      "t": "code",
      "c": [
       "docker ps"
      ]
     }
    ]
   },
   {
    "id": "logs",
    "text": [
     "로그 확인: ",
     {
      "t": "code",
      "c": [
       "docker logs web"
      ]
     }
    ]
   },
   {
    "id": "exec",
    "text": [
     "컨테이너 내부 들여다보기: ",
     {
      "t": "code",
      "c": [
       "docker exec web ls /"
      ]
     }
    ]
   },
   {
    "id": "clean",
    "text": [
     "정리: ",
     {
      "t": "code",
      "c": [
       "docker stop web"
      ]
     },
     " 그리고 ",
     {
      "t": "code",
      "c": [
       "docker rm web"
      ]
     }
    ]
   }
  ],
  "hint": [
   "지원: ",
   {
    "t": "code",
    "c": [
     "pull, run (-d, -p, --name, --gpus all), ps (-a), stop, start, rm, rmi, images, logs, exec, inspect"
    ]
   },
   ", 그리고 ",
   {
    "t": "code",
    "c": [
     "nvidia-smi"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "curl localhost:PORT"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "clear"
    ]
   },
   ". ↑/↓로 명령 히스토리."
  ],
  "termHead": "노트북 — docker 호스트 (시뮬레이션)",
  "missionsTitle": "🎯 미션",
  "placeholder": "docker run -d -p 8080:80 nginx",
  "panelTitles": [
   "📦 로컬 이미지",
   "🐳 컨테이너"
  ]
 },
 "m3": {
  "title": "쿠버네티스 개념",
  "sub": "Docker는 한 머신에서 컨테이너 하나를 돌립니다. 쿠버네티스는 머신 함대 위에서 수천 개를 돌리고 — 계속 살려둡니다.",
  "_ncards": 3,
  "objects": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "매일 쓰게 될 오브젝트"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Pod"
        ]
       },
       " — 최소 단위; 네트워크/스토리지를 공유하는 컨테이너 1개 이상. 파드는 ",
       {
        "t": "i",
        "c": [
         "일회용"
        ]
       },
       "입니다 — 절대 애지중지하지 마세요."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Deployment"
        ]
       },
       " — \"이 파드 템플릿의 레플리카 N개를 유지하고, 업데이트를 안전하게 굴려라.\" 생 파드가 아니라 거의 항상 Deployment를 만듭니다."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Service"
        ]
       },
       " — 끊임없이 바뀌는 파드들 위의 고정된 이름 + 가상 IP 로드밸런서."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Namespace"
        ]
       },
       " — 오브젝트의 폴더. ",
       {
        "t": "b",
        "c": [
         "Node"
        ]
       },
       " — 머신. ",
       {
        "t": "b",
        "c": [
         "kubectl"
        ]
       },
       " — API 서버로 가는 나의 CLI."
      ]
     },
     "\n"
    ]
   }
  ],
  "cpLabels": [
   {
    "cp": "api",
    "label": "kube-apiserver"
   },
   {
    "cp": "etcd",
    "label": "etcd"
   },
   {
    "cp": "sched",
    "label": "kube-scheduler"
   },
   {
    "cp": "cm",
    "label": "controller-manager"
   },
   {
    "cp": "kubelet",
    "label": "kubelet (모든 노드에)"
   },
   {
    "cp": "proxy",
    "label": "kube-proxy (모든 노드에)"
   }
  ],
  "cpEmpty": [
   {
    "t": "p",
    "cls": "empty",
    "c": [
     "← 컴포넌트를 클릭하면 하는 일이 나옵니다."
    ]
   }
  ],
  "demoTitle": "클러스터가 일하는 모습",
  "demoIntro": [
   {
    "t": "b",
    "c": [
     "원하는 상태"
    ]
   },
   "를 선언하면(\"내 웹 앱 레플리카 3개\") 컨트롤러가 현실을 거기에 맞춥니다. 직접 해보세요:"
  ],
  "demoBtns": [
   "1 · 레플리카 3개 배포",
   "2 · 💥 파드 죽이기",
   "3 · 6개로 스케일",
   "4 · 롤링 업데이트",
   "초기화"
  ],
  "narrator0": "스케줄러가 파드를 노드에 분산합니다. 하나가 죽으면 ReplicaSet 컨트롤러가 실제 ≠ 원함 을 감지하고 대체 파드를 만듭니다. 아무도 손으로 재시작하지 않습니다.",
  "legend": [
   "Running",
   "생성 중",
   "종료 중",
   "새 버전 (v2)"
  ],
  "clusterTitle": "클러스터: 컨트롤 플레인 + 워커"
 },
 "m4": {
  "title": "쿠버네티스 실습",
  "sub": "진짜 조정 루프가 도는 시뮬레이션 3노드 클러스터입니다. 파드를 지워보세요 — 컨트롤러가 교체하는 걸 보게 됩니다.",
  "_ncards": 0,
  "missions": [
   {
    "id": "nodes",
    "text": [
     "클러스터 살펴보기: ",
     {
      "t": "code",
      "c": [
       "kubectl get nodes"
      ]
     }
    ]
   },
   {
    "id": "create",
    "text": [
     "앱 배포: ",
     {
      "t": "code",
      "c": [
       "kubectl create deployment web --image=nginx --replicas=3"
      ]
     }
    ]
   },
   {
    "id": "heal",
    "text": [
     "아무 파드나 삭제(",
     {
      "t": "code",
      "c": [
       "kubectl delete pod <이름>"
      ]
     },
     ")하고 자가 치유 관찰"
    ]
   },
   {
    "id": "scale",
    "text": [
     "스케일 업: ",
     {
      "t": "code",
      "c": [
       "kubectl scale deployment web --replicas=6"
      ]
     }
    ]
   },
   {
    "id": "expose",
    "text": [
     "노출: ",
     {
      "t": "code",
      "c": [
       "kubectl expose deployment web --port=80"
      ]
     }
    ]
   },
   {
    "id": "rollout",
    "text": [
     "롤링 업데이트: ",
     {
      "t": "code",
      "c": [
       "kubectl set image deployment/web nginx=nginx:1.27"
      ]
     }
    ]
   },
   {
    "id": "undo",
    "text": [
     "롤백: ",
     {
      "t": "code",
      "c": [
       "kubectl rollout undo deployment/web"
      ]
     },
     " (이후 ",
     {
      "t": "code",
      "c": [
       "rollout history"
      ]
     },
     " 확인)"
    ]
   },
   {
    "id": "apply",
    "text": [
     "실무 워크플로 — YAML 생성 후 적용: ",
     {
      "t": "code",
      "c": [
       "kubectl create deployment api --image=redis --dry-run=client -o yaml > api.yaml"
      ]
     },
     ", 그다음 ",
     {
      "t": "code",
      "c": [
       "kubectl apply -f api.yaml"
      ]
     }
    ]
   }
  ],
  "hint": [
   "이 클러스터는 진짜 kubectl을 알아듣습니다: 네임스페이스(",
   {
    "t": "code",
    "c": [
     "-n"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "-A"
    ]
   },
   "), 레이블(",
   {
    "t": "code",
    "c": [
     "-l"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "--show-labels"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "label"
    ]
   },
   "), YAML(",
   {
    "t": "code",
    "c": [
     "apply -f"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "-o yaml"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "--dry-run=client"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "edit"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "> file.yaml"
    ]
   },
   "), ",
   {
    "t": "code",
    "c": [
     "run"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "logs"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "exec"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "rollout history/undo"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "get events|endpoints|rs"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "cordon/drain/taint"
    ]
   },
   "… 전체 목록은 ",
   {
    "t": "code",
    "c": [
     "help"
    ]
   },
   ", ",
   {
    "t": "code",
    "c": [
     "k"
    ]
   },
   " = kubectl. 워커당 파드 4개 — 10개로 스케일해 ",
   {
    "t": "b",
    "c": [
     "Pending"
    ]
   },
   "을, 이미지 ",
   {
    "t": "code",
    "c": [
     "ngnix"
    ]
   },
   "(오타!)를 배포해 ",
   {
    "t": "b",
    "c": [
     "ImagePullBackOff"
    ]
   },
   "를 만나보세요."
  ],
  "termHead": "노트북 — kubectl → sim-cluster",
  "missionsTitle": "🎯 미션",
  "placeholder": "kubectl get nodes",
  "panelTitles": [
   "☸️ 실시간 클러스터 뷰"
  ]
 },
 "m5": {
  "title": "컨테이너와 쿠버네티스의 GPU",
  "sub": "ML 워크로드가 GPU를 얻는 실제 방식 — 배우는 데 GPU는 필요 없습니다.",
  "_ncards": 4,
  "toolkit": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "1 · Docker + GPU: NVIDIA Container Toolkit"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "컨테이너는 호스트 커널을 공유합니다 — 그래서 호스트의 ",
       {
        "t": "b",
        "c": [
         "GPU 드라이버"
        ]
       },
       "도 쓸 수 있죠. ",
       {
        "t": "code",
        "c": [
         "--gpus"
        ]
       },
       "를 주면 NVIDIA Container Toolkit이 드라이버 라이브러리와 디바이스 파일(",
       {
        "t": "code",
        "c": [
         "/dev/nvidia0…"
        ]
       },
       ")을 컨테이너에 주입합니다."
      ]
     },
     "\n",
     {
      "t": "div",
      "cls": "grid2",
      "c": [
       "\n",
       {
        "t": "div",
        "cls": "stackrow",
        "c": [
         "\n",
         {
          "t": "div",
          "st": {
           "borderColor": "var(--cyan)"
          },
          "c": [
           "내 컨테이너: PyTorch, CUDA ",
           {
            "t": "b",
            "c": [
             "런타임"
            ]
           },
           " 12.x"
          ]
         },
         "\n",
         {
          "t": "div",
          "st": {
           "borderColor": "var(--nvidia)"
          },
          "c": [
           "← 주입됨: 드라이버 라이브러리(libcuda.so), /dev/nvidia*"
          ]
         },
         "\n",
         {
          "t": "div",
          "c": [
           "containerd / Docker + nvidia-container-toolkit"
          ]
         },
         "\n",
         {
          "t": "div",
          "st": {
           "borderColor": "var(--nvidia)"
          },
          "c": [
           "호스트: NVIDIA 커널 드라이버"
          ]
         },
         "\n",
         {
          "t": "div",
          "c": [
           "호스트: 리눅스 커널 + GPU 하드웨어"
          ]
         },
         "\n"
        ]
       },
       "\n",
       {
        "t": "div",
        "c": [
         "\n",
         {
          "t": "p",
          "c": [
           {
            "t": "b",
            "c": [
             "핵심 통찰:"
            ]
           },
           " CUDA ",
           {
            "t": "i",
            "c": [
             "툴킷/런타임"
            ]
           },
           "은 ",
           {
            "t": "b",
            "c": [
             "이미지 안에"
            ]
           },
           " 실려 있고(그래서 ",
           {
            "t": "code",
            "c": [
             "pytorch/pytorch"
            ]
           },
           "가 ~7 GB), ",
           {
            "t": "i",
            "c": [
             "드라이버"
            ]
           },
           "는 호스트에 남습니다. 이미지의 CUDA 버전은 호스트 드라이버가 지원하는 버전 이하여야 합니다."
          ]
         },
         "\n",
         {
          "t": "p",
          "c": [
           "Docker 실습에서 해보세요: ",
           {
            "t": "code",
            "c": [
             "docker run --gpus all pytorch/pytorch nvidia-smi"
            ]
           },
           " — 그다음 ",
           {
            "t": "code",
            "c": [
             "--gpus"
            ]
           },
           " ",
           {
            "t": "i",
            "c": [
             "없이"
            ]
           },
           " 실행해서 그 유명한 에러를 구경하세요."
          ]
         },
         "\n"
        ]
       },
       "\n"
      ]
     },
     "\n"
    ]
   }
  ],
  "expert": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "4 · 전문가 레벨: 멀티 노드 학습 & ML 플랫폼 스택"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "분산 학습"
        ]
       },
       ": 64-GPU 잡 = 8개 노드 위 8개 파드 × 8 GPU. 쿠버네티스는 파드 스케줄링만 하고, 그래디언트는 ",
       {
        "t": "b",
        "c": [
         "NCCL"
        ]
       },
       "(노드 안은 NVLink로 all-reduce, 노드 사이는 InfiniBand/RoCE)이 나릅니다 — ",
       {
        "t": "code",
        "c": [
         "torchrun"
        ]
       },
       ", Ray, Kubeflow training operator가 지휘하고요. 병목은 대개 GPU 개수가 아니라 인터커넥트 토폴로지입니다."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "갱 스케줄링"
        ]
       },
       ": 기본 스케줄러는 파드를 하나씩 배치합니다 — 16-GPU 잡이 12개만 쥔 채 나머지 4개를 기다리며 모두를 막는 교착이 생길 수 있죠. ",
       {
        "t": "b",
        "c": [
         "Kueue"
        ]
       },
       "와 ",
       {
        "t": "b",
        "c": [
         "Volcano"
        ]
       },
       "가 전부-아니면-전무 admission과 잡 큐, 우선순위, 선점으로 해결합니다 — GPU 클러스터를 공유하는 순간 필수품입니다."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "실전 스택"
        ]
       },
       ": NVIDIA ",
       {
        "t": "b",
        "c": [
         "GPU Operator"
        ]
       },
       "가 드라이버 + device plugin + ",
       {
        "t": "b",
        "c": [
         "DCGM exporter"
        ]
       },
       "(GPU별 사용률/메모리/온도를 Prometheus로 — 5단계 관측성의 재사용)를 설치합니다. GPU를 더 사기 전에 DCGM부터 보세요: 할당됐지만 노는 GPU가 비용 누수 1위입니다. 그 위에 Kubeflow, Ray, Run:ai 같은 플랫폼이 있지만 — 전부 이제 아는 원시 요소들로 만들어졌습니다: device plugin, 오퍼레이터, 스케줄러, 조정 루프."
      ]
     },
     "\n"
    ]
   }
  ],
  "dpIntro": [
   {
    "t": "div",
    "cls": "card",
    "c": [
     "\n",
     {
      "t": "h4",
      "c": [
       "2 · 쿠버네티스 GPU 스케줄링 — device plugin"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "kubelet은 GPU가 뭔지 모릅니다. ",
       {
        "t": "b",
        "c": [
         "NVIDIA device plugin"
        ]
       },
       "(DaemonSet)이 각 GPU 노드에 ",
       {
        "t": "code",
        "c": [
         "nvidia.com/gpu: 4"
        ]
       },
       " 를 광고합니다. 파드는 다른 자원처럼 GPU를 ",
       {
        "t": "i",
        "c": [
         "요청"
        ]
       },
       "하고 — GPU는 ",
       {
        "t": "b",
        "c": [
         "공유도 초과 할당도 없이"
        ]
       },
       " 요청당 통째로 배정됩니다."
      ]
     },
     "\n",
     {
      "t": "pre",
      "st": {
       "background": "#010409",
       "border": "1px solid var(--border)",
       "borderRadius": "8px",
       "padding": "10px",
       "fontSize": "12px"
      },
      "c": [
       "resources:\n  limits:\n    ",
       {
        "t": "span",
        "st": {
         "color": "var(--nvidia)"
        },
        "c": [
         "nvidia.com/gpu: 2"
        ]
       },
       "   # 스케줄러가 GPU 2개가 빈 노드를 찾는다"
      ]
     },
     "\n"
    ]
   }
  ],
  "simTitle": "🧪 GPU 스케줄링 시뮬레이터",
  "simIntro": "클러스터: GPU 노드 2대(각 A100 4장) + CPU 전용 노드 1대. 학습 잡을 스케줄해 보세요:",
  "simEvents0": "스케줄러 이벤트가 여기에 표시됩니다.",
  "gpuOpts": [
   "1개",
   "2개",
   "4개",
   "8개"
  ],
  "btnSchedule": "파드 스케줄",
  "btnReset": "클러스터 초기화",
  "gpuReqLabel": "잡에 필요한 GPU:",
  "migBefore": [
   "\n",
   {
    "t": "h4",
    "c": [
     "3 · GPU 나눠 쓰기: MIG & 타임슬라이싱"
    ]
   },
   "\n",
   {
    "t": "p",
    "c": [
     "GPU 통째 할당은 작은 워크로드(노트북, 추론)에 돈 낭비입니다. 해법 둘:"
    ]
   },
   "\n"
  ],
  "migAfter": [
   "\n",
   {
    "t": "p",
    "c": [
     {
      "t": "b",
      "c": [
       "타임슬라이싱"
      ]
     },
     ": 소프트웨어 레벨 — device plugin이 GPU 1개를 N개(예: ",
     {
      "t": "code",
      "c": [
       "nvidia.com/gpu: 10"
      ]
     },
     ")로 광고하고 워크로드가 순번을 돌아가며 씁니다. 메모리 격리가 없어 욕심 많은 파드 하나가 다른 파드를 OOM시킬 수 있습니다. 개발/노트북엔 좋고, 프로덕션엔 위험."
    ]
   },
   "\n",
   {
    "t": "table",
    "cls": "cmp",
    "c": [
     "\n",
     {
      "t": "tr",
      "c": [
       {
        "t": "th",
        "c": []
       },
       {
        "t": "th",
        "c": [
         "MIG"
        ]
       },
       {
        "t": "th",
        "c": [
         "타임슬라이싱"
        ]
       }
      ]
     },
     "\n",
     {
      "t": "tr",
      "c": [
       {
        "t": "td",
        "c": [
         "격리"
        ]
       },
       {
        "t": "td",
        "c": [
         "하드웨어 (메모리 + 연산)"
        ]
       },
       {
        "t": "td",
        "c": [
         "없음"
        ]
       }
      ]
     },
     "\n",
     {
      "t": "tr",
      "c": [
       {
        "t": "td",
        "c": [
         "하드웨어"
        ]
       },
       {
        "t": "td",
        "c": [
         "A100/H100/B100만"
        ]
       },
       {
        "t": "td",
        "c": [
         "모든 NVIDIA GPU"
        ]
       }
      ]
     },
     "\n",
     {
      "t": "tr",
      "c": [
       {
        "t": "td",
        "c": [
         "적합한 곳"
        ]
       },
       {
        "t": "td",
        "c": [
         "멀티테넌트 프로덕션 추론"
        ]
       },
       {
        "t": "td",
        "c": [
         "개발, 노트북, 간헐적 소형 잡"
        ]
       }
      ]
     },
     "\n"
    ]
   },
   "\n"
  ],
  "migGpuName": "NVIDIA A100 80GB",
  "migHint0": [
   {
    "t": "b",
    "c": [
     "MIG"
    ]
   },
   "(Multi-Instance GPU, A100/H100+): GPU 하나를 전용 메모리/연산을 가진 최대 7개의 격리 인스턴스로 하드웨어 분할합니다. 각각이 독립적인 스케줄링 자원(",
   {
    "t": "code",
    "c": [
     "nvidia.com/mig-1g.10gb"
    ]
   },
   ")으로 나타납니다. 격리가 강력해 멀티테넌트 클러스터에 안전합니다."
  ]
 },
 "m6": {
  "title": "퀴즈 — 시험 도메인별로 태그된 전체 문제은행",
  "sub": "모든 문제에 CKA/CKAD 도메인이 붙어 있습니다. 시험이나 도메인 하나에 집중해 풀고, 채점하고, 틀린 문제를 복습하세요 — 도메인별 정답률이 시험장(Exam Room)의 준비도 대시보드에 반영됩니다.",
  "_ncards": 0,
  "gradeBtn": "채점하기",
  "focusLabel": "집중:",
  "allLabel": "전체",
  "allDomains": "모든 도메인",
  "questionCount": "문제가 이 세트에 있습니다",
  "accTitle": "📊 도메인별 정답률 (누적)",
  "scoreLabel": "점수",
  "reviewTitle": "틀린 문제 복습",
  "retryBtn": "다시 풀기"
 },
 "m7": {
  "title": "Docker 깊이 보기",
  "sub": "2단계: \"컨테이너 돌릴 줄 알아요\"와 \"컨테이너로 배포합니다\"를 가르는 것들.",
  "_ncards": 6,
  "cards": [
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "레이어 캐시 — 명령 순서가 곧 성능"
       ]
      },
      "\n",
      {
       "t": "div",
       "cls": "grid2",
       "c": [
        "\n",
        {
         "t": "div",
         "c": [
          "\n",
          {
           "t": "pre",
           "cls": "code",
           "c": [
            {
             "t": "span",
             "cls": "cm",
             "c": [
              "# ❌ 코드만 고쳐도 pip install이 다시 돈다"
             ]
            },
            "\nCOPY . .\nRUN pip install -r requirements.txt"
           ]
          },
          "\n",
          {
           "t": "pre",
           "cls": "code",
           "c": [
            {
             "t": "span",
             "cls": "cm",
             "c": [
              "# ✅ requirements.txt가 바뀔 때까지 deps 레이어 캐시 유지"
             ]
            },
            "\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . ."
           ]
          },
          "\n"
         ]
        },
        "\n",
        {
         "t": "div",
         "c": [
          "\n",
          {
           "t": "p",
           "c": [
            "Docker는 해당 명령과 ",
            {
             "t": "i",
             "c": [
              "그 이전 전부"
             ]
            },
            "가 안 바뀌었을 때만 캐시 레이어를 재사용합니다. 느리고 잘 안 바뀌는 단계(의존성)를 자주 바뀌는 단계(내 코드) 앞에 두세요. ML 이미지에서는 이게 4초 재빌드와 25분 재빌드의 차이입니다."
           ]
          },
          "\n"
         ]
        },
        "\n"
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "데이터 — 쓰기 레이어는 컨테이너와 함께 죽는다"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "컨테이너가 자기 파일시스템에 쓴 것은 ",
        {
         "t": "code",
         "c": [
          "docker rm"
         ]
        },
        "과 함께 삭제됩니다. 영속 데이터에는 마운트가 필요합니다:"
       ]
      },
      "\n",
      {
       "t": "table",
       "cls": "cmp",
       "c": [
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "th",
           "c": []
          },
          {
           "t": "th",
           "c": [
            "볼륨"
           ]
          },
          {
           "t": "th",
           "c": [
            "바인드 마운트"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "문법"
           ]
          },
          {
           "t": "td",
           "c": [
            {
             "t": "code",
             "c": [
              "-v pgdata:/var/lib/postgresql/data"
             ]
            }
           ]
          },
          {
           "t": "td",
           "c": [
            {
             "t": "code",
             "c": [
              "-v ./src:/app/src"
             ]
            }
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "위치"
           ]
          },
          {
           "t": "td",
           "c": [
            "Docker가 관리하는 호스트 영역"
           ]
          },
          {
           "t": "td",
           "c": [
            "내가 지정한 호스트 폴더 그대로"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "적합한 곳"
           ]
          },
          {
           "t": "td",
           "c": [
            "데이터베이스, 프로덕션 전반"
           ]
          },
          {
           "t": "td",
           "c": [
            "개발 중 코드 실시간 편집"
           ]
          }
         ]
        },
        "\n"
       ]
      },
      "\n",
      {
       "t": "p",
       "cls": "hint",
       "c": [
        "같은 아이디어가 쿠버네티스에서 PersistentVolume(4단계)으로 다시 등장합니다 — 파드도 컨테이너만큼 일회용이라, 상태는 항상 바깥에 삽니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "네트워킹 — 컨테이너는 이름으로 서로를 찾는다"
       ]
      },
      "\n",
      {
       "t": "pre",
       "cls": "code",
       "c": [
        "docker network create mynet\ndocker run -d --name db  --network mynet postgres\ndocker run -d --name api --network mynet myapp   ",
        {
         "t": "span",
         "cls": "cm",
         "c": [
          "# api는 이제 \"db:5432\"로 접근 — Docker DNS가 컨테이너 이름을 해석"
         ]
        }
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "사용자 정의 네트워크"
         ]
        },
        "에서 컨테이너는 컨테이너 이름으로 서로를 해석합니다 — 설정에 IP가 필요 없습니다. ",
        {
         "t": "code",
         "c": [
          "-p 호스트:컨테이너"
         ]
        },
        "는 ",
        {
         "t": "i",
         "c": [
          "바깥에서"
         ]
        },
        "(내 브라우저) 컨테이너에 닿을 때만 필요합니다. 컨테이너끼리는 절대 필요 없습니다."
       ]
      },
      "\n",
      {
       "t": "p",
       "cls": "hint",
       "c": [
        "쿠버네티스는 이걸 더 밀어붙입니다: 모든 파드가 자기 IP를 갖고, Service가 클러스터 전체 고정 DNS 이름(",
        {
         "t": "code",
         "c": [
          "web.default.svc.cluster.local"
         ]
        },
        ")을 줍니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "Docker Compose — 스택 전체를 파일 하나에"
       ]
      },
      "\n",
      {
       "t": "div",
       "cls": "grid2",
       "c": [
        "\n",
        {
         "t": "pre",
         "cls": "code",
         "c": [
          {
           "t": "span",
           "cls": "cm",
           "c": [
            "# compose.yaml — 웹 + 캐시 + DB"
           ]
          },
          "\n",
          {
           "t": "span",
           "cls": "k",
           "c": [
            "services"
           ]
          },
          ":\n  ",
          {
           "t": "span",
           "cls": "g",
           "c": [
            "web"
           ]
          },
          ":\n    build: .\n    ports: [\"8080:80\"]\n    depends_on: [db, cache]\n  ",
          {
           "t": "span",
           "cls": "g",
           "c": [
            "cache"
           ]
          },
          ":\n    image: redis:7\n  ",
          {
           "t": "span",
           "cls": "g",
           "c": [
            "db"
           ]
          },
          ":\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: dev\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n",
          {
           "t": "span",
           "cls": "k",
           "c": [
            "volumes"
           ]
          },
          ":\n  pgdata:"
         ]
        },
        "\n",
        {
         "t": "div",
         "c": [
          "\n",
          {
           "t": "p",
           "c": [
            {
             "t": "code",
             "c": [
              "docker compose up -d"
             ]
            },
            " 하나로 전부 시작(서로 네트워크로 연결, 서비스 이름으로 DNS), ",
            {
             "t": "code",
             "c": [
              "docker compose down"
             ]
            },
            "으로 전부 제거. git에 든 파일 하나 = 팀 전체의 재현 가능한 개발 환경."
           ]
          },
          "\n",
          {
           "t": "p",
           "cls": "hint",
           "c": [
            {
             "t": "b",
             "c": [
              "쿠버네티스로 가는 다리입니다:"
             ]
            },
            " Compose는 머신 한 대를 위한 선언적 원하는 상태. K8s 매니페스트는 같은 아이디어를 함대에 적용한 것 — 거기에 조정 루프까지. 이 파일을 읽을 수 있다면 4단계의 YAML도 낯설지 않을 겁니다."
           ]
          },
          "\n"
         ]
        },
        "\n"
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "레지스트리, 태그 & 다이제스트"
       ]
      },
      "\n",
      {
       "t": "pre",
       "cls": "code",
       "c": [
        "docker tag myapp ",
        {
         "t": "span",
         "cls": "g",
         "c": [
          "ghcr.io/daniel/myapp:1.4.2"
         ]
        },
        "   ",
        {
         "t": "span",
         "cls": "cm",
         "c": [
          "# 레지스트리/네임스페이스/저장소:태그"
         ]
        },
        "\ndocker push ghcr.io/daniel/myapp:1.4.2"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "code",
         "c": [
          ":latest"
         ]
        },
        "는 그저 기본 태그 이름일 뿐 — 자동으로 최신이 ",
        {
         "t": "b",
         "c": [
          "아니고"
         ]
        },
        ", 게다가 ",
        {
         "t": "i",
         "c": [
          "움직입니다"
         ]
        },
        ": 같은 태그가 내일은 다른 바이트를 가리킬 수 있습니다. 프로덕션은 버전(",
        {
         "t": "code",
         "c": [
          ":1.4.2"
         ]
        },
        ")이나 불변 다이제스트(",
        {
         "t": "code",
         "c": [
          "@sha256:…"
         ]
        },
        ")를 고정합니다. 쿠버네티스도 태그로 이미지를 당깁니다 — 움직이는 태그 + ",
        {
         "t": "code",
         "c": [
          "imagePullPolicy"
         ]
        },
        " 혼동은 고전적인 장애 원인입니다."
       ]
      },
      "\n"
     ]
    }
   ]
  ],
  "msPre": [
   {
    "t": "pre",
    "cls": "code",
    "c": [
     {
      "t": "span",
      "cls": "cm",
      "c": [
       "# 1단계: 빌드 (컴파일러, SDK — 거대함)"
      ]
     },
     "\n",
     {
      "t": "span",
      "cls": "k",
      "c": [
       "FROM"
      ]
     },
     " golang:1.24 ",
     {
      "t": "span",
      "cls": "k",
      "c": [
       "AS"
      ]
     },
     " build\nWORKDIR /src\nCOPY . .\nRUN go build -o /app/server .\n\n",
     {
      "t": "span",
      "cls": "cm",
      "c": [
       "# 2단계: 런타임 — 거의 아무것도 없는 상태에서 시작"
      ]
     },
     "\n",
     {
      "t": "span",
      "cls": "k",
      "c": [
       "FROM"
      ]
     },
     " gcr.io/distroless/static\nCOPY ",
     {
      "t": "span",
      "cls": "g",
      "c": [
       "--from=build"
      ]
     },
     " /app/server /server\nENTRYPOINT [\"/server\"]"
    ]
   }
  ],
  "msHint": "마지막 스테이지만 이미지가 됩니다. 빌드 도구, 소스, 캐시는 남겨두고요. 작은 이미지 = 빠른 pull, 빠른 파드 시작, 작은 공격 표면.",
  "msTitle": "멀티 스테이지 빌드 — 툴체인 말고 앱만 배포"
 },
 "m8": {
  "title": "쿠버네티스 운영 툴킷",
  "sub": "4단계: 실습에서는 명령형 커맨드를 배웠습니다. 실제 클러스터는 선언적 YAML과 아래 기능들로 돌아갑니다.",
  "_ncards": 8,
  "cards": [
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "선언적 YAML — 진짜 워크플로"
       ]
      },
      "\n",
      {
       "t": "div",
       "cls": "grid2",
       "c": [
        "\n",
        {
         "t": "pre",
         "cls": "code",
         "c": [
          {
           "t": "span",
           "cls": "k",
           "c": [
            "apiVersion"
           ]
          },
          ": apps/v1\n",
          {
           "t": "span",
           "cls": "k",
           "c": [
            "kind"
           ]
          },
          ": Deployment\n",
          {
           "t": "span",
           "cls": "k",
           "c": [
            "metadata"
           ]
          },
          ":\n  name: web\n",
          {
           "t": "span",
           "cls": "k",
           "c": [
            "spec"
           ]
          },
          ":\n  replicas: 3\n  selector:\n    matchLabels: {app: web}\n  template:\n    metadata:\n      labels: {app: web}          ",
          {
           "t": "span",
           "cls": "cm",
           "c": [
            "# 레이블이 모든 걸 이어붙이는 접착제"
           ]
          },
          "\n    spec:\n      containers:\n      - name: nginx\n        image: nginx:1.27\n        ports: [{containerPort: 80}]\n        resources:\n          requests: {cpu: 100m, memory: 128Mi}\n          limits: {memory: 256Mi}\n        readinessProbe:\n          httpGet: {path: /, port: 80}"
         ]
        },
        "\n",
        {
         "t": "div",
         "c": [
          "\n",
          {
           "t": "p",
           "c": [
            {
             "t": "code",
             "c": [
              "kubectl apply -f deploy.yaml"
             ]
            },
            " — 파일 자체가 원하는 상태입니다. 몇 번을 적용해도 안전(멱등)합니다. 파일은 git에 삽니다 → 리뷰, 롤백, 감사가 공짜."
           ]
          },
          "\n",
          {
           "t": "p",
           "c": [
            {
             "t": "code",
             "c": [
              "kubectl create deployment …"
             ]
            },
            "(실습 방식)는 학습과 빠른 실험용으로 좋고, 팀은 ",
            {
             "t": "code",
             "c": [
              "apply"
             ]
            },
            "로 일합니다. ",
            {
             "t": "code",
             "c": [
              "kubectl get deploy web -o yaml"
             ]
            },
            "은 살아있는 오브젝트를 YAML로 보여줍니다 — 스키마를 익히는 최고의 방법."
           ]
          },
          "\n",
          {
           "t": "p",
           "cls": "hint",
           "c": [
            {
             "t": "b",
             "c": [
              "레이블 & 셀렉터"
             ]
            },
            "가 접착제입니다: Deployment는 ",
            {
             "t": "code",
             "c": [
              "matchLabels"
             ]
            },
            "로 자기 파드를 찾고, Service도 같은 레이블로 라우팅하며, ",
            {
             "t": "code",
             "c": [
              "kubectl get pods -l app=web"
             ]
            },
            "으로 필터링합니다. ",
            {
             "t": "b",
             "c": [
              "네임스페이스"
             ]
            },
            "는 이 모든 걸 팀/환경별로 구획합니다."
           ]
          },
          "\n"
         ]
        },
        "\n"
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "ConfigMap & Secret — 설정을 이미지 밖으로"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "dev와 prod에서 같은 이미지, 다른 건 주입되는 설정뿐. ",
        {
         "t": "b",
         "c": [
          "ConfigMap"
         ]
        },
        " = 일반 설정, ",
        {
         "t": "b",
         "c": [
          "Secret"
         ]
        },
        " = 자격 증명. 둘 다 환경 변수나 마운트된 파일로 들어옵니다:"
       ]
      },
      "\n",
      {
       "t": "pre",
       "cls": "code",
       "c": [
        "env:\n- name: DB_HOST\n  valueFrom:\n    configMapKeyRef: {name: app-config, key: db_host}\n- name: DB_PASSWORD\n  valueFrom:\n    secretKeyRef: {name: db-creds, key: password}"
       ]
      },
      "\n",
      {
       "t": "p",
       "cls": "hint",
       "c": [
        "면접 단골 함정: Secret은 ",
        {
         "t": "b",
         "c": [
          "base64 인코딩일 뿐, 암호화가 아닙니다"
         ]
        },
        ". 진짜 보호 = etcd 저장 시 암호화, RBAC 제한(5단계), 또는 외부 관리자(Vault, 클라우드 시크릿 스토어)."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "헬스 프로브 — K8s가 앱의 진짜 상태를 아는 방법"
       ]
      },
      "\n",
      {
       "t": "table",
       "cls": "cmp",
       "c": [
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "th",
           "c": [
            "프로브"
           ]
          },
          {
           "t": "th",
           "c": [
            "질문"
           ]
          },
          {
           "t": "th",
           "c": [
            "실패 시"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            {
             "t": "b",
             "c": [
              "liveness"
             ]
            }
           ]
          },
          {
           "t": "td",
           "c": [
            "살아는 있나?"
           ]
          },
          {
           "t": "td",
           "c": [
            "kubelet이 컨테이너를 ",
            {
             "t": "b",
             "c": [
              "재시작"
             ]
            }
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            {
             "t": "b",
             "c": [
              "readiness"
             ]
            }
           ]
          },
          {
           "t": "td",
           "c": [
            "지금 트래픽 받을 수 있나?"
           ]
          },
          {
           "t": "td",
           "c": [
            "파드가 ",
            {
             "t": "b",
             "c": [
              "Service 엔드포인트에서 제외"
             ]
            },
            " — 재시작 아님"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            {
             "t": "b",
             "c": [
              "startup"
             ]
            }
           ]
          },
          {
           "t": "td",
           "c": [
            "아직 부팅 중?"
           ]
          },
          {
           "t": "td",
           "c": [
            "나머지 두 프로브를 보류 (느리게 뜨는 앱, 큰 모델)"
           ]
          }
         ]
        },
        "\n"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "readiness 프로브가 없으면 롤링 업데이트가 준비 안 된 파드로 트래픽을 보냅니다 — 배포마다 잠깐씩 502. 있으면 롤아웃이 기다립니다. 추가할 수 있는 YAML 중 가성비 최고입니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "자원, limits & QoS"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "requests"
         ]
        },
        " = 스케줄러가 예약하는 양(파드 배치를 결정하는 바로 그 숫자 — GPU에서 본 것과 같은 메커니즘). ",
        {
         "t": "b",
         "c": [
          "limits"
         ]
        },
        " = cgroup 상한: CPU 초과 → 스로틀링; 메모리 초과 → ",
        {
         "t": "b",
         "c": [
          "OOMKilled"
         ]
        },
        "(악명 높은 exit code 137)."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "QoS 클래스는 설정에서 따라옵니다: ",
        {
         "t": "b",
         "c": [
          "Guaranteed"
         ]
        },
        "(requests = limits)는 마지막에 축출, ",
        {
         "t": "b",
         "c": [
          "Burstable"
         ]
        },
        "은 중간, ",
        {
         "t": "b",
         "c": [
          "BestEffort"
         ]
        },
        "(아무것도 미설정)는 노드가 부족할 때 제일 먼저 축출. 프로덕션 규칙: requests는 항상, memory limits는 설정, CPU limits는 두 번 생각."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "오토스케일링 — 서로 다른 다이얼 세 개"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "HPA"
         ]
        },
        "(Horizontal Pod Autoscaler): 부하가 오르면 파드 추가. ",
        {
         "t": "code",
         "c": [
          "목표 = ceil(현재 × 사용률/목표치)"
         ]
        },
        " — 예: 파드 3개가 CPU 90%, 목표 60% → 5개. ",
        {
         "t": "b",
         "c": [
          "VPA"
         ]
        },
        ": 같은 파드의 requests 크기 조정. ",
        {
         "t": "b",
         "c": [
          "Cluster Autoscaler"
         ]
        },
        ": ",
        {
         "t": "i",
         "c": [
          "노드"
         ]
        },
        " 추가 — 실습에서 만든 바로 그 ",
        {
         "t": "b",
         "c": [
          "Pending"
         ]
        },
        " 파드를 감시해 머신을 삽니다(GPU 노드 풀도 이렇게 늘어납니다)."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "스토리지 — PV, PVC, StatefulSet"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "파드는 ",
        {
         "t": "b",
         "c": [
          "PersistentVolumeClaim"
         ]
        },
        "(\"10Gi, 빠른 걸로\")으로 스토리지를 요청 → ",
        {
         "t": "b",
         "c": [
          "StorageClass"
         ]
        },
        "가 실제 디스크(EBS, PD, Ceph…)를 ",
        {
         "t": "b",
         "c": [
          "PersistentVolume"
         ]
        },
        "으로 프로비저닝 → 파드에 마운트되고 ",
        {
         "t": "b",
         "c": [
          "파드가 삭제돼도 살아남습니다"
         ]
        },
        ". 요청/공급 분리 덕에 앱 YAML은 클라우드 중립적으로 유지됩니다."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "StatefulSet"
         ]
        },
        " = 상태 있는 앱을 위한 Deployment: 고정된 이름(",
        {
         "t": "code",
         "c": [
          "db-0"
         ]
        },
        ", ",
        {
         "t": "code",
         "c": [
          "db-1"
         ]
        },
        "), 각자의 PVC, 순서 있는 시작/종료. 데이터베이스, Kafka, 정체성이 필요한 모든 것. ML 학습의 모델 체크포인트도 같은 PVC 메커니즘을 씁니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "트래픽 들이기 — Service 타입 & Ingress"
       ]
      },
      "\n",
      {
       "t": "table",
       "cls": "cmp",
       "c": [
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "th",
           "c": [
            "타입"
           ]
          },
          {
           "t": "th",
           "c": [
            "도달 범위"
           ]
          },
          {
           "t": "th",
           "c": [
            "용도"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "ClusterIP"
           ]
          },
          {
           "t": "td",
           "c": [
            "클러스터 내부만"
           ]
          },
          {
           "t": "td",
           "c": [
            "기본값 — 서비스 간 통신"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "NodePort"
           ]
          },
          {
           "t": "td",
           "c": [
            "모든 노드 IP의 :30000-32767"
           ]
          },
          {
           "t": "td",
           "c": [
            "빠른 데모, 베어메탈"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "LoadBalancer"
           ]
          },
          {
           "t": "td",
           "c": [
            "공인 IP를 가진 클라우드 LB"
           ]
          },
          {
           "t": "td",
           "c": [
            "프로덕션 입구, 서비스당 LB 하나($)"
           ]
          }
         ]
        },
        "\n",
        {
         "t": "tr",
         "c": [
          {
           "t": "td",
           "c": [
            "Ingress"
           ]
          },
          {
           "t": "td",
           "c": [
            "LB 하나로 호스트/경로 HTTP 라우팅"
           ]
          },
          {
           "t": "td",
           "c": [
            {
             "t": "code",
             "c": [
              "api.example.com → api-svc"
             ]
            },
            ", TLS 종료 — 보통의 정답"
           ]
          }
         ]
        },
        "\n"
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "Deployment 너머"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "Job"
         ]
        },
        " — 완료까지 실행(배치, 마이그레이션, ML 학습 1회). ",
        {
         "t": "b",
         "c": [
          "CronJob"
         ]
        },
        " — 스케줄 위의 Job. ",
        {
         "t": "b",
         "c": [
          "DaemonSet"
         ]
        },
        " — 노드마다 정확히 파드 하나: 로그 수집기, 모니터링 에이전트… 그리고 6단계의 NVIDIA device plugin — 이제 그게 어떤 종류의 오브젝트인지 아시겠죠."
       ]
      },
      "\n"
     ]
    }
   ]
  ]
 },
 "m9": {
  "title": "프로덕션 & 생태계",
  "sub": "5단계: 쿠버네티스를 진짜로 운영하기 — 패키징, 배포, 관측성, 보안, 확장.",
  "_ncards": 6,
  "cards": [
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "Helm — 패키지 매니저"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "마이크로서비스 10개 × 환경 4개 = YAML 지옥. Helm ",
        {
         "t": "b",
         "c": [
          "차트"
         ]
        },
        "는 템플릿화된 YAML이고, 환경마다 다른 값은 ",
        {
         "t": "code",
         "c": [
          "values.yaml"
         ]
        },
        "에 삽니다(",
        {
         "t": "code",
         "c": [
          "replicas: {{ .Values.replicaCount }}"
         ]
        },
        "). 그리고: ",
        {
         "t": "code",
         "c": [
          "helm install prometheus prometheus-community/kube-prometheus-stack"
         ]
        },
        " — 복잡한 앱 전체가 명령 하나로, ",
        {
         "t": "code",
         "c": [
          "helm upgrade"
         ]
        },
        "/",
        {
         "t": "code",
         "c": [
          "rollback"
         ]
        },
        "으로 관리. 차트를 만들기 한참 전부터 차트를 쓰게 될 겁니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "GitOps — 한 층 위의 조정 루프"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "K8s의 핵심은 이미 알고 있습니다: 컨트롤러가 실제 상태를 원하는 상태에 맞춘다. ",
        {
         "t": "b",
         "c": [
          "GitOps는 같은 루프를 배포 자체에 적용합니다"
         ]
        },
        ": git 저장소가 모든 매니페스트를 담고, 클러스터 내 에이전트(",
        {
         "t": "b",
         "c": [
          "Argo CD"
         ]
        },
        "/",
        {
         "t": "b",
         "c": [
          "Flux"
         ]
        },
        ")가 클러스터와 저장소를 끊임없이 비교하고 동기화합니다. 배포 = PR 머지. 롤백 = ",
        {
         "t": "code",
         "c": [
          "git revert"
         ]
        },
        ". 아무도 prod에 손으로 ",
        {
         "t": "code",
         "c": [
          "kubectl apply"
         ]
        },
        " 하지 않고, 클러스터는 저장소에서 통째로 재구축 가능합니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "관측성"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "메트릭:"
         ]
        },
        " Prometheus가 모든 것을 수집(파드, 노드, kube-state-metrics); Grafana 대시보드; Alertmanager가 호출. 골든 시그널을 보세요: 지연, 트래픽, 오류, 포화. ",
        {
         "t": "b",
         "c": [
          "로그:"
         ]
        },
        " stdout → 노드 에이전트(Fluent Bit) → Loki/Elastic; ",
        {
         "t": "code",
         "c": [
          "kubectl logs"
         ]
        },
        "는 파드 몇 개를 넘으면 못 씁니다. ",
        {
         "t": "b",
         "c": [
          "이벤트:"
         ]
        },
        " ",
        {
         "t": "code",
         "c": [
          "kubectl get events"
         ]
        },
        " / ",
        {
         "t": "code",
         "c": [
          "describe"
         ]
        },
        " — FailedScheduling에서 봤듯 디버깅의 첫 정거장. 디버깅 순서: ",
        {
         "t": "code",
         "c": [
          "get pods"
         ]
        },
        " → ",
        {
         "t": "code",
         "c": [
          "describe"
         ]
        },
        "(이벤트) → ",
        {
         "t": "code",
         "c": [
          "logs"
         ]
        },
        " → ",
        {
         "t": "code",
         "c": [
          "exec"
         ]
        },
        "."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "보안 — 네 개의 층"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "RBAC"
         ]
        },
        ": 누가 무엇을 할 수 있나 — Role(리소스에 대한 동사)을 사용자/ServiceAccount에 바인딩. 모든 파드는 ServiceAccount로 실행됩니다. 최소 권한은 소프트웨어에도 적용됩니다."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "파드 보안"
         ]
        },
        ": ",
        {
         "t": "code",
         "c": [
          "securityContext"
         ]
        },
        " — ",
        {
         "t": "code",
         "c": [
          "runAsNonRoot"
         ]
        },
        ", capability 제거, 읽기 전용 루트 FS. Pod Security Standards가 네임스페이스별로 강제합니다."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "네트워크"
         ]
        },
        ": 기본값으로는 ",
        {
         "t": "i",
         "c": [
          "모든 파드가 모든 파드와 통신 가능"
         ]
        },
        ". NetworkPolicy는 레이블 위의 방화벽: \"db는 app=api 트래픽만 받는다\"."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "공급망"
         ]
        },
        ": 이미지 스캔(Trivy), 다이제스트 고정, 서명(cosign), 최소 베이스 이미지 — 2단계의 distroless 습관이 여기서 빛납니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "CRD & Operator — 쿠버네티스 자체를 확장하기"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "CustomResourceDefinition"
         ]
        },
        "은 API 서버에 새 오브젝트 타입을 가르치고, ",
        {
         "t": "b",
         "c": [
          "Operator"
         ]
        },
        "는 그것을 조정하는 커스텀 컨트롤러입니다. ",
        {
         "t": "code",
         "c": [
          "kind: Certificate"
         ]
        },
        "(cert-manager가 TLS 갱신), ",
        {
         "t": "code",
         "c": [
          "kind: PostgresCluster"
         ]
        },
        "(오퍼레이터가 페일오버/백업 처리), 그리고 — GPU 루프를 닫으며 — ",
        {
         "t": "b",
         "c": [
          "NVIDIA GPU Operator"
         ]
        },
        ": 모든 GPU 노드에 드라이버, device plugin, DCGM 모니터링을 대신 설치합니다. 오퍼레이터를 이해하면 왜 사람들이 \"쿠버네티스는 플랫폼을 만드는 플랫폼\"이라 하는지 알게 됩니다."
       ]
      },
      "\n"
     ]
    }
   ],
   [
    {
     "t": "div",
     "cls": "card",
     "c": [
      "\n",
      {
       "t": "h4",
       "c": [
        "클러스터 자체를 운영하기"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "매니지드 컨트롤 플레인(GKE/EKS/AKS)이 기본값입니다 — 노드 풀, 업그레이드, 비용은 여전히 내 몫. 그래도 순서는 알아두세요: 컨트롤 플레인 업그레이드 → 노드 풀(한 번에 한 노드씩 drain/cordon, 마이너 버전은 한 단계씩), 무엇이든 하기 전에 ",
        {
         "t": "b",
         "c": [
          "etcd 백업"
         ]
        },
        ", drain이 쿼럼을 무너뜨리지 않도록 PodDisruptionBudget. 노트북용 도구: CI/테스트엔 kind, 엣지엔 k3s, 매니지드가 숨기는 것(그리고 CKA가 시험하는 것)을 배우려면 kubeadm."
       ]
      },
      "\n"
     ]
    }
   ]
  ]
 },
 "m10": {
  "title": "트러블슈팅 체육관",
  "sub": [
   "트러블슈팅은 CKA의 30% — 가장 큰 단일 영역입니다. 각 시나리오는 고장 난 클러스터에 당신을 떨어뜨립니다. 진단하고, 고치고, ",
   {
    "t": "b",
    "c": [
     "채점"
    ]
   },
   "을 누르세요 — 실제 시험처럼 클러스터의 실시간 상태로 채점됩니다."
  ],
  "_ncards": 0,
  "intro": [
   "시험 테크닉: ",
   {
    "t": "code",
    "c": [
     "kubectl get pods"
    ]
   },
   " → ",
   {
    "t": "code",
    "c": [
     "describe"
    ]
   },
   "(Events를 읽으세요!) → ",
   {
    "t": "code",
    "c": [
     "logs"
    ]
   },
   " → 수정 → 검증. 난이도: ●○○ 워밍업, ●●○ 실제 시험 수준, ●●● 까다로움. 명령이 아니라 결과를 채점합니다 — 올바른 경로라면 무엇이든 인정됩니다."
  ],
  "btnCheck": "채점",
  "btnHint": "힌트",
  "btnSolution": "풀이 보기",
  "btnReset": "시나리오 초기화",
  "btnBack": "전체 시나리오",
  "checksTitle": "채점 결과",
  "passed": "시나리오 통과!",
  "solutionTitle": "풀이",
  "termHead": "시험 콘솔 — kubectl → broken-cluster",
  "greeting": "시나리오 클러스터에 접속했습니다. 위의 과제를 읽고 조사를 시작하세요. '채점'은 클러스터의 실시간 상태를 검사합니다.",
  "clusterTitle": "☸️ 실시간 클러스터 뷰"
 },
 "m11": {
  "title": "🎯 CKAD 드릴 — 프로브 · 자원 · 설정",
  "sub": [
   {
    "t": "i",
    "c": [
     "직접 해봐야만"
    ]
   },
   " 익힐 수 있는 세 가지 시험 영역: 헬스 프로브, 자원 requests/limits와 QoS, 그리고 ConfigMap/Secret. 각 드릴은 살아있는 놀이터입니다 — 작업하는 동안 미션이 클러스터 상태로 자동 채점되며, 순서는 자유입니다."
  ],
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (시험에서 허용!)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 아래 명령은 모두 시험에서 알고 있어야 하는 것들입니다. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "드릴 콘솔 — kubectl",
  "greeting": "드릴 클러스터에 접속했습니다. 위의 미션은 작업하는 동안 실시간으로 채점됩니다 — 채점 버튼이 필요 없어요. 'help'로 명령을 확인하세요.",
  "panelApp": "🧪 앱 패널 — 각 컨테이너의 안쪽",
  "panelEndpoints": "🔌 Service 엔드포인트 (ready 파드만)",
  "panelNodes": "⬢ 노드 용량 — requests vs 할당 가능량",
  "panelObjects": "🗂 클러스터의 설정 오브젝트",
  "panelPods": "이를 소비하는 파드",
  "noProbes": "프로브 없음 — 클러스터는 이 앱의 상태를 모릅니다",
  "limitNone": "제한 없음",
  "btnHang": "💥 행(hang)",
  "btn503": "🤒 503",
  "btnHeal": "💚 회복",
  "btnLeak": "🧪 누수 시작",
  "btnStopLeak": "⏹ 누수 중지"
 },
 "m12": {
  "title": "🧲 CKA 드릴 — 스케줄링 · RBAC",
  "sub": [
   "읽기만 해서는 절대 늘지 않는 관리자 시험 영역 둘: ",
   {
    "t": "b",
    "c": [
     "파드가 어디에 놓이는가"
    ]
   },
   "(taint는 밀어내고, 레이블은 끌어당기고, 안티어피니티는 흩뿌립니다) 그리고 ",
   {
    "t": "b",
    "c": [
     "누가 무엇을 할 수 있는가"
    ]
   },
   "(RBAC, 기본 거부). 살아있는 놀이터입니다 — 작업하는 동안 미션이 클러스터 상태로 자동 채점되며, 순서는 자유입니다."
  ],
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (시험에서 허용!)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 아래 명령은 모두 시험에서 알고 있어야 하는 것들입니다. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "드릴 콘솔 — kubectl",
  "greeting": "드릴 클러스터에 접속했습니다. 위의 미션은 작업하는 동안 실시간으로 채점됩니다 — 채점 버튼이 필요 없어요. 'help'로 명령을 확인하세요.",
  "panelNodes": "⬢ 노드 — 레이블, taint, 그리고 무엇이 어디에 놓였나",
  "panelPending": "⏳ Pending 파드 — 스케줄러가 밝힌 이유",
  "noPending": "Pending 없음 — 스케줄러가 만족한 상태",
  "panelRbac": "🗂 RBAC 오브젝트 — 주체, Role, Binding",
  "panelTester": "🔑 can-i 테스터 (실시간)"
 },
 "m14": {
  "title": "🛠 클러스터 운영 드릴 — drain · 업그레이드 · etcd 백업",
  "sub": [
   "CKA의 순수 관리자 영역을 손으로 익힙니다: ",
   {
    "t": "b",
    "c": [
     "노드 유지보수"
    ]
   },
   "(drain, cordon — 그리고 거부하는 PodDisruptionBudget), 단 하나뿐인 올바른 순서의 ",
   {
    "t": "b",
    "c": [
     "kubeadm 업그레이드"
    ]
   },
   " 의식(컨트롤 플레인 먼저, kubelet은 그다음, drain한 노드 하나씩), 그리고 ",
   {
    "t": "b",
    "c": [
     "재해 복구"
    ]
   },
   "(시험이 요구하는 정확한 TLS 플래그의 etcdctl snapshot save, etcdutl restore, 인증서 만료 점검). 이 랩의 새 명령: ",
   {
    "t": "code",
    "c": [
     "ssh 노드"
    ]
   },
   "로 노드에 직접 올라갑니다. 미션은 클러스터 상태로 실시간 채점됩니다."
  ],
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (시험에서 허용!)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 아래 명령은 모두 시험에서 알고 있어야 하는 것들입니다. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "드릴 콘솔 — kubectl + ssh",
  "greeting": "드릴 클러스터에 접속했습니다. 위의 미션은 작업하는 동안 실시간으로 채점됩니다. 이 랩의 새 명령: 'ssh 노드이름'으로 노드에 올라갑니다(kubeadm, apt-get, systemctl, etcdctl은 노드 위에 있습니다. 'exit'로 복귀). 나머지는 'help'로 확인하세요.",
  "panelNodes": "⬢ 노드 — 누가 cordon 됐고, 무엇이 어디서 도는가",
  "panelPdb": "🛡 PodDisruptionBudget — 실시간 축출 계산",
  "noPdb": "PDB 없음 — 모든 축출이 허용됩니다",
  "panelHost": "🖥 현재 위치",
  "panelVersions": "🧮 버전 — 컨트롤 플레인 vs 각 kubelet",
  "upgradeOrder": "순서: 컨트롤 플레인 → 그다음 워커마다: drain → kubeadm → kubelet → uncordon",
  "panelSnap": "📸 /backup의 스냅샷 (컨트롤 플레인 디스크)",
  "noSnap": "아직 스냅샷 없음 — 이 클러스터에는 되돌리기 버튼이 없습니다",
  "panelLive": "🗄 현재 클러스터 — 복구하면 이 상태가 되돌아갑니다",
  "noDeploys": "Deployment 없음 — 이미 사고가 난 걸까요?"
 },
 "m13": {
  "title": "🌐 네트워킹 드릴 — NetworkPolicy · Ingress · Gateway API",
  "sub": [
   "Services & Networking 영역을 손으로 익힙니다: 클러스터 안에서 ",
   {
    "t": "b",
    "c": [
     "누가 누구와 통신할 수 있는가"
    ]
   },
   "(NetworkPolicy 허용 목록), 그리고 ",
   {
    "t": "b",
    "c": [
     "바깥이 어떻게 들어오는가"
    ]
   },
   "(Ingress 호스트/경로 규칙과 역할이 분리된 후계자 Gateway API). 여기서 새 명령: ",
   {
    "t": "code",
    "c": [
     "curl http://호스트/경로"
    ]
   },
   "를 치면 당신이 외부 클라이언트가 됩니다. 미션은 클러스터 상태로 실시간 채점되며, 순서는 자유입니다."
  ],
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (시험에서 허용!)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 아래 명령은 모두 시험에서 알고 있어야 하는 것들입니다. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "드릴 콘솔 — kubectl + curl",
  "greeting": "드릴 클러스터에 접속했습니다. 위의 미션은 작업하는 동안 실시간으로 채점됩니다. 이 랩의 새 명령: 'curl http://호스트/경로'는 Ingress/Gateway를 두드리는 외부 클라이언트 역할을 합니다. 나머지는 'help'로 확인하세요.",
  "panelMatrix": "🕸 연결 매트릭스 — NetworkPolicy 실시간 판정",
  "panelPolicies": "🗂 이 네임스페이스의 NetworkPolicy",
  "panelRules": "🚪 Ingress 규칙 — 호스트/경로 → Service → 파드",
  "panelChain": "🛣 Gateway 체인 — 클래스 → 게이트웨이 → 라우트 → 파드",
  "noPolicies": "아직 정책 없음 — 파드 네트워크는 평평합니다 (전부 허용)",
  "noRules": "아직 Ingress 없음 — 모든 curl이 404를 받습니다",
  "noGateway": "아직 Gateway 없음 — gateway.yaml을 적용하세요",
  "matrixFrom": "출발 ↓ · 도착 →"
 },
 "m15": {
  "title": "🎓 시험장 — 모의고사 & 준비도",
  "sub": "Certify 레이어: 여기서 한 모든 것(실습 미션, 트러블슈팅 시나리오, 퀴즈 정답률, 지난 모의고사)이 반영되는 도메인별 준비도 대시보드, 그리고 실제 클러스터 상태로 채점되는 CKA/CKAD 모의고사 — 합격선 66%, 체크별 부분 점수, 실전과 똑같이.",
  "_ncards": 0,
  "intro": [
   "시험 기술: 시험 중에는 채점 버튼이 없습니다. 과제를 읽고, 작업하고, 스스로 검증하고(",
   {
    "t": "code",
    "c": [
     "kubectl get/describe"
    ]
   },
   "), 불안하면 깃발을 꽂고 넘어가세요. 채점은 마지막에 단 한 번 — 명령이 아니라 클러스터를 봅니다. (스토리지는 아직 시뮬레이터 과제가 없어 퀴즈가 그 도메인을 담당합니다.)"
  ],
  "sigPractice": "실습",
  "sigQuiz": "퀴즈",
  "sigMock": "모의",
  "sigPracticeTitle": "이 도메인에서 완료한 실습 미션 & 시나리오",
  "sigQuizTitle": "이 도메인의 누적 퀴즈 정답률",
  "sigMockTitle": "최근 모의고사에서 이 도메인의 점수",
  "btnStart": "모의고사 시작",
  "tasksWord": "과제",
  "minWord": "분",
  "historyTitle": "📜 지난 응시 기록",
  "noHistory": "아직 응시 기록이 없습니다. 첫 모의고사는 원래 아픕니다 — 실전보다 여기서 아픈 게 낫죠.",
  "taskWord": "과제",
  "ptsWord": "점",
  "flagBtn": "나중에 다시 보기",
  "flaggedBtn": "깃발 꽂음",
  "endBtn": "종료하고 채점",
  "quitBtn": "포기",
  "confirmEnd": "지금 채점할까요? 못 끝낸 과제는 현재 클러스터 상태만큼만 점수를 받습니다.",
  "confirmQuit": "채점 없이 나갈까요? 이번 응시는 기록되지 않습니다.",
  "passed": "합격",
  "failed": "불합격",
  "passLine": "합격선: 66%",
  "byDomain": "도메인별 점수",
  "byTask": "과제별 채점",
  "solutionTitle": "풀이 해설",
  "backBtn": "시험장으로 돌아가기",
  "termHead": "시험 콘솔 — kubectl (과제별 클러스터)",
  "greeting": "각 과제는 자기만의 클러스터에서 돌아갑니다. 작업하고, kubectl로 스스로 검증하고, 다음 과제로 넘어가세요 — 채점은 마지막에 한 번입니다.",
  "clusterTitle": "☸️ 실시간 클러스터 뷰"
 },
 "m16": {
  "title": "🐳 Docker 드릴 — 빌드 · 볼륨 · 네트워크 · Compose",
  "sub": "읽는 것만으로는 부족한 다섯 개의 Docker 실습장: 레이어 캐시를 내 편으로 만들고, 멀티 스테이지로 이미지를 줄이고, 볼륨에 데이터를 남기고, 이름 기반 DNS를 연결하고, Compose로 스택 전체를 띄웁니다. 미션은 입력하는 동안 실시간으로 채점됩니다 — Check 버튼이 없습니다.",
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (docs.docker.com)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 아래 명령은 모두 Docker 사용자라면 몸에 배어 있어야 하는 것들입니다. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "laptop — docker 호스트 (시뮬레이션)",
  "greeting": "시뮬레이션 Docker 엔진입니다. Manifests 패널에서 Dockerfile / compose.yaml을 편집한 뒤 여기서 빌드하고 실행하세요. 'help'로 명령을 확인하세요.",
  "panelImages": "🧊 이미지 (레이어 · 크기)",
  "panelContainers": "📦 컨테이너",
  "panelInfra": "🧱 볼륨 & 네트워크"
 },
 "m17": {
  "title": "🧩 파드 설계 — 사이드카 & initContainer",
  "sub": "파드 하나에 컨테이너 여러 개. 사이드카를 추가하면 READY가 첫 번째 컨테이너만이 아니라 모든 컨테이너를 따라가는 걸 보고, initContainer를 추가하면 앱이 실행되기 전에 시작 순서가 진행되는 걸 지켜보세요. 미션은 입력하는 동안 실시간으로 채점됩니다 — Check 버튼이 없습니다.",
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (kubernetes.io)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — 사이드카 준비성, '모든 컨테이너가 준비되어야 함' 규칙, initContainer 순서, logs -c/--previous. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "시험 콘솔 — kubectl",
  "greeting": "시뮬레이션 클러스터입니다. Manifests 패널에서 YAML을 편집한 뒤 여기서 apply하세요. 'help'로 명령을 확인하세요.",
  "panelPods": "🧩 파드",
  "panelInit": "init",
  "panelEndpoints": "🔌 Service 엔드포인트",
  "ready": "Ready",
  "notReady": "NotReady",
  "btnHang": "😵 행",
  "btn503": "🤒 503",
  "btnHeal": "😀 회복"
 },
 "m18": {
  "title": "💾 스토리지 드릴 — PV/PVC/StorageClass",
  "sub": "PersistentVolumeClaim은 스토리지를 요청만 하고, StorageClass가 필요할 때 프로비저닝합니다. 바인딩하고, 마운트하고, 쓰고, 파드를 지운 뒤 교체된 파드에도 데이터가 남아있는지 확인하세요 — 그다음 emptyDir로 같은 걸 해보면 살아남지 않는 걸 보게 됩니다. 미션은 입력하는 동안 실시간으로 채점됩니다 — Check 버튼이 없습니다.",
  "_ncards": 0,
  "missionsTitle": "미션 — 실시간 채점",
  "docsTitle": "📖 실제 문서에서 찾기 (kubernetes.io)",
  "btnReset": "랩 초기화",
  "btnSolve": "풀이 실행하기",
  "solutionTitle": "모범 답안",
  "solveNote": "모범 답안 — PVC 바인딩(정적 + 동적), 파드가 죽어도 데이터가 남는 PVC vs. 그렇지 않은 emptyDir, PVC가 Pending에 멈추는 장애와 그 해결법, StatefulSet의 volumeClaimTemplates. 미션이 채점되는 걸 지켜본 뒤, 초기화하고 직접 해 보세요.",
  "termHead": "시험 콘솔 — kubectl",
  "greeting": "시뮬레이션 클러스터입니다. Manifests 패널에서 YAML을 편집한 뒤 여기서 apply하세요. 'help'로 명령을 확인하세요.",
  "panelPvcs": "💾 PersistentVolumeClaim",
  "panelPvs": "🗄 PersistentVolume",
  "panelPods": "📦 파드",
  "noneYet": "(아직 없음)"
 }
};
