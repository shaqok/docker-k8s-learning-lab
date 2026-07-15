import { renderToString } from 'react-dom/server';
import React from 'react';
import App from '/sessions/practical-inspiring-bardeen/mnt/outputs/docker-k8s-lab-react/src/App.jsx';
import { LanguageProvider } from '/sessions/practical-inspiring-bardeen/mnt/outputs/docker-k8s-lab-react/src/i18n/LanguageContext.jsx';
import { ProgressProvider } from '/sessions/practical-inspiring-bardeen/mnt/outputs/docker-k8s-lab-react/src/context/ProgressContext.jsx';
import { createDockerSim } from '/sessions/practical-inspiring-bardeen/mnt/outputs/docker-k8s-lab-react/src/sims/dockerSim.js';
import { createK8sSim } from '/sessions/practical-inspiring-bardeen/mnt/outputs/docker-k8s-lab-react/src/sims/k8sSim.js';

// ---- sim logic tests ----
const out=[];
const dsim=createDockerSim({onChange:()=>{},onMission:(id)=>out.push('M:'+id)});
const print=(t,c)=>out.push(t);
dsim.exec('docker pull nginx',print);
dsim.exec('docker run -d -p 8080:80 --name web nginx',print);
dsim.exec('docker ps',print);
dsim.exec('curl localhost:8080',print);
dsim.exec('docker run --gpus all pytorch/pytorch nvidia-smi',print);
console.log('docker missions:',out.filter(x=>x.startsWith('M:')).join(','));
console.log('docker ps ok:',out.some(x=>x.includes('Up 2 minutes')));
console.log('curl ok:',out.some(x=>x.includes('answered on port 8080')));
console.log('nvidia-smi ok:',out.some(x=>x.includes('NVIDIA-SMI')));

const kout=[];
const ksim=createK8sSim({onMission:(id)=>kout.push('M:'+id)});
const kprint=(t,c)=>kout.push(t);
ksim.exec('kubectl get nodes',kprint);
ksim.exec('kubectl create deployment web --image=nginx --replicas=3',kprint);
for(let i=0;i<6;i++)ksim.reconcile();
await new Promise(r=>setTimeout(r,2500));
ksim.exec('kubectl get pods -o wide',kprint);
console.log('k8s pods running:',ksim.state.pods.filter(p=>p.status==='Running').length);
ksim.exec('kubectl scale deployment web --replicas=12',kprint);
for(let i=0;i<12;i++)ksim.reconcile();
await new Promise(r=>setTimeout(r,1500));
console.log('k8s pending exists:',ksim.state.pods.some(p=>p.status==='Pending'));
console.log('k8s missions:',kout.filter(x=>x.startsWith('M:')).join(','));

// ---- SSR render both languages ----
let store={};
globalThis.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}};
globalThis.document={documentElement:{lang:'en'},title:''};
const render=()=>renderToString(<LanguageProvider><ProgressProvider><App/></ProgressProvider></LanguageProvider>);
const en=render();
console.log('EN render:',en.length,'| roadmap:',en.includes('Roadmap: Beginner'),'| sidebar:',en.includes('Operator Toolkit'),'| quiz:',en.includes('A container is best described'));
store.dk8slang='ko';
const ko=render();
console.log('KO render:',ko.length,'| roadmap:',ko.includes('로드맵'),'| stage:',ko.includes('1단계 · 컨테이너 기초'),'| quiz:',ko.includes('컨테이너를 가장 잘 설명한'),'| gpu:',ko.includes('GPU 스케줄링 시뮬레이터'));
process.exit(0);
