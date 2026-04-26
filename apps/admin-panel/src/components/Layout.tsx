import { NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { useTranslation } from 'react-i18next';
import './Layout.css';

const LANGUAGES = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
];

const ROLE_LABELS = {
  platform_admin: 'Administrador',
  tenant_admin: 'Tenant Admin',
  operator: 'Operador',
  viewer: 'Viewer',
} as const;

function Icon({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'dashboard') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="5" height="5" rx="1.2" />
        <rect x="12" y="3" width="5" height="8" rx="1.2" />
        <rect x="3" y="12" width="5" height="5" rx="1.2" />
        <rect x="12" y="14" width="5" height="3" rx="1.2" />
      </svg>
    );
  }

  if (name === 'tenants') {
    return (
      <svg {...common}>
        <path d="M10 4.25a2.75 2.75 0 1 1 0 5.5a2.75 2.75 0 0 1 0-5.5Z" />
        <path d="M4.75 16.25a5.25 5.25 0 0 1 10.5 0" />
        <path d="M3 9.75a2.25 2.25 0 0 1 2.25-2.25" />
        <path d="M17 9.75a2.25 2.25 0 0 0-2.25-2.25" />
      </svg>
    );
  }

  if (name === 'connectors') {
    return (
      <svg {...common}>
        <path d="M6 4v4" />
        <path d="M14 12v4" />
        <path d="M10 6H7.5a2.5 2.5 0 1 0 0 5H12.5a2.5 2.5 0 1 1 0 5H10" />
      </svg>
    );
  }

  if (name === 'workflows') {
    return (
      <svg {...common}>
        <path d="M8 3 4 10h4l-1 7 5-8H8l0-6Z" />
      </svg>
    );
  }

  if (name === 'events') {
    return (
      <svg {...common}>
        <path d="M4 5h12" />
        <path d="M4 10h8" />
        <path d="M4 15h6" />
        <path d="m13 12 3 3-3 3" />
      </svg>
    );
  }

  if (name === 'audit') {
    return (
      <svg {...common}>
        <path d="M6 3.5h8l2 2V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
        <path d="M8 8h4" />
        <path d="M8 11h5" />
        <path d="M8 14h3" />
      </svg>
    );
  }

  if (name === 'incidents') {
    return (
      <svg {...common}>
        <path d="M10 3.5 17 16.5H3L10 3.5Z" />
        <path d="M10 8v3.5" />
        <circle cx="10" cy="14.2" r=".6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === 'schema') {
    return (
      <svg {...common}>
        <path d="M4 5h4v4H4z" />
        <path d="M12 11h4v4h-4z" />
        <path d="M8 7h2.5a2.5 2.5 0 0 1 2.5 2.5V11" />
      </svg>
    );
  }

  if (name === 'mapping') {
    return (
      <svg {...common}>
        <path d="M4 6.5h5" />
        <path d="M11 6.5h5" />
        <path d="M10 4v5" />
        <path d="M4 13.5h12" />
      </svg>
    );
  }

  if (name === 'settings') {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 3.5v1.5" />
        <path d="M10 15v1.5" />
        <path d="m5.4 5.4 1 1" />
        <path d="m13.6 13.6 1 1" />
        <path d="M3.5 10H5" />
        <path d="M15 10h1.5" />
        <path d="m5.4 14.6 1-1" />
        <path d="m13.6 6.4 1-1" />
      </svg>
    );
  }

  if (name === 'chevron-left' || name === 'arrow-left') {
    return (
      <svg {...common}>
        <path d="m12.5 4.5-5 5 5 5" />
      </svg>
    );
  }

  if (name === 'chevron-right' || name === 'arrow-right') {
    return (
      <svg {...common}>
        <path d="m7.5 4.5 5 5-5 5" />
      </svg>
    );
  }

  if (name === 'bell') {
    return (
      <svg {...common}>
        <path d="M6.5 14.5h7" />
        <path d="M8 16a2 2 0 0 0 4 0" />
        <path d="M5.5 14.5V9.2a4.5 4.5 0 1 1 9 0v5.3" />
      </svg>
    );
  }

  if (name === 'user') {
    return (
      <svg {...common}>
        <path d="M10 4.25a2.75 2.75 0 1 1 0 5.5a2.75 2.75 0 0 1 0-5.5Z" />
        <path d="M4.75 16.25a5.25 5.25 0 0 1 10.5 0" />
      </svg>
    );
  }

  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(() => window.history.state?.idx ?? 0);
  const [historyMaxIndex, setHistoryMaxIndex] = useState<number>(() => window.history.state?.idx ?? 0);

  const navItems = useMemo(
    () => [
      { path: '/', label: t('nav.dashboard'), icon: 'dashboard', section: 'overview' },
      { path: '/tenants', label: t('nav.tenants'), icon: 'tenants', section: 'operate' },
      { path: '/connectors', label: t('nav.connectors'), icon: 'connectors', section: 'operate' },
      { path: '/workflows', label: t('nav.workflows'), icon: 'workflows', section: 'operate' },
      { path: '/events', label: t('nav.events'), icon: 'events', section: 'observe' },
      { path: '/audit', label: t('nav.audit'), icon: 'audit', section: 'observe' },
      { path: '/incidents', label: t('nav.incidents'), icon: 'incidents', section: 'observe' },
      { path: '/schema-diffs', label: t('nav.schemaDiffs'), icon: 'schema', section: 'data' },
      { path: '/mapping-memory', label: t('nav.mappingMemory'), icon: 'mapping', section: 'data' },
      { path: '/settings', label: t('nav.settings'), icon: 'settings', section: 'settings' },
    ],
    [t],
  );

  const navSections = ['overview', 'operate', 'observe', 'data', 'settings'] as const;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentLang = i18n.language?.slice(0, 2) ?? 'es';
  const activeLang = LANGUAGES.find((lang) => lang.code === currentLang) ?? LANGUAGES[0];
  const activeNavItem =
    navItems.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
    ) ?? navItems[0];
  const roleLabel = user?.role ? ROLE_LABELS[user.role] : 'Administrador';
  const canGoBack = historyIndex > 0 || window.history.length > 1;
  const canGoForward = historyIndex < historyMaxIndex;

  useEffect(() => {
    const nextIndex = window.history.state?.idx ?? 0;
    setHistoryIndex(nextIndex);
    setHistoryMaxIndex((currentMax) => (navigationType === 'POP' ? currentMax : Math.max(currentMax, nextIndex)));
  }, [location.key, navigationType]);

  const handleGoBack = () => {
    if (!canGoBack) return;
    navigate(-1);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    navigate(1);
  };

  return (
    <div className={`layout ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          {!collapsed && (
            <div className="logo">
              <span className="logo-mark" />
              <div className="logo-copy">
                <span className="logo-text">IntegraX</span>
                <span className="logo-subtitle">integracion</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => {
            const items = navItems.filter((item) => item.section === section);
            return (
              <div key={section} className="nav-section">
                {!collapsed && <div className="nav-section-label">{t(`navSections.${section}`)}</div>}
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="nav-icon">
                      <Icon name={item.icon} />
                    </span>
                    {!collapsed && <span className="nav-label">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="lang-switcher">
            <button
              type="button"
              className="lang-current"
              onClick={() => setLangOpen((open) => !open)}
              aria-expanded={langOpen}
            >
              <span>{activeLang.label}</span>
              {!collapsed && <span className="lang-caret">▾</span>}
            </button>
            {langOpen && (
              <div className="lang-dropdown">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    className={`lang-option ${currentLang === lang.code ? 'active' : ''}`}
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      setLangOpen(false);
                    }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="user-info">
            <div className="user-avatar">
              <Icon name="user" />
            </div>
            {!collapsed && (
              <div className="user-details">
                <span className="user-name">{user?.name ?? 'admin'}</span>
                <span className="user-role">{user?.tenantId ?? 'platform admin'}</span>
              </div>
            )}
          </div>

          {!collapsed && <span className="role-pill">{roleLabel}</span>}

          <button type="button" className="logout-btn" onClick={handleLogout}>
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <div className="history-actions">
              <button
                type="button"
                className={`history-btn ${canGoBack ? '' : 'is-disabled'}`}
                aria-label="Back"
                onClick={handleGoBack}
                disabled={!canGoBack}
              >
                <Icon name="arrow-left" />
              </button>
              <button
                type="button"
                className={`history-btn ${canGoForward ? '' : 'is-disabled'}`}
                aria-label="Forward"
                onClick={handleGoForward}
                disabled={!canGoForward}
              >
                <Icon name="arrow-right" />
              </button>
            </div>
            <div className="toolbar-divider" />
            <div className="breadcrumb">
              <span className="breadcrumb-brand">{activeNavItem.label.toUpperCase()}</span>
            </div>
          </div>

          <div className="topbar-right">
            <label className="role-select-wrap">
              <span className="role-select-label">Rol</span>
              <select className="role-select" value={user?.role ?? 'platform_admin'} disabled>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="toolbar-divider" />

            <button type="button" className="bell-btn" aria-label="Notifications">
              <Icon name="bell" />
              <span className="bell-dot" />
            </button>

            <div className="topbar-user">
              <div className="topbar-user-avatar">
                <Icon name="user" />
              </div>
              <div className="topbar-user-copy">
                <strong>{roleLabel}</strong>
                <span>{user?.tenantId ?? 'platform'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="content">{children}</div>
      </main>
    </div>
  );
}
