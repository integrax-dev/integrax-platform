import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminJson } from '../lib/adminApi';
import { useAuthStore } from '../stores/auth';
import { usePlatformStream, type SanitizedPlatformEvent } from '../lib/usePlatformStream';
import { allowDemoFallbacks } from '../lib/runtime';
import './Pages.css';

type EventStatus = 'processed' | 'pending' | 'failed' | 'dlq';

type PlatformEvt = {
  id: string;
  type: string;
  tenant: string;
  connector: string;
  status: EventStatus;
  time: string;
  error?: string;
};

const MOCK_EVENTS: PlatformEvt[] = [
  { id: 'evt_001', type: 'order.created',   tenant: 'Acme SA',   connector: 'Shopify',     status: 'processed', time: 'hace 1 min' },
  { id: 'evt_002', type: 'payment.updated', tenant: 'Globex',    connector: 'MercadoPago', status: 'pending',   time: 'hace 3 min' },
  { id: 'evt_003', type: 'invoice.created', tenant: 'Umbrella',  connector: 'AFIP',        status: 'failed',    time: 'hace 7 min',  error: 'Timeout en servicio externo' },
  { id: 'evt_004', type: 'message.sent',    tenant: 'Acme SA',   connector: 'WhatsApp',    status: 'dlq',       time: 'hace 10 min', error: 'Payload inválido' },
];

const STATUS_BADGE: Record<EventStatus, string> = {
  processed: 'success',
  pending:   'info',
  failed:    'error',
  dlq:       'warning',
};

// ─── Live indicator ───────────────────────────────────────────────────────────

function LiveDot({ active, liveLabel, disconnectedLabel }: { active: boolean; liveLabel: string; disconnectedLabel: string }) {
  return (
    <span className={`live-indicator ${active ? 'is-active' : ''}`}>
      <span className="live-indicator-dot" />
      {active ? liveLabel : disconnectedLabel}
    </span>
  );
}

export function Events() {
  const { t } = useTranslation();
  const [events,      setEvents]      = useState<PlatformEvt[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [connected,   setConnected]   = useState(false);
  const [filterStatus,   setFilterStatus]   = useState<EventStatus | 'all'>('all');
  const [filterConnector, setFilterConnector] = useState<string>('all');
  const [newCount,    setNewCount]    = useState(0);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminJson<{ events: PlatformEvt[] }>('/api/admin/events');
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (allowDemoFallbacks && !cancelled) {
          setEvents(MOCK_EVENTS);
        } else if (!cancelled) {
          setError('No se pudo cargar eventos');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Real-time stream ────────────────────────────────────────────────────────
  const getToken = useCallback(() => useAuthStore.getState().token, []);

  usePlatformStream({
    getToken,
    handlers: useMemo(() => ({
      'event.processed': (env: SanitizedPlatformEvent) => {
        const evt = env.metadata as PlatformEvt;
        if (!evt) return;
        setEvents(prev => [{ ...evt, status: 'processed' }, ...prev.slice(0, 199)]);
        setNewCount(n => n + 1);
        setConnected(true);
      },
      'event.failed': (env: SanitizedPlatformEvent) => {
        const evt = env.metadata as PlatformEvt;
        if (!evt) return;
        setEvents(prev => [{ ...evt, status: 'failed' }, ...prev.slice(0, 199)]);
        setNewCount(n => n + 1);
        setConnected(true);
      },
      'event.dlq': (env: SanitizedPlatformEvent) => {
        const evt = env.metadata as PlatformEvt;
        if (!evt) return;
        setEvents(prev => [{ ...evt, status: 'dlq' }, ...prev.slice(0, 199)]);
        setNewCount(n => n + 1);
        setConnected(true);
      },
    }), []),
  });

  const filtered = events.filter(e => {
    if (filterStatus    !== 'all' && e.status    !== filterStatus)    return false;
    if (filterConnector !== 'all' && e.connector !== filterConnector) return false;
    return true;
  });

  const connectors = useMemo(
    () => Array.from(new Set(events.map(e => e.connector))).sort(),
    [events],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('events.title')}</h1>
          <p className="page-subtitle-row">
            {t('events.subtitle')}
            <LiveDot active={connected} liveLabel={t('common.live')} disconnectedLabel={t('common.disconnected')} />
            {newCount > 0 && (
              <span className="live-counter" onClick={() => setNewCount(0)}>
                +{newCount} {t('common.newItems', { count: '' }).replace('+', '').trim()}
              </span>
            )}
          </p>
        </div>
        <div className="page-filters">
          <select
            className="input input-auto-width"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as EventStatus | 'all')}
          >
            <option value="all">{t('events.allStatuses')}</option>
            <option value="processed">{t('events.status.processed')}</option>
            <option value="pending">{t('events.status.pending')}</option>
            <option value="failed">{t('events.status.failed')}</option>
            <option value="dlq">{t('events.status.dlq')}</option>
          </select>
          <select
            className="input input-auto-width"
            value={filterConnector}
            onChange={e => setFilterConnector(e.target.value)}
          >
            <option value="all">{t('events.allConnectors')}</option>
            {connectors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.id')}</th>
              <th>{t('common.type')}</th>
              <th>{t('common.tenant')}</th>
              <th>{t('common.connector')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.time')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>{t('common.loading')}</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="table-error">{error}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7}>{t('events.noEvents')}</td></tr>
            ) : filtered.map(event => (
              <tr key={event.id}>
                <td><code className="text-xs">{event.id}</code></td>
                <td><code className="event-type">{event.type}</code></td>
                <td>{event.tenant}</td>
                <td>{event.connector}</td>
                <td>
                  <span className={`badge badge-${STATUS_BADGE[event.status]}`}>
                    {t(`events.status.${event.status}`)}
                  </span>
                </td>
                <td className="text-muted">{event.time}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-secondary btn-sm">{t('common.view')}</button>
                    {(event.status === 'failed' || event.status === 'dlq') && (
                      <button className="btn btn-primary btn-sm">{t('common.retry')}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
