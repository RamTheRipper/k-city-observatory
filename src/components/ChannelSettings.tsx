import type { ChannelItem, GroupItem, UserSettings } from '../types';

type ChannelSettingsProps = {
  channels: ChannelItem[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  groupLabels: GroupItem[];
};

const groupDisplayOrder = [
  'vwp',
  'girls_revolution_project',
  'sinsekai_record',
  'kuusou',
  'official',
];

function getChannelName(channel: ChannelItem): string {
  return channel.displayName || channel.channelName || channel.name || channel.channelId;
}

function toInputId(prefix: string, channelId: string): string {
  return `${prefix}-${channelId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getGroupLabel(group: string, groupLabels: GroupItem[]): string {
  const definedLabel = groupLabels.find((item) => item.groupId === group)?.displayName;

  if (definedLabel) {
    return definedLabel;
  }

  const labels: Record<string, string> = {
    vwp: 'V.W.P',
    girls_revolution_project: '少女革命計画',
    sinsekai_record: 'SINSEKAI RECORD',
    kuusou: '空爽',
    official: 'KAMITSUBAKI STUDIO / 公式',
    other: 'その他',
  };

  return labels[group] ?? group;
}

function groupChannels(channels: ChannelItem[]): [string, ChannelItem[]][] {
  const grouped = new Map<string, ChannelItem[]>();

  for (const channel of channels) {
    const group = channel.primaryGroupId || channel.group || channel.groupIds?.[0] || 'other';
    grouped.set(group, [...(grouped.get(group) ?? []), channel]);
  }

  const orderByGroup = new Map(groupDisplayOrder.map((group, index) => [group, index]));

  return [...grouped.entries()].sort(([groupA], [groupB]) => {
    const orderA = orderByGroup.get(groupA);
    const orderB = orderByGroup.get(groupB);

    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
    }

    return groupA.localeCompare(groupB, 'ja-JP');
  });
}

export function ChannelSettings({ channels, settings, onChange, groupLabels }: ChannelSettingsProps) {
  const selectedChannelIds = new Set(settings.selectedChannelIds);
  const favoriteChannelIds = new Set(settings.favoriteChannelIds);

  function toggleSelected(channelId: string): void {
    const nextSelected = selectedChannelIds.has(channelId)
      ? settings.selectedChannelIds.filter((id) => id !== channelId)
      : [...settings.selectedChannelIds, channelId];

    onChange({ ...settings, selectedChannelIds: nextSelected });
  }

  function toggleFavorite(channelId: string): void {
    const nextFavorites = favoriteChannelIds.has(channelId)
      ? settings.favoriteChannelIds.filter((id) => id !== channelId)
      : [...settings.favoriteChannelIds, channelId];

    onChange({ ...settings, favoriteChannelIds: nextFavorites });
  }

  return (
    <section className="channelSettings" aria-label="配信者設定">
      {groupChannels(channels).map(([group, groupChannels]) => (
        <div key={group} className="channelGroup">
          <h3>{getGroupLabel(group, groupLabels)}</h3>
          <div className="channelList">
            {groupChannels.map((channel) => (
              <div
                key={channel.channelId}
                className={
                  selectedChannelIds.has(channel.channelId)
                    ? 'channelRow channelRow-selected'
                    : 'channelRow'
                }
              >
                <div>
                  <strong>{getChannelName(channel)}</strong>
                  <span>{channel.channelName || channel.channelId}</span>
                </div>

                <label
                  className="largeCheck"
                  htmlFor={toInputId('channel-visible', channel.channelId)}
                >
                  <input
                    id={toInputId('channel-visible', channel.channelId)}
                    type="checkbox"
                    checked={selectedChannelIds.has(channel.channelId)}
                    onChange={() => toggleSelected(channel.channelId)}
                  />
                  表示
                </label>

                <label
                  className="largeCheck"
                  htmlFor={toInputId('channel-favorite', channel.channelId)}
                >
                  <input
                    id={toInputId('channel-favorite', channel.channelId)}
                    type="checkbox"
                    checked={favoriteChannelIds.has(channel.channelId)}
                    onChange={() => toggleFavorite(channel.channelId)}
                  />
                  お気に入り
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
