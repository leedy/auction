import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav';
import Lots from './pages/Lots';
import Flagged from './pages/Flagged';
import Interests from './pages/Interests';

function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="main-content">
        <Routes>
          <Route path="/lots" element={<Lots />} />
          <Route path="/flagged" element={<Flagged />} />
          <Route path="/interests" element={<Interests />} />
          <Route path="*" element={<Navigate to="/lots" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
