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
  const notificationsEnabled =
    settings.notificationBeforeStartEnabled || settings.notificationAtStartEnabled;

  function updateNotificationSettings(next: Partial<UserSettings>): void {
    const nextSettings = { ...settings, ...next };
    onChange({
      ...nextSettings,
      notificationEnabled:
        nextSettings.notificationBeforeStartEnabled || nextSettings.notificationAtStartEnabled,
    });
  }

  return (
    <section className="notificationSettings topNotificationSettings" aria-label="通知設定">
      <div className="panelHeader">
        <div>
          <h2>通知設定</h2>
          <p>ページを開いている間だけ通知します</p>
        </div>
        <p>権限: {permissionLabel}</p>
      </div>

      <div className="notificationControls">
        <label className="switchRow">
          <input
            type="checkbox"
            checked={settings.notificationBeforeStartEnabled}
            onChange={(event) =>
              updateNotificationSettings({ notificationBeforeStartEnabled: event.target.checked })
            }
          />
          30分前
        </label>

        <label className="switchRow">
          <input
            type="checkbox"
            checked={settings.notificationAtStartEnabled}
            onChange={(event) =>
              updateNotificationSettings({ notificationAtStartEnabled: event.target.checked })
            }
          />
          配信開始時
        </label>

        <button type="button" className="ghostButton" onClick={onRequestPermission}>
          通知権限を確認
        </button>
      </div>

      {notificationsEnabled && permission !== 'granted' ? (
        <p className="notificationHint">通知を受け取るにはブラウザの通知権限を許可してください。</p>
      ) : null}
    </section>
  );
}
