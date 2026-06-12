import { TEST_DATABASE_URL } from "./testDb.js";

const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
]);

export async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function listenOnFetchSafePort(app, host = "127.0.0.1") {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let errorListener;
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, host);
      errorListener = reject;
      instance.once("listening", () => resolve(instance));
      instance.once("error", errorListener);
    });
    // Remove the temporary error listener to avoid per-server listener leaks.
    server.off("error", errorListener);

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    if (port && !FETCH_FORBIDDEN_PORTS.has(port)) {
      return server;
    }

    await closeServer(server);
  }

  throw new Error("Unable to allocate a fetch-safe test server port");
}

export async function startTestServer() {
  // Ensure the app connects to the same test database
  if (TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  }
  process.env.NODE_ENV = "test";

  const { app, pool } = await import("../../src/index.js");

  const server = await listenOnFetchSafePort(app);

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
    await closeServer(server);
    await pool.end();
  }

  return { request, close };
}
