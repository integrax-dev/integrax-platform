import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { allowDemoFallbacks } from '../lib/runtime';
import './Login.css';

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <span className="logo-icon">IX</span>
            <span className="logo-text">IntegraX</span>
          </div>
          <p className="login-subtitle">{t('login.title')}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="email">
              {t('login.email')}
            </label>
            <input
              type="email"
              id="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">
              {t('login.password')}
            </label>
            <input
              type="password"
              id="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="........"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? t('common.loading') : t('login.submit')}
          </button>
        </form>

        {allowDemoFallbacks && (
          <div className="login-footer">
            <p className="demo-hint">
              Demo: use any email/password.
              <br />
              Include "admin" in email for admin role.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
