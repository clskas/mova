// SENGA load test — STAGING ONLY (mock OTP 123456, test accounts +24398…).
//
//   k6 run -e GATEWAY_URL=https://mova-stg-gateway.onrender.com -e LOAD_TEST_KEY=... \
//          -e DRIVERS=200 -e PASSENGERS=50 -e SOCKETS=100 -e DURATION=5m loadtest/senga-load.js
//
// What it simulates (Kinshasa, around Gombe / Limete):
//   drivers    — one account each, sends its GPS position every 8 s (like the driver app);
//   passengers — one account each, looks at nearby vehicles and asks a price every ~10 s,
//                and 1 time in 10 books a ride then cancels it;
//   sockets    — live connections on /tracking (WebSocket), kept open with ping/pong.
// LOAD_TEST_KEY lets these requests pass the gateway's per-IP limits; the gateway only
// accepts it on staging (never in production).
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const GATEWAY = (__ENV.GATEWAY_URL || '').replace(/\/+$/, '').replace(/\/api$/, '');
const KEY = __ENV.LOAD_TEST_KEY || '';
const DRIVERS = Number(__ENV.DRIVERS || 200);
const PASSENGERS = Number(__ENV.PASSENGERS || 50);
const SOCKETS = Number(__ENV.SOCKETS || 100);
const DURATION = __ENV.DURATION || '5m';
const RAMP = __ENV.RAMP || '1m';

if (!/mova-stg-|localhost|127\.0\.0\.1/.test(GATEWAY)) {
  throw new Error(`Refusing to run the load test against "${GATEWAY}" (staging only).`);
}

const API = `${GATEWAY}/api`;
const loginFailures = new Counter('senga_login_failures');
const locationTime = new Trend('senga_driver_location_ms', true);
const estimateTime = new Trend('senga_estimate_ms', true);
const nearbyTime = new Trend('senga_nearby_ms', true);
const socketConnected = new Counter('senga_socket_connected');
const socketErrors = new Counter('senga_socket_errors');

function scenario(vus, exec) {
  return vus > 0
    ? {
        executor: 'ramping-vus',
        exec,
        startVUs: 0,
        stages: [
          { duration: RAMP, target: vus },
          { duration: DURATION, target: vus },
          { duration: '30s', target: 0 },
        ],
        gracefulRampDown: '30s',
      }
    : undefined;
}

const scenarios = {};
for (const [name, vus, exec] of [
  ['drivers', DRIVERS, 'driver'],
  ['passengers', PASSENGERS, 'passenger'],
  ['sockets', SOCKETS, 'socket'],
]) {
  const s = scenario(vus, exec);
  if (s) scenarios[name] = s;
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{kind:api}': ['p(95)<1500'],
    senga_driver_location_ms: ['p(95)<1000'],
    senga_estimate_ms: ['p(95)<2000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

const headers = (token) => ({
  'Content-Type': 'application/json',
  'X-Senga-Client': 'senga',
  'x-senga-load-test': KEY,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// Unique test phone per virtual user and role: +243 98 1 xxxxxx (drivers) / 2 (passengers) / 3 (sockets).
function phoneFor(role, vu) {
  return `+243981${role}${String(vu).padStart(5, '0')}`;
}

let token = null;

function login(role) {
  if (token) return token;
  const roleDigit = role === 'DRIVER' ? 1 : role === 'SOCKET' ? 3 : 2;
  const phone = phoneFor(roleDigit, __VU);
  const body = { phone, ...(role === 'DRIVER' ? { role: 'DRIVER' } : {}) };
  const r1 = http.post(`${API}/auth/otp/request`, JSON.stringify(body), { headers: headers(), tags: { kind: 'auth' } });
  const r2 = http.post(`${API}/auth/otp/verify`, JSON.stringify({ ...body, code: '123456' }), {
    headers: headers(),
    tags: { kind: 'auth' },
  });
  let t = null;
  try {
    const j = r2.json();
    t = j.accessToken || (j.data && j.data.accessToken) || null;
  } catch (_) {
    t = null;
  }
  if (!check(r2, { 'login ok': () => r1.status < 300 && Boolean(t) })) {
    loginFailures.add(1);
    sleep(5);
    return null;
  }
  token = t;
  return token;
}

// Random point in a ~6 km square around Gombe / Limete.
function kinshasaPoint() {
  return { lat: -4.33 + (Math.random() - 0.5) * 0.06, lng: 15.32 + (Math.random() - 0.5) * 0.06 };
}

export function driver() {
  const t = login('DRIVER');
  if (!t) return;
  const p = kinshasaPoint();
  const r = http.post(`${API}/drivers/location`, JSON.stringify(p), { headers: headers(t), tags: { kind: 'api', name: 'location' } });
  locationTime.add(r.timings.duration);
  check(r, { 'location ok': (x) => x.status < 300 });
  sleep(8);
}

export function passenger() {
  const t = login('PASSENGER');
  if (!t) return;
  const from = kinshasaPoint();
  const to = kinshasaPoint();
  const n = http.get(`${API}/rides/nearby-vehicles?lat=${from.lat}&lng=${from.lng}&vehicleType=STANDARD`, {
    headers: headers(t),
    tags: { kind: 'api', name: 'nearby' },
  });
  nearbyTime.add(n.timings.duration);
  check(n, { 'nearby ok': (x) => x.status < 300 });

  const trip = {
    pickupLat: from.lat,
    pickupLng: from.lng,
    dropoffLat: to.lat,
    dropoffLng: to.lng,
    vehicleType: 'STANDARD',
    pickupAddress: 'Test charge départ',
    dropoffAddress: 'Test charge arrivée',
  };
  const e = http.post(`${API}/rides/estimate`, JSON.stringify(trip), { headers: headers(t), tags: { kind: 'api', name: 'estimate' } });
  estimateTime.add(e.timings.duration);
  check(e, { 'estimate ok': (x) => x.status < 300 });

  if (Math.random() < 0.1) {
    const c = http.post(`${API}/rides`, JSON.stringify(trip), { headers: headers(t), tags: { kind: 'api', name: 'create-ride' } });
    let id = null;
    try {
      const j = c.json();
      id = j.id || (j.ride && j.ride.id) || (j.data && j.data.id) || null;
    } catch (_) {
      id = null;
    }
    if (id) {
      http.post(`${API}/rides/${id}/cancel`, JSON.stringify({ reason: 'test de charge' }), {
        headers: headers(t),
        tags: { kind: 'api', name: 'cancel-ride' },
      });
    }
  }
  sleep(8 + Math.random() * 4);
}

export function socket() {
  const t = login('SOCKET');
  if (!t) return;
  const wsUrl = `${GATEWAY.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(wsUrl, { headers: { 'x-senga-load-test': KEY } }, (sock) => {
    sock.on('message', (msg) => {
      if (msg.startsWith('0')) sock.send(`40/tracking,${JSON.stringify({ token: t })}`); // engine open → join namespace
      else if (msg === '2') sock.send('3'); // ping → pong
      else if (msg.startsWith('40/tracking')) socketConnected.add(1);
      else if (msg.startsWith('44/tracking')) socketErrors.add(1);
    });
    sock.on('error', () => socketErrors.add(1));
    sock.setTimeout(() => sock.close(), 60000); // reconnect every minute, like a phone changing network
  });
  check(res, { 'socket upgraded': (r) => r && r.status === 101 });
  sleep(1);
}
