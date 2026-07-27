import 'dotenv/config';
import { arePaymentsEnabled } from '../src/payments.js';
import { handleInvoiceLinkRequest } from '../src/invoiceLinkHandler.js';

// API_URL is only required to actually build an invoice. While payments are
// disabled the handler refuses before any upstream call, so a non-commercial
// test-mode deployment must not crash at import time for a missing API_URL.
if (!process.env.API_URL && arePaymentsEnabled()) {
  throw new Error('API_URL not set');
}

export default async function handler(req, res) {
  return handleInvoiceLinkRequest(req, res, {
    fetchImpl: fetch,
    env: process.env,
  });
}
