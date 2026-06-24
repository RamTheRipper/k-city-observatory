import type { GroupItem, StatusFilter, UserSettings } from '../types';

type FilterPanelProps = {
  groups: string[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onReset: () => void;
  onOpenChannelSettings: () => void;
  groupLabels: GroupItem[];
};

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'upcoming', label: '今後・配信中' },
  { value: 'past', label: '過去' },
];

function getGroupLabel(group: string, groupLabels: GroupItem[]): string {
  const definedLabel = groupLabels.find((item) => item.groupId === group)?.displayName;

  if (definedLabel) {
    return definedLabel;
  }

  const labels: Record<string, string> = {
    all: 'すべて',
    vwp: 'V.W.P',
    girls_revolution_project: '少女革命計画',
    sinsekai_record: 'SINSEKAI RECORD',
    kuusou: '空爽',
    official: 'KAMITSUBAKI STUDIO / 公式',
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
  groupLabels,
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
        <label className="searchField" htmlFor="schedule-search">
          <span>検索</span>
          <input
            id="schedule-search"
            type="search"
            value={settings.searchQuery}
            placeholder="配信者・タイトル・タグ"
            onChange={(event) => onChange({ ...settings, searchQuery: event.target.value })}
          />
        </label>

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
                {getGroupLabel(group, groupLabels)}
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
