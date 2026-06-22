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
    <details className="notificationSettings topNotificationSettings">
      <summary>
        <span className="summaryTitle">通知設定</span>
        <span className="summaryMeta">
          {notificationsEnabled ? `${settings.notificationLeadTimeMinutes}分前` : 'OFF'} / {permissionLabel}
        </span>
        <button
          type="button"
          className="ghostButton notificationPermissionButton"
          onClick={(event) => {
            event.preventDefault();
            onRequestPermission();
          }}
        >
          通知を許可
        </button>
      </summary>

      <div className="notificationDetails" aria-label="通知設定">
        <div className="notificationControls">
          <div className="notificationOptionStack">
            <label className="switchRow">
              <input
                type="checkbox"
                checked={settings.notificationBeforeStartEnabled}
                onChange={(event) =>
                  updateNotificationSettings({ notificationBeforeStartEnabled: event.target.checked })
                }
              />
              開始前に通知
            </label>

            {settings.notificationBeforeStartEnabled ? (
              <label className="selectField notificationTimingField" htmlFor="notification-lead-time">
                <span>通知タイミング</span>
                <select
                  id="notification-lead-time"
                  value={settings.notificationLeadTimeMinutes}
                  onChange={(event) =>
                    updateNotificationSettings({
                      notificationLeadTimeMinutes: Number(event.target.value) === 10 ? 10 : 30,
                    })
                  }
                >
                  <option value={10}>10分前</option>
                  <option value={30}>30分前</option>
                </select>
              </label>
            ) : null}
          </div>

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

          <label className="switchRow">
            <input
              type="checkbox"
              checked={settings.notificationFavoritesOnly}
              onChange={(event) =>
                updateNotificationSettings({ notificationFavoritesOnly: event.target.checked })
              }
            />
            お気に入りのみ通知
          </label>

        </div>

        {notificationsEnabled && permission !== 'granted' ? (
          <p className="notificationHint">
            通知を受け取るには、ブラウザの通知許可を有効にしてください。
          </p>
        ) : (
          <p className="notificationHint mutedHint">
            ページを開いている間だけ通知します。
          </p>
        )}
      </div>
    </details>
  );
}
