import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-wrapper">
      <nav className="navbar">
        <div className="navbar-brand">Evia CRM</div>
        <div className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Active Tenders
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Client Book
          </NavLink>
          <NavLink to="/pipeline" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Sales Pipeline
          </NavLink>
          <NavLink to="/prospected" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Contracts Prospected
          </NavLink>
        </div>
        <div className="navbar-user">
          <span className="user-name">{user?.name}</span>
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
