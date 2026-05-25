// ============================================
// App Configuration – Settings Tab values
// ============================================

export interface AppConfig {
  FOLDER_ID: string;
  APP_TITLE: string;
  ORGANIZATION: string;
  SCRIPT_URL: string;
}

const CONFIG_KEY = 'dtr_app_config';

const DEFAULT_CONFIG: AppConfig = {
  FOLDER_ID: '10Qvt5AZuPe7NPuOTWBJ_q6d_0SmdKYbX',
  APP_TITLE: 'Smart DTR System',
  ORGANIZATION: 'MIlMetro',
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzZa8RK506x8tWq_jOoV6Zww13i833MKnxhmQU9NGIMi-lDedg-J8CiJBqeJj7rtjiS/exec',
};

export function getConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = getConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

export function getAppTitle(): string {
  return getConfig().APP_TITLE;
}

export function getOrganization(): string {
  return getConfig().ORGANIZATION;
}

export function getFolderId(): string {
  return getConfig().FOLDER_ID;
}

export function getScriptUrl(): string {
  return getConfig().SCRIPT_URL;
}
