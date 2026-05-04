import { Bell, Menu, Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface TopBarProps {
  /**
   * Optional - the page H1 inside <PageHeader> owns the title now.
   * Kept for cases where a top-bar breadcrumb is wanted.
   */
  title?: string;
  /** Right-side action slot. If omitted, default placeholder Search + Bell icons render. */
  actions?: ReactNode;
  /** Mobile hamburger handler - shows the burger button at <768px when set. */
  onMobileMenu?: () => void;
}

export function TopBar({ title, actions, onMobileMenu }: TopBarProps) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        {onMobileMenu && (
          <button
            type="button"
            className="topbar-burger"
            onClick={onMobileMenu}
            aria-label="Open menu"
          >
            <Menu size={20} aria-hidden />
          </button>
        )}
        {title && <h1 className="topbar-title">{title}</h1>}
      </div>
      <div className="topbar-actions">
        {actions ?? (
          <>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Search"
              title="Search (coming soon)"
            >
              <Search size={18} aria-hidden />
            </button>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Notifications"
              title="Notifications (coming soon)"
            >
              <Bell size={18} aria-hidden />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
