import { Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

@Injectable()
export class AdminService {
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };

  private async fetchJson<T>(service: 'auth' | 'ride' | 'driver', path: string): Promise<T> {
    const res = await fetch(serviceUrl(service, path), { headers: this.headers });
    if (!res.ok) throw new Error(`Admin proxy failed: ${service}${path}`);
    return res.json();
  }

  async getMetrics() {
    const [users, drivers, rideStats, incidents] = await Promise.all([
      this.fetchJson<{ count: number }>('auth', '/internal/users/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ count: number }>('driver', '/internal/drivers/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ rides: number; completed: number; revenueCdf: number }>('ride', '/internal/rides/stats').catch(() => ({ rides: 0, completed: 0, revenueCdf: 0 })),
      this.fetchJson<unknown[]>('driver', '/internal/incidents').catch(() => []),
    ]);
    const openIncidents = Array.isArray(incidents) ? incidents.filter((i: { status?: string }) => i.status === 'OPEN').length : 0;
    return { users: users.count, drivers: drivers.count, rides: rideStats.rides, completedRides: rideStats.completed, revenueCdf: rideStats.revenueCdf, openIncidents, city: 'Kinshasa' };
  }

  listUsers(skip = 0, take = 50) { return this.fetchJson('auth', `/internal/users?skip=${skip}&take=${take}`); }
  pendingKyc() { return this.fetchJson('driver', '/internal/kyc/pending'); }
  approveKyc(id: string, approved: boolean, notes?: string) {
    return fetch(serviceUrl('driver', `/internal/kyc/${id}/review`), { method: 'POST', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ approved, notes }) }).then((r) => r.json());
  }
  listIncidents() { return this.fetchJson('driver', '/internal/incidents'); }
  resolveIncident(id: string, status: string) {
    return fetch(serviceUrl('driver', `/internal/incidents/${id}/resolve`), { method: 'POST', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then((r) => r.json());
  }
}
