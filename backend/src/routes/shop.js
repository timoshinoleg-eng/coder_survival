import { Router } from 'express';
import { getProducts } from '../utils/shopCatalog.js';

const router = Router();

router.get('/products', async (req, res) => {
  res.json({ success: true, products: getProducts() });
});

export default router;
