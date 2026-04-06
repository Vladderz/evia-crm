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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
