import { isFetchSafePort } from './helpers/testServer.js';

describe('test server port selection', () => {
  test('rejects ports blocked by the Fetch specification', () => {
    expect(isFetchSafePort(6667)).toBe(false);
    expect(isFetchSafePort(6000)).toBe(false);
  });

  test('accepts ordinary ephemeral test ports', () => {
    expect(isFetchSafePort(3000)).toBe(true);
    expect(isFetchSafePort(55432)).toBe(true);
  });
});
