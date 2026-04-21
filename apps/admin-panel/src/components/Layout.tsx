import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { useTranslation } from 'react-i18next';
import './Layout.css';

const LANGUAGES = [
  { code: 'es', flag: '🇦🇷', label: 'ES' },
  { code: 'en', flag: '🇺🇸', label: 'EN' },
  { code: 'pt', flag: '🇧🇷', label: 'PT' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'zh', flag: '🇨🇳', label: 'ZH' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);

  const navItems = [
    { path: '/',               label: t('nav.dashboard'),     icon: '📊', section: 'overview' },
    { path: '/tenants',        label: t('nav.tenants'),        icon: '🏢', section: 'operate'  },
    { path: '/connectors',     label: t('nav.connectors'),     icon: '🔌', section: 'operate'  },
    { path: '/workflows',      label: t('nav.workflows'),      icon: '⚡', section: 'operate'  },
    { path: '/events',         label: t('nav.events'),         icon: '📨', section: 'observe'  },
    { path: '/audit',          label: t('nav.audit'),          icon: '📋', section: 'observe'  },
    { path: '/incidents',      label: t('nav.incidents'),      icon: '🚨', section: 'observe'  },
    { path: '/schema-diffs',   label: t('nav.schemaDiffs'),    icon: '🔀', section: 'data'     },
    { path: '/mapping-memory', label: t('nav.mappingMemory'),  icon: '🧠', section: 'data'     },
    { path: '/settings',       label: t('nav.settings'),       icon: '⚙️', section: 'settings' },
  ];

  const NAV_SECTIONS = ['overview', 'operate', 'observe', 'data', 'settings'] as const;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentLang = i18n.language?.slice(0, 2) ?? 'es';
  const activeLang = LANGUAGES.find(l => l.code === currentLang) ?? LANGUAGES[0];
  const activeNavItem = navItems.find(i => i.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(i.path)
  ) ?? navItems[0];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">IntegraX</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map(section => {
            const items = navItems.filter(i => i.section === section);
            return (
              <div key={section} className="nav-section">
                <div className="nav-section-label">{t(`navSections.${section}`)}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {/* Language switcher */}
          <div className="lang-switcher">
            <button
              className="lang-current"
              onClick={() => setLangOpen(o => !o)}
              aria-expanded={langOpen}
            >
              {activeLang.flag} {activeLang.label} <span style={{ opacity: 0.5, fontSize: 9 }}>{langOpen ? '▲' : '▼'}</span>
            </button>
            {langOpen && (
              <div className="lang-dropdown">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    className={`lang-option ${currentLang === lang.code ? 'active' : ''}`}
                    onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="user-info">
            <div className="user-avatar">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role.replace('_', ' ')}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-brand">IntegraX</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{activeNavItem.label}</span>
          </div>
          <div className="topbar-right">
            <span className="pill">{t('common.admin')}</span>
          </div>
        </div>

        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
