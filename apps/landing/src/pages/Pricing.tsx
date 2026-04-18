import React from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav.js';

const PLANS = [
  {
    name: 'Free',
    price: 0,
    desc: 'Try it out. No credit card.',
    credits: '10,000',
    events: '100K / month',
    connectors: 1,
    users: 1,
    features: ['1 connector', '3 workflows', '1 user', '7-day data retention', 'Community support'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: 29,
    desc: 'For growing businesses.',
    credits: '500,000',
    events: '5M / month',
    connectors: 5,
    users: 3,
    features: ['5 connectors', '10 workflows', '3 users', '30-day retention', 'Email support'],
    cta: 'Start Starter',
    highlight: false,
  },
  {
    name: 'Professional',
    price: 99,
    desc: 'For serious operations.',
    credits: '5,000,000',
    events: '50M / month',
    connectors: 20,
    users: 10,
    features: ['20 connectors', '50 workflows', '10 users', '90-day retention', 'AI-powered workflows', 'Priority support', 'SLA 99.9%'],
    cta: 'Start Professional',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 299,
    desc: 'Unlimited everything.',
    credits: 'Unlimited',
    events: 'Unlimited',
    connectors: 100,
    users: 100,
    features: ['Unlimited connectors', '500 workflows', '100 users', '365-day retention', 'Self-hosted option', 'Dedicated support', 'SLA 99.99%', 'SSO / SAML'],
    cta: 'Contact sales',
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <div>
      <Nav />
      <section style={{ padding: '80px 24px 40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Simple pricing</h1>
        <p style={{ color: '#64748b', fontSize: 18 }}>Start free. Scale when you need it. All prices in USD.</p>
      </section>

      <section style={{ padding: '20px 24px 80px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 24 }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{
              padding: 32, borderRadius: 16,
              border: plan.highlight ? '2px solid #7c3aed' : '1.5px solid #e2e8f0',
              background: plan.highlight ? '#faf5ff' : '#fff',
              position: 'relative',
            }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', padding: '4px 16px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{plan.desc}</div>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: '#0f172a' }}>${plan.price}</span>
                <span style={{ color: '#94a3b8' }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', marginBottom: 32 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ padding: '6px 0', color: '#475569', fontSize: 14, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#7c3aed' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={plan.name === 'Enterprise' ? 'mailto:sales@integrax.dev' : `/signup?plan=${plan.name.toLowerCase()}`}
                style={{
                  display: 'block', textAlign: 'center',
                  background: plan.highlight ? '#7c3aed' : '#f1f5f9',
                  color: plan.highlight ? '#fff' : '#334155',
                  padding: '12px 24px', borderRadius: 8, fontWeight: 600, fontSize: 15,
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 600, margin: '60px auto 0', textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: 15 }}>
            All plans include 10,000 free credits on signup. Need a custom plan?{' '}
            <a href="mailto:sales@integrax.dev" style={{ color: '#7c3aed', fontWeight: 600 }}>Contact us</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
