import type { GroupItem, HealthDocument, StatusFilter, UserSettings } from '../types';

type FilterPanelProps = {
  groups: string[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onReset: () => void;
  onOpenChannelSettings: () => void;
  groupLabels: GroupItem[];
  health: HealthDocument | null;
  isReloading: boolean;
  onReload: () => void;
};

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'upcoming', label: '今後' },
  { value: 'live', label: '配信中' },
  { value: 'archived', label: '過去' },
];

const groupDisplayOrder = [
  'vwp',
  'girls_revolution_project',
  'sinsekai_record',
  'kuusou',
  'official',
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
  health,
  isReloading,
  onReload,
}: FilterPanelProps) {
  const apiUsage = health?.apiUsage;
  const orderByGroup = new Map(groupDisplayOrder.map((group, index) => [group, index]));
  const groupCounts = apiUsage?.groupCounts
    ? Object.entries(apiUsage.groupCounts).sort(([a], [b]) => {
        const orderA = orderByGroup.get(a);
        const orderB = orderByGroup.get(b);

        if (orderA !== undefined || orderB !== undefined) {
          return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
        }

        return a.localeCompare(b, 'ja-JP');
      })
    : [];

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

        <button type="button" className="reloadButton" onClick={onReload} disabled={isReloading}>
          {isReloading ? '再読み込み中' : '最新データを再読み込み'}
        </button>
      </div>

      {apiUsage ? (
        <div className={apiUsage.lastError ? 'healthStrip healthStrip-warning' : 'healthStrip'}>
          <span>取得範囲: {apiUsage.fetchedScope}</span>
          {apiUsage.loadedChannels !== undefined ? (
            <span>
              チャンネル: {apiUsage.enabledChannels ?? 0}/{apiUsage.loadedChannels} 有効 / fetch{' '}
              {apiUsage.fetchTargets ?? 0}
            </span>
          ) : null}
          <span>推定API使用量: {apiUsage.estimatedUnits} units</span>
          {groupCounts.length > 0 ? (
            <span>
              グループ別:{' '}
              {groupCounts
                .map(([group, count]) => `${getGroupLabel(group, groupLabels)} ${count}`)
                .join(' / ')}
            </span>
          ) : null}
          {apiUsage.skippedChannels?.length ? (
            <span>取得対象外: {apiUsage.skippedChannels.length}</span>
          ) : null}
          {apiUsage.lastSuccessAt ? <span>最終成功: {apiUsage.lastSuccessAt}</span> : null}
          {apiUsage.lastError ? (
            <strong>データ更新が停止している可能性があります: {apiUsage.lastError.message}</strong>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
