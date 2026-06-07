import { TEST_DATABASE_URL } from "./testDb.js";

export async function startTestServer() {
  // Ensure the app connects to the same test database
  if (TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  }
  process.env.NODE_ENV = "test";

  const { app, pool } = await import("../../src/index.js");

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path, { method = "GET", headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      body: text ? JSON.parse(text) : null,
    };
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }

  return { request, close };
}
