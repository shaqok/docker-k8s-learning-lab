import { createContext, useCallback, useContext, useState } from 'react';

/** Mission progress for both labs + roadmap checklist (persisted). */
const ProgressContext = createContext(null);

export function ProgressProvider({ children }) {
  const [dockerDone, setDockerDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sdocker') || '[]'); } catch { return []; }
  });
  const [k8sDone, setK8sDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sk8s') || '[]'); } catch { return []; }
  });
  const [roadmap, setRoadmap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sroad') || '{}'); } catch { return {}; }
  });
  const [scenariosDone, setScenariosDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8scen') || '[]'); } catch { return []; }
  });
  const [ckadDone, setCkadDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sckad') || '{}'); } catch { return {}; }
  });
  const [ckaDone, setCkaDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8scka') || '{}'); } catch { return {}; }
  });
  const [netDone, setNetDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8snet') || '{}'); } catch { return {}; }
  });
  const [opsDone, setOpsDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sops') || '{}'); } catch { return {}; }
  });
  const [dockerDrillDone, setDockerDrillDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sdockerdrill') || '{}'); } catch { return {}; }
  });
  const [podDone, setPodDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8spod') || '{}'); } catch { return {}; }
  });
  const [quizStats, setQuizStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8squiz') || '{}'); } catch { return {}; }
  });
  const [examResults, setExamResults] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dk8sexam') || '[]'); } catch { return []; }
  });

  const completeMission = useCallback((lab, id) => {
    const set = lab === 'docker' ? setDockerDone : setK8sDone;
    const key = lab === 'docker' ? 'dk8sdocker' : 'dk8sk8s';
    set((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeScenario = useCallback((id) => {
    setScenariosDone((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try { localStorage.setItem('dk8scen', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeCkadMission = useCallback((labId, missionId) => {
    setCkadDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8sckad', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeCkaMission = useCallback((labId, missionId) => {
    setCkaDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8scka', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeNetMission = useCallback((labId, missionId) => {
    setNetDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8snet', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeOpsMission = useCallback((labId, missionId) => {
    setOpsDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8sops', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completeDockerMission = useCallback((labId, missionId) => {
    setDockerDrillDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8sdockerdrill', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const completePodMission = useCallback((labId, missionId) => {
    setPodDone((prev) => {
      const cur = prev[labId] || [];
      if (cur.includes(missionId)) return prev;
      const next = { ...prev, [labId]: [...cur, missionId] };
      try { localStorage.setItem('dk8spod', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /** Clear one drill lab's completed missions so it can be re-attempted from scratch. */
  const makeReset = (setter, storageKey) => (labId) => {
    setter((prev) => {
      if (!(prev[labId] && prev[labId].length)) return prev;
      const next = { ...prev, [labId]: [] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const resetCkadLab = useCallback(makeReset(setCkadDone, 'dk8sckad'), []);
  const resetCkaLab = useCallback(makeReset(setCkaDone, 'dk8scka'), []);
  const resetNetLab = useCallback(makeReset(setNetDone, 'dk8snet'), []);
  const resetOpsLab = useCallback(makeReset(setOpsDone, 'dk8sops'), []);
  const resetDockerLab = useCallback(makeReset(setDockerDrillDone, 'dk8sdockerdrill'), []);
  const resetPodLab = useCallback(makeReset(setPodDone, 'dk8spod'), []);

  /** Fold one quiz attempt's per-domain {r,w} deltas into the running totals. */
  const recordQuiz = useCallback((delta) => {
    setQuizStats((prev) => {
      const next = { ...prev };
      for (const [id, d] of Object.entries(delta)) {
        const cur = next[id] || { r: 0, w: 0 };
        next[id] = { r: cur.r + d.r, w: cur.w + d.w };
      }
      try { localStorage.setItem('dk8squiz', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const recordExamResult = useCallback((result) => {
    setExamResults((prev) => {
      const next = [...prev, result];
      try { localStorage.setItem('dk8sexam', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setRoadmapItem = useCallback((key, checked) => {
    setRoadmap((prev) => {
      const next = { ...prev, [key]: checked };
      try { localStorage.setItem('dk8sroad', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <ProgressContext.Provider value={{ dockerDone, k8sDone, completeMission, roadmap, setRoadmapItem, scenariosDone, completeScenario, ckadDone, completeCkadMission, resetCkadLab, ckaDone, completeCkaMission, resetCkaLab, netDone, completeNetMission, resetNetLab, opsDone, completeOpsMission, resetOpsLab, dockerDrillDone, completeDockerMission, resetDockerLab, podDone, completePodMission, resetPodLab, quizStats, recordQuiz, examResults, recordExamResult }}>
      {children}
    </ProgressContext.Provider>
  );
}

export const useProgress = () => useContext(ProgressContext);
