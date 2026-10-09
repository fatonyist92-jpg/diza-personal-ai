import { test } from "node:test";
import assert from "node:assert/strict";
import { BloksCoreBridge, BloksHttpError, normalizeBloksOrigin } from "./core-bridge.mjs";

const makeBridge = (reply = { ok: true }) => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, ...opts });
    return new Response(JSON.stringify(reply), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  return { bridge: new BloksCoreBridge({ origin: "https://bloks.example", token: "paired-token", fetchImpl }), calls };
};

test("requires HTTPS for a remote Bloks backend", () => {
  assert.equal(normalizeBloksOrigin("https://bloks.example/"), "https://bloks.example");
  assert.equal(normalizeBloksOrigin("http://127.0.0.1:8799/"), "http://127.0.0.1:8799");
  for (const invalid of ["http://server.example", "https://a.example/path", "https://user:pass@a.example/", "https://a.example/#frag", "file:///tmp/bloks"]) {
    assert.throws(() => normalizeBloksOrigin(invalid), TypeError);
  }
});

test("health handshake uses the Bloks API, not an AI provider", async () => {
  const { bridge, calls } = makeBridge({ features: ["calls"] });
  assert.deepEqual(await bridge.health(), { features: ["calls"] });
  assert.equal(calls[0].url, "https://bloks.example/api/health");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.authorization, "Bearer paired-token");
  assert.equal(calls[0].credentials, "omit");
  assert.equal(calls[0].redirect, "error");
});

test("agent loading is bounded and authenticated", async () => {
  const { bridge, calls } = makeBridge({ bots: [] });
  await bridge.agents({ messages: 12 });
  assert.equal(calls[0].url, "https://bloks.example/api/bots?messages=12");
  assert.throws(() => bridge.agents({ messages: 101 }), RangeError);
});

test("send goes to existing agent thread without replacing Bloks state", async () => {
  const { bridge, calls } = makeBridge();
  await bridge.send("diza_1", "  Halo Diz!  ");
  assert.equal(calls[0].url, "https://bloks.example/api/bots/diza_1/messages");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(calls[0].body), { text: "Halo Diz!" });
  assert.throws(() => bridge.send("../admin", "hello"), TypeError);
  assert.throws(() => bridge.send("diza_1", "   "), TypeError);
});

test("call lease reuses original Bloks claim, renew and hangup endpoints", async () => {
  const { bridge, calls } = makeBridge({ token: "lease", ttlMs: 20000 });
  await bridge.claimCall("diza_1");
  await bridge.renewCall("lease");
  await bridge.endCall("lease");
  assert.deepEqual(calls.map(c => new URL(c.url).pathname), [
    "/api/calls/claim", "/api/calls/renew", "/api/calls"
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), { targetId: "diza_1", device: "DIZA Android" });
  assert.equal(calls[2].method, "DELETE");
});

test("event stream can resume without replaying an entire conversation", async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(url);
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"kind":"hello","_seq":2}\n\n'));
        controller.close();
      }
    }), { headers: { "content-type": "text/event-stream" } });
  };
  const bridge = new BloksCoreBridge({ origin: "https://bloks.example", fetchImpl });
  const body = await bridge.events({ since: 1 });
  const { value } = await body.getReader().read();
  assert.match(new TextDecoder().decode(value), /"hello"/);
  assert.equal(paths[0], "https://bloks.example/api/events?since=1");
});

test("server failures keep credentials and provider errors out of UI output", async () => {
  const bridge = new BloksCoreBridge({
    origin: "https://bloks.example",
    fetchImpl: async () => new Response(JSON.stringify({ error: "secret-provider-key" }), { status: 401 })
  });
  await assert.rejects(bridge.agents(), e =>
    e instanceof BloksHttpError && e.status === 401 && !e.message.includes("secret-provider-key")
  );
});
