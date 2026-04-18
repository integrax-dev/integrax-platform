import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Nav from '../components/Nav.js';

const API_URL = import.meta.env['VITE_API_URL'] ?? 'https://api.integrax.dev';

type Step = 'form' | 'verify' | 'done';

export default function Signup() {
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  const [form, setForm] = useState({
    email: '',
    name: '',
    companyName: '',
    plan: params.get('plan') ?? 'free',
  });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await resp.json() as { success: boolean; error?: { message: string } };
      if (!data.success) throw new Error(data.error?.message ?? 'Signup failed');
      setEmail(form.email);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Nav />
      <section style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f8fafc' }}>
        <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 40 }}>

          {step === 'form' && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>Create your account</h1>
                <p style={{ color: '#64748b', marginTop: 8 }}>10,000 free API credits included.</p>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Your name</label>
                  <input
                    required style={inputStyle} placeholder="Jane Smith"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Company / workspace name</label>
                  <input
                    required style={inputStyle} placeholder="Acme Corp"
                    value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Work email</label>
                  <input
                    required type="email" style={inputStyle} placeholder="jane@acme.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Plan</label>
                  <select style={inputStyle} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                    <option value="free">Free — $0/mo</option>
                    <option value="starter">Starter — $29/mo</option>
                    <option value="professional">Professional — $99/mo</option>
                    <option value="enterprise">Enterprise — $299/mo</option>
                  </select>
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? 'Sending...' : 'Continue →'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: 24, color: '#94a3b8', fontSize: 13 }}>
                Already have an account?{' '}
                <a href="https://app.integrax.dev/login" style={{ color: '#7c3aed', fontWeight: 600 }}>Log in</a>
              </p>
            </>
          )}

          {step === 'verify' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Check your inbox</h2>
              <p style={{ color: '#475569', lineHeight: 1.7 }}>
                We sent a verification link to <strong>{email}</strong>.<br />
                Click it to activate your account.
              </p>
              <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 24 }}>
                Didn't receive it?{' '}
                <button onClick={() => setStep('form')} style={{ color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  Try again
                </button>
              </p>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 15, outline: 'none', background: '#fff', color: '#0f172a' };
const btnStyle: React.CSSProperties = { background: '#7c3aed', color: '#fff', padding: '13px', borderRadius: 8, fontWeight: 700, fontSize: 16, border: 'none', cursor: 'pointer', marginTop: 4 };
