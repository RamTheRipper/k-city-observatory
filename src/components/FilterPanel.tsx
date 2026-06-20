import type { StatusFilter, UserSettings } from '../types';

type FilterPanelProps = {
  groups: string[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onReset: () => void;
};

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'upcoming', label: '今後の配信' },
  { value: 'live', label: '配信中' },
  { value: 'archived', label: '過去配信' },
  { value: 'all', label: 'すべて' },
];

export function FilterPanel({ groups, settings, onChange, onReset }: FilterPanelProps) {
  return (
    <section className="panel filterPanel" aria-label="フィルター">
      <div className="field">
        <label htmlFor="group-filter">グループ</label>
        <select
          id="group-filter"
          value={settings.selectedGroup}
          onChange={(event) => onChange({ ...settings, selectedGroup: event.target.value })}
        >
          <option value="all">全て</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="status-filter">表示対象</label>
        <select
          id="status-filter"
          value={settings.statusFilter}
          onChange={(event) =>
            onChange({ ...settings, statusFilter: event.target.value as StatusFilter })
          }
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <label className="switchRow">
        <input
          type="checkbox"
          checked={settings.showFavoritesOnly}
          onChange={(event) => onChange({ ...settings, showFavoritesOnly: event.target.checked })}
        />
        お気に入りのみ
      </label>

      <button type="button" className="secondaryButton" onClick={onReset}>
        フィルターリセット
      </button>
    </section>
  );
}
