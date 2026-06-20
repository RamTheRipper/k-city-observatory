import type { StatusFilter, UserSettings } from '../types';

type FilterPanelProps = {
  groups: string[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onReset: () => void;
  onOpenChannelSettings: () => void;
};

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'upcoming', label: '今後' },
  { value: 'live', label: '配信中' },
  { value: 'archived', label: '過去' },
];

function getGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    all: 'すべて',
    vwp: 'V.W.P',
    solo: 'ソロ',
    official: '公式/番組',
    other: 'その他',
  };

  return labels[group] ?? group;
}

export function FilterPanel({
  groups,
  settings,
  onChange,
  onReset,
  onOpenChannelSettings,
}: FilterPanelProps) {
  return (
    <section className="filterPanel" aria-label="フィルター">
      <div className="statusTabs" role="tablist" aria-label="表示対象">
        {statusOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className="statusTab"
            aria-selected={settings.statusFilter === option.value}
            onClick={() => onChange({ ...settings, statusFilter: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="filterBar">
        <label className="selectField" htmlFor="group-filter">
          <span>グループ</span>
          <select
            id="group-filter"
            value={settings.selectedGroup}
            onChange={(event) => onChange({ ...settings, selectedGroup: event.target.value })}
          >
            <option value="all">すべて</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {getGroupLabel(group)}
              </option>
            ))}
          </select>
        </label>

        <label className="switchRow">
          <input
            type="checkbox"
            checked={settings.showFavoritesOnly}
            onChange={(event) => onChange({ ...settings, showFavoritesOnly: event.target.checked })}
          />
          お気に入りのみ
        </label>

        <button type="button" className="ghostButton" onClick={onReset}>
          リセット
        </button>

        <button type="button" className="ghostButton settingsButton" onClick={onOpenChannelSettings}>
          配信者設定
        </button>
      </div>
    </section>
  );
}
