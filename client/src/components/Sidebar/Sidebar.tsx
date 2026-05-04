import { NavLink } from 'react-router-dom';
import { useEffect } from 'react';
import { type LucideIcon, X } from 'lucide-react';
import { Avatar } from '../Avatar/Avatar';
import logoUrl from '../../assets/evia-logo.png';

export interface SidebarNavItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface SidebarUser {
  name: string;
  onLogout?: () => void;
}

interface SidebarProps {
  items: SidebarNavItem[];
  user: SidebarUser | null;
  /** Mobile slide-in open state (controlled by AppShell). */
  open?: boolean;
  onClose?: () => void;
  /**
   * Demo override - when provided, the matching item key renders
   * as active instead of relying on the current route. Used by the
   * Playground to demo the active state without changing the URL.
   */
  activeKey?: string;
}

export function Sidebar({ items, user, open = false, onClose, activeKey }: SidebarProps) {
  /* Close on Escape when open on mobile */
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      <aside
        className={`sidebar${open ? ' sidebar-open' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="sidebar-brand">
          <img src={logoUrl} alt="Evia Consultancy" className="sidebar-brand-logo" />
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {items.map(item => {
            const Icon = item.icon;

            if (activeKey !== undefined) {
              const isActive = activeKey === item.key;
              return (
                <a
                  key={item.key}
                  href={item.to}
                  className={`sidebar-nav-item${isActive ? ' sidebar-nav-item-active' : ''}`}
                  onClick={e => e.preventDefault()}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                  <span>{item.label}</span>
                </a>
              );
            }

            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-nav-item${isActive ? ' sidebar-nav-item-active' : ''}`
                }
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {user && (
          <div className="sidebar-user">
            <Avatar name={user.name} size={32} />
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.name}</span>
              {user.onLogout && (
                <button
                  type="button"
                  className="sidebar-user-action"
                  onClick={user.onLogout}
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop${open ? ' sidebar-backdrop-open' : ''}`}
        aria-hidden
        onClick={onClose}
      />

      {/* Mobile close button (visually duplicated inside the slide-in) */}
      {open && (
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onClose}
          aria-label="Close menu"
          style={{ position: 'fixed', top: 12, left: 184, zIndex: 41 }}
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </>
  );
}
