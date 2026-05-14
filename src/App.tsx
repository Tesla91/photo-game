import { HashRouter, Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
