import { Outlet, useNavigate } from 'react-router-dom'
import { AppShell } from './AppShell/AppShell'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <AppShell user={user ? { name: user.name, onLogout: handleLogout } : null}>
      <Outlet />
    </AppShell>
  )
}
