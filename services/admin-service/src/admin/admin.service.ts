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
      async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const payload = data as { message?: string | string[]; error?: { message?: string } };
          const raw = payload.error?.message ?? payload.message;
          const message = Array.isArray(raw) ? raw.join(', ') : raw ?? `Admin proxy failed: ${service}${path} (${r.status})`;
          throw new Error(message);
        }
        return data;
      },
    );
  }

  async getMetrics() {
    const [users, driverStats, rideStats, incidents, deliveries, scheduled, carpool, moving, rental, wallet] = await Promise.all([
      this.fetchJson<{ count: number }>('auth', '/internal/users/count').catch(() => ({ count: 0 })),
      this.fetchJson<{ total?: number; available?: number; pendingKyc?: number; approved?: number }>(
        'driver',
        '/internal/drivers/stats',
      ).catch(() => ({ total: 0, available: 0, pendingKyc: 0, approved: 0 })),
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
      this.fetchJson<{ status?: string; type?: string }[]>('driver', '/internal/incidents').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/deliveries?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/scheduled-rides?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/carpool?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/moving?take=100').catch(() => []),
      this.fetchJson<unknown[]>('ride', '/internal/rental-inquiries?take=100').catch(() => []),
      this.fetchJson<{ totalBalanceCdf?: number; walletCount?: number; transactionsToday?: number }>(
        'payment',
        '/internal/wallets/overview',
      ).catch(() => ({ totalBalanceCdf: 0, walletCount: 0, transactionsToday: 0 })),
    ]);
    const openIncidents = Array.isArray(incidents) ? incidents.filter((i) => i.status === 'OPEN').length : 0;
    const sosIncidents = Array.isArray(incidents)
      ? incidents.filter((i) => i.status === 'OPEN' && i.type === 'SOS').length
      : 0;
    const activeDeliveries = Array.isArray(deliveries)
      ? deliveries.filter((d: { status?: string; type?: string }) => {
          if (d.type === 'ERRAND') return !['COMPLETED', 'CANCELLED'].includes(d.status ?? '');
          return !['DELIVERED', 'CANCELLED'].includes(d.status ?? '');
        }).length
      : 0;
    return {
      users: users.count,
      drivers: driverStats.total ?? 0,
      availableDrivers: driverStats.available ?? 0,
      pendingKyc: driverStats.pendingKyc ?? 0,
      approvedDrivers: driverStats.approved ?? 0,
      rides: rideStats.rides ?? 0,
      completedRides: rideStats.completed ?? 0,
      revenueCdf: rideStats.revenueCdf ?? 0,
      todayRides: rideStats.todayRides ?? 0,
      todayCompleted: rideStats.todayCompleted ?? 0,
      todayRevenueCdf: rideStats.todayRevenueCdf ?? 0,
      activeRides: rideStats.activeRides ?? 0,
      cancelledRides: rideStats.cancelled ?? 0,
      openIncidents,
      sosIncidents,
      activeDeliveries,
      scheduledRides: Array.isArray(scheduled) ? scheduled.length : 0,
      carpoolTrips: Array.isArray(carpool) ? carpool.length : 0,
      movingRequests: Array.isArray(moving) ? moving.length : 0,
      rentalInquiries: Array.isArray(rental) ? rental.length : 0,
      walletBalanceCdf: wallet.totalBalanceCdf ?? 0,
      walletCount: wallet.walletCount ?? 0,
      walletTransactionsToday: wallet.transactionsToday ?? 0,
      city: 'RDC',
    };
  }

  getReports(days = 30) {
    return this.fetchJson('ride', `/internal/rides/reports?days=${days}`);
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
    return this.fetchJson('driver', `/internal/drivers/${userId}/detail`);
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
  reviewDriverKyc(userId: string, approved: boolean, notes?: string) {
    return this.proxy('driver', `/internal/drivers/${userId}/kyc`, { method: 'PATCH', body: JSON.stringify({ approved, notes }) });
  }
  reviewDriverDocumentsRenewal(userId: string, approved: boolean, notes?: string) {
    return this.proxy('driver', `/internal/drivers/${userId}/documents-renewal`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, notes }),
    });
  }
  reviewVehicleTypeApproval(userId: string, approved: boolean, notes?: string) {
    return this.proxy('driver', `/internal/drivers/${userId}/vehicle-type`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, notes }),
    });
  }
  runKycOcr(documentId: string) {
    return this.proxy('driver', `/internal/kyc/${documentId}/ocr`, { method: 'POST', body: JSON.stringify({}) });
  }
  regenerateDriverActivationPin(userId: string) {
    return this.proxy('driver', `/internal/drivers/${userId}/activation-pin`, { method: 'POST', body: JSON.stringify({}) });
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
  getGpsTrace(type: string, id: string) {
    return this.fetchJson('ride', `/internal/tracking/${type}/${id}/trace`);
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
  assignDeliveryDriver(id: string, driverId: string) {
    return this.proxy('ride', `/internal/deliveries/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
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
  assignScheduledDriver(id: string, driverId: string) {
    return this.proxy('ride', `/internal/scheduled-rides/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
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

  listProvinces() {
    return this.fetchJson('ride', '/internal/provinces');
  }
  createProvince(name: string) {
    return this.proxy('ride', '/internal/provinces', { method: 'POST', body: JSON.stringify({ name }) });
  }
  updateProvince(id: string, name: string) {
    return this.proxy('ride', `/internal/provinces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }
  deleteProvince(id: string) {
    return this.proxy('ride', `/internal/provinces/${id}`, { method: 'DELETE' });
  }

  listCities(provinceId?: string) {
    const q = provinceId ? `?provinceId=${encodeURIComponent(provinceId)}` : '';
    return this.fetchJson('ride', `/internal/cities${q}`);
  }
  listCitiesCatalog() {
    return this.fetchJson('ride', '/internal/cities/catalog');
  }
  createCity(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/cities', { method: 'POST', body: JSON.stringify(body) });
  }
  updateCity(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/cities/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deleteCity(id: string) {
    return this.proxy('ride', `/internal/cities/${id}`, { method: 'DELETE' });
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
  assignMovingDriver(id: string, driverId: string) {
    return this.proxy('ride', `/internal/moving/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
  }

  listRentalInquiries(take = 50) {
    return this.fetchJson('ride', `/internal/rental-inquiries?take=${take}`);
  }
  cancelRentalInquiry(id: string) {
    return this.proxy('ride', `/internal/rental-inquiries/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  }
  updateRentalInquiryStatus(id: string, status: string, forceOverride?: boolean) {
    return this.proxy('ride', `/internal/rental-inquiries/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, forceOverride: forceOverride === true }),
    });
  }
  assignRentalDriver(id: string, driverId: string) {
    return this.proxy('ride', `/internal/rental-inquiries/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
  }

  listRentalVehicles() {
    return this.fetchJson('ride', '/internal/rental-vehicles');
  }
  createRentalVehicle(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/rental-vehicles', { method: 'POST', body: JSON.stringify(body) });
  }
  updateRentalVehicle(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/rental-vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deleteRentalVehicle(id: string) {
    return this.proxy('ride', `/internal/rental-vehicles/${id}`, { method: 'DELETE' });
  }

  listWalletTransactions(skip = 0, take = 50, userId?: string) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (userId) params.set('userId', userId);
    return this.enrichWalletTransactions(params);
  }
  private formatUserDisplayName(user: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string;
    publicId?: string;
  }) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.phone || user.publicId || '—';
  }
  private async fetchUserDisplayNames(userIds: string[]) {
    const map = new Map<string, string>();
    await Promise.all(
      userIds.map(async (id) => {
        try {
          const user = await this.fetchJson<{
            firstName?: string | null;
            lastName?: string | null;
            phone?: string;
            publicId?: string;
          }>('auth', `/internal/users/${id}`);
          map.set(id, this.formatUserDisplayName(user));
        } catch {
          map.set(id, `${id.slice(0, 8)}…`);
        }
      }),
    );
    return map;
  }
  private async enrichWalletTransactions(params: URLSearchParams) {
    const page = await this.fetchJson<{
      data: Array<{
        id: string;
        amountCdf: number;
        type: string;
        description?: string;
        reference?: string | null;
        createdAt?: string;
        wallet?: { userId: string; balanceCdf?: number };
      }>;
      total: number;
      skip: number;
      take: number;
      currency?: string;
    }>('payment', `/internal/transactions?${params}`);
    const userIds = [...new Set(page.data.map((t) => t.wallet?.userId).filter((id): id is string => Boolean(id)))];
    const names = await this.fetchUserDisplayNames(userIds);
    return {
      ...page,
      data: page.data.map((t) => ({
        ...t,
        wallet: t.wallet
          ? {
              ...t.wallet,
              userName: names.get(t.wallet.userId) ?? null,
            }
          : undefined,
      })),
    };
  }
  getWalletOverview() {
    return this.fetchJson('payment', '/internal/wallets/overview');
  }
  getWallet(userId: string) {
    return this.fetchJson<{ userId: string; balanceCdf?: number; [key: string]: unknown }>('payment', `/internal/wallets/${userId}`).then(
      async (wallet) => {
        try {
          const user = await this.fetchJson<{
            firstName?: string | null;
            lastName?: string | null;
            phone?: string;
            publicId?: string;
          }>('auth', `/internal/users/${userId}`);
          return { ...wallet, userName: this.formatUserDisplayName(user) };
        } catch {
          return wallet;
        }
      },
    );
  }
  adjustWallet(userId: string, body: { amountCdf: number; type: 'CREDIT' | 'DEBIT'; description: string }) {
    return this.proxy('payment', `/internal/wallets/${userId}/adjust`, { method: 'POST', body: JSON.stringify(body) });
  }
  withdrawWallet(userId: string, body: { amountCdf: number; provider: string; phone: string }) {
    return this.proxy('payment', `/internal/wallets/${userId}/withdraw`, { method: 'POST', body: JSON.stringify(body) });
  }
  async listCashDebts(driverUserId?: string) {
    const params = new URLSearchParams();
    if (driverUserId) params.set('driverUserId', driverUserId);
    const qs = params.toString();
    const overview = await this.fetchJson<{
      totalOpenCdf: number;
      openDebtCount: number;
      debtorCount: number;
      platformFeeCdf: number;
      restaurantShareCdf: number;
      partnerShareCdf: number;
      debtors: Array<{
        driverUserId: string;
        totalCdf: number;
        platformFeeCdf: number;
        restaurantShareCdf: number;
        partnerShareCdf: number;
        openCount: number;
      }>;
      debts: Array<{
        id: string;
        driverUserId: string;
        referenceType: string;
        referenceId: string;
        category: string;
        amountCdf: number;
        description?: string | null;
        beneficiaryUserId?: string | null;
        createdAt: string;
      }>;
    }>('payment', `/internal/cash-debts${qs ? `?${qs}` : ''}`);

    const userIds = [
      ...new Set([
        ...overview.debtors.map((d) => d.driverUserId),
        ...overview.debts.map((d) => d.driverUserId),
      ]),
    ];
    const names = await this.fetchUserDisplayNames(userIds);

    return {
      ...overview,
      debtors: overview.debtors.map((d) => ({
        ...d,
        driverName: names.get(d.driverUserId) ?? null,
      })),
      debts: overview.debts.map((d) => ({
        ...d,
        driverName: names.get(d.driverUserId) ?? null,
      })),
    };
  }
  settleCashDebt(debtId: string, settlementRef?: string) {
    return this.proxy('payment', `/internal/cash-debts/${debtId}/settle`, {
      method: 'POST',
      body: JSON.stringify({ settlementRef }),
    });
  }

  listSurcharges() {
    return this.fetchJson('ride', '/internal/surcharges');
  }
  updateSurcharge(type: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/surcharges/${type}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listCommissions() {
    return this.fetchJson('ride', '/internal/commissions');
  }

  updateCommission(serviceType: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/commissions/${serviceType}`, { method: 'PATCH', body: JSON.stringify(body) });
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

  listPoiSuggestions(status?: string, skip = 0, take = 50) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (status) params.set('status', status);
    return this.fetchJson('ride', `/internal/poi-suggestions?${params.toString()}`);
  }

  approvePoiSuggestion(id: string, body: Record<string, unknown> = {}) {
    return this.proxy('ride', `/internal/poi-suggestions/${id}/approve`, { method: 'POST', body: JSON.stringify(body) });
  }

  rejectPoiSuggestion(id: string, body: Record<string, unknown> = {}) {
    return this.proxy('ride', `/internal/poi-suggestions/${id}/reject`, { method: 'POST', body: JSON.stringify(body) });
  }
}
