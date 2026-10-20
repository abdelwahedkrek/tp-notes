const test = require("node:test");
const assert = require("node:assert");
const app = require("../server");

async function call(method, path, body) {
  const srv = app.listen(0);
  const { port } = srv.address();
  const r = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json();
  srv.close();
  return { status: r.status, data };
}

test("GET /health répond ok", async () => {
  const r = await call("GET", "/health");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data, { status: "ok" });
});

test("POST /notes crée une note", async () => {
  const r = await call("POST", "/notes", { text: "Réviser STRIDE" });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.text, "Réviser STRIDE");
});

test("POST /notes refuse un texte vide", async () => {
  const r = await call("POST", "/notes", { text: "  " });
  assert.strictEqual(r.status, 400);
});
