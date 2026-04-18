import React from 'react';
import { Link } from 'react-router-dom';

const s: Record<string, React.CSSProperties> = {
  nav: {
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #e2e8f0',
    padding: '0 24px',
  },
  inner: {
    maxWidth: 1120, margin: '0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 64,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 20, color: '#7c3aed' },
  links: { display: 'flex', gap: 32, alignItems: 'center' },
  link: { color: '#334155', fontSize: 15, fontWeight: 500, transition: 'color .15s' },
  cta: {
    background: '#7c3aed', color: '#fff', padding: '8px 20px',
    borderRadius: 8, fontWeight: 600, fontSize: 14,
    transition: 'background .15s',
  },
};

export default function Nav() {
  return (
    <nav style={s.nav}>
      <div style={s.inner}>
        <Link to="/" style={s.logo}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#7c3aed"/>
            <path d="M8 14h12M14 8l6 6-6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          IntegraX
        </Link>
        <div style={s.links}>
          <Link to="/pricing" style={s.link}>Pricing</Link>
          <a href="https://docs.integrax.dev" style={s.link} target="_blank" rel="noreferrer">Docs</a>
          <a href="https://app.integrax.dev/login" style={s.link}>Log in</a>
          <Link to="/signup" style={s.cta}>Start free →</Link>
        </div>
      </div>
    </nav>
  );
}
