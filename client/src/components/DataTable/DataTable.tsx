import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../Button/Button';

/* -----------------------------------------------------------------
 * Types
 * ----------------------------------------------------------------- */

export interface Column<T> {
  key: string;
  header: string;
  /** Pixel width or "flex" to absorb remaining space. */
  width?: number | 'flex';
  /** Hard cap on cell content width (used for truncation). */
  maxWidth?: number;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  sortable?: boolean;
  sortKey?: string;
  /** Apply font-mono with tabular-nums to cell content. */
  mono?: boolean;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyState?: {
    message: string;
    action?: { label: string; onClick: () => void };
  };
  onRowClick?: (row: T) => void;
  expandedRow?: {
    rowId: string | null;
    render: (row: T) => ReactNode;
  };
  selectedRowId?: string | null;
  pagination?: {
    pageSize: number;
    total: number;
    page: number;
    onPageChange: (page: number) => void;
  };
  sortState?: SortState;
  onSortChange?: (state: SortState) => void;
  /** ARIA label for the table element (improves screen reader output). */
  ariaLabel?: string;
  /**
   * "attached" sits flush below stage tabs + filter row: bottom corners
   * round, no top border. "standalone" is the default rounded card.
   */
  variant?: 'standalone' | 'attached';
}

/* -----------------------------------------------------------------
 * Truncated text with tooltip
 * Exported so page code can wrap any string cell.
 * ----------------------------------------------------------------- */

interface TruncatedTextProps {
  children: string;
  maxWidth?: number;
}

export function TruncatedText({ children, maxWidth }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setIsTruncated(el.scrollWidth > el.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const span = (
    <span
      ref={ref}
      className="dt-truncate"
      style={maxWidth != null ? { maxWidth } : undefined}
    >
      {children}
    </span>
  );

  if (!isTruncated) return span;

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{span}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="dt-tooltip" sideOffset={4} collisionPadding={8}>
          {children}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/* -----------------------------------------------------------------
 * DataTable
 * ----------------------------------------------------------------- */

function colWidthStyle<T>(col: Column<T>): CSSProperties {
  if (col.width === 'flex' || col.width == null) return { width: 'auto' };
  return { width: col.width };
}

function alignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'dt-align-right';
  if (align === 'center') return 'dt-align-center';
  return 'dt-align-left';
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  isError,
  errorMessage = 'Could not load data.',
  onRetry,
  emptyState,
  onRowClick,
  expandedRow,
  selectedRowId,
  pagination,
  sortState,
  onSortChange,
  ariaLabel,
  variant = 'standalone',
}: DataTableProps<T>) {
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const totalCols = columns.length;

  function handleHeaderClick(col: Column<T>) {
    if (!col.sortable || !onSortChange) return;
    const key = col.sortKey ?? col.key;
    if (sortState?.key === key) {
      onSortChange({ key, direction: sortState.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ key, direction: 'asc' });
    }
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, idx: number, row: T) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      rowRefs.current[idx + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rowRefs.current[idx - 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onRowClick?.(row);
    } else if (e.key === 'Escape') {
      if (expandedRow?.rowId && expandedRow.rowId === rowKey(row)) {
        // Tell the parent to collapse - we surface this via onRowClick on the
        // already-expanded row, which is the same gesture used to toggle.
        e.preventDefault();
        onRowClick?.(row);
      }
    }
  }

  /* Header */
  const header = (
    <thead className="dt-thead">
      <tr>
        {columns.map(col => {
          const sortKey = col.sortKey ?? col.key;
          const isSorted = sortState?.key === sortKey;
          const SortIcon = isSorted
            ? sortState!.direction === 'asc'
              ? ArrowUp
              : ArrowDown
            : null;
          return (
            <th
              key={col.key}
              className={`dt-th ${alignClass(col.align)}${col.sortable ? ' dt-th-sortable' : ''}`}
              style={colWidthStyle(col)}
              aria-sort={
                isSorted
                  ? sortState!.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : col.sortable
                    ? 'none'
                    : undefined
              }
              onClick={col.sortable ? () => handleHeaderClick(col) : undefined}
            >
              <span className="dt-th-inner">
                {col.header}
                {SortIcon && <SortIcon size={12} aria-hidden />}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );

  /* Body */
  let body: ReactNode;

  if (isLoading) {
    body = (
      <tbody className="dt-tbody">
        {Array.from({ length: 5 }).map((_, i) => (
          <tr key={`s-${i}`} className="dt-row dt-row-skeleton">
            {columns.map(col => (
              <td
                key={col.key}
                className={`dt-td ${alignClass(col.align)}`}
                style={colWidthStyle(col)}
              >
                <span className="dt-skel" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  } else if (isError) {
    body = (
      <tbody className="dt-tbody">
        <tr>
          <td colSpan={totalCols} className="dt-state dt-state-error">
            <AlertCircle size={24} aria-hidden />
            <p className="dt-state-title">{errorMessage}</p>
            {onRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </td>
        </tr>
      </tbody>
    );
  } else if (data.length === 0) {
    const message = emptyState?.message ?? 'No results.';
    body = (
      <tbody className="dt-tbody">
        <tr>
          <td colSpan={totalCols} className="dt-state dt-state-empty">
            <p className="dt-state-message">{message}</p>
            {emptyState?.action && (
              <Button variant="secondary" size="sm" onClick={emptyState.action.onClick}>
                {emptyState.action.label}
              </Button>
            )}
          </td>
        </tr>
      </tbody>
    );
  } else {
    body = (
      <tbody className="dt-tbody">
        {data.map((row, idx) => {
          const id = rowKey(row);
          const isSelected = selectedRowId === id;
          const isExpanded = expandedRow?.rowId === id;
          const clickable = !!onRowClick;
          const rowClasses = [
            'dt-row',
            clickable ? 'dt-row-clickable' : '',
            isSelected ? 'dt-row-selected' : '',
            isExpanded ? 'dt-row-expanded' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <Fragment key={id}>
              <tr
                ref={el => { rowRefs.current[idx] = el; }}
                tabIndex={0}
                aria-selected={isSelected || undefined}
                aria-expanded={expandedRow ? isExpanded : undefined}
                className={rowClasses}
                onClick={clickable ? () => onRowClick!(row) : undefined}
                onKeyDown={e => handleRowKeyDown(e, idx, row)}
              >
                {columns.map(col => {
                  const cellClasses = [
                    'dt-td',
                    alignClass(col.align),
                    col.mono ? 'dt-mono' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td
                      key={col.key}
                      className={cellClasses}
                      style={colWidthStyle(col)}
                    >
                      {col.maxWidth != null ? (
                        <div
                          className="dt-cell-clip"
                          style={{ maxWidth: col.maxWidth }}
                        >
                          {col.render(row)}
                        </div>
                      ) : (
                        col.render(row)
                      )}
                    </td>
                  );
                })}
              </tr>
              {isExpanded && expandedRow && (
                <tr className="dt-row-expand">
                  <td colSpan={totalCols} className="dt-expand-cell">
                    {expandedRow.render(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    );
  }

  /* Pagination footer */
  let footer: ReactNode = null;
  if (pagination && !isLoading && !isError && data.length > 0) {
    const { page, pageSize, total, onPageChange } = pagination;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    footer = (
      <div className="dt-pagination">
        <span className="dt-page-info">
          Showing {start}-{end} of {total}
        </span>
        <div className="dt-page-nav">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="dt-page-indicator">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  const containerClass =
    variant === 'attached' ? 'dt-container dt-container-attached' : 'dt-container';

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <div className={containerClass}>
        <div className="dt-scroll">
          <table className="dt-table" role="table" aria-label={ariaLabel}>
            {header}
            {body}
          </table>
        </div>
        {footer}
      </div>
    </Tooltip.Provider>
  );
}
