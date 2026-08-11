import { useState, type ReactNode } from 'react';
import { BarChart3, Building2, FileText, PauseCircle, Search, TrendingUp } from 'lucide-react';
import { Sidebar, type SidebarNavItem, type SidebarUser } from '../Sidebar/Sidebar';
import { TopBar } from '../TopBar/TopBar';

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_NAV_ITEMS: SidebarNavItem[] = [
  { key: 'tenders', to: '/', label: 'Active Tenders', icon: FileText },
  { key: 'pipeline', to: '/pipeline', label: 'Sales Pipeline', icon: TrendingUp },
  { key: 'clients', to: '/clients', label: 'Client Book', icon: Building2 },
  { key: 'prospected', to: '/prospected', label: 'Contracts Prospected', icon: Search },
  { key: 'scoreboard', to: '/scoreboard', label: 'Scoreboard', icon: BarChart3 },
  { key: 'no_mans_land', to: '/no-mans-land', label: "No Man's Land", icon: PauseCircle },
];

interface AppShellProps {
  /** Optional top-bar title - usually omitted, since PageHeader owns the H1. */
  title?: string;
  /** TopBar right-side action slot (defaults to Search + Bell placeholders). */
  topBarActions?: ReactNode;
  /** Sidebar nav items - defaults to the standard CRM nav. */
  navItems?: SidebarNavItem[];
  /** Authenticated user shown in the sidebar footer. */
  user: SidebarUser | null;
  /** Demo override - forces a sidebar item active by key (used by Playground). */
  sidebarActiveKey?: string;
  children: ReactNode;
}

export function AppShell({
  title,
  topBarActions,
  navItems = DEFAULT_NAV_ITEMS,
  user,
  sidebarActiveKey,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        user={user}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        activeKey={sidebarActiveKey}
      />
      <div className="app-shell-main">
        <TopBar
          title={title}
          actions={topBarActions}
          onMobileMenu={() => setMobileOpen(true)}
        />
        <main className="app-shell-content">{children}</main>
      </div>
    </div>
  );
}
