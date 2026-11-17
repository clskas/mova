import { agentFor, upstreamHttpAgent, upstreamHttpsAgent } from './upstream-agent';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('upstream keep-alive agent', () => {
  it('picks the agent from the target protocol', () => {
    expect(agentFor('https://mova-stg-ride.onrender.com')).toBe(upstreamHttpsAgent);
    expect(agentFor('http://mova-ride:10000')).toBe(upstreamHttpAgent);
  });

  it('keeps connections alive', () => {
    expect((upstreamHttpAgent as unknown as { keepAlive: boolean }).keepAlive).toBe(true);
    expect((upstreamHttpsAgent as unknown as { keepAlive: boolean }).keepAlive).toBe(true);
  });

  it('is used by every gateway proxy', () => {
    const proxy = readFileSync(join(__dirname, 'proxy.middleware.ts'), 'utf8');
    expect(proxy.match(/agent: agentFor\(target\)/g)?.length).toBe(2);
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toMatch(/agent: agentFor\(rideTarget\)/);
  });
});
