import { getProductById, getProducts } from '../src/utils/shopCatalog.js';

describe('shopCatalog.js', () => {
  test('getProductById("energy_refill") returns product with all fields', () => {
    const p = getProductById('energy_refill');
    expect(p).toBeTruthy();
    expect(p.id).toBe('energy_refill');
    expect(p.name).toBe('Энергетик');
    expect(p.stars).toBe(10);
    expect(p.category).toBe('energy');
  });

  test('getProductById("invalid") returns null', () => {
    expect(getProductById('invalid_id_xyz')).toBeNull();
  });

  test('getProducts() returns array containing known products', () => {
    const products = getProducts();
    expect(Array.isArray(products)).toBe(true);
    const ids = products.map((p) => p.id);
    expect(ids).toContain('energy_refill');
    expect(ids).toContain('coffee_break');
    expect(ids).toContain('premium_pass');
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });
});
