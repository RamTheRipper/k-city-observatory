import type { ChannelItem, UserSettings } from '../types';

type ChannelSettingsProps = {
  channels: ChannelItem[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
};

function getChannelName(channel: ChannelItem): string {
  return channel.displayName || channel.channelName || channel.name || channel.channelId;
}

function getGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    vwp: 'V.W.P',
    solo: 'solo',
    official: 'official',
    other: 'その他',
  };

  return labels[group] ?? group;
}

function groupChannels(channels: ChannelItem[]): [string, ChannelItem[]][] {
  const grouped = new Map<string, ChannelItem[]>();

  for (const channel of channels) {
    const group = channel.groupIds?.[0] || channel.group || 'other';
    grouped.set(group, [...(grouped.get(group) ?? []), channel]);
  }

  return [...grouped.entries()];
}

export function ChannelSettings({ channels, settings, onChange }: ChannelSettingsProps) {
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
          <h3>{getGroupLabel(group)}</h3>
          <div className="channelList">
            {groupChannels.map((channel) => (
              <div key={channel.channelId} className="channelRow">
                <div>
                  <strong>{getChannelName(channel)}</strong>
                  <span>{channel.channelName || channel.channelId}</span>
                </div>

                <label>
                  <input
                    type="checkbox"
                    checked={selectedChannelIds.has(channel.channelId)}
                    onChange={() => toggleSelected(channel.channelId)}
                  />
                  表示
                </label>

                <label>
                  <input
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
