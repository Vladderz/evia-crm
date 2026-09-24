import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TenderView } from './format';

/**
 * Reads / writes the Tenders and Frameworks vs DPS view from the URL.
 *
 * The tenders view has no parameter; the DPS view is `?type=dps`.
 * Switching preserves any other search params and uses replace: true
 * so the back button does not fill with view toggles.
 */
export function useTenderView(): {
  view: TenderView;
  setView: (view: TenderView) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: TenderView = searchParams.get('type') === 'dps' ? 'dps' : 'tenders';

  const setView = useCallback(
    (next: TenderView) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        if (next === 'dps') params.set('type', 'dps');
        else params.delete('type');
        return params;
      }, { replace: true });
    },
    [setSearchParams],
  );

  return { view, setView };
}
