import { createServer, type Server } from 'node:http';
import { JOBS } from './jobs.ts';

/**
 * A scripted stand-in model that speaks the OpenAI chat-completions format (REQ-TEST-02).
 * It costs no tokens and answers every job deterministically, so end-to-end tests exercise
 * the real adapter, parser, mender and checks. It behaves like LM Studio: it streams when
 * asked, reports usage, and when a JSON schema is sent it answers in that shape alone, with
 * no fences or thinking around it. The model name selects its behaviour:
 *   standin          correct answers
 *   standin-flaky    invalid JSON first, correct on the repair
 *   standin-invalid  never valid
 *   standin-refuse   always declines
 *   standin-slow     correct, after a pause
 *   standin-typing   correct, written out a few characters at a time, as a real model writes
 *   standin-plain    rejects the JSON schema and streaming, as an older server does
 */
interface Body {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  response_format?: { type: string };
}

export function startStandIn(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const send = (status: number, payload: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(payload));
      };
      if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions'))
        return send(404, { error: 'not found' });
      try {
        const data = JSON.parse(body) as Body;
        const plain = data.model === 'standin-plain';
        if (plain && data.response_format)
          return send(400, { error: { message: 'response_format is not supported' } });
        if (plain && data.stream)
          return send(400, { error: { message: 'stream is not supported' } });
        const system = data.messages.find((m) => m.role === 'system')?.content ?? '';
        const name = /JOB: (\S+)/.exec(system)?.[1] ?? '';
        const job = JOBS[name];
        const first = data.messages.find((m) => m.role === 'user')?.content ?? '{}';
        const isRepair = data.messages.filter((m) => m.role === 'user').length > 1;
        const enforced = data.response_format?.type === 'json_schema';
        let content: string;
        if (/warm_up|\{"ok":true\}/.test(system)) content = '{"ok":true}';
        else if (!job) content = 'Unknown job.';
        else if (data.model === 'standin-invalid')
          content = 'Certainly! Here is my answer: it went well.';
        else if (data.model === 'standin-refuse')
          content = "I'm sorry, but I can't help with that.";
        else if (data.model === 'standin-flaky' && !isRepair) content = '{"why": "half an answer"';
        else {
          const answer = JSON.stringify(job.fallback(JSON.parse(first)));
          // A server holding the model to a schema returns the object and nothing else.
          content = enforced ? answer : `<think>scripted</think>\n\`\`\`json\n${answer}\n\`\`\``;
        }
        const usage = {
          prompt_tokens: Math.ceil((system.length + first.length) / 4),
          completion_tokens: Math.ceil(content.length / 4),
          completion_tokens_details: { reasoning_tokens: 0 },
        };
        const reply = () => {
          if (!data.stream) {
            return send(200, { choices: [{ message: { role: 'assistant', content } }], usage });
          }
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
          });
          const finish = () => {
            if (data.stream_options?.include_usage)
              response.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
            response.write('data: [DONE]\n\n');
            response.end();
          };
          const typing = data.model === 'standin-typing';
          // In pieces, so the adapter's first-token timing has something to measure; a few
          // characters at a time when typing, so the words can be watched arriving.
          const size = typing ? 12 : Math.ceil(content.length / 3);
          let at = 0;
          const write = () => {
            const piece = { choices: [{ delta: { content: content.slice(at, at + size) } }] };
            response.write(`data: ${JSON.stringify(piece)}\n\n`);
            at += size;
          };
          if (!typing) {
            while (at < content.length) write();
            return finish();
          }
          const timer = setInterval(() => {
            if (at < content.length) return write();
            clearInterval(timer);
            finish();
          }, 25);
          response.on('close', () => clearInterval(timer));
        };
        if (data.model === 'standin-slow') setTimeout(reply, 1500);
        else reply();
      } catch (error) {
        send(400, { error: String(error) });
      }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
