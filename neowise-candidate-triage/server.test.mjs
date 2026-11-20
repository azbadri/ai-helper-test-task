import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleTriage } from "./server.mjs";

function responseRecorder() {
  return {
    status: null,
    body: null,
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  };
}

test("invalid and failed model inputs return safe API responses", async () => {
  const cases = [
    { raw: "{", status: 400, expected: { status: "invalid_input" } },
    { raw: JSON.stringify({ text: "  " }), status: 400, expected: { status: "invalid_input" } },
    ...["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"].map((marker) => ({
      raw: JSON.stringify({ text: `candidate ${marker}` }),
      status: 200,
      expected: { status: "manual_review", topic: null, draft: null },
    })),
  ];

  for (const item of cases) {
    const request = Readable.from([Buffer.from(item.raw)]);
    const response = responseRecorder();
    await handleTriage(request, response);
    assert.equal(response.status, item.status, item.raw);
    assert.deepEqual(response.body, item.expected, item.raw);
  }
});
