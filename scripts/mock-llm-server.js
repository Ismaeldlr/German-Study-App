#!/usr/bin/env node
/**
 * A local stand-in for an OpenAI-compatible provider, for tests and for
 * trying the app without spending money.
 *
 *   node scripts/mock-llm-server.js [port] [key]
 *
 * The Android emulator reaches the host at http://10.0.2.2:<port>/v1.
 * Requests must carry `Authorization: Bearer <key>` (default "test-key").
 */
const http = require('http');

const approxTokens = (text) => Math.ceil(text.length / 4);

function reply(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const handler = taskHandlers.find((h) => system.includes(`Task: ${h.task}`));
  if (handler) return handler.respond(user, body);
  return 'OK';
}

/** Canned replies for app tasks, matched by the 'Task: <name>' line of the system prompt. */
const taskHandlers = require('./mock-tasks.js').handlers;

function startMockLlmServer({ port = 8787, key = 'test-key', host = '0.0.0.0', log = false } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        return send(404, { error: { message: `No route for ${req.method} ${req.url}` } });
      }
      if (req.headers.authorization !== `Bearer ${key}`) {
        return send(401, { error: { message: 'Incorrect API key provided.' } });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: { message: 'Body is not JSON.' } });
      }
      requests.push(body);
      const content = reply(body);
      const promptText = (body.messages ?? []).map((m) => m.content).join('\n');
      const usage = {
        prompt_tokens: approxTokens(promptText),
        completion_tokens: approxTokens(content),
      };
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      if (log) {
        console.log(
          `${new Date().toISOString()} ${body.model} ${usage.prompt_tokens} in / ${usage.completion_tokens} out`,
        );
      }
      send(200, {
        id: `chatcmpl-mock-${requests.length}`,
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage,
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

module.exports = { startMockLlmServer, taskHandlers };

if (require.main === module) {
  const port = Number(process.argv[2] ?? 8787);
  const key = process.argv[3] ?? 'test-key';
  startMockLlmServer({ port, key, log: true }).then((s) => {
    console.log(`Mock LLM listening on ${s.url}/v1 (emulator: http://10.0.2.2:${s.port}/v1)`);
  });
}
