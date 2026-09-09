import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnergyUiState } from '../src/utils/energyUi.js';

test('energy UI bands match backend absolute 10/30 energy stress thresholds', () => {
  assert.equal(getEnergyUiState(9, 220).band, 'critical');
  assert.equal(getEnergyUiState(10, 220).band, 'warning');
  assert.equal(getEnergyUiState(29, 220).band, 'warning');
  assert.equal(getEnergyUiState(30, 220).band, 'healthy');
});

test('energy UI classification is absolute while percent remains display-only', () => {
  assert.equal(getEnergyUiState(15, 150).percent, 10);
  assert.equal(getEnergyUiState(15, 150).band, 'warning');
  assert.equal(getEnergyUiState(50, 220).band, 'healthy');
  assert.equal(getEnergyUiState(9, 220).band, 'critical');
});

test('critical and warning states communicate absolute stress timing', () => {
  assert.match(getEnergyUiState(9, 220).message, /ниже 10 ед\./);
  assert.match(getEnergyUiState(29, 220).message, /ниже 30 ед\./);
  assert.equal(getEnergyUiState(30, 220).message, null);
});
