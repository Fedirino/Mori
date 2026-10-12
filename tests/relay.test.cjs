const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function runRelay(events) {
  const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
  const handler = source.slice(source.indexOf('async function handleChat('), source.indexOf('function shouldKeepDetailedReply('));
  let now = 0;
  let creates = 0;
  let polls = 0;
  const context = {
    cleanMessages: messages => messages,
    hermesApiUrl: { value: () => 'https://relay.test' },
    hermesApiKey: { value: () => 'test-key' },
    DEFAULT_HERMES_MODEL: 'test',
    Date: { now: () => now },
    AbortSignal,
    setTimeout: callback => { now += 10_000; callback(); },
    console: { error: () => {} },
    compressVoiceReply: text => text,
    json: (_res, status, body) => ({ status, body }),
    fetch: async (url, options) => {
      assert.ok(options.signal);
      if (url.endsWith('/v1/runs')) {
        creates++;
        return { ok: true, json: async () => ({ run_id: 'test-run' }) };
      }
      const event = events[polls++] || { event: 'message.delta', delta: '' };
      if (event instanceof Error) throw event;
      return { ok: true, text: async () => 'data: ' + JSON.stringify(event) };
    }
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  const result = await context.handleChat({ body: { messages: [{ role: 'user', content: 'Turn on lights' }] } }, {}, 'winston:test');
  return { ...result, creates, polls };
}

test('slow relay returns uncertainty without submitting the action twice', async () => {
  const result = await runRelay([]);
  assert.equal(result.status, 200);
  assert.equal(result.body.pending, true);
  assert.match(result.body.reply, /may already have gone through/);
  assert.equal(result.creates, 1);
});

test('temporary polling failure can recover the completed reply', async () => {
  const result = await runRelay([new Error('Temporary disconnect'), { event: 'run.completed', output: 'The lights are on.' }]);
  assert.equal(result.body.reply, 'The lights are on.');
  assert.equal(result.body.pending, undefined);
  assert.equal(result.creates, 1);
  assert.equal(result.polls, 2);
});
