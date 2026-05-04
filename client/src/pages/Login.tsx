import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Input } from '../components/Input/Input'
import { Button } from '../components/Button/Button'
import logoUrl from '../assets/evia-logo.png'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src={logoUrl} alt="Evia Consultancy" />
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@eviaconsultancy.com"
            required
            autoFocus
            autoComplete="email"
          />
          <div style={{ height: 16 }} />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            className="login-submit"
          >
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
