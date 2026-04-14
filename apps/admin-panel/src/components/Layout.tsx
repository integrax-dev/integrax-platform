import { NavLink, useNavigate } from 'react-router-dom';
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
  const { t, i18n } = useTranslation();

  const navItems = [
    { path: '/',               label: t('nav.dashboard'),     icon: '📊' },
    { path: '/tenants',        label: t('nav.tenants'),        icon: '🏢' },
    { path: '/connectors',     label: t('nav.connectors'),     icon: '🔌' },
    { path: '/workflows',      label: t('nav.workflows'),      icon: '⚡' },
    { path: '/events',         label: t('nav.events'),         icon: '📨' },
    { path: '/audit',          label: t('nav.audit'),          icon: '📋' },
    { path: '/incidents',      label: t('nav.incidents'),      icon: '🚨' },
    { path: '/schema-diffs',   label: t('nav.schemaDiffs'),    icon: '🔀' },
    { path: '/mapping-memory', label: t('nav.mappingMemory'),  icon: '🧠' },
    { path: '/settings',       label: t('nav.settings'),       icon: '⚙️' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentLang = i18n.language?.slice(0, 2) ?? 'es';
  const activeLang = LANGUAGES.find(l => l.code === currentLang) ?? LANGUAGES[0];

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
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {/* Language switcher */}
          <div className="lang-switcher">
            <span className="lang-current">{activeLang.flag} {activeLang.label}</span>
            <div className="lang-dropdown">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  className={`lang-option ${currentLang === lang.code ? 'active' : ''}`}
                  onClick={() => i18n.changeLanguage(lang.code)}
                >
                  {lang.flag} {lang.label}
                </button>
              ))}
            </div>
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
        {children}
      </main>
    </div>
  );
}
