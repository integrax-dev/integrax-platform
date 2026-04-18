import React from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav.js';

const CONNECTORS = ['MercadoPago', 'AFIP WSFE', 'Contabilium', 'Google Sheets', 'WhatsApp', 'Shopify'];

const FEATURES = [
  { icon: '⚡', title: 'Event-driven', desc: 'Kafka + Debezium CDC. Every change triggers an action in real time.' },
  { icon: '🔌', title: 'Plug & play connectors', desc: 'MercadoPago, AFIP, Contabilium, Google Sheets — more added monthly.' },
  { icon: '🤖', title: 'AI-powered workflows', desc: 'Describe what you want in plain language. Claude builds the workflow.' },
  { icon: '🏢', title: 'Multi-tenant', desc: 'Full isolation per business. One platform, unlimited clients.' },
  { icon: '☁️', title: 'Cloud or self-hosted', desc: 'Run on integrax.dev or deploy to your own VPS. Your data, your call.' },
  { icon: '📊', title: 'Full observability', desc: 'Grafana dashboards, distributed tracing, audit logs for every action.' },
];

export default function Home() {
  return (
    <div>
      <Nav />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #fff 60%)', padding: '100px 24px 80px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ede9fe', color: '#7c3aed', padding: '6px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            🚀 Built for Argentina & LatAm
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.1, color: '#0f172a', marginBottom: 24 }}>
            Connect every system.<br />
            <span style={{ color: '#7c3aed' }}>Automate everything.</span>
          </h1>
          <p style={{ fontSize: 20, color: '#475569', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
            IntegraX connects your ERP, payment processor, invoicing, and ecommerce in one platform — with AI-powered workflows and no-code connectors.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/signup" style={{ background: '#7c3aed', color: '#fff', padding: '14px 32px', borderRadius: 10, fontWeight: 700, fontSize: 17 }}>
              Start free — no credit card
            </Link>
            <a href="https://docs.integrax.dev" target="_blank" rel="noreferrer" style={{ background: '#fff', color: '#334155', padding: '14px 32px', borderRadius: 10, fontWeight: 600, fontSize: 17, border: '1.5px solid #e2e8f0' }}>
              View docs →
            </a>
          </div>
          <p style={{ marginTop: 16, color: '#94a3b8', fontSize: 13 }}>10,000 free API credits on signup. No setup fees.</p>
        </div>
      </section>

      {/* Connectors strip */}
      <section style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Integrates with</span>
          {CONNECTORS.map(c => (
            <span key={c} style={{ color: '#475569', fontWeight: 600, fontSize: 14 }}>{c}</span>
          ))}
          <span style={{ color: '#7c3aed', fontSize: 13, fontWeight: 600 }}>+ more</span>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, textAlign: 'center', marginBottom: 60, color: '#0f172a' }}>
            Everything you need to integrate
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 32 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ padding: 32, borderRadius: 16, border: '1.5px solid #e2e8f0', background: '#fff' }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: '#64748b', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#7c3aed', padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Ready to automate?</h2>
        <p style={{ color: '#ddd6fe', fontSize: 18, marginBottom: 40 }}>Start with 10,000 free credits. No setup, no commitment.</p>
        <Link to="/signup" style={{ background: '#fff', color: '#7c3aed', padding: '16px 40px', borderRadius: 10, fontWeight: 700, fontSize: 18 }}>
          Create your free account →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ padding: '40px 24px', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 14 }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <span>© {new Date().getFullYear()} IntegraX. integrax.dev</span>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href="/privacy" style={{ color: '#94a3b8' }}>Privacy</a>
            <a href="/terms" style={{ color: '#94a3b8' }}>Terms</a>
            <a href="https://docs.integrax.dev" style={{ color: '#94a3b8' }}>Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
