export interface StageTab {
  key: string;
  label: string;
  count?: number;
}

interface StageTabsProps {
  tabs: StageTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function StageTabs({ tabs, activeKey, onChange }: StageTabsProps) {
  return (
    <div className="stage-tabs" role="tablist">
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`stage-tab${isActive ? ' stage-tab-active' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="stage-tab-count">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
