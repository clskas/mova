import { Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

type MovaService = 'auth' | 'ride' | 'driver' | 'payment';

@Injectable()
export class AdminService {
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };

  private async fetchJson<T>(service: MovaService, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(serviceUrl(service, path), {
      ...init,
      headers: { ...this.headers, ...(init?.headers as Record<string, string>) },
    });
    if (!res.ok) throw new Error(`Admin proxy failed: ${service}${path}`);
    return res.json();
  }

  private jsonHeaders = { ...this.headers, 'Content-Type': 'application/json' };

  private proxy(service: MovaService, path: string, init: RequestInit) {
    return fetch(serviceUrl(service, path), { ...init, headers: { ...this.jsonHeaders, ...(init.headers as Record<string, string>) } }).then(
      (r) => r.json(),
    );
  }

  async getMetrics() {
    const [users, drivers, rideStats, incidents, deliveries, scheduled, carpool, moving, rental] = await Promise.all([
      this.fetchJson<{ count: number }>('auth', '/internal/users/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ count: number }>('driver', '/internal/drivers/count').catch(() => ({ count: 0 })),
      this.fetchJson<{
        rides?: number;
        completed?: number;
        revenueCdf?: number;
        todayRides?: number;
        todayCompleted?: number;
        todayRevenueCdf?: number;
        activeRides?: number;
        cancelled?: number;
      }>('ride', '/internal/rides/stats').catch(() => ({
        rides: 0,
        completed: 0,
        revenueCdf: 0,
        todayRides: 0,
        todayCompleted: 0,
        todayRevenueCdf: 0,
        activeRides: 0,
        cancelled: 0,
      })),
      this.fetchJson<unknown[]>('driver', '/internal/incidents').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/deliveries?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/scheduled-rides?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/carpool?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/moving?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/rental-inquiries?take=100').catch(() => []),
    ]);
    const openIncidents = Array.isArray(incidents) ? incidents.filter((i: { status?: string }) => i.status === 'OPEN').length : 0;
    const activeDeliveries = Array.isArray(deliveries)
      ? deliveries.filter((d: { status?: string }) => !['DELIVERED', 'CANCELLED'].includes(d.status ?? '')).length
      : 0;
    return {
      users: users.count,
      drivers: drivers.count,
      rides: rideStats.rides ?? 0,
      completedRides: rideStats.completed ?? 0,
      revenueCdf: rideStats.revenueCdf ?? 0,
      todayRides: rideStats.todayRides ?? 0,
      todayCompleted: rideStats.todayCompleted ?? 0,
      todayRevenueCdf: rideStats.todayRevenueCdf ?? 0,
      activeRides: rideStats.activeRides ?? 0,
      cancelledRides: rideStats.cancelled ?? 0,
      openIncidents,
      activeDeliveries,
      scheduledRides: Array.isArray(scheduled) ? scheduled.length : 0,
      carpoolTrips: Array.isArray(carpool) ? carpool.length : 0,
      movingRequests: Array.isArray(moving) ? moving.length : 0,
      rentalInquiries: Array.isArray(rental) ? rental.length : 0,
      city: 'Kinshasa',
    };
  }

  listUsers(skip = 0, take = 50, search?: string) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (search) params.set('search', search);
    return this.fetchJson('auth', `/internal/users?${params}`);
  }
  getUser(id: string) {
    return this.fetchJson('auth', `/internal/users/${id}`);
  }
  updateUser(id: string, body: Record<string, unknown>) {
    return this.proxy('auth', `/internal/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deactivateUser(id: string) {
    return this.proxy('auth', `/internal/users/${id}`, { method: 'DELETE' });
  }

  listDrivers(skip = 0, take = 50, filters?: { kycStatus?: string; isAvailable?: string }) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (filters?.kycStatus) params.set('kycStatus', filters.kycStatus);
    if (filters?.isAvailable) params.set('isAvailable', filters.isAvailable);
    return this.fetchJson('driver', `/internal/drivers?${params}`);
  }
  getDriver(userId: string) {
    return this.fetchJson('driver', `/internal/drivers/${userId}`);
  }
  setDriverStatus(userId: string, active: boolean, suspendUser = false) {
    return Promise.all([
      this.proxy('driver', `/internal/drivers/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
      suspendUser
        ? this.proxy('auth', `/internal/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: active ? 'ACTIVE' : 'SUSPENDED' }) })
        : Promise.resolve(null),
    ]).then(([driver]) => driver);
  }
  pendingKyc() {
    return this.fetchJson('driver', '/internal/kyc/pending');
  }
  approveKyc(id: string, approved: boolean, notes?: string) {
    return this.proxy('driver', `/internal/kyc/${id}/review`, { method: 'POST', body: JSON.stringify({ approved, notes }) });
  }
  listIncidents() {
    return this.fetchJson('driver', '/internal/incidents');
  }
  resolveIncident(id: string, status: string) {
    return this.proxy('driver', `/internal/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status }) });
  }

  listRides(query: { status?: string; from?: string; to?: string; skip?: number; take?: number }) {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    params.set('skip', String(query.skip ?? 0));
    params.set('take', String(query.take ?? 50));
    return this.fetchJson('ride', `/internal/rides?${params}`);
  }
  getRide(id: string) {
    return this.fetchJson('ride', `/internal/rides/${id}`);
  }
  cancelRide(id: string, reason?: string) {
    return this.proxy('ride', `/internal/rides/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  updateRideStatus(id: string, status: string, reason?: string) {
    return this.proxy('ride', `/internal/rides/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
  }

  listDeliveries(take = 50) {
    return this.fetchJson('ride', `/internal/deliveries?take=${take}`);
  }
  getDelivery(id: string) {
    return this.fetchJson('ride', `/internal/deliveries/${id}`);
  }
  updateDeliveryStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/deliveries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  cancelDelivery(id: string, reason?: string) {
    return this.proxy('ride', `/internal/deliveries/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  listScheduledRides(take = 50) {
    return this.fetchJson('ride', `/internal/scheduled-rides?take=${take}`);
  }
  cancelScheduledRide(id: string, reason?: string) {
    return this.proxy('ride', `/internal/scheduled-rides/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  updateScheduledRideStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/scheduled-rides/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  listRestaurants() {
    return this.fetchJson('ride', '/internal/restaurants');
  }
  createRestaurant(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/restaurants', { method: 'POST', body: JSON.stringify(body) });
  }
  updateRestaurant(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/restaurants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deleteRestaurant(id: string) {
    return this.proxy('ride', `/internal/restaurants/${id}`, { method: 'DELETE' });
  }

  listPricingRules(city?: string) {
    const q = city ? `?city=${encodeURIComponent(city)}` : '';
    return this.fetchJson('ride', `/internal/pricing-rules${q}`);
  }
  createPricingRule(vehicleType: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}`, { method: 'POST', body: JSON.stringify(body) });
  }
  updatePricingRule(vehicleType: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deletePricingRule(vehicleType: string, city: string) {
    const q = city ? `?city=${encodeURIComponent(city)}` : '';
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}${q}`, { method: 'DELETE' });
  }

  listDeliveryPricingRules() {
    return this.fetchJson('ride', '/internal/delivery-pricing-rules');
  }
  updateDeliveryPricingRule(category: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/delivery-pricing-rules/${category}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listCommunes(city?: string) {
    return this.fetchJson('ride', `/internal/communes${city ? `?city=${city}` : ''}`);
  }
  updateCommune(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/communes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  createCommune(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/communes', { method: 'POST', body: JSON.stringify(body) });
  }
  deleteCommune(id: string) {
    return this.proxy('ride', `/internal/communes/${id}`, { method: 'DELETE' });
  }

  listCarpool(take = 50) {
    return this.fetchJson('ride', `/internal/carpool?take=${take}`);
  }
  cancelCarpool(id: string) {
    return this.proxy('ride', `/internal/carpool/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  }
  updateCarpoolStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/carpool/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  listMoving(take = 50) {
    return this.fetchJson('ride', `/internal/moving?take=${take}`);
  }
  cancelMoving(id: string) {
    return this.proxy('ride', `/internal/moving/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  }
  updateMovingStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/moving/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  listRentalInquiries(take = 50) {
    return this.fetchJson('ride', `/internal/rental-inquiries?take=${take}`);
  }
  cancelRentalInquiry(id: string) {
    return this.proxy('ride', `/internal/rental-inquiries/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  }
  updateRentalInquiryStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/rental-inquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  listWalletTransactions(skip = 0, take = 50, userId?: string) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (userId) params.set('userId', userId);
    return this.fetchJson('payment', `/internal/transactions?${params}`);
  }
  getWalletOverview() {
    return this.fetchJson('payment', '/internal/wallets/overview');
  }
  getWallet(userId: string) {
    return this.fetchJson('payment', `/internal/wallets/${userId}`);
  }
  adjustWallet(userId: string, body: { amountCdf: number; type: 'CREDIT' | 'DEBIT'; description: string }) {
    return this.proxy('payment', `/internal/wallets/${userId}/adjust`, { method: 'POST', body: JSON.stringify(body) });
  }

  listSurcharges() {
    return this.fetchJson('ride', '/internal/surcharges');
  }
  updateSurcharge(type: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/surcharges/${type}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listPromoCodes() {
    return this.fetchJson('ride', '/internal/promo-codes');
  }
  createPromoCode(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/promo-codes', { method: 'POST', body: JSON.stringify(body) });
  }
  updatePromoCode(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/promo-codes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listSubscriptionPlans() {
    return this.fetchJson('payment', '/internal/subscription-plans');
  }
  createSubscriptionPlan(body: Record<string, unknown>) {
    return this.proxy('payment', '/internal/subscription-plans', { method: 'POST', body: JSON.stringify(body) });
  }
  updateSubscriptionPlan(id: string, body: Record<string, unknown>) {
    return this.proxy('payment', `/internal/subscription-plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  listSubscribers(query: { planId?: string; status?: string; skip?: number; take?: number }) {
    const params = new URLSearchParams();
    if (query.planId) params.set('planId', query.planId);
    if (query.status) params.set('status', query.status);
    params.set('skip', String(query.skip ?? 0));
    params.set('take', String(query.take ?? 50));
    return this.fetchJson('payment', `/internal/subscriptions?${params}`);
  }
}
