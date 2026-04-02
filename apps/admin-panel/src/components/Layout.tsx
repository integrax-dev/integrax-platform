import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import './Layout.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'DB' },
  { path: '/tenants', label: 'Tenants', icon: 'TN' },
  { path: '/connectors', label: 'Connectors', icon: 'CX' },
  { path: '/workflows', label: 'Workflows', icon: 'WF' },
  { path: '/events', label: 'Events', icon: 'EV' },
  { path: '/audit', label: 'Audit', icon: 'AU' },
  { path: '/observability', label: 'Observability', icon: 'OB' },
  { path: '/approvals', label: 'Approvals', icon: 'AP' },
  { path: '/conflicts', label: 'Conflicts', icon: 'CF' },
  { path: '/incidents', label: 'Incidents', icon: 'IN' },
  { path: '/schema-diffs', label: 'Schema Diffs', icon: 'SD' },
  { path: '/mapping-memory', label: 'Mapping Memory', icon: 'MM' },
  { path: '/settings', label: 'Settings', icon: 'ST' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">IX</span>
            <span className="logo-text">IntegraX</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
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
        </nav>

        <div className="sidebar-footer">
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
            Salir
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
