import type { UserSettings } from '../types';

type NotificationSettingsProps = {
  settings: UserSettings;
  permission: NotificationPermission | 'unsupported';
  onChange: (settings: UserSettings) => void;
  onRequestPermission: () => void;
};

export function NotificationSettings({
  settings,
  permission,
  onChange,
  onRequestPermission,
}: NotificationSettingsProps) {
  const permissionLabel =
    permission === 'unsupported' ? '非対応' : permission === 'default' ? '未確認' : permission;

  return (
    <section className="notificationSettings" aria-label="通知設定">
      <div className="panelHeader">
        <h2>通知</h2>
        <p>権限: {permissionLabel}</p>
      </div>

      <label className="switchRow">
        <input
          type="checkbox"
          checked={settings.notificationEnabled}
          onChange={(event) =>
            onChange({ ...settings, notificationEnabled: event.target.checked })
          }
        />
        30分前通知
      </label>

      <button type="button" className="ghostButton" onClick={onRequestPermission}>
        通知権限を確認
      </button>
    </section>
  );
}
