import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, type Health } from './lib/api';
import { Icon } from './components/ui';
import Dashboard from './pages/Dashboard';
import InterviewSetup from './pages/InterviewSetup';
import InterviewRoom from './pages/InterviewRoom';
import ReportPage from './pages/Report';
import Lab from './pages/Lab';
import Prepare from './pages/Prepare';
import Quiz from './pages/Quiz';
import History from './pages/History';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.home, end: true },
  { to: '/prepare', label: 'Prepare', icon: Icon.book },
  { to: '/interview', label: 'Interview', icon: Icon.mic },
  { to: '/lab', label: 'Code Lab', icon: Icon.code },
  { to: '/quiz', label: 'Quiz', icon: Icon.quiz },
  { to: '/history', label: 'History', icon: Icon.history },
  { to: '/settings', label: 'AI Engine', icon: Icon.cog },
];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);

  const provider = health?.active ?? 'offline';
  const ok = provider === 'ollama' ? health?.ollama.ok : provider === 'openai' ? health?.openai.ok : !!health;

  return (
    <div className="app">
      <aside className="side">
        <div className="logo"><i>N</i>NEXUS</div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.icon}<span>{n.label}</span></NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="status-pill">
          <span className={`dot ${ok ? 'ok' : ''}`} />
          <span>{health ? `${provider}${provider === 'ollama' ? ' · ' + health.settings.ollamaModel : ''}` : 'API offline'}</span>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prepare" element={<Prepare />} />
          <Route path="/interview" element={<InterviewSetup />} />
          <Route path="/interview/:id" element={<InterviewRoom />} />
          <Route path="/report/:id" element={<ReportPage />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
