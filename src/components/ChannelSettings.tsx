import type { ChannelItem, UserSettings } from '../types';

type ChannelSettingsProps = {
  channels: ChannelItem[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
};

function getChannelName(channel: ChannelItem): string {
  return channel.displayName || channel.name || channel.channelId;
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
    <section className="panel channelSettings" aria-label="チャンネル設定">
      <div className="panelHeader">
        <h2>配信者設定</h2>
        <p>{channels.length}件</p>
      </div>

      <div className="channelList">
        {channels.map((channel) => (
          <div key={channel.channelId} className="channelRow">
            <div>
              <strong>{getChannelName(channel)}</strong>
              <span>{channel.group || '未分類'}</span>
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
    </section>
  );
}
