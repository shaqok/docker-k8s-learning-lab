/* AUTO-GENERATED — structured rich-text content (en).
 * Node trees rendered by src/components/Rich.jsx; converted from the
 * legacy HTML strings by scripts/convert-content.mjs. Edit content here
 * (text nodes are plain strings; elements are { t, cls?, st?, c? }). */
export default {
 "m0": {
  "title": "Roadmap: Beginner → Expert",
  "sub": "The complete path through Docker, Kubernetes, and GPU infrastructure. Check items off as you master them — progress is saved in this browser. Chips on the right jump to the module that teaches each skill.",
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
       "🪜 From this app to the real world"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "1 · This app"
        ]
       },
       " — concepts and command muscle-memory, zero installs."
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
       " (free for personal use) — every Module-2 command works verbatim on your laptop. Docker runs fine on a laptop; it's clusters people worry about."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "3 · A real cluster on your laptop"
        ]
       },
       " — this is the surprise: ",
       {
        "t": "code",
        "c": [
         "kind"
        ]
       },
       " (Kubernetes-in-Docker) or ",
       {
        "t": "code",
        "c": [
         "minikube"
        ]
       },
       " runs a genuine single-machine cluster in ~2 GB RAM. Every Module-4 command works there. ",
       {
        "t": "code",
        "c": [
         "k3s/k3d"
        ]
       },
       " is an even lighter option."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "4 · Browser playgrounds"
        ]
       },
       " — Play with Docker, Play with Kubernetes, and Killercoda give you free throwaway multi-node clusters, no install at all."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "5 · Managed cloud"
        ]
       },
       " — GKE/EKS/AKS free credits for the things a laptop can't do: real LoadBalancers, cluster autoscaling, and cheap spot GPUs (a T4 costs ~$0.10–0.30/hr) for Stage 6 practice."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "6 · Certifications"
        ]
       },
       " — CKAD (developer) → CKA (admin) → CKS (security). All practical, terminal-based exams; the K8s Lab commands here are exactly the muscle memory they test."
      ]
     },
     "\n"
    ]
   }
  ]
 },
 "m1": {
  "title": "Containers 101",
  "sub": "What a container actually is, and why it isn't a VM.",
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
       "Container vs Virtual Machine"
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
           "Virtual Machine"
          ]
         },
         {
          "t": "th",
          "c": [
           "Container"
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
           "What it virtualizes"
          ]
         },
         {
          "t": "td",
          "c": [
           "Hardware — each VM runs a full guest OS"
          ]
         },
         {
          "t": "td",
          "c": [
           "The OS — processes share the host kernel, isolated by namespaces & cgroups"
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
           "Size"
          ]
         },
         {
          "t": "td",
          "c": [
           "GBs"
          ]
         },
         {
          "t": "td",
          "c": [
           "MBs"
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
           "Startup"
          ]
         },
         {
          "t": "td",
          "c": [
           "Minutes"
          ]
         },
         {
          "t": "td",
          "c": [
           "Milliseconds–seconds"
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
           "Isolation"
          ]
         },
         {
          "t": "td",
          "c": [
           "Strong (hypervisor)"
          ]
         },
         {
          "t": "td",
          "c": [
           "Good (kernel features)"
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
       "A container is just a ",
       {
        "t": "b",
        "c": [
         "normal Linux process"
        ]
       },
       " that the kernel lies to: it sees its own filesystem, network, and process tree (",
       {
        "t": "b",
        "c": [
         "namespaces"
        ]
       },
       ") and is limited in CPU/RAM it may use (",
       {
        "t": "b",
        "c": [
         "cgroups"
        ]
       },
       "). That's why it starts instantly — nothing \"boots\"."
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
       "The vocabulary you need"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Image"
        ]
       },
       " — the frozen template (like a class). ",
       {
        "t": "b",
        "c": [
         "Container"
        ]
       },
       " — a running instance (like an object). ",
       {
        "t": "b",
        "c": [
         "Registry"
        ]
       },
       " — where images live (Docker Hub, GHCR). ",
       {
        "t": "b",
        "c": [
         "Dockerfile"
        ]
       },
       " — the recipe to build an image. ",
       {
        "t": "b",
        "c": [
         "Tag"
        ]
       },
       " — a version label, e.g. ",
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
       " is just a default tag, not \"newest magically\"."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "Ready? Open ",
       {
        "t": "b",
        "c": [
         "Module 2"
        ]
       },
       " and type real commands. →"
      ]
     },
     "\n"
    ]
   }
  ],
  "layersTitle": "Images are layers 🥞",
  "layersIntro": [
   "An ",
   {
    "t": "b",
    "c": [
     "image"
    ]
   },
   " is a read-only stack of filesystem layers, built from a ",
   {
    "t": "code",
    "c": [
     "Dockerfile"
    ]
   },
   ". A ",
   {
    "t": "b",
    "c": [
     "container"
    ]
   },
   " = image + one thin writable layer on top. Click through a Dockerfile build:"
  ],
  "layerLabels": [
   "Layer 1 · python:3.12-slim base (≈120 MB)",
   "Layer 2 · flask installed (≈12 MB)",
   "Layer 3 · app.py copied (2 kB)",
   "Metadata · CMD (0 B — just config)",
   [
    "▲ Writable container layer (added at ",
    {
     "t": "code",
     "c": [
      "docker run"
     ]
    },
    ")"
   ]
  ],
  "layersBtn": "▶ docker build — next step",
  "layersReset": "Reset",
  "layersHint0": "Each Dockerfile instruction creates one layer. Layers are cached & shared between images — that's why pulls are fast.",
  "lcTitle": "Container lifecycle",
  "lcHint0": "Press the buttons in order — or out of order, and see what real Docker would say."
 },
 "m2": {
  "title": "Docker Lab",
  "sub": [
   "A simulated Docker engine. Type commands — state updates live on the right. Try ",
   {
    "t": "code",
    "c": [
     "help"
    ]
   },
   "."
  ],
  "_ncards": 0,
  "missions": [
   {
    "id": "pull",
    "text": [
     "Pull an image: ",
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
     "Run it detached with a port: ",
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
     "List running containers: ",
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
     "Check its logs: ",
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
     "Get a shell inside: ",
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
     "Stop & remove it: ",
     {
      "t": "code",
      "c": [
       "docker stop web"
      ]
     },
     " then ",
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
   "Supported: ",
   {
    "t": "code",
    "c": [
     "pull, run (-d, -p, --name, --gpus all), ps (-a), stop, start, rm, rmi, images, logs, exec, inspect"
    ]
   },
   ", plus ",
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
   ". Use ↑/↓ for history."
  ],
  "termHead": "laptop — docker host (simulated)",
  "missionsTitle": "🎯 Missions",
  "placeholder": "docker run -d -p 8080:80 nginx",
  "panelTitles": [
   "📦 Local images",
   "🐳 Containers"
  ]
 },
 "m3": {
  "title": "Kubernetes Concepts",
  "sub": "Docker runs one container on one machine. Kubernetes runs thousands across a fleet — and keeps them alive.",
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
       "The objects you'll use daily"
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
       " — smallest unit; one or more containers sharing network/storage. Pods are ",
       {
        "t": "i",
        "c": [
         "disposable"
        ]
       },
       " — never hand-pet them."
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
       " — \"keep N replicas of this pod template running, and roll out updates safely.\" You almost always create Deployments, not raw Pods."
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
       " — a stable name + virtual IP that load-balances across a Deployment's ever-changing pods."
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
       " — folders for objects. ",
       {
        "t": "b",
        "c": [
         "Node"
        ]
       },
       " — a machine. ",
       {
        "t": "b",
        "c": [
         "kubectl"
        ]
       },
       " — your CLI to the API server."
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
    "label": "kubelet (on every node)"
   },
   {
    "cp": "proxy",
    "label": "kube-proxy (on every node)"
   }
  ],
  "cpEmpty": [
   {
    "t": "p",
    "cls": "empty",
    "c": [
     "← Click a component to see what it does."
    ]
   }
  ],
  "demoTitle": "Watch the cluster work",
  "demoIntro": [
   "You declare ",
   {
    "t": "b",
    "c": [
     "desired state"
    ]
   },
   " (\"3 replicas of my web app\"); controllers make reality match. Try it:"
  ],
  "demoBtns": [
   "1 · Deploy 3 replicas",
   "2 · 💥 Kill a pod",
   "3 · Scale to 6",
   "4 · Rolling update",
   "Reset"
  ],
  "narrator0": "The scheduler spreads pods across nodes. If one dies, the ReplicaSet controller notices actual ≠ desired and creates a replacement. Nobody restarts anything by hand.",
  "legend": [
   "Running",
   "Creating",
   "Terminating",
   "New version (v2)"
  ],
  "clusterTitle": "The cluster: control plane + workers"
 },
 "m4": {
  "title": "Kubernetes Lab",
  "sub": "A simulated 3-node cluster with a real reconciliation loop. Delete a pod — watch the controller replace it.",
  "_ncards": 0,
  "missions": [
   {
    "id": "nodes",
    "text": [
     "Inspect the cluster: ",
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
     "Deploy an app: ",
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
     "Delete any pod (",
     {
      "t": "code",
      "c": [
       "kubectl delete pod <name>"
      ]
     },
     ") and watch it self-heal"
    ]
   },
   {
    "id": "scale",
    "text": [
     "Scale up: ",
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
     "Expose it: ",
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
     "Rolling update: ",
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
     "Roll it back: ",
     {
      "t": "code",
      "c": [
       "kubectl rollout undo deployment/web"
      ]
     },
     " (then check ",
     {
      "t": "code",
      "c": [
       "rollout history"
      ]
     },
     ")"
    ]
   },
   {
    "id": "apply",
    "text": [
     "The real workflow — generate YAML & apply it: ",
     {
      "t": "code",
      "c": [
       "kubectl create deployment api --image=redis --dry-run=client -o yaml > api.yaml"
      ]
     },
     ", then ",
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
   "This cluster speaks real kubectl: namespaces (",
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
   "), labels (",
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
   "), YAML (",
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
   "… type ",
   {
    "t": "code",
    "c": [
     "help"
    ]
   },
   " for the list, ",
   {
    "t": "code",
    "c": [
     "k"
    ]
   },
   " = kubectl. Each worker fits 4 pods — scale to 10 and see ",
   {
    "t": "b",
    "c": [
     "Pending"
    ]
   },
   "; deploy image ",
   {
    "t": "code",
    "c": [
     "ngnix"
    ]
   },
   " (typo!) and meet ",
   {
    "t": "b",
    "c": [
     "ImagePullBackOff"
    ]
   },
   "."
  ],
  "termHead": "laptop — kubectl → sim-cluster",
  "missionsTitle": "🎯 Missions",
  "placeholder": "kubectl get nodes",
  "panelTitles": [
   "☸️ Live cluster view"
  ]
 },
 "m5": {
  "title": "GPUs in Containers & Kubernetes",
  "sub": "How ML workloads actually get GPUs — no GPU required to learn it.",
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
       "1 · Docker + GPUs: the NVIDIA Container Toolkit"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "Containers share the host kernel — so they can use the host's ",
       {
        "t": "b",
        "c": [
         "GPU driver"
        ]
       },
       " too. The NVIDIA Container Toolkit injects the driver libraries and device files (",
       {
        "t": "code",
        "c": [
         "/dev/nvidia0…"
        ]
       },
       ") into the container when you pass ",
       {
        "t": "code",
        "c": [
         "--gpus"
        ]
       },
       "."
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
           "Your container: PyTorch, CUDA ",
           {
            "t": "b",
            "c": [
             "runtime"
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
           "← injected: driver libs (libcuda.so), /dev/nvidia*"
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
           "Host: NVIDIA kernel driver"
          ]
         },
         "\n",
         {
          "t": "div",
          "c": [
           "Host: Linux kernel + GPU hardware"
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
             "Key insight:"
            ]
           },
           " the CUDA ",
           {
            "t": "i",
            "c": [
             "toolkit/runtime"
            ]
           },
           " ships ",
           {
            "t": "b",
            "c": [
             "inside the image"
            ]
           },
           " (that's why ",
           {
            "t": "code",
            "c": [
             "pytorch/pytorch"
            ]
           },
           " is ~7 GB), but the ",
           {
            "t": "i",
            "c": [
             "driver"
            ]
           },
           " stays on the host. Image CUDA version must be ≤ what the host driver supports."
          ]
         },
         "\n",
         {
          "t": "p",
          "c": [
           "Try in the Docker Lab: ",
           {
            "t": "code",
            "c": [
             "docker run --gpus all pytorch/pytorch nvidia-smi"
            ]
           },
           " — then try it ",
           {
            "t": "i",
            "c": [
             "without"
            ]
           },
           " ",
           {
            "t": "code",
            "c": [
             "--gpus"
            ]
           },
           " and see the classic error."
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
       "4 · Expert level: multi-node training & the ML platform stack"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Distributed training"
        ]
       },
       ": a 64-GPU job = 8 pods × 8 GPUs on 8 nodes. Kubernetes only schedules the pods; ",
       {
        "t": "b",
        "c": [
         "NCCL"
        ]
       },
       " (all-reduce over NVLink within a node, InfiniBand/RoCE between nodes) moves gradients, driven by ",
       {
        "t": "code",
        "c": [
         "torchrun"
        ]
       },
       ", Ray, or the Kubeflow training operator. Interconnect topology — not GPU count — is usually the bottleneck."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "Gang scheduling"
        ]
       },
       ": the default scheduler places pods one by one — a 16-GPU job could grab 12 GPUs and deadlock waiting for 4 more while blocking everyone else. ",
       {
        "t": "b",
        "c": [
         "Kueue"
        ]
       },
       " and ",
       {
        "t": "b",
        "c": [
         "Volcano"
        ]
       },
       " fix this with all-or-nothing admission plus job queues, priorities, and preemption — essential the moment a GPU cluster is shared."
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       {
        "t": "b",
        "c": [
         "The stack in practice"
        ]
       },
       ": NVIDIA ",
       {
        "t": "b",
        "c": [
         "GPU Operator"
        ]
       },
       " installs driver + device plugin + ",
       {
        "t": "b",
        "c": [
         "DCGM exporter"
        ]
       },
       " (per-GPU utilization/memory/temperature into Prometheus — Stage 5's observability, reused). Watch DCGM before buying GPUs: idle allocated GPUs are the #1 cost leak. Above it all sit platforms like Kubeflow, Ray, or Run:ai — but they're all built from the primitives you now know: device plugins, operators, schedulers, reconciliation."
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
       "2 · Kubernetes GPU scheduling — device plugins"
      ]
     },
     "\n",
     {
      "t": "p",
      "c": [
       "The kubelet doesn't know what a GPU is. The ",
       {
        "t": "b",
        "c": [
         "NVIDIA device plugin"
        ]
       },
       " (a DaemonSet) advertises ",
       {
        "t": "code",
        "c": [
         "nvidia.com/gpu: 4"
        ]
       },
       " on each GPU node. Pods then ",
       {
        "t": "i",
        "c": [
         "request"
        ]
       },
       " GPUs like any resource — and GPUs are ",
       {
        "t": "b",
        "c": [
         "not shared or oversubscribed"
        ]
       },
       ": a whole GPU per request."
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
       "   # scheduler finds a node with 2 free GPUs"
      ]
     },
     "\n"
    ]
   }
  ],
  "simTitle": "🧪 GPU scheduling simulator",
  "simIntro": "Cluster: 2 GPU nodes (4× A100 each) + 1 CPU-only node. Schedule some training jobs:",
  "simEvents0": "Scheduler events will appear here.",
  "gpuOpts": [
   "1 GPU",
   "2 GPUs",
   "4 GPUs",
   "8 GPUs"
  ],
  "btnSchedule": "Schedule pod",
  "btnReset": "Reset cluster",
  "gpuReqLabel": "Job needs",
  "migBefore": [
   "\n",
   {
    "t": "h4",
    "c": [
     "3 · Sharing GPUs: MIG & time-slicing"
    ]
   },
   "\n",
   {
    "t": "p",
    "c": [
     "Whole-GPU allocation wastes money on small workloads (notebooks, inference). Two fixes:"
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
       "Time-slicing"
      ]
     },
     ": software-level — the device plugin advertises 1 GPU as N (e.g. ",
     {
      "t": "code",
      "c": [
       "nvidia.com/gpu: 10"
      ]
     },
     "), and workloads take turns on it. No memory isolation — one greedy pod can OOM another. Fine for dev/notebooks, risky for production."
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
         "Time-slicing"
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
         "Isolation"
        ]
       },
       {
        "t": "td",
        "c": [
         "Hardware (memory + compute)"
        ]
       },
       {
        "t": "td",
        "c": [
         "None"
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
         "Hardware"
        ]
       },
       {
        "t": "td",
        "c": [
         "A100/H100/B100 only"
        ]
       },
       {
        "t": "td",
        "c": [
         "Any NVIDIA GPU"
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
         "Best for"
        ]
       },
       {
        "t": "td",
        "c": [
         "Multi-tenant production inference"
        ]
       },
       {
        "t": "td",
        "c": [
         "Dev, notebooks, bursty small jobs"
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
   " (Multi-Instance GPU, A100/H100+): hardware-partitions one GPU into up to 7 isolated instances with dedicated memory/compute. Each appears as its own schedulable resource (",
   {
    "t": "code",
    "c": [
     "nvidia.com/mig-1g.10gb"
    ]
   },
   "). Strong isolation — safe for multi-tenant clusters."
  ]
 },
 "m6": {
  "title": "Quiz — the whole bank, tagged by exam domain",
  "sub": "Every question carries its CKA/CKAD domain. Focus on one exam or one domain, grade yourself, review your misses — your per-domain accuracy feeds the readiness dashboard in the Exam Room.",
  "_ncards": 0,
  "gradeBtn": "Grade me",
  "focusLabel": "Focus:",
  "allLabel": "Everything",
  "allDomains": "All domains",
  "questionCount": "questions in this set",
  "accTitle": "📊 Your accuracy by domain (all attempts)",
  "scoreLabel": "Score",
  "reviewTitle": "Review your misses",
  "retryBtn": "New attempt"
 },
 "m7": {
  "title": "Docker in Depth",
  "sub": "Stage 2: what separates \"I can run a container\" from \"I ship containers\".",
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
        "Layer caching — instruction order is a performance feature"
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
              "# ❌ any code edit re-runs pip install"
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
              "# ✅ deps layer cached until requirements.txt changes"
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
            "Docker reuses a cached layer only if the instruction ",
            {
             "t": "i",
             "c": [
              "and everything before it"
             ]
            },
            " is unchanged. Put slow, rarely-changing steps (deps) before fast-changing ones (your code). For ML images this is the difference between 4-second and 25-minute rebuilds."
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
        "Data — the writable layer dies with the container"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "Anything a container writes to its own filesystem is deleted at ",
        {
         "t": "code",
         "c": [
          "docker rm"
         ]
        },
        ". Persistent data needs a mount:"
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
            "Volume"
           ]
          },
          {
           "t": "th",
           "c": [
            "Bind mount"
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
            "Syntax"
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
            "Lives"
           ]
          },
          {
           "t": "td",
           "c": [
            "Docker-managed area on the host"
           ]
          },
          {
           "t": "td",
           "c": [
            "An exact host folder you chose"
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
            "Best for"
           ]
          },
          {
           "t": "td",
           "c": [
            "Databases, anything production"
           ]
          },
          {
           "t": "td",
           "c": [
            "Live-editing code during development"
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
        "Same idea reappears in Kubernetes as PersistentVolumes (Stage 4) — pods are as disposable as containers, so state always lives outside them."
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
        "Networking — containers find each other by name"
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
          "# api can now reach \"db:5432\" — Docker's DNS resolves container names"
         ]
        }
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "On a ",
        {
         "t": "b",
         "c": [
          "user-defined network"
         ]
        },
        ", containers resolve each other by container name — no IPs in your config. ",
        {
         "t": "code",
         "c": [
          "-p host:container"
         ]
        },
        " is only for reaching a container ",
        {
         "t": "i",
         "c": [
          "from outside"
         ]
        },
        " (your browser); container-to-container traffic never needs it."
       ]
      },
      "\n",
      {
       "t": "p",
       "cls": "hint",
       "c": [
        "Kubernetes takes this further: every pod gets its own IP, and Services give stable DNS names cluster-wide (",
        {
         "t": "code",
         "c": [
          "web.default.svc.cluster.local"
         ]
        },
        ")."
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
        "Docker Compose — your whole stack in one file"
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
            "# compose.yaml — web + cache + db"
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
            " starts everything (networked together, DNS by service name); ",
            {
             "t": "code",
             "c": [
              "docker compose down"
             ]
            },
            " removes it all. One file in git = reproducible dev environment for the whole team."
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
              "This is your bridge to Kubernetes:"
             ]
            },
            " Compose is declarative desired state for one machine. A K8s manifest is the same idea for a fleet — plus reconciliation. If you can read this file, Stage 4's YAML will feel familiar."
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
        "Registries, tags & digests"
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
          "# registry/namespace/repo:tag"
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
        " is just the default tag name — it is ",
        {
         "t": "b",
         "c": [
          "not"
         ]
        },
        " automatically the newest, and it ",
        {
         "t": "i",
         "c": [
          "moves"
         ]
        },
        ": the same tag can point to different bytes tomorrow. Production systems pin versions (",
        {
         "t": "code",
         "c": [
          ":1.4.2"
         ]
        },
        ") or immutable digests (",
        {
         "t": "code",
         "c": [
          "@sha256:…"
         ]
        },
        "). Kubernetes pulls by tag too — a moving tag plus ",
        {
         "t": "code",
         "c": [
          "imagePullPolicy"
         ]
        },
        " confusion is a classic outage."
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
       "# stage 1: build (has compilers, SDKs — huge)"
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
       "# stage 2: runtime — start from (almost) nothing"
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
  "msHint": "Only the last stage becomes the image. Build tools, source code, and caches stay behind. Smaller image = faster pulls, faster pod starts, smaller attack surface.",
  "msTitle": "Multi-stage builds — ship the app, not the toolchain"
 },
 "m8": {
  "title": "Kubernetes Operator Toolkit",
  "sub": "Stage 4: the lab taught you imperative commands. Real clusters run on declarative YAML plus the features below.",
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
        "Declarative YAML — the real workflow"
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
            "# labels glue everything together"
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
            " — the file ",
            {
             "t": "i",
             "c": [
              "is"
             ]
            },
            " the desired state; apply it as often as you like (idempotent). Files live in git → review, rollback, audit for free."
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
            " (what the lab uses) is fine for learning and quick tests; ",
            {
             "t": "code",
             "c": [
              "apply"
             ]
            },
            " is how teams work. ",
            {
             "t": "code",
             "c": [
              "kubectl get deploy web -o yaml"
             ]
            },
            " shows any live object as YAML — a great way to learn the schema."
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
              "Labels & selectors"
             ]
            },
            " are the glue: the Deployment finds its pods via ",
            {
             "t": "code",
             "c": [
              "matchLabels"
             ]
            },
            ", Services route via the same labels, and ",
            {
             "t": "code",
             "c": [
              "kubectl get pods -l app=web"
             ]
            },
            " filters by them. ",
            {
             "t": "b",
             "c": [
              "Namespaces"
             ]
            },
            " partition it all per team/env."
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
        "ConfigMaps & Secrets — config out of the image"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "Same image in dev and prod; only injected config differs. ",
        {
         "t": "b",
         "c": [
          "ConfigMap"
         ]
        },
        " = plain settings, ",
        {
         "t": "b",
         "c": [
          "Secret"
         ]
        },
        " = credentials. Both arrive as env vars or mounted files:"
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
        "Gotcha every interviewer asks: Secrets are only ",
        {
         "t": "b",
         "c": [
          "base64-encoded, not encrypted"
         ]
        },
        ". Real protection = encryption-at-rest in etcd, RBAC limits (Stage 5), or an external manager (Vault, cloud secret stores)."
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
        "Health probes — how K8s knows your app is actually OK"
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
            "Probe"
           ]
          },
          {
           "t": "th",
           "c": [
            "Question"
           ]
          },
          {
           "t": "th",
           "c": [
            "On failure"
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
            "Is it alive at all?"
           ]
          },
          {
           "t": "td",
           "c": [
            "kubelet ",
            {
             "t": "b",
             "c": [
              "restarts"
             ]
            },
            " the container"
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
            "Can it take traffic right now?"
           ]
          },
          {
           "t": "td",
           "c": [
            "Pod ",
            {
             "t": "b",
             "c": [
              "removed from Service endpoints"
             ]
            },
            " — not restarted"
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
            "Still booting?"
           ]
          },
          {
           "t": "td",
           "c": [
            "Holds off the other two probes (slow-starting apps, big models)"
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
        "Without a readiness probe, rolling updates route traffic to pods that aren't ready yet — brief 502s on every deploy. With one, the rollout waits. This is the single highest-value YAML you'll add."
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
        "Resources, limits & QoS"
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
        " = what the scheduler reserves (this is the number used to decide pod placement — same mechanism you saw with GPUs). ",
        {
         "t": "b",
         "c": [
          "limits"
         ]
        },
        " = the cgroup ceiling: exceed CPU → throttled; exceed memory → ",
        {
         "t": "b",
         "c": [
          "OOMKilled"
         ]
        },
        " (the infamous exit code 137)."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "QoS classes follow from what you set: ",
        {
         "t": "b",
         "c": [
          "Guaranteed"
         ]
        },
        " (requests = limits) evicted last, ",
        {
         "t": "b",
         "c": [
          "Burstable"
         ]
        },
        " in the middle, ",
        {
         "t": "b",
         "c": [
          "BestEffort"
         ]
        },
        " (nothing set) evicted first under node pressure. Production rule: always set requests; set memory limits; think twice about CPU limits."
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
        "Autoscaling — three different dials"
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
        " (Horizontal Pod Autoscaler): more pods when load rises. ",
        {
         "t": "code",
         "c": [
          "desired = ceil(current × usage/target)"
         ]
        },
        " — e.g. 3 pods at 90% CPU with a 60% target → 5 pods. ",
        {
         "t": "b",
         "c": [
          "VPA"
         ]
        },
        ": same pods, resized requests. ",
        {
         "t": "b",
         "c": [
          "Cluster Autoscaler"
         ]
        },
        ": more ",
        {
         "t": "i",
         "c": [
          "nodes"
         ]
        },
        " — it watches for exactly the ",
        {
         "t": "b",
         "c": [
          "Pending"
         ]
        },
        " pods you created in the lab and buys machines to fit them (this is how GPU node pools scale too)."
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
        "Storage — PV, PVC, StatefulSets"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "A pod asks for storage with a ",
        {
         "t": "b",
         "c": [
          "PersistentVolumeClaim"
         ]
        },
        " (\"10Gi, fast\") → a ",
        {
         "t": "b",
         "c": [
          "StorageClass"
         ]
        },
        " provisions a real disk (EBS, PD, Ceph…) as a ",
        {
         "t": "b",
         "c": [
          "PersistentVolume"
         ]
        },
        " → it's mounted into the pod and ",
        {
         "t": "b",
         "c": [
          "survives pod deletion"
         ]
        },
        ". Claim/provision separation means app YAML stays cloud-agnostic."
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
        " = Deployment for stateful apps: stable names (",
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
        "), each with its own PVC, started/stopped in order. Databases, Kafka, anything with identity. Model checkpoints in ML training use the same PVC machinery."
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
        "Getting traffic in — Service types & Ingress"
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
            "Type"
           ]
          },
          {
           "t": "th",
           "c": [
            "Reach"
           ]
          },
          {
           "t": "th",
           "c": [
            "Use"
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
            "Inside cluster only"
           ]
          },
          {
           "t": "td",
           "c": [
            "Default — service-to-service"
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
            "Every node's IP :30000-32767"
           ]
          },
          {
           "t": "td",
           "c": [
            "Quick demos, bare metal"
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
            "Cloud LB with public IP"
           ]
          },
          {
           "t": "td",
           "c": [
            "Production entry, one LB per service ($)"
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
            "One LB, HTTP routing by host/path"
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
            ", TLS termination — the usual answer"
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
        "Beyond Deployments"
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
        " — run to completion (batch, migrations, one ML training run). ",
        {
         "t": "b",
         "c": [
          "CronJob"
         ]
        },
        " — Jobs on a schedule. ",
        {
         "t": "b",
         "c": [
          "DaemonSet"
         ]
        },
        " — exactly one pod per node: log shippers, monitoring agents… and the NVIDIA device plugin from Stage 6 — now you know what kind of object it is."
       ]
      },
      "\n"
     ]
    }
   ]
  ]
 },
 "m9": {
  "title": "Production & the Ecosystem",
  "sub": "Stage 5: running Kubernetes for real — packaging, delivery, observability, security, extension.",
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
        "Helm — the package manager"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "Ten microservices × four environments = YAML sprawl. A Helm ",
        {
         "t": "b",
         "c": [
          "chart"
         ]
        },
        " is templated YAML; ",
        {
         "t": "code",
         "c": [
          "values.yaml"
         ]
        },
        " holds what differs (",
        {
         "t": "code",
         "c": [
          "replicas: {{ .Values.replicaCount }}"
         ]
        },
        "). Then: ",
        {
         "t": "code",
         "c": [
          "helm install prometheus prometheus-community/kube-prometheus-stack"
         ]
        },
        " — entire complex apps in one command, ",
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
        " to manage them. You'll consume charts long before you write one."
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
        "GitOps — the reconciliation loop, one level up"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "You already know the core K8s idea: controllers make actual state match desired state. ",
        {
         "t": "b",
         "c": [
          "GitOps applies the same loop to deployment itself"
         ]
        },
        ": a git repo holds all manifests; an in-cluster agent (",
        {
         "t": "b",
         "c": [
          "Argo CD"
         ]
        },
        " or ",
        {
         "t": "b",
         "c": [
          "Flux"
         ]
        },
        ") continuously diffs cluster vs repo and syncs. Deploy = merge a PR. Rollback = ",
        {
         "t": "code",
         "c": [
          "git revert"
         ]
        },
        ". Nobody runs ",
        {
         "t": "code",
         "c": [
          "kubectl apply"
         ]
        },
        " against prod by hand, and the cluster can be rebuilt from the repo."
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
        "Observability"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "Metrics:"
         ]
        },
        " Prometheus scrapes everything (pods, nodes, kube-state-metrics); Grafana dashboards; Alertmanager pages you. Watch the golden signals: latency, traffic, errors, saturation. ",
        {
         "t": "b",
         "c": [
          "Logs:"
         ]
        },
        " stdout → node agent (Fluent Bit) → Loki/Elastic; ",
        {
         "t": "code",
         "c": [
          "kubectl logs"
         ]
        },
        " doesn't scale past a few pods. ",
        {
         "t": "b",
         "c": [
          "Events:"
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
        " — your first debugging stop, as you saw with FailedScheduling. Debug flow: ",
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
        " (events) → ",
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
        "Security — the four layers"
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
        ": who can do what — Roles (verbs on resources) bound to users/ServiceAccounts. Every pod runs as a ServiceAccount; least privilege applies to software too."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "Pod security"
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
        ", drop capabilities, read-only root FS. Pod Security Standards enforce this per namespace."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "Network"
         ]
        },
        ": by default ",
        {
         "t": "i",
         "c": [
          "every pod can talk to every pod"
         ]
        },
        ". NetworkPolicies are firewalls on labels: \"db accepts traffic only from app=api\"."
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        {
         "t": "b",
         "c": [
          "Supply chain"
         ]
        },
        ": scan images (Trivy), pin digests, sign (cosign), minimal base images — Stage 2's distroless habit pays off here."
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
        "CRDs & Operators — extending Kubernetes itself"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "A ",
        {
         "t": "b",
         "c": [
          "CustomResourceDefinition"
         ]
        },
        " teaches the API server a new object type; an ",
        {
         "t": "b",
         "c": [
          "Operator"
         ]
        },
        " is a custom controller that reconciles it. ",
        {
         "t": "code",
         "c": [
          "kind: Certificate"
         ]
        },
        " (cert-manager renews TLS), ",
        {
         "t": "code",
         "c": [
          "kind: PostgresCluster"
         ]
        },
        " (operator handles failover/backups), and — closing the GPU loop — the ",
        {
         "t": "b",
         "c": [
          "NVIDIA GPU Operator"
         ]
        },
        ", which installs drivers, device plugin, and DCGM monitoring on every GPU node for you. When you understand operators, you understand why people say Kubernetes is a platform for building platforms."
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
        "Running the cluster itself"
       ]
      },
      "\n",
      {
       "t": "p",
       "c": [
        "Managed control planes (GKE/EKS/AKS) are the default — you keep node pools, upgrades, and cost. Know the drill even so: control-plane upgrade → node pools (drain/cordon one node at a time, one minor version per hop), ",
        {
         "t": "b",
         "c": [
          "etcd backups"
         ]
        },
        " before anything, PodDisruptionBudgets so drains don't take down your quorum. Tooling on your laptop: kind for CI/testing, k3s at the edge, kubeadm to learn what managed services hide (and what CKA tests)."
       ]
      },
      "\n"
     ]
    }
   ]
  ]
 },
 "m10": {
  "title": "Troubleshooting Gym",
  "sub": [
   "Troubleshooting is 30% of the CKA — the single biggest domain. Each scenario drops you into a broken cluster; diagnose it, fix it, then hit ",
   {
    "t": "b",
    "c": [
     "Check"
    ]
   },
   " to be graded on the live cluster state, exactly like the real exam."
  ],
  "_ncards": 0,
  "intro": [
   "Exam technique: ",
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
   " (read the Events!) → ",
   {
    "t": "code",
    "c": [
     "logs"
    ]
   },
   " → fix → verify. Difficulty: ●○○ warm-up, ●●○ real exam level, ●●● tricky. Your fixes are graded, not your commands — any correct path counts."
  ],
  "btnCheck": "Check my work",
  "btnHint": "Hint",
  "btnSolution": "Show solution",
  "btnReset": "Reset scenario",
  "btnBack": "All scenarios",
  "checksTitle": "Grading",
  "passed": "Scenario passed!",
  "solutionTitle": "Solution walkthrough",
  "termHead": "exam console — kubectl → broken-cluster",
  "greeting": "You are connected to the scenario cluster. Read the task above, then investigate. 'Check my work' grades the LIVE cluster state.",
  "clusterTitle": "☸️ Live cluster view"
 },
 "m11": {
  "title": "🎯 CKAD Drills — Probes · Resources · Config",
  "sub": [
   "Three exam domains you can only learn by ",
   {
    "t": "i",
    "c": [
     "doing"
    ]
   },
   ": health probes, resource requests/limits & QoS, and ConfigMaps/Secrets. Each drill is a live playground — missions are graded automatically against the cluster state as you work, in any order."
  ],
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (allowed in the exam)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — every command below is one the exam expects you to know. Watch the missions tick, then hit Reset and do it yourself.",
  "termHead": "drill console — kubectl",
  "greeting": "Connected to the drill cluster. Missions above are graded live as you work — no Check button needed. Type 'help' for commands.",
  "panelApp": "🧪 App panel — inside each container",
  "panelEndpoints": "🔌 Service endpoints (ready pods only)",
  "panelNodes": "⬢ Node capacity — requests vs allocatable",
  "panelObjects": "🗂 Config objects in the cluster",
  "panelPods": "Pods consuming them",
  "noProbes": "no probes — the cluster is blind to this app",
  "limitNone": "no limit",
  "btnHang": "💥 Hang",
  "btn503": "🤒 503",
  "btnHeal": "💚 Heal",
  "btnLeak": "🧪 Start leak",
  "btnStopLeak": "⏹ Stop leak"
 },
 "m12": {
  "title": "🧲 CKA Drills — Scheduling · RBAC",
  "sub": [
   "Two admin-exam domains where reading gets you nowhere: ",
   {
    "t": "b",
    "c": [
     "where pods land"
    ]
   },
   " (taints repel, labels attract, anti-affinity spreads) and ",
   {
    "t": "b",
    "c": [
     "who may do what"
    ]
   },
   " (RBAC, deny-by-default). Live playgrounds — missions are graded automatically against cluster state as you work, in any order."
  ],
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (allowed in the exam)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — every command below is one the exam expects you to know. Watch the missions tick, then hit Reset and do it yourself.",
  "termHead": "drill console — kubectl",
  "greeting": "Connected to the drill cluster. Missions above are graded live as you work — no Check button needed. Type 'help' for commands.",
  "panelNodes": "⬢ Nodes — labels, taints, and what landed where",
  "panelPending": "⏳ Pending pods — the scheduler's own reasons",
  "noPending": "nothing Pending — the scheduler is happy",
  "panelRbac": "🗂 RBAC objects — subjects, roles, bindings",
  "panelTester": "🔑 can-i tester (live)"
 },
 "m14": {
  "title": "🛠 Cluster Ops Drills — drain · upgrade · etcd backup",
  "sub": [
   "The pure-admin third of the CKA, hands-on: ",
   {
    "t": "b",
    "c": [
     "node maintenance"
    ]
   },
   " (drain, cordon — and the PodDisruptionBudget that refuses), the ",
   {
    "t": "b",
    "c": [
     "kubeadm upgrade"
    ]
   },
   " ritual in its one correct order (control plane first, kubelets after, one drained node at a time), and ",
   {
    "t": "b",
    "c": [
     "disaster recovery"
    ]
   },
   " (etcdctl snapshot save with the exact TLS flags the exam wants, etcdutl restore, certificate expiry checks). New here: ",
   {
    "t": "code",
    "c": [
     "ssh NODE"
    ]
   },
   " puts you ON a node. Missions are graded live against cluster state."
  ],
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (allowed in the exam)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — every command below is one the exam expects you to know. Watch the missions tick, then hit Reset and do it yourself.",
  "termHead": "drill console — kubectl + ssh",
  "greeting": "Connected to the drill cluster. Missions above are graded live as you work. New here: 'ssh NODE' hops onto a node (kubeadm, apt-get, systemctl, etcdctl live there; 'exit' returns). Type 'help' for everything else.",
  "panelNodes": "⬢ Nodes — who is cordoned, what runs where",
  "panelPdb": "🛡 PodDisruptionBudgets — live eviction math",
  "noPdb": "no PDBs — every eviction is allowed",
  "panelHost": "🖥 Where you are",
  "panelVersions": "🧮 Versions — control plane vs each kubelet",
  "upgradeOrder": "order: control plane → then each worker: drain → kubeadm → kubelet → uncordon",
  "panelSnap": "📸 Snapshots on /backup (control-plane disk)",
  "noSnap": "no snapshot yet — this cluster has NO undo button",
  "panelLive": "🗄 Live cluster — what a restore would roll back",
  "noDeploys": "no Deployments — did the disaster already strike?"
 },
 "m13": {
  "title": "🌐 Networking Drills — NetworkPolicy · Ingress · Gateway API",
  "sub": [
   "The Services & Networking domain, hands-on: ",
   {
    "t": "b",
    "c": [
     "who may talk to whom"
    ]
   },
   " inside the cluster (NetworkPolicy allow-lists), and ",
   {
    "t": "b",
    "c": [
     "how the outside gets in"
    ]
   },
   " (Ingress host/path rules, and their role-separated successor, the Gateway API). New here: ",
   {
    "t": "code",
    "c": [
     "curl http://HOST/PATH"
    ]
   },
   " makes you the external client. Missions are graded live against cluster state, in any order."
  ],
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (allowed in the exam)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — every command below is one the exam expects you to know. Watch the missions tick, then hit Reset and do it yourself.",
  "termHead": "drill console — kubectl + curl",
  "greeting": "Connected to the drill cluster. Missions above are graded live as you work. New command here: 'curl http://HOST/PATH' acts as an EXTERNAL client hitting your Ingress/Gateway. Type 'help' for everything else.",
  "panelMatrix": "🕸 Connectivity matrix — live NetworkPolicy verdicts",
  "panelPolicies": "🗂 NetworkPolicies in this namespace",
  "panelRules": "🚪 Ingress rules — host/path → Service → pods",
  "panelChain": "🛣 Gateway chain — class → gateway → routes → pods",
  "noPolicies": "no policies yet — the pod network is flat (allow-all)",
  "noRules": "no Ingress yet — every curl returns 404",
  "noGateway": "no Gateway yet — apply gateway.yaml",
  "matrixFrom": "from ↓ · to →"
 },
 "m15": {
  "title": "🎓 Exam Room — mock exams & readiness",
  "sub": "The Certify layer: a per-domain readiness dashboard fed by everything you've done here (lab missions, troubleshooting scenarios, quiz accuracy, past mocks), and timed CKA/CKAD mock exams graded on live cluster state — 66% to pass, partial credit per check, exactly like the real thing.",
  "_ncards": 0,
  "intro": [
   "Exam technique: there is NO check button during the exam. Read the task, do the work, verify it yourself (",
   {
    "t": "code",
    "c": [
     "kubectl get/describe"
    ]
   },
   "), flag anything shaky, move on. Grading happens once, at the end — against the cluster, not your commands. (Storage has no sim tasks yet; the quiz covers that domain.)"
  ],
  "sigPractice": "labs",
  "sigQuiz": "quiz",
  "sigMock": "mock",
  "sigPracticeTitle": "lab missions & scenarios completed for this domain",
  "sigQuizTitle": "cumulative quiz accuracy in this domain",
  "sigMockTitle": "this domain's score in your latest mock exam",
  "btnStart": "Start mock exam",
  "tasksWord": "tasks",
  "minWord": "min",
  "historyTitle": "📜 Past attempts",
  "noHistory": "No attempts yet. The first mock always hurts — better here than in the real one.",
  "taskWord": "Task",
  "ptsWord": "pts",
  "flagBtn": "Flag for later",
  "flaggedBtn": "Flagged",
  "endBtn": "End exam & grade",
  "quitBtn": "Quit",
  "confirmEnd": "Grade the exam now? Unfinished tasks score whatever their cluster state earns.",
  "confirmQuit": "Quit without grading? This attempt will not be recorded.",
  "passed": "PASSED",
  "failed": "Not passed",
  "passLine": "pass line: 66%",
  "byDomain": "Score by domain",
  "byTask": "Per-task grading",
  "solutionTitle": "Solution walkthrough",
  "backBtn": "Back to the Exam Room",
  "termHead": "exam console — kubectl (per-task cluster)",
  "greeting": "Each task runs on its OWN cluster. Do the work, verify with kubectl, then move to the next task — grading happens at the end.",
  "clusterTitle": "☸️ Live cluster view"
 },
 "m16": {
  "title": "🐳 Docker Drills — build · volumes · networks · compose",
  "sub": "Five hands-on Docker playgrounds where reading isn't enough: make the layer cache work for you, slim an image with a multi-stage build, persist data in a volume, wire up name-based DNS, and bring a whole stack up with Compose. Missions are graded live as you type — no Check button.",
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (docs.docker.com)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — every command below is one every Docker user should know cold. Watch the missions tick, then Reset and do it yourself.",
  "termHead": "laptop — docker host (simulated)",
  "greeting": "Simulated Docker engine. Edit the Dockerfile / compose.yaml in the Manifests pane, then build & run here. Type 'help' for commands.",
  "panelImages": "🧊 Images (layers · size)",
  "panelContainers": "📦 Containers",
  "panelInfra": "🧱 Volumes & networks"
 },
 "m17": {
  "title": "🧩 Pod Design — sidecars & initContainers",
  "sub": "One pod, more than one container. Add a sidecar and watch READY track every container, not just the first; add an initContainer and watch the startup sequence play out before the app ever runs. Missions are graded live as you type — no Check button.",
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (kubernetes.io)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — sidecar readiness, the all-containers-ready rule, initContainer sequencing, and logs -c/--previous. Watch the missions tick, then Reset and do it yourself.",
  "termHead": "exam console — kubectl",
  "greeting": "Simulated cluster. Edit the YAML in the Manifests pane, then apply it here. Type 'help' for commands.",
  "panelPods": "🧩 Pods",
  "panelInit": "init",
  "panelEndpoints": "🔌 Service endpoints",
  "ready": "Ready",
  "notReady": "NotReady",
  "btnHang": "😵 hang",
  "btn503": "🤒 503",
  "btnHeal": "😀 heal"
 },
 "m18": {
  "title": "💾 Storage Drills — PV/PVC/StorageClass",
  "sub": "A PersistentVolumeClaim only requests storage; a StorageClass provisions it on demand. Bind, mount, write, delete the pod, and watch a replacement pod keep your data — then watch emptyDir NOT survive the same trick. Missions are graded live as you type — no Check button.",
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs (kubernetes.io)",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — PVC binding (static + dynamic), pod-dies-data-survives vs. emptyDir, the PVC-stuck-Pending fault and its fix, and StatefulSet volumeClaimTemplates. Watch the missions tick, then Reset and do it yourself.",
  "termHead": "exam console — kubectl",
  "greeting": "Simulated cluster. Edit the YAML in the Manifests pane, then apply it here. Type 'help' for commands.",
  "panelPvcs": "💾 PersistentVolumeClaims",
  "panelPvs": "🗄 PersistentVolumes",
  "panelPods": "📦 Pods",
  "noneYet": "(none yet)"
 },
 "m19": {
  "title": "📦 Packaging & GitOps — Helm, Kustomize, drift",
  "sub": "Three playgrounds for the packaging layer: make values.yaml really drive a Helm chart (including revision history and rollback), patch a Kustomize base from an overlay without touching it, and watch a GitOps controller revert hand-edited drift on its own. Missions are graded live as you type — no Check button.",
  "_ncards": 0,
  "missionsTitle": "Missions — graded live",
  "docsTitle": "📖 In the real docs",
  "btnReset": "Reset lab",
  "btnSolve": "Solve it for me",
  "solutionTitle": "Reference solution",
  "solveNote": "Reference solution — install/upgrade/rollback, namePrefix/patches/patchesJson6902, and auto-sync vs manual sync. Watch the missions tick, then Reset and do it yourself.",
  "termHead": "exam console — kubectl / helm / kustomize / gitops",
  "greeting": "Simulated cluster. Edit the chart/overlay files in the Manifests pane, then run helm/kustomize/kubectl/gitops here. Type 'help' for kubectl commands.",
  "panelReleases": "⎈ Releases",
  "panelRevision": "rev",
  "panelNoReleases": "no releases yet — helm install RELEASE chart/",
  "panelDiff": "🧬 base vs overlays/prod",
  "panelApps": "🔄 GitOps apps",
  "panelSource": "source",
  "panelMissing": "missing",
  "panelModified": "modified",
  "btnAutoSyncOn": "autoSync: on (click to disable)",
  "btnAutoSyncOff": "autoSync: off (click to enable)"
 }
};
