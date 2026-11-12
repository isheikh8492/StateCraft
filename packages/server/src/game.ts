import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDirector, type Director } from '@statecraft/director';
import { ENGINE_VERSION } from '@statecraft/engine';
import { type Ledger, openLedger } from '@statecraft/ledger';
import { createHarness } from '@statecraft/models';
import { ModelConfig, type ModelRole, ModelSettings } from '@statecraft/protocol';

/**
 * Holds the open campaign and the model settings. One campaign is open at a time; starting
 * a new one sets the old file aside under a dated name, it is never deleted.
 */
export interface Game {
  director(): Director;
  ledger(): Ledger;
  config(): ModelConfig;
  /** The model that serves a role: its own if one is set, otherwise the main model. */
  settingsFor(role?: ModelRole): ModelSettings;
  saveConfig(next: ModelConfig): void;
  /** True when the environment variable a model's settings name holds a key. */
  hasKey(settings: ModelSettings): boolean;
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

  let config: ModelConfig = { main: initial ?? NO_MODEL, roles: {} };
  if (!initial && existsSync(settingsFile)) {
    const stored: unknown = JSON.parse(readFileSync(settingsFile, 'utf8'));
    const parsed = ModelConfig.safeParse(stored);
    // Earlier versions stored one model's settings on their own.
    const single = ModelSettings.safeParse(stored);
    if (parsed.success) config = parsed.data;
    else if (single.success) config = { main: single.data, roles: {} };
  }
  const settingsFor = (role?: ModelRole) => (role ? config.roles[role] : undefined) ?? config.main;

  let ledger: Ledger;
  let director: Director;
  const open = () => {
    ledger = openLedger(campaignFile, ENGINE_VERSION);
    const current = ledger;
    const harness = createHarness({
      settings: settingsFor,
      onCall: (record) => current.recordCall(record.id, record.resolution, record),
    });
    // A fixed seed makes a campaign repeatable; the end-to-end tests set one.
    const seed = process.env.STATECRAFT_SEED;
    director = createDirector({ ledger, harness, ...(seed ? { newSeed: () => seed } : {}) });
  };
  open();

  return {
    campaignFile,
    director: () => director,
    ledger: () => ledger,
    config: () => config,
    settingsFor,
    saveConfig(next) {
      config = next;
      writeFileSync(settingsFile, `${JSON.stringify(next, null, 2)}\n`);
    },
    hasKey: (settings) => Boolean(process.env[settings.keyEnv || DEFAULT_KEY[settings.kind] || '']),
    newCampaign() {
      ledger.close();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      renameSync(campaignFile, join(dataDir, `campaign-${stamp}.statecraft`));
      open();
    },
    close: () => ledger.close(),
  };
}
