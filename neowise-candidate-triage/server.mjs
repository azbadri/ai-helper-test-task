import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }
  const text = input?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return json(response, 400, { status: "invalid_input" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300);
  try {
    const raw = await classify(text, { signal: controller.signal });
    const result = JSON.parse(raw);
    const topics = new Set(["delivery", "pricing", "other"]);
    if (!result || !topics.has(result.topic) || typeof result.draft !== "string" || !result.draft.trim()) {
      return json(response, 200, { status: "manual_review", topic: null, draft: null });
    }
    return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft.trim() });
  } catch {
    return json(response, 200, { status: "manual_review", topic: null, draft: null });
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      json(response, 400, { status: "invalid_input" });
    }
  }).listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
