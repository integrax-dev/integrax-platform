import { useEffect, useState } from 'react';

export interface ToastItem {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  body: string;
}

const SEVERITY_STYLES: Record<ToastItem['severity'], { bg: string; border: string; icon: string; color: string }> = {
  critical: { bg: '#fef2f2', border: '#fca5a5', icon: '🔴', color: '#b91c1c' },
  major:    { bg: '#fffbeb', border: '#fcd34d', icon: '🟡', color: '#92400e' },
  minor:    { bg: '#eff6ff', border: '#93c5fd', icon: '🔵', color: '#1e40af' },
  info:     { bg: '#f0fdf4', border: '#86efac', icon: '✓',  color: '#15803d' },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const s = SEVERITY_STYLES[item.severity];

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 6s
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        border: `1px solid ${s.border}`,
        background: s.bg,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        maxWidth: 340,
        transition: 'all 0.25s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(20px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: s.color, marginBottom: 2 }}>
            {item.title}
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.body}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastCard item={t} onDismiss={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
