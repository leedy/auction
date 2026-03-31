import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext } from 'react';
import Nav from './components/Nav';
import Auctions from './pages/Auctions';
import Lots from './pages/Lots';
import Flagged from './pages/Flagged';
import Interests from './pages/Interests';
import Admin from './pages/Admin';
import Models from './pages/Models';
import { getAuctionHouses } from './services/api';

export const AuctionHouseContext = createContext({
  ah: null,
  auctionHouses: [],
  setAh: () => {},
  refreshHouses: () => {},
  auctionId: null,
  setAuctionId: () => {},
});

function App() {
  const [auctionHouses, setAuctionHouses] = useState([]);
  const [ah, setAhState] = useState(() => localStorage.getItem('selectedAh') || null);
  const [auctionId, setAuctionIdState] = useState(() => {
    const saved = localStorage.getItem('selectedAuctionId');
    return saved ? Number(saved) : null;
  });

  const setAh = (slug) => {
    setAhState(slug);
    if (slug) {
      localStorage.setItem('selectedAh', slug);
    } else {
      localStorage.removeItem('selectedAh');
    }
    // Clear auction selection when house changes
    setAuctionIdState(null);
    localStorage.removeItem('selectedAuctionId');
  };

  const setAuctionId = (id) => {
    setAuctionIdState(id);
    if (id) {
      localStorage.setItem('selectedAuctionId', String(id));
    } else {
      localStorage.removeItem('selectedAuctionId');
    }
  };

  const refreshHouses = async () => {
    try {
      const houses = await getAuctionHouses();
      setAuctionHouses(houses);
      // Auto-select first house if none selected or selection is invalid
      if (houses.length > 0) {
        const slugs = houses.map((h) => h.slug);
        if (!ah || !slugs.includes(ah)) {
          setAh(houses[0].slug);
        }
      }
    } catch (err) {
      console.error('Failed to load auction houses:', err);
    }
  };

  useEffect(() => {
    refreshHouses();
  }, []);

  return (
    <AuctionHouseContext.Provider value={{ ah, auctionHouses, setAh, refreshHouses, auctionId, setAuctionId }}>
      <BrowserRouter>
        <Nav />
        <main className="main-content">
          <Routes>
            <Route path="/auctions" element={<Auctions />} />
          <Route path="/lots" element={<Lots />} />
            <Route path="/flagged" element={<Flagged />} />
            <Route path="/interests" element={<Interests />} />
            <Route path="/models" element={<Models />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/lots" replace />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuctionHouseContext.Provider>
  );
}

export default App;
