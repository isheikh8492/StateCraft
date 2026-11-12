import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDirector, type Director } from '@statecraft/director';
import { ENGINE_VERSION } from '@statecraft/engine';
import { type Ledger, openLedger } from '@statecraft/ledger';
import { createHarness } from '@statecraft/models';
import { ModelSettings } from '@statecraft/protocol';

/**
 * Holds the open campaign and the model settings. One campaign is open at a time; starting
 * a new one sets the old file aside under a dated name, it is never deleted.
 */
export interface Game {
  director(): Director;
  ledger(): Ledger;
  settings(): ModelSettings;
  saveSettings(next: ModelSettings): void;
  /** True when the environment variable the settings name holds a key. */
  hasKey(): boolean;
  newCampaign(): void;
  close(): void;
  readonly campaignFile: string;
}

const NO_MODEL: ModelSettings = { kind: 'none', baseUrl: '', model: '', keyEnv: '' };
const DEFAULT_KEY: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function openGame(dataDir: string, initial?: ModelSettings): Game {
  mkdirSync(dataDir, { recursive: true });
  const campaignFile = join(dataDir, 'campaign.statecraft');
  const settingsFile = join(dataDir, 'settings.json');

  let settings: ModelSettings = initial ?? NO_MODEL;
  if (!initial && existsSync(settingsFile)) {
    const parsed = ModelSettings.safeParse(JSON.parse(readFileSync(settingsFile, 'utf8')));
    if (parsed.success) settings = parsed.data;
  }

  let ledger: Ledger;
  let director: Director;
  const open = () => {
    ledger = openLedger(campaignFile, ENGINE_VERSION);
    const current = ledger;
    const harness = createHarness({
      settings: () => settings,
      onCall: (record) => current.recordCall(record.id, record.resolution, record),
    });
    director = createDirector({ ledger, harness });
  };
  open();

  return {
    campaignFile,
    director: () => director,
    ledger: () => ledger,
    settings: () => settings,
    saveSettings(next) {
      settings = next;
      writeFileSync(settingsFile, `${JSON.stringify(next, null, 2)}\n`);
    },
    hasKey: () => Boolean(process.env[settings.keyEnv || DEFAULT_KEY[settings.kind] || '']),
    newCampaign() {
      ledger.close();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      renameSync(campaignFile, join(dataDir, `campaign-${stamp}.statecraft`));
      open();
    },
    close: () => ledger.close(),
  };
}
