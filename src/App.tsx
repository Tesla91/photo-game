import { HashRouter, Route, Routes } from 'react-router-dom';
import { Admin } from './pages/Admin';
import { HostDashboard } from './pages/HostDashboard';
import { HostNew } from './pages/HostNew';
import { Landing } from './pages/Landing';
import { Play } from './pages/Play';
import { Upload } from './pages/Upload';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host/new" element={<HostNew />} />
        <Route path="/host/:code" element={<HostDashboard />} />
        <Route path="/r/:code" element={<Upload />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
