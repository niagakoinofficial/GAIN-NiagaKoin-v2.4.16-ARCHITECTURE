import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_STRATEGY_PRESETS,
  STRATEGY_PRESETS_STORAGE_KEY,
  deleteCustomStrategyPreset,
  loadCustomStrategyPresets,
  sanitizeStrategyPreset,
  saveCustomStrategyPreset,
} from './strategyPresets';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

test('built-in presets stay within supported layer limits', () => {
  for (const preset of BUILTIN_STRATEGY_PRESETS) {
    assert.ok(preset.averagingLayers >= 1 && preset.averagingLayers <= 20);
    assert.ok(preset.gridLayers >= 1 && preset.gridLayers <= 100);
    assert.ok(preset.baseAmount >= 5);
  }
});

test('sanitize strategy preset clamps unsafe layer ranges', () => {
  const sanitized = sanitizeStrategyPreset({ id: 'x', name: 'x', averagingLayers: 999, gridLayers: -5, baseAmount: 0, baseTp: 0 });
  assert.equal(sanitized.averagingLayers, 20);
  assert.equal(sanitized.gridLayers, 1);
  assert.equal(sanitized.baseAmount, 5);
  assert.equal(sanitized.baseTp, 0.1);
});

test('custom strategy presets persist locally only', () => {
  const storage = new MemoryStorage();
  const preset = sanitizeStrategyPreset({ id: 'custom-1', name: 'My Preset', botMode: 'Grid Only' });
  const saved = saveCustomStrategyPreset(storage, preset);
  assert.equal(saved.length, 1);
  assert.equal(storage.getItem(STRATEGY_PRESETS_STORAGE_KEY)?.includes('My Preset'), true);
  assert.equal(loadCustomStrategyPresets(storage)[0].name, 'My Preset');
  assert.equal(deleteCustomStrategyPreset(storage, 'custom-1').length, 0);
});
