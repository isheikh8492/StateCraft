import { createServer, type Server } from 'node:http';
import { JOBS } from './jobs.ts';

/**
 * A scripted stand-in model that speaks the OpenAI chat-completions format (REQ-TEST-02).
 * It costs no tokens and answers every job deterministically, so end-to-end tests exercise
 * the real adapter, parser and checks. The model name selects its behaviour:
 *   standin          correct answers
 *   standin-flaky    invalid JSON first, correct on the repair
 *   standin-invalid  never valid
 *   standin-refuse   always declines
 *   standin-slow     correct, after a pause
 */
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
        const data = JSON.parse(body) as {
          model: string;
          messages: { role: string; content: string }[];
        };
        const system = data.messages.find((m) => m.role === 'system')?.content ?? '';
        const name = /JOB: (\S+)/.exec(system)?.[1] ?? '';
        const job = JOBS[name];
        const first = data.messages.find((m) => m.role === 'user')?.content ?? '{}';
        const isRepair = data.messages.filter((m) => m.role === 'user').length > 1;
        let content: string;
        if (!job) content = 'Unknown job.';
        else if (data.model === 'standin-invalid')
          content = 'Certainly! Here is my answer: it went well.';
        else if (data.model === 'standin-refuse')
          content = "I'm sorry, but I can't help with that.";
        else if (data.model === 'standin-flaky' && !isRepair) content = '{"why": "half an answer"';
        else
          content = `<think>scripted</think>\n\`\`\`json\n${JSON.stringify(job.fallback(JSON.parse(first)))}\n\`\`\``;
        const reply = () =>
          send(200, {
            choices: [{ message: { role: 'assistant', content } }],
            usage: {
              prompt_tokens: Math.ceil((system.length + first.length) / 4),
              completion_tokens: Math.ceil(content.length / 4),
            },
          });
        if (data.model === 'standin-slow') setTimeout(reply, 1500);
        else reply();
      } catch (error) {
        send(400, { error: String(error) });
      }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
