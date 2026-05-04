import { Search } from 'lucide-react';
import type { ChangeEvent, ReactNode } from 'react';

interface FilterBarProps {
  /** "attached" sits flush below stage tabs (no top corners, no top border). */
  variant?: 'standalone' | 'attached';
  children: ReactNode;
}

export function FilterBar({ variant = 'standalone', children }: FilterBarProps) {
  return (
    <div className={`filter-bar${variant === 'attached' ? ' filter-bar-attached' : ''}`}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- */

interface FilterBarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

FilterBar.Search = function FilterBarSearch({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel = 'Search',
}: FilterBarSearchProps) {
  return (
    <div className="filter-bar-search">
      <Search size={16} className="filter-bar-search-icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
};

/* ----------------------------------------------------------------- */

interface FilterBarClearProps {
  onClick: () => void;
  label?: string;
}

FilterBar.Clear = function FilterBarClear({
  onClick,
  label = 'Clear filters',
}: FilterBarClearProps) {
  return (
    <button type="button" className="filter-bar-clear" onClick={onClick}>
      {label}
    </button>
  );
};
