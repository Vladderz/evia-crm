import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/ToastProvider'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ActiveTenders from './pages/ActiveTenders'
import ClientBook from './pages/ClientBook'
import SalesPipeline from './pages/SalesPipeline'
import ContractsProspected from './pages/ContractsProspected'
import Scoreboard from './pages/Scoreboard'
import NoMansLand from './pages/NoMansLand'
import Subscriptions from './pages/Subscriptions'
import Playground from './pages/Playground'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/*
            Dev-only component sandbox. The Route is always declared
            so it is reliably picked up by react-router's child
            traversal; the DEV check gates the rendered element. In a
            production build Vite resolves import.meta.env.DEV to
            false at compile time and the ternary collapses to the
            redirect, so /playground 404s back to / for real users.
          */}
          <Route
            path="/playground"
            element={
              import.meta.env.DEV ? <Playground /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ActiveTenders />} />
            <Route path="clients" element={<ClientBook />} />
            <Route path="pipeline" element={<SalesPipeline />} />
            <Route path="prospected" element={<ContractsProspected />} />
            <Route path="scoreboard" element={<Scoreboard />} />
            <Route path="no-mans-land" element={<NoMansLand />} />
            <Route path="subscriptions" element={<Subscriptions />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
