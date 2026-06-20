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
    permission === 'unsupported' ? '???' : permission === 'default' ? '???' : permission;
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
    <section className="notificationSettings topNotificationSettings" aria-label="????">
      <div className="panelHeader">
        <div>
          <h2>????</h2>
          <p>?????????????????</p>
        </div>
        <p>??: {permissionLabel}</p>
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
          30??
        </label>

        <label className="switchRow">
          <input
            type="checkbox"
            checked={settings.notificationAtStartEnabled}
            onChange={(event) =>
              updateNotificationSettings({ notificationAtStartEnabled: event.target.checked })
            }
          />
          ?????
        </label>

        <button type="button" className="ghostButton" onClick={onRequestPermission}>
          ???????
        </button>
      </div>

      {notificationsEnabled && permission !== 'granted' ? (
        <p className="notificationHint">????????????????????????????</p>
      ) : null}
    </section>
  );
}
