import * as http from 'http';
import * as https from 'https';

/**
 * Keep-alive connections from the gateway to the services.
 *
 * Without an agent, http-proxy opens a new TCP connection — and a new TLS handshake when the
 * service URL is https — for every request. That costs CPU on every call: the 0.5 CPU gateway
 * hit 100 % at ~110 requests/s in the staging load test (2026-11-17, tier 2: 61 % of 502s).
 * One shared agent per protocol reuses the sockets.
 */
const options = { keepAlive: true, keepAliveMsecs: 10_000, maxSockets: 256, maxFreeSockets: 64, timeout: 60_000 };

export const upstreamHttpAgent = new http.Agent(options);
export const upstreamHttpsAgent = new https.Agent(options);

export function agentFor(target: string): http.Agent {
  return target.trim().toLowerCase().startsWith('https:') ? upstreamHttpsAgent : upstreamHttpAgent;
}
