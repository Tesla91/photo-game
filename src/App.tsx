import { HashRouter, Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { HostNew } from './pages/HostNew';
import { HostDashboard } from './pages/HostDashboard';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host/new" element={<HostNew />} />
        <Route path="/host/:code" element={<HostDashboard />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
