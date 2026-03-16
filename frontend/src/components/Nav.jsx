import { NavLink } from 'react-router-dom';

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-brand">Auction Monitor</div>
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
