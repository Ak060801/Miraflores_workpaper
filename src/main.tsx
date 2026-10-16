import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { loadModel, type Model } from './data/model';
import { CtxProvider } from './app/ctx';
import { store } from './store/events';
import { buildSeed } from './app/seed';

function Boot() {
  const [m, setM] = useState<Model | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadModel(`${import.meta.env.BASE_URL}packet.json`).then((model) => {
      if (!store.events.length && !localStorage.getItem('miraflores.noseed')) store.load(buildSeed(model));
      (window as any).__model = model;
      setM(model);
    }).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div className="empty">Could not load the packet: {err}</div>;
  if (!m) return <div className="empty" style={{ marginTop: 80 }}>Loading the Okafor-Lindqvist packet…</div>;
  return <CtxProvider m={m}><App /></CtxProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boot /></StrictMode>);
