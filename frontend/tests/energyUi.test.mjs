import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnergyUiState } from '../src/utils/energyUi.js';

test('energy UI bands match audited 10/30 percent stress thresholds', () => {
  assert.equal(getEnergyUiState(9, 100).band, 'critical');
  assert.equal(getEnergyUiState(10, 100).band, 'warning');
  assert.equal(getEnergyUiState(30, 100).band, 'warning');
  assert.equal(getEnergyUiState(31, 100).band, 'healthy');
});

test('energy UI uses percentage, not absolute energy', () => {
  assert.equal(getEnergyUiState(15, 150).percent, 10);
  assert.equal(getEnergyUiState(15, 150).band, 'warning');
  assert.equal(getEnergyUiState(9, 150).band, 'critical');
});

test('critical and warning states communicate stress timing', () => {
  assert.match(getEnergyUiState(9, 100).message, /ниже 10%/);
  assert.match(getEnergyUiState(30, 100).message, /ниже 30%/);
  assert.equal(getEnergyUiState(31, 100).message, null);
});
