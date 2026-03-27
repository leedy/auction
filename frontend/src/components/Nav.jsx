import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { AuctionHouseContext } from '../App';

function Nav() {
  const { ah, auctionHouses, setAh } = useContext(AuctionHouseContext);

  return (
    <nav className="nav">
      <div className="nav-brand">Auction Monitor</div>
      {auctionHouses.length > 1 && (
        <select
          className="ah-selector"
          value={ah || ''}
          onChange={(e) => setAh(e.target.value)}
        >
          {auctionHouses.map((house) => (
            <option key={house.slug} value={house.slug}>
              {house.name}
            </option>
          ))}
        </select>
      )}
      <div className="nav-links">
        <NavLink to="/lots" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Lots
        </NavLink>
        <NavLink to="/flagged" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Flagged
        </NavLink>
        <NavLink to="/interests" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Interests
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Admin
        </NavLink>
      </div>
    </nav>
  );
}

export default Nav;
