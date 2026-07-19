import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import './styles.css';

type AuthResponse = {
  userId: string;
  email: string;
  token: string;
};

type VideoStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type VideoJob = {
  id: string;
  userId: string;
  originalFilename: string;
  status: VideoStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type FramePreview = {
  name: string;
  url: string;
  blob: Blob;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'frame-extractor.token';
const EMAIL_KEY = 'frame-extractor.email';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [frames, setFrames] = useState<FramePreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadJobs();
    const interval = window.setInterval(() => {
      void loadJobs(false);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    return () => {
      frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    };
  }, [frames]);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const auth = await request<AuthResponse>(`/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem(TOKEN_KEY, auth.token);
      localStorage.setItem(EMAIL_KEY, auth.email);
      setToken(auth.token);
      setEmail(auth.email);
      setPassword('');
      setMessage(authMode === 'login' ? 'Login realizado.' : 'Cadastro realizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na autenticacao.');
    } finally {
      setBusy(false);
    }
  }

  async function loadJobs(showLoading = true) {
    if (showLoading) {
      setBusy(true);
    }
    try {
      const data = await request<VideoJob[]>('/videos');
      setJobs(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar videos.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setMessage('Selecione pelo menos um video.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await request<VideoJob>('/videos', {
          method: 'POST',
          body: form
        });
      }
      setFiles([]);
      setMessage('Upload enviado. Os videos entraram na fila de exportacao.');
      await loadJobs(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar videos.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip(job: VideoJob): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/videos/${job.id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Download indisponivel (${response.status}).`);
    }
    return response.blob();
  }

  async function saveZip(job: VideoJob) {
    setBusy(true);
    setMessage('');
    try {
      const blob = await downloadZip(job);
      triggerDownload(blob, `${job.originalFilename}-frames.zip`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao baixar ZIP.');
    } finally {
      setBusy(false);
    }
  }

  async function previewFrames(job: VideoJob) {
    setBusy(true);
    setSelectedJobId(job.id);
    setMessage('');
    frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    setFrames([]);

    try {
      const blob = await downloadZip(job);
      const zip = await JSZip.loadAsync(blob);
      const images: FramePreview[] = [];

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || !/\.(png|jpe?g|webp)$/i.test(name)) {
          continue;
        }
        const imageBlob = await entry.async('blob');
        images.push({
          name,
          blob: imageBlob,
          url: URL.createObjectURL(imageBlob)
        });
      }

      setFrames(images.sort((left, right) => left.name.localeCompare(right.name)));
      if (images.length === 0) {
        setMessage('O ZIP nao contem imagens reconhecidas.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao visualizar frames.');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setToken('');
    setPassword('');
    setJobs([]);
    setFrames([]);
    setSelectedJobId(null);
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Frame Extractor</p>
            <h1>Exportacao de frames de video</h1>
          </div>

          <form onSubmit={authenticate} className="form-stack">
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <label>
              Senha
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
            </label>
            <button disabled={busy}>{authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
          </form>

          <button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Criar uma conta' : 'Ja tenho conta'}
          </button>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Frame Extractor</p>
          <h1>Videos e frames exportados</h1>
        </div>
        <div className="session">
          <span>{email}</span>
          <button className="secondary" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel upload-panel">
          <h2>Novo envio</h2>
          <form onSubmit={uploadVideos} className="form-stack">
            <label>
              Videos
              <input
                type="file"
                accept="video/*,.mp4,.mov,.mkv,.avi,.webm,.wmv,.flv"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>
            <button disabled={busy || files.length === 0}>Enviar {files.length || ''}</button>
          </form>
          <button className="secondary full" onClick={() => void loadJobs()} disabled={busy}>Atualizar lista</button>
          {message && <p className="message">{message}</p>}
        </aside>

        <section className="panel jobs-panel">
          <div className="section-header">
            <h2>Exportacoes</h2>
            <span>{jobs.length} videos</span>
          </div>
          <div className="job-list">
            {jobs.length === 0 && (
              <div className="empty-list">
                Nenhum video enviado ainda.
              </div>
            )}
            {jobs.map((job) => (
              <article key={job.id} className={`job-card ${selectedJobId === job.id ? 'selected' : ''}`}>
                <div>
                  <h3>{job.originalFilename}</h3>
                  <p>Atualizado em {formatDate(job.updatedAt)}</p>
                  {job.errorMessage && <p className="error">{job.errorMessage}</p>}
                </div>
                <span className={`status ${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>
                <div className="actions">
                  <button className="secondary" onClick={() => setSelectedJobId(job.id)}>Detalhes</button>
                  <button className="secondary" disabled={job.status !== 'COMPLETED'} onClick={() => void previewFrames(job)}>Ver frames</button>
                  <button disabled={job.status !== 'COMPLETED'} onClick={() => void saveZip(job)}>Baixar ZIP</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="section-header">
            <h2>Frames</h2>
            <span>{selectedJob ? selectedJob.originalFilename : 'Nenhum video selecionado'}</span>
          </div>

          {frames.length === 0 ? (
            <div className="empty-state">
              <p>Selecione um video concluido e clique em "Ver frames".</p>
            </div>
          ) : (
            <div className="frame-grid">
              {frames.map((frame) => (
                <figure key={frame.name} className="frame-card">
                  <img src={frame.url} alt={frame.name} />
                  <figcaption>
                    <span>{frame.name}</span>
                    <button className="secondary" onClick={() => triggerDownload(frame.blob, frame.name)}>Baixar</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function statusLabel(status: VideoStatus) {
  const labels: Record<VideoStatus, string> = {
    PENDING: 'Pendente',
    PROCESSING: 'Exportando',
    COMPLETED: 'Concluido',
    FAILED: 'Falhou'
  };
  return labels[status];
}

createRoot(document.getElementById('root')!).render(<App />);
