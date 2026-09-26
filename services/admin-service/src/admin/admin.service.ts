import { HttpStatus, Injectable } from '@nestjs/common';
import {
  INTERNAL_API_KEY,
  MovaErrorCode,
  MovaHttpException,
  UserRole,
  commerceTypeFromSearch,
  parseCommerceType,
  resolveCityFromCoords,
  serviceUrl,
} from '@mova/shared';
import { filterRowsByManagedCity, filterRowsByCityName, assertCityMatch, forceCityOnBody, assertCoordsInManagedCity } from '../common/city-scope.util';

type MovaService = 'auth' | 'ride' | 'driver' | 'payment' | 'notification';

const STAFF_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.FINANCE,
  UserRole.CONTENT,
  UserRole.CITY_ADMIN,
]);

@Injectable()
export class AdminService {
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };

  private async fetchJson<T>(service: MovaService, path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(serviceUrl(service, path), {
        ...init,
        cache: 'no-store',
        headers: { ...this.headers, ...(init?.headers as Record<string, string>) },
      });
    } catch {
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.BAD_GATEWAY,
        `Service ${service} injoignable.`,
      );
    }
    if (!res.ok) {
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.BAD_GATEWAY,
        `Admin proxy failed: ${service}${path}`,
      );
    }
    const text = await res.text();
    if (!text.trim()) return [] as T;
    return JSON.parse(text) as T;
  }

  private jsonHeaders = { ...this.headers, 'Content-Type': 'application/json' };

  private proxy(service: MovaService, path: string, init: RequestInit) {
    return fetch(serviceUrl(service, path), { ...init, headers: { ...this.jsonHeaders, ...(init.headers as Record<string, string>) } }).then(
      async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const payload = data as {
            message?: string | string[];
            error?: { message?: string; code?: string };
          };
          const raw = payload.error?.message ?? payload.message;
          const message = Array.isArray(raw)
            ? raw.join(', ')
            : raw ?? `Admin proxy failed: ${service}${path} (${r.status})`;
          const code =
            payload.error?.code && payload.error.code.startsWith('MOVA_')
              ? (payload.error.code as MovaErrorCode)
              : r.status === HttpStatus.NOT_FOUND
                ? MovaErrorCode.NOT_FOUND
                : r.status === HttpStatus.CONFLICT || r.status === HttpStatus.BAD_REQUEST
                  ? MovaErrorCode.VALIDATION_ERROR
                  : MovaErrorCode.INTERNAL_ERROR;
          throw new MovaHttpException(code, r.status >= 400 && r.status < 600 ? r.status : HttpStatus.BAD_GATEWAY, message);
        }
        return data;
      },
    );
  }

  async getMetrics(managedCity?: string | null) {
    if (!managedCity) {
      return this.getMetricsNational();
    }
    const city = managedCity.trim();
    const [driversRes, rides, deliveries, incidents, reports] = await Promise.all([
      this.listDrivers(0, 500, { includeHidden: false }, city).catch(() => ({ data: [] as Array<Record<string, unknown>> })),
      this.listRides({ skip: 0, take: 200 }, city).catch(() => [] as Array<Record<string, unknown>>),
      this.listDeliveries({ skip: 0, take: 200 }, city).catch(() => [] as Array<Record<string, unknown>>),
      this.fetchJson<{ status?: string; type?: string; lat?: number; lng?: number }[]>('driver', '/internal/incidents').catch(() => []),
      this.getReports(30, city).catch(() => null),
    ]);
    const drivers = Array.isArray(driversRes) ? driversRes : (driversRes as { data?: Array<Record<string, unknown>> }).data ?? [];
    const availableDrivers = drivers.filter((d) => d.isAvailable === true).length;
    const pendingKyc = drivers.filter((d) => String(d.kycStatus ?? '').toUpperCase() === 'PENDING').length;
    const approvedDrivers = drivers.filter((d) => String(d.kycStatus ?? '').toUpperCase() === 'APPROVED').length;
    const rideRows = Array.isArray(rides) ? rides : [];
    const deliveryRows = Array.isArray(deliveries) ? deliveries : [];
    const activeRides = rideRows.filter((r) =>
      ['REQUESTED', 'SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(String(r.status ?? '')),
    ).length;
    const activeDeliveries = deliveryRows.filter((d) => {
      if (d.type === 'ERRAND') return !['COMPLETED', 'CANCELLED'].includes(String(d.status ?? ''));
      return !['DELIVERED', 'CANCELLED'].includes(String(d.status ?? ''));
    }).length;
    const cityKey = city.toLowerCase();
    const cityIncidents = (Array.isArray(incidents) ? incidents : []).filter((i) => {
      if (i.lat == null || i.lng == null) return true;
      return resolveCityFromCoords(Number(i.lat), Number(i.lng)).toLowerCase() === cityKey;
    });
    const openIncidents = cityIncidents.filter((i) => i.status === 'OPEN').length;
    const sosIncidents = cityIncidents.filter((i) => i.status === 'OPEN' && i.type === 'SOS').length;
    const kpis =
      reports && typeof reports === 'object' && reports !== null && 'kpis' in reports
        ? (reports as { kpis: Record<string, number> }).kpis
        : undefined;
    return {
      users: drivers.length,
      drivers: drivers.length,
      availableDrivers,
      pendingKyc,
      approvedDrivers,
      rides: kpis?.totalRides ?? rideRows.length,
      completedRides: kpis?.completedRides ?? 0,
      revenueCdf: kpis?.totalRevenueCdf ?? 0,
      todayRides: 0,
      todayCompleted: 0,
      todayRevenueCdf: 0,
      activeRides,
      cancelledRides: kpis?.cancelledRides ?? 0,
      openIncidents,
      sosIncidents,
      activeDeliveries,
      scheduledRides: 0,
      carpoolTrips: 0,
      movingRequests: 0,
      rentalInquiries: 0,
      walletBalanceCdf: 0,
      walletCount: 0,
      walletTransactionsToday: 0,
      city,
    };
  }

  private async getMetricsNational() {
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

  getReports(days = 30, city?: string | null) {
    const params = new URLSearchParams({ days: String(days) });
    if (city?.trim()) params.set('city', city.trim());
    return this.fetchJson('ride', `/internal/rides/reports?${params}`);
  }

  async listUsers(
    skip = 0,
    take = 50,
    search?: string,
    includePlayPrelaunch = false,
    cities?: string | string[] | null,
  ) {
    const commerceType = commerceTypeFromSearch(search);
    if (commerceType) {
      return this.listUsersByCommerceType(commerceType, skip, take, includePlayPrelaunch, cities);
    }

    const cityList = (Array.isArray(cities) ? cities : cities ? [cities] : [])
      .map((c) => c.trim())
      .filter(Boolean);
    if (cityList.length > 0) {
      return this.listUsersInCities(cityList, skip, take, search, includePlayPrelaunch);
    }

    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (search) params.set('search', search);
    if (includePlayPrelaunch) params.set('includePlayPrelaunch', 'true');
    const result = await this.fetchJson<{
      data?: Array<{ id: string; role?: string; status?: string; commerceType?: string; managedCity?: string | null; [key: string]: unknown }>;
      total?: number;
      skip?: number;
      take?: number;
    }>('auth', `/internal/users?${params}`);
    const pendingDrivers = (result.data ?? []).filter(
      (u) => u.role === 'DRIVER' && String(u.status ?? '').toUpperCase() === 'PENDING_KYC',
    );
    if (pendingDrivers.length > 0) {
      await Promise.all(
        pendingDrivers.map(async (u) => {
          try {
            const detail = await this.fetchJson<{ kycStatus?: string }>(
              'driver',
              `/internal/drivers/${u.id}/detail`,
            );
            if (String(detail.kycStatus ?? '').toUpperCase() !== 'APPROVED') return;
            await this.proxy('auth', `/internal/users/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'ACTIVE', role: 'DRIVER' }),
            });
            u.status = 'ACTIVE';
          } catch {
            /* driver profile missing or auth unreachable — leave badge as-is */
          }
        }),
      );
    }
    const restaurantUsers = (result.data ?? []).filter((u) => u.role === 'RESTAURANT');
    if (restaurantUsers.length > 0) {
      try {
        const restaurants = await this.fetchJson<
          Array<{ ownerUserId?: string | null; commerceType?: string | null }>
        >('ride', '/internal/restaurants');
        const byOwner = new Map<string, string>();
        for (const r of restaurants ?? []) {
          if (r.ownerUserId && !byOwner.has(r.ownerUserId)) {
            byOwner.set(r.ownerUserId, r.commerceType ?? 'RESTAURANT');
          }
        }
        for (const u of restaurantUsers) {
          u.commerceType = byOwner.get(u.id) ?? 'RESTAURANT';
        }
      } catch {
        for (const u of restaurantUsers) {
          u.commerceType = u.commerceType ?? 'RESTAURANT';
        }
      }
    }
    return result;
  }

  /**
   * Users attached to one or more cities: drivers (operatingCity), partners (GPS/city),
   * passengers (homeCity + ride pickup history), CITY_ADMIN (managedCity).
   * Builds the allow-list first, then loads those accounts.
   */
  private async listUsersInCities(
    cityList: string[],
    skip: number,
    take: number,
    search?: string,
    includePlayPrelaunch = false,
  ) {
    const cityKeys = new Set(cityList.map((c) => c.toLowerCase()));
    const citiesParam = encodeURIComponent(cityList.join(','));
    const [driversBundles, restaurantsBundles, rentalBundles, opsStaff, homeCityPassengers, ridePassengerBundles] =
      await Promise.all([
        Promise.all(
          cityList.map((city) =>
            this.listDrivers(0, 500, { includeHidden: true }, city).catch(() => ({
              data: [] as Array<{ userId?: string; id?: string }>,
            })),
          ),
        ),
        Promise.all(
          cityList.map((city) =>
            this.listRestaurants(city).catch(() => [] as Array<{ ownerUserId?: string | null }>),
          ),
        ),
        Promise.all(
          cityList.map((city) =>
            this.listRentalVehicles(city).catch(() => [] as Array<{ ownerUserId?: string | null }>),
          ),
        ),
        this.fetchJson<
          Array<{ id: string; role?: string; managedCity?: string | null }>
        >('auth', '/internal/users/ops-staff').catch(() => []),
        this.fetchJson<Array<{ id: string }>>(
          'auth',
          `/internal/users/by-home-city?cities=${citiesParam}&role=PASSENGER`,
        ).catch(() => []),
        Promise.all(
          cityList.map((city) =>
            this.fetchJson<{ passengerIds?: string[] }>(
              'ride',
              `/internal/rides/passengers-by-city?city=${encodeURIComponent(city)}&take=2000`,
            ).catch(() => ({ passengerIds: [] as string[] })),
          ),
        ),
      ]);

    const allowedIds = new Set<string>();
    for (const driversRes of driversBundles) {
      const driverRows = Array.isArray(driversRes)
        ? driversRes
        : (driversRes as { data?: Array<{ userId?: string; id?: string }> }).data ?? [];
      for (const d of driverRows) {
        const id = String(d.userId ?? d.id ?? '');
        if (id) allowedIds.add(id);
      }
    }
    for (const restaurants of restaurantsBundles) {
      for (const r of Array.isArray(restaurants) ? restaurants : []) {
        if (r.ownerUserId) allowedIds.add(String(r.ownerUserId));
      }
    }
    for (const rentalVehicles of rentalBundles) {
      for (const r of Array.isArray(rentalVehicles) ? rentalVehicles : []) {
        if (r.ownerUserId) allowedIds.add(String(r.ownerUserId));
      }
    }
    for (const s of Array.isArray(opsStaff) ? opsStaff : []) {
      if (
        String(s.role ?? '') === UserRole.CITY_ADMIN &&
        cityKeys.has(String(s.managedCity ?? '').trim().toLowerCase())
      ) {
        allowedIds.add(s.id);
      }
    }
    for (const p of Array.isArray(homeCityPassengers) ? homeCityPassengers : []) {
      if (p?.id) allowedIds.add(String(p.id));
    }
    for (const bundle of ridePassengerBundles) {
      for (const id of bundle?.passengerIds ?? []) {
        if (id) allowedIds.add(String(id));
      }
    }

    const ids = [...allowedIds];
    type Row = {
      id: string;
      role?: string;
      status?: string;
      commerceType?: string;
      managedCity?: string | null;
      homeCity?: string | null;
      phone?: string | null;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      playPrelaunch?: boolean;
      [key: string]: unknown;
    };
    const loaded: Row[] = [];
    const chunkSize = 40;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const rows = await Promise.all(
        chunk.map((id) =>
          this.fetchJson<Row>('auth', `/internal/users/${id}`).catch(() => null),
        ),
      );
      for (const u of rows) {
        if (u?.id) loaded.push(u);
      }
    }

    const q = (search ?? '').trim().toLowerCase();
    let filtered = loaded.filter((u) => {
      if (!includePlayPrelaunch && u.playPrelaunch) return false;
      if (!q) return true;
      const hay = [
        u.firstName,
        u.lastName,
        u.phone,
        u.email,
        u.role,
        u.managedCity,
        u.homeCity,
        u.commerceType,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });

    const restaurantUsers = filtered.filter((u) => u.role === 'RESTAURANT');
    if (restaurantUsers.length > 0) {
      try {
        const restaurants = await this.fetchJson<
          Array<{ ownerUserId?: string | null; commerceType?: string | null }>
        >('ride', '/internal/restaurants');
        const byOwner = new Map<string, string>();
        for (const r of restaurants ?? []) {
          if (r.ownerUserId && !byOwner.has(r.ownerUserId)) {
            byOwner.set(r.ownerUserId, r.commerceType ?? 'RESTAURANT');
          }
        }
        for (const u of restaurantUsers) {
          u.commerceType = byOwner.get(u.id) ?? 'RESTAURANT';
        }
      } catch {
        for (const u of restaurantUsers) {
          u.commerceType = u.commerceType ?? 'RESTAURANT';
        }
      }
    }

    filtered = filtered.sort((a, b) => String(a.role ?? '').localeCompare(String(b.role ?? '')));
    const total = filtered.length;
    const page = filtered.slice(Math.max(0, skip), Math.max(0, skip) + Math.max(1, take));
    return { data: page, total, skip, take };
  }

  /** Search by partner business type (Pharmacie / Boutique / …) — auth role is always RESTAURANT. */
  private async listUsersByCommerceType(
    commerceType: string,
    skip: number,
    take: number,
    includePlayPrelaunch: boolean,
    cities?: string | string[] | null,
  ) {
    const restaurants = await this.fetchJson<
      Array<{ ownerUserId?: string | null; commerceType?: string | null; lat?: number | null; lng?: number | null }>
    >('ride', '/internal/restaurants').catch(() => []);
    const rows = Array.isArray(restaurants) ? restaurants : [];
    const ownerIds = [
      ...new Set(
        rows
          .filter((r) => parseCommerceType(r.commerceType) === commerceType && r.ownerUserId)
          .map((r) => String(r.ownerUserId)),
      ),
    ];
    if (ownerIds.length === 0) {
      return { data: [], total: 0, skip, take };
    }

    const params = new URLSearchParams({
      skip: '0',
      take: '500',
      search: 'restaurant',
    });
    if (includePlayPrelaunch) params.set('includePlayPrelaunch', 'true');
    const authResult = await this.fetchJson<{
      data?: Array<{ id: string; role?: string; commerceType?: string; managedCity?: string | null; [key: string]: unknown }>;
    }>('auth', `/internal/users?${params}`);
    const ownerSet = new Set(ownerIds);
    let data = (authResult.data ?? [])
      .filter((u) => ownerSet.has(u.id) && u.role === 'RESTAURANT')
      .map((u) => ({ ...u, commerceType }));

    const cityList = (Array.isArray(cities) ? cities : cities ? [cities] : [])
      .map((c) => c.trim())
      .filter(Boolean);
    if (cityList.length > 0) {
      const cityPartnerIds = new Set<string>();
      const restaurantsBundles = await Promise.all(
        cityList.map((city) =>
          this.listRestaurants(city).catch(() => [] as Array<{ ownerUserId?: string | null }>),
        ),
      );
      for (const restaurants of restaurantsBundles) {
        for (const r of Array.isArray(restaurants) ? restaurants : []) {
          if (r.ownerUserId) cityPartnerIds.add(String(r.ownerUserId));
        }
      }
      data = data.filter((u) => cityPartnerIds.has(u.id));
    }

    const total = data.length;
    return { data: data.slice(skip, skip + take), total, skip, take };
  }
  listPlayPrelaunchUsers() {
    return this.fetchJson('auth', '/internal/users/play-prelaunch');
  }
  async purgePlayPrelaunchUsers(actorRole: string, actorId: string) {
    if (actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut supprimer les comptes Google Play / Test Lab.',
      );
    }
    const listed = await this.listPlayPrelaunchUsers() as {
      data?: { id: string }[];
    };
    const ids = (listed.data ?? []).map((u) => u.id);
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.purgeUser(id, actorRole, actorId);
        deleted.push(id);
      } catch (e) {
        skipped.push({
          id,
          reason: e instanceof Error ? e.message : 'refus de suppression',
        });
      }
    }
    return { deleted: deleted.length, ids: deleted, skipped };
  }
  async getUser(id: string, managedCity?: string | null) {
    const user = await this.fetchJson<{
      id: string;
      role?: string;
      managedCity?: string | null;
      homeCity?: string | null;
      [key: string]: unknown;
    }>('auth', `/internal/users/${id}`);
    if (!managedCity) return user;
    const role = String(user.role ?? '');
    if (role === UserRole.CITY_ADMIN) {
      assertCityMatch(managedCity, user.managedCity, 'Admin ville hors de votre périmètre.');
      return user;
    }
    if (STAFF_ROLES.has(role)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte staff hors de votre périmètre ville.',
      );
    }
    if (role === UserRole.DRIVER) {
      await this.getDriver(id, managedCity);
      return user;
    }
    if (role === UserRole.RESTAURANT || role === UserRole.RENTAL_PARTNER) {
      const [restaurants, rentals] = await Promise.all([
        this.listRestaurants(managedCity).catch(() => [] as Array<{ ownerUserId?: string | null }>),
        this.listRentalVehicles(managedCity).catch(() => [] as Array<{ ownerUserId?: string | null }>),
      ]);
      const owners = new Set<string>();
      for (const r of Array.isArray(restaurants) ? restaurants : []) {
        if (r.ownerUserId) owners.add(String(r.ownerUserId));
      }
      for (const r of Array.isArray(rentals) ? rentals : []) {
        if (r.ownerUserId) owners.add(String(r.ownerUserId));
      }
      if (!owners.has(id)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Partenaire hors de votre ville gérée.',
        );
      }
      return user;
    }
    if (role === UserRole.PASSENGER) {
      const home = String(user.homeCity ?? '').trim().toLowerCase();
      if (home && home === managedCity.trim().toLowerCase()) return user;
      const ridePassengers = await this.fetchJson<{ passengerIds?: string[] }>(
        'ride',
        `/internal/rides/passengers-by-city?city=${encodeURIComponent(managedCity)}&take=3000`,
      ).catch(() => ({ passengerIds: [] as string[] }));
      if ((ridePassengers.passengerIds ?? []).includes(id)) return user;
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Passager hors de votre ville gérée.',
      );
    }
    throw new MovaHttpException(
      MovaErrorCode.AUTH_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      'Utilisateur hors de votre ville gérée.',
    );
  }
  async createUser(body: Record<string, unknown>, actorRole: string) {
    const nextRole = typeof body.role === 'string' ? body.role : undefined;
    if (nextRole === UserRole.SUPER_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut attribuer le rôle Super admin.',
      );
    }
    if (nextRole && STAFF_ROLES.has(nextRole) && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut attribuer un rôle staff (ADMIN, SUPPORT, FINANCE, CONTENT, CITY_ADMIN, SUPER_ADMIN).',
      );
    }
    if (!nextRole) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le rôle est obligatoire (ex. RESTAURANT, RENTAL_PARTNER). Ne pas laisser PASSENGER par défaut pour un partenaire.',
      );
    }
    return this.proxy('auth', '/internal/users', { method: 'POST', body: JSON.stringify(body) });
  }
  async updateUser(id: string, body: Record<string, unknown>, actorRole: string) {
    const nextRole = typeof body.role === 'string' ? body.role : undefined;
    // Explicit: never let ADMIN / CITY_ADMIN self-escalate to SUPER_ADMIN via UI or API.
    if (nextRole === UserRole.SUPER_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut attribuer le rôle Super admin.',
      );
    }
    // Only SUPER_ADMIN may grant staff/admin-panel roles (blocks ADMIN→FINANCE escalation).
    if (nextRole && STAFF_ROLES.has(nextRole) && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut attribuer un rôle staff (ADMIN, SUPPORT, FINANCE, CONTENT, CITY_ADMIN, SUPER_ADMIN).',
      );
    }
    const target = await this.getUser(id).catch(() => null) as { role?: string } | null;
    if (target?.role && STAFF_ROLES.has(target.role) && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut modifier un compte staff.',
      );
    }
    if (
      (body.adminPermissions !== undefined || body.accessLevelIds !== undefined) &&
      actorRole !== UserRole.SUPER_ADMIN
    ) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut personnaliser les niveaux d\'accès.',
      );
    }
    return this.proxy('auth', `/internal/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deactivateUser(id: string, actorRole: string) {
    const target = await this.getUser(id).catch(() => null) as { role?: string } | null;
    if (target?.role === UserRole.SUPER_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut désactiver un compte SUPER_ADMIN.',
      );
    }
    return this.proxy('auth', `/internal/users/${id}`, { method: 'DELETE' });
  }

  async purgeUser(id: string, actorRole: string, actorId: string) {
    if (actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut supprimer définitivement un utilisateur.',
      );
    }
    if (id === actorId) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Vous ne pouvez pas supprimer votre propre compte.',
      );
    }
    const target = await this.getUser(id).catch(() => null);
    if (!target) {
      throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND, 'Utilisateur introuvable.');
    }
    await Promise.allSettled([
      this.proxy('driver', `/internal/users/${id}/data`, { method: 'DELETE' }),
      this.proxy('payment', `/internal/users/${id}/data`, { method: 'DELETE' }),
      this.proxy('notification', `/internal/users/${id}/data`, { method: 'DELETE' }),
      this.proxy('ride', `/internal/users/${id}/data`, { method: 'DELETE' }),
    ]);
    try {
      return await this.proxy('auth', `/internal/users/${id}/purge`, {
        method: 'POST',
        body: JSON.stringify({ actorId }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      const forbidden = /SUPER_ADMIN|propre compte|propriétaire/i.test(message);
      throw new MovaHttpException(
        forbidden ? MovaErrorCode.AUTH_FORBIDDEN : MovaErrorCode.INTERNAL_ERROR,
        forbidden ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST,
        message && message.length < 180 ? message : "Impossible de supprimer l'utilisateur. Réessayez.",
      );
    }
  }

  async listDrivers(
    skip = 0,
    take = 50,
    filters?: { kycStatus?: string; isAvailable?: string; includeHidden?: boolean },
    managedCity?: string | null,
  ) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (filters?.kycStatus) params.set('kycStatus', filters.kycStatus);
    if (filters?.isAvailable) params.set('isAvailable', filters.isAvailable);
    if (filters?.includeHidden) params.set('includeHidden', 'true');
    if (managedCity?.trim()) params.set('city', managedCity.trim());
    const [result, onDuty] = await Promise.all([
      this.fetchJson<{ data?: Array<Record<string, unknown>>; total?: number; skip?: number; take?: number }>(
        'driver',
        `/internal/drivers?${params}`,
      ),
      this.fetchJson<{ driverIds?: string[] }>('ride', '/internal/drivers/on-duty').catch(() => ({
        driverIds: [] as string[],
      })),
    ]);
    const onDutySet = new Set(onDuty.driverIds ?? []);
    const data = (result.data ?? []).map((d) => {
      const isAvailable = d.isAvailable === true;
      const userId = String(d.userId ?? '');
      const dutyStatus = !isAvailable ? 'OFFLINE' : onDutySet.has(userId) ? 'ON_TRIP' : 'AVAILABLE';
      return { ...d, dutyStatus };
    });
    return { ...result, data };
  }
  async getDriver(userId: string, managedCity?: string | null) {
    const detail = await this.fetchJson<{ operatingCity?: string | null }>('driver', `/internal/drivers/${userId}/detail`);
    assertCityMatch(managedCity ?? null, detail?.operatingCity, 'Chauffeur hors de votre ville gérée.');
    return detail;
  }
  async setDriverStatus(userId: string, active: boolean, suspendUser = false, managedCity?: string | null) {
    await this.getDriver(userId, managedCity);
    return Promise.all([
      this.proxy('driver', `/internal/drivers/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
      suspendUser
        ? this.proxy('auth', `/internal/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: active ? 'ACTIVE' : 'SUSPENDED' }) })
        : Promise.resolve(null),
    ]).then(([driver]) => driver);
  }
  async setDriverAcceptsDeliveries(
    userId: string,
    opts: {
      serviceMode?: 'BOTH' | 'RIDES_ONLY' | 'DELIVERIES_ONLY';
      acceptsDeliveries?: boolean;
    },
    managedCity?: string | null,
  ) {
    await this.getDriver(userId, managedCity);
    let serviceMode = opts.serviceMode;
    if (!serviceMode) {
      if (opts.acceptsDeliveries === false) serviceMode = 'RIDES_ONLY';
      else if (opts.acceptsDeliveries === true) serviceMode = 'BOTH';
      else serviceMode = 'BOTH';
    }
    // Pass serviceMode string (not booleans) so Nest never drops acceptsRides=false.
    return this.proxy('driver', `/internal/drivers/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ serviceMode }),
    });
  }
  pendingKyc(status?: string, managedCity?: string | null) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (managedCity?.trim()) params.set('city', managedCity.trim());
    const q = params.toString();
    return this.fetchJson('driver', `/internal/kyc/pending${q ? `?${q}` : ''}`);
  }
  async approveKyc(id: string, approved: boolean, notes?: string, managedCity?: string | null) {
    if (managedCity) {
      const pending = (await this.pendingKyc('ALL', managedCity)) as Array<{ id?: string }>;
      if (!Array.isArray(pending) || !pending.some((d) => d.id === id)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Document KYC hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('driver', `/internal/kyc/${id}/review`, { method: 'POST', body: JSON.stringify({ approved, notes }) });
  }
  async reviewDriverKyc(userId: string, approved: boolean, notes?: string, managedCity?: string | null) {
    await this.getDriver(userId, managedCity);
    return this.proxy('driver', `/internal/drivers/${userId}/kyc`, { method: 'PATCH', body: JSON.stringify({ approved, notes }) });
  }
  async reviewDriverDocumentsRenewal(userId: string, approved: boolean, notes?: string, managedCity?: string | null) {
    await this.getDriver(userId, managedCity);
    return this.proxy('driver', `/internal/drivers/${userId}/documents-renewal`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, notes }),
    });
  }
  async reviewVehicleTypeApproval(
    userId: string,
    approved: boolean,
    notes?: string,
    vehicleType?: string,
    actorRole?: string,
    managedCity?: string | null,
  ) {
    await this.getDriver(userId, managedCity);
    if (vehicleType && actorRole !== UserRole.SUPER_ADMIN && actorRole !== UserRole.ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un administrateur peut modifier le type d\'engin.',
      );
    }
    return this.proxy('driver', `/internal/drivers/${userId}/vehicle-type`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, notes, vehicleType }),
    });
  }
  async runKycOcr(documentId: string, managedCity?: string | null) {
    if (managedCity) {
      const pending = (await this.pendingKyc('ALL', managedCity)) as Array<{ id?: string }>;
      if (!pending.some((d) => d.id === documentId)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Document KYC hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('driver', `/internal/kyc/${documentId}/ocr`, { method: 'POST', body: JSON.stringify({}) });
  }
  async regenerateDriverActivationPin(userId: string, managedCity?: string | null) {
    await this.getDriver(userId, managedCity);
    return this.proxy('driver', `/internal/drivers/${userId}/activation-pin`, { method: 'POST', body: JSON.stringify({}) });
  }
  purgeDriverProfile(userId: string, actorRole: string) {
    if (actorRole !== UserRole.SUPER_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Seul un SUPER_ADMIN peut retirer un profil chauffeur fantôme.',
      );
    }
    return this.proxy('driver', `/internal/users/${userId}/data`, { method: 'DELETE' });
  }
  async issuePartnerLoginPin(subject: string, userId: string, managedCity?: string | null) {
    if (managedCity) {
      const pending = await this.listPartnerKycPending('ALL', true, managedCity);
      const key = `${userId}:${subject}`;
      const inScope =
        (pending.restaurants ?? []).some((r) => `${r.userId}:RESTAURANT` === key) ||
        (pending.rentalPartners ?? []).some((r) => `${r.userId}:RENTAL_PARTNER` === key);
      if (!inScope) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Partenaire hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/partner-kyc/${subject}/${userId}/login-pin`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
  listIncidents(managedCity?: string | null) {
    return this.fetchJson<{ lat?: number; lng?: number; [key: string]: unknown }[]>(
      'driver',
      '/internal/incidents',
    ).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      return filterRowsByManagedCity(rows, managedCity ?? null, (r) => ({ lat: r.lat, lng: r.lng }));
    });
  }
  async resolveIncident(id: string, status: string, managedCity?: string | null) {
    if (managedCity) {
      const scoped = await this.listIncidents(managedCity);
      if (!scoped.some((row) => String(row.id ?? '') === id)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Incident hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('driver', `/internal/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status }) });
  }

  async listRides(
    query: { status?: string; from?: string; to?: string; skip?: number; take?: number },
    managedCity?: string | null,
  ) {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const skip = Number.isFinite(query.skip) ? Math.max(0, Number(query.skip)) : 0;
    const take = Number.isFinite(query.take) && Number(query.take) > 0 ? Number(query.take) : 50;
    // CITY_ADMIN: over-fetch then filter by pickup GPS (downstream has no city column).
    const fetchTake = managedCity ? Math.min(500, Math.max(take * 10, 200)) : Math.min(200, take);
    const fetchSkip = managedCity ? 0 : skip;
    params.set('skip', String(fetchSkip));
    params.set('take', String(fetchTake));
    const data = await this.fetchJson<
      { pickupLat?: number; pickupLng?: number; [key: string]: unknown }[]
    >('ride', `/internal/rides?${params}`);
    const rows = Array.isArray(data) ? data : [];
    const scoped = filterRowsByManagedCity(rows, managedCity ?? null, (r) => ({
      lat: r.pickupLat,
      lng: r.pickupLng,
    }));
    if (!managedCity) return scoped;
    return scoped.slice(skip, skip + Math.min(200, take));
  }

  async getRide(id: string, managedCity?: string | null) {
    const ride = await this.fetchJson<{
      pickupLat?: number | null;
      pickupLng?: number | null;
      [key: string]: unknown;
    }>('ride', `/internal/rides/${id}`);
    assertCoordsInManagedCity(
      managedCity ?? null,
      ride?.pickupLat,
      ride?.pickupLng,
      'Course hors de votre ville gérée.',
    );
    return ride;
  }

  async getGpsTrace(type: string, id: string, managedCity?: string | null) {
    const kind = type.trim().toLowerCase();
    if (managedCity) {
      if (kind === 'ride' || kind === 'rides') {
        await this.getRide(id, managedCity);
      } else if (kind === 'delivery' || kind === 'deliveries') {
        await this.getDelivery(id, managedCity);
      } else if (kind === 'moving' || kind === 'movings') {
        const rows = await this.listMoving(200, managedCity);
        if (!rows.some((r) => String((r as { id?: string }).id ?? '') === id)) {
          throw new MovaHttpException(
            MovaErrorCode.AUTH_FORBIDDEN,
            HttpStatus.FORBIDDEN,
            'Déménagement hors de votre ville gérée.',
          );
        }
      } else if (kind === 'errand' || kind === 'errands') {
        // Errands are delivery-shaped; reuse delivery city ACL when possible.
        await this.getDelivery(id, managedCity).catch(() => {
          throw new MovaHttpException(
            MovaErrorCode.AUTH_FORBIDDEN,
            HttpStatus.FORBIDDEN,
            'Course courses hors de votre ville gérée.',
          );
        });
      } else {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Trace GPS hors périmètre admin ville.',
        );
      }
    }
    return this.fetchJson('ride', `/internal/tracking/${type}/${id}/trace`);
  }

  async cancelRide(id: string, reason?: string, managedCity?: string | null) {
    await this.getRide(id, managedCity);
    return this.proxy('ride', `/internal/rides/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  async updateRideStatus(id: string, status: string, reason?: string, managedCity?: string | null) {
    await this.getRide(id, managedCity);
    return this.proxy('ride', `/internal/rides/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
  }

  async assignRideDriver(id: string, driverId: string, managedCity?: string | null) {
    await this.getRide(id, managedCity);
    return this.proxy('ride', `/internal/rides/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
  }

  async markRidePaid(id: string, confirmedBy?: string, managedCity?: string | null) {
    await this.getRide(id, managedCity);
    return this.proxy('payment', `/internal/rides/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ confirmedBy }),
    });
  }

  async markDeliveryPaid(id: string, confirmedBy?: string, type = 'DELIVERY', managedCity?: string | null) {
    await this.getDelivery(id, managedCity);
    const referenceType = type === 'ERRAND' ? 'ERRAND' : 'DELIVERY';
    return this.proxy('payment', `/internal/services/${referenceType}/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ confirmedBy }),
    });
  }

  async listDeliveries(
    query: {
      status?: string;
      type?: string;
      from?: string;
      to?: string;
      search?: string;
      skip?: number;
      take?: number;
    } = {},
    managedCity?: string | null,
  ) {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.type) params.set('type', query.type);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.search?.trim()) params.set('search', query.search.trim());
    const skip = Number(query.skip ?? 0);
    const take = Number(query.take ?? 50);
    const fetchTake = managedCity ? Math.min(500, Math.max(take * 10, 200)) : take;
    const fetchSkip = managedCity ? 0 : skip;
    params.set('skip', String(fetchSkip));
    params.set('take', String(fetchTake));
    const data = await this.fetchJson<
      {
        pickupLat?: number | null;
        pickupLng?: number | null;
        deliveryLat?: number | null;
        deliveryLng?: number | null;
        [key: string]: unknown;
      }[]
    >('ride', `/internal/deliveries?${params}`);
    const rows = Array.isArray(data) ? data : [];
    const scoped = filterRowsByManagedCity(rows, managedCity ?? null, (r) => ({
      lat: r.pickupLat ?? r.deliveryLat,
      lng: r.pickupLng ?? r.deliveryLng,
    }));
    if (!managedCity) return scoped;
    return scoped.slice(skip, skip + take);
  }
  async getDelivery(id: string, managedCity?: string | null) {
    const delivery = await this.fetchJson<{
      pickupLat?: number | null;
      pickupLng?: number | null;
      deliveryLat?: number | null;
      deliveryLng?: number | null;
      [key: string]: unknown;
    }>('ride', `/internal/deliveries/${id}`);
    assertCoordsInManagedCity(
      managedCity ?? null,
      delivery?.pickupLat ?? delivery?.deliveryLat,
      delivery?.pickupLng ?? delivery?.deliveryLng,
      'Livraison hors de votre ville gérée.',
    );
    return delivery;
  }

  async updateDeliveryStatus(id: string, status: string, managedCity?: string | null) {
    await this.getDelivery(id, managedCity);
    return this.proxy('ride', `/internal/deliveries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  async cancelDelivery(id: string, reason?: string, managedCity?: string | null) {
    await this.getDelivery(id, managedCity);
    return this.proxy('ride', `/internal/deliveries/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  async assignDeliveryDriver(id: string, driverId: string, managedCity?: string | null) {
    await this.getDelivery(id, managedCity);
    return this.proxy('ride', `/internal/deliveries/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) });
  }

  listScheduledRides(take = 50, managedCity?: string | null) {
    return this.fetchJson<{ pickupLat?: number; pickupLng?: number; [key: string]: unknown }[]>(
      'ride',
      `/internal/scheduled-rides?take=${take}`,
    ).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      return filterRowsByManagedCity(rows, managedCity ?? null, (r) => ({
        lat: r.pickupLat,
        lng: r.pickupLng,
      }));
    });
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

  async listRestaurants(managedCity?: string | null) {
    const data = await this.fetchJson<{ lat?: number; lng?: number; [key: string]: unknown }[]>(
      'ride',
      '/internal/restaurants',
    );
    const rows = Array.isArray(data) ? data : [];
    // CITY_ADMIN: full restaurant list filtered in-memory by restaurant lat/lng.
    return filterRowsByManagedCity(rows, managedCity ?? null, (r) => ({ lat: r.lat, lng: r.lng }));
  }
  async createRestaurant(body: Record<string, unknown>, managedCity?: string | null) {
    const lat = typeof body.lat === 'number' ? body.lat : Number(body.lat);
    const lng = typeof body.lng === 'number' ? body.lng : Number(body.lng);
    assertCoordsInManagedCity(managedCity ?? null, lat, lng, 'Restaurant hors de votre ville gérée.');
    const payload = managedCity
      ? forceCityOnBody(managedCity, { ...body, lat, lng })
      : body;
    return this.proxy('ride', '/internal/restaurants', { method: 'POST', body: JSON.stringify(payload) });
  }
  async updateRestaurant(id: string, body: Record<string, unknown>, managedCity?: string | null) {
    if (managedCity) {
      const restaurants = await this.listRestaurants(managedCity);
      const existing = restaurants.find((r) => String(r.id ?? '') === id);
      if (!existing) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Restaurant hors de votre ville gérée.',
        );
      }
      const lat = body.lat != null ? Number(body.lat) : Number(existing.lat);
      const lng = body.lng != null ? Number(body.lng) : Number(existing.lng);
      assertCoordsInManagedCity(managedCity, lat, lng, 'Restaurant hors de votre ville gérée.');
    }
    return this.proxy('ride', `/internal/restaurants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deleteRestaurant(id: string, managedCity?: string | null) {
    if (managedCity) {
      const restaurants = await this.listRestaurants(managedCity);
      if (!restaurants.some((r) => String(r.id ?? '') === id)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Restaurant hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/restaurants/${id}`, { method: 'DELETE' });
  }

  async listPartnerKycPending(status?: string, includeHidden = false, managedCity?: string | null) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (includeHidden) params.set('includeHidden', 'true');
    const q = params.toString();
    const raw = await this.fetchJson<{
      restaurants?: Array<{ lat?: number | null; lng?: number | null; city?: string | null; userId?: string; [k: string]: unknown }>;
      rentalPartners?: Array<{ lat?: number | null; lng?: number | null; city?: string | null; userId?: string; [k: string]: unknown }>;
      documents?: Array<{ id?: string; userId?: string; subject?: string; [k: string]: unknown }>;
    }>('ride', `/internal/partner-kyc/pending${q ? `?${q}` : ''}`);
    if (!managedCity) return raw;
    const restaurantsGps = filterRowsByManagedCity(raw.restaurants ?? [], managedCity, (r) => ({
      lat: r.lat,
      lng: r.lng,
    }));
    // Also keep restaurants that already expose a city name matching managedCity.
    const restaurantsNamed = filterRowsByCityName(raw.restaurants ?? [], managedCity, (r) => r.city);
    const restaurants = [
      ...new Map([...restaurantsGps, ...restaurantsNamed].map((r) => [r.userId, r])).values(),
    ];
    const rentalsGps = filterRowsByManagedCity(raw.rentalPartners ?? [], managedCity, (r) => ({
      lat: r.lat,
      lng: r.lng,
    }));
    const rentalsNamed = filterRowsByCityName(raw.rentalPartners ?? [], managedCity, (r) => r.city);
    const rentalMerged = [...new Map([...rentalsGps, ...rentalsNamed].map((r) => [r.userId, r])).values()];
    const allowed = new Set([
      ...restaurants.map((r) => `${r.userId}:RESTAURANT`),
      ...rentalMerged.map((r) => `${r.userId}:RENTAL_PARTNER`),
    ]);
    return {
      restaurants,
      rentalPartners: rentalMerged,
      documents: (raw.documents ?? []).filter((d) => allowed.has(`${d.userId}:${d.subject}`)),
    };
  }
  async reviewPartnerKycDocument(id: string, approved: boolean, notes?: string, managedCity?: string | null) {
    if (managedCity) {
      const pending = await this.listPartnerKycPending('ALL', true, managedCity);
      const docs = pending.documents ?? [];
      if (!docs.some((d) => d.id === id)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Dossier partenaire hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/partner-kyc/documents/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ approved, notes }),
    });
  }
  async reviewPartnerKycSubject(
    subject: string,
    userId: string,
    approved: boolean,
    notes?: string,
    managedCity?: string | null,
  ) {
    if (managedCity) {
      const pending = await this.listPartnerKycPending('ALL', true, managedCity);
      const key = `${userId}:${subject}`;
      const inScope =
        (pending.restaurants ?? []).some((r) => `${r.userId}:RESTAURANT` === key) ||
        (pending.rentalPartners ?? []).some((r) => `${r.userId}:RENTAL_PARTNER` === key);
      if (!inScope) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Partenaire hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/partner-kyc/${subject}/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, notes }),
    });
  }

  listPublicites() {
    return this.fetchJson('ride', '/internal/publicites');
  }
  createPublicite(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/publicites', { method: 'POST', body: JSON.stringify(body) });
  }
  updatePublicite(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/publicites/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deletePublicite(id: string) {
    return this.proxy('ride', `/internal/publicites/${id}`, { method: 'DELETE' });
  }

  listCompanyContacts(search?: string) {
    const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return this.fetchJson('ride', `/internal/company-contacts${q}`);
  }
  createCompanyContact(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/company-contacts', { method: 'POST', body: JSON.stringify(body) });
  }
  updateCompanyContact(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/company-contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deleteCompanyContact(id: string) {
    return this.proxy('ride', `/internal/company-contacts/${id}`, { method: 'DELETE' });
  }

  listCgu() {
    return this.fetchJson('ride', '/internal/cgu');
  }
  createCgu(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/cgu', { method: 'POST', body: JSON.stringify(body) });
  }
  updateCgu(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/cgu/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  publishCgu(id: string) {
    return this.proxy('ride', `/internal/cgu/${id}/publish`, { method: 'POST' });
  }
  unpublishCgu(id: string) {
    return this.proxy('ride', `/internal/cgu/${id}/unpublish`, { method: 'POST' });
  }
  deleteCgu(id: string) {
    return this.proxy('ride', `/internal/cgu/${id}`, { method: 'DELETE' });
  }

  listPricingRules(city?: string) {
    const q = city ? `?city=${encodeURIComponent(city)}` : '';
    return this.fetchJson('ride', `/internal/pricing-rules${q}`);
  }
  createPricingRule(vehicleType: string, body: Record<string, unknown>, managedCity?: string | null) {
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}`, {
      method: 'POST',
      body: JSON.stringify(forceCityOnBody(managedCity ?? null, body)),
    });
  }
  updatePricingRule(vehicleType: string, body: Record<string, unknown>, managedCity?: string | null) {
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}`, {
      method: 'PATCH',
      body: JSON.stringify(forceCityOnBody(managedCity ?? null, body)),
    });
  }
  deletePricingRule(vehicleType: string, city: string, managedCity?: string | null) {
    assertCityMatch(managedCity ?? null, city, `Vous ne pouvez supprimer que les tarifs de ${managedCity}.`);
    const q = city ? `?city=${encodeURIComponent(city)}` : '';
    return this.proxy('ride', `/internal/pricing-rules/${vehicleType}${q}`, { method: 'DELETE' });
  }

  listDeliveryPricingRules() {
    return this.fetchJson('ride', '/internal/delivery-pricing-rules');
  }
  updateDeliveryPricingRule(category: string, body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les majorations livraison nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', `/internal/delivery-pricing-rules/${category}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listErrandCategoryEstimates() {
    return this.fetchJson('ride', '/internal/errand-category-estimates');
  }
  createErrandCategoryEstimate(body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les estimations courses nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', '/internal/errand-category-estimates', { method: 'POST', body: JSON.stringify(body) });
  }
  updateErrandCategoryEstimate(category: string, body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les estimations courses nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', `/internal/errand-category-estimates/${category}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  deleteErrandCategoryEstimate(category: string, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les estimations courses nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', `/internal/errand-category-estimates/${category}`, { method: 'DELETE' });
  }

  listPricingTimeWindows(city?: string) {
    const q = city ? `?city=${encodeURIComponent(city)}` : '';
    return this.fetchJson('ride', `/internal/pricing-time-windows${q}`);
  }
  createPricingTimeWindow(body: Record<string, unknown>, managedCity?: string | null) {
    return this.proxy('ride', '/internal/pricing-time-windows', {
      method: 'POST',
      body: JSON.stringify(forceCityOnBody(managedCity ?? null, body)),
    });
  }
  async updatePricingTimeWindow(id: string, body: Record<string, unknown>, managedCity?: string | null) {
    if (managedCity) {
      const windows = (await this.listPricingTimeWindows(managedCity)) as Array<{ id?: string; city?: string }>;
      const existing = windows.find((w) => String(w.id ?? '') === id);
      if (!existing) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          `Plage horaire hors de ${managedCity}.`,
        );
      }
      assertCityMatch(managedCity, existing.city, `Vous ne pouvez modifier que les plages de ${managedCity}.`);
    }
    return this.proxy('ride', `/internal/pricing-time-windows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(forceCityOnBody(managedCity ?? null, body)),
    });
  }
  async deletePricingTimeWindow(id: string, managedCity?: string | null) {
    if (managedCity) {
      const windows = (await this.listPricingTimeWindows(managedCity)) as Array<{ id?: string; city?: string }>;
      const existing = windows.find((w) => String(w.id ?? '') === id);
      if (!existing) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          `Plage horaire hors de ${managedCity}.`,
        );
      }
      assertCityMatch(managedCity, existing.city, `Vous ne pouvez supprimer que les plages de ${managedCity}.`);
    }
    return this.proxy('ride', `/internal/pricing-time-windows/${id}`, { method: 'DELETE' });
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
  updateProvince(id: string, data: { name?: string; isActive?: boolean }) {
    return this.proxy('ride', `/internal/provinces/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
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
  setAllCitiesActive(isActive: boolean) {
    return this.proxy('ride', '/internal/cities/bulk-active', { method: 'POST', body: JSON.stringify({ isActive }) });
  }

  setAllProvincesActive(isActive: boolean) {
    return this.proxy('ride', '/internal/provinces/bulk-active', { method: 'POST', body: JSON.stringify({ isActive }) });
  }

  seedPois(city?: string | null) {
    const q = city?.trim()
      ? `?city=${encodeURIComponent(city.trim())}`
      : '?city=RDC';
    return this.proxy('ride', `/internal/poi/seed${q}`, { method: 'POST' });
  }

  listCarpool(take = 50, managedCity?: string | null) {
    return this.fetchJson<{ fromCity?: string; pickupLat?: number; pickupLng?: number; [key: string]: unknown }[]>(
      'ride',
      `/internal/carpool?take=${take}`,
    ).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      if (!managedCity) return rows;
      const byName = filterRowsByCityName(rows, managedCity, (r) => r.fromCity);
      if (byName.length > 0 || rows.every((r) => r.fromCity != null)) return byName;
      return filterRowsByManagedCity(rows, managedCity, (r) => ({
        lat: r.pickupLat,
        lng: r.pickupLng,
      }));
    });
  }
  cancelCarpool(id: string) {
    return this.proxy('ride', `/internal/carpool/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  }
  updateCarpoolStatus(id: string, status: string) {
    return this.proxy('ride', `/internal/carpool/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  listMoving(take = 50, managedCity?: string | null) {
    return this.fetchJson<{ city?: string; pickupLat?: number; pickupLng?: number; [key: string]: unknown }[]>(
      'ride',
      `/internal/moving?take=${take}`,
    ).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      if (!managedCity) return rows;
      const byName = filterRowsByCityName(rows, managedCity, (r) => (typeof r.city === 'string' ? r.city : null));
      if (byName.length > 0 || rows.every((r) => typeof r.city === 'string')) return byName;
      return filterRowsByManagedCity(rows, managedCity, (r) => ({
        lat: r.pickupLat,
        lng: r.pickupLng,
      }));
    });
  }

  /** CITY_ADMIN: refuse write outside managedCity. */
  async assertMovingInScope(id: string, managedCity?: string | null) {
    if (!managedCity) return;
    const scoped = await this.listMoving(200, managedCity);
    if (!scoped.some((r) => String(r.id ?? '') === id)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Déménagement hors de votre ville gérée.',
      );
    }
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

  listRentalInquiries(take = 50, managedCity?: string | null) {
    return this.fetchJson<
      Array<{
        pickupCity?: string;
        city?: string;
        vehicle?: { city?: string } | null;
        [key: string]: unknown;
      }>
    >('ride', `/internal/rental-inquiries?take=${take}`).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      return filterRowsByCityName(
        rows,
        managedCity ?? null,
        (r) => r.pickupCity ?? r.city ?? r.vehicle?.city,
      );
    });
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

  listRentalVehicles(managedCity?: string | null) {
    return this.fetchJson<{ city?: string; [key: string]: unknown }[]>('ride', '/internal/rental-vehicles').then(
      (data) => {
        const rows = Array.isArray(data) ? data : [];
        return filterRowsByCityName(rows, managedCity ?? null, (r) => r.city);
      },
    );
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
  topUpWallet(userId: string, body: { amountCdf: number; provider: string; phone: string }) {
    return this.proxy('payment', `/internal/wallets/${userId}/top-up`, { method: 'POST', body: JSON.stringify(body) });
  }
  topUpWalletStatus(userId: string, providerRef: string) {
    const q = new URLSearchParams({ providerRef });
    return this.proxy('payment', `/internal/wallets/${userId}/top-up/status?${q}`, { method: 'GET' });
  }
  reverseVirtualTreasuryFloat() {
    return this.proxy('payment', `/internal/wallets/platform/reverse-virtual-float`, { method: 'POST', body: '{}' });
  }
  clawbackOpenCashFeeAccruals() {
    return this.proxy('payment', `/internal/wallets/platform/clawback-open-cash-fees`, { method: 'POST', body: '{}' });
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

  confirmCashDebtByCode(code: string, confirmedBy?: string) {
    return this.proxy('payment', '/internal/cash-debts/confirm-cash', {
      method: 'POST',
      body: JSON.stringify({ code, confirmedBy }),
    });
  }

  getDebtPolicy() {
    return this.proxy('payment', '/internal/debt-policy', { method: 'GET' });
  }

  updateDebtPolicy(body: {
    maxOpenDebtCdf?: number;
    blockOffers?: boolean;
    isActive?: boolean;
    requirePositiveWalletBalance?: boolean;
  }) {
    return this.proxy('payment', '/internal/debt-policy', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  listSurcharges() {
    return this.fetchJson('ride', '/internal/surcharges');
  }
  updateSurcharge(type: string, body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les majorations nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', `/internal/surcharges/${type}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listMovingVehicleCategories() {
    return this.fetchJson('ride', '/internal/moving-vehicle-categories').catch(() => []);
  }

  updateMovingVehicleCategory(category: string, body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les coefficients déménagement nationaux sont réservés au staff central.',
      );
    }
    return this.proxy('ride', `/internal/moving-vehicle-categories/${category}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  getPlatformConfig() {
    return this.fetchJson('ride', '/internal/platform-config');
  }

  updatePlatformConfig(body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'La configuration nationale de la plateforme est réservée au staff central. Utilisez « Documents » pour le KYC ville.',
      );
    }
    return this.proxy('ride', '/internal/platform-config', { method: 'PATCH', body: JSON.stringify(body) });
  }

  getClientAppsConfig() {
    return this.fetchJson('ride', '/internal/client-apps-config');
  }

  updateClientAppsConfig(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/client-apps-config', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  listPlatformVendors() {
    return this.fetchJson('ride', '/internal/platform-vendors');
  }

  createPlatformVendor(body: Record<string, unknown>) {
    return this.proxy('ride', '/internal/platform-vendors', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updatePlatformVendor(id: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/platform-vendors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  deletePlatformVendor(id: string) {
    return this.proxy('ride', `/internal/platform-vendors/${id}`, { method: 'DELETE' });
  }

  runPlatformVendorAlerts() {
    return this.proxy('ride', '/internal/platform-vendors/run-alerts', {
      method: 'POST',
      body: '{}',
    });
  }

  listCancellationPolicies() {
    return this.fetchJson('ride', '/internal/cancellation-policies');
  }

  updateCancellationPolicy(vehicleType: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/cancellation-policies/${vehicleType}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  listParcelWeightBands() {
    return this.fetchJson('ride', '/internal/parcel-weight-bands');
  }

  updateParcelWeightBand(category: string, body: Record<string, unknown>) {
    return this.proxy('ride', `/internal/parcel-weight-bands/${category}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  listCommissions() {
    return this.fetchJson('ride', '/internal/commissions');
  }

  updateCommission(serviceType: string, body: Record<string, unknown>, actorRole?: string) {
    if (actorRole === UserRole.CITY_ADMIN) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les commissions plateforme nationales sont réservées au staff central.',
      );
    }
    return this.proxy('ride', `/internal/commissions/${serviceType}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  listPromoCodes() {
    return this.fetchJson('ride', '/internal/promo-codes');
  }

  /**
   * CITY_ADMIN: voit les codes nationaux (lecture) + ceux qui incluent sa ville.
   * Staff central: liste complète.
   */
  async listPromoCodesScoped(managedCity?: string | null) {
    const rows = (await this.listPromoCodes()) as Array<{ cityNames?: string[] | null }>;
    if (!managedCity?.trim()) return rows;
    const key = managedCity.trim().toLowerCase();
    return rows.filter((p) => {
      const cities = (p.cityNames ?? []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
      if (cities.length === 0) return true; // national — visible en lecture
      return cities.includes(key);
    });
  }

  /** Promo éditable par CITY_ADMIN uniquement si limité exactement à sa ville. */
  private assertCityAdminOwnsPromo(
    managedCity: string,
    promo: { cityNames?: string[] | null },
  ) {
    const cities = (promo.cityNames ?? []).map((c) => String(c).trim()).filter(Boolean);
    const key = managedCity.trim().toLowerCase();
    const onlyOwn =
      cities.length === 1 && cities[0].toLowerCase() === key;
    if (!onlyOwn) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        `Vous ne pouvez modifier que les codes promo limités à ${managedCity} (pas les codes nationaux ni multi-villes).`,
      );
    }
  }

  async createPromoCode(body: Record<string, unknown>, managedCity?: string | null) {
    const payload = { ...body };
    if (managedCity?.trim()) {
      // Force scope: CITY_ADMIN ne peut jamais créer un code national / multi-villes.
      payload.cityNames = [managedCity.trim()];
    }
    return this.proxy('ride', '/internal/promo-codes', { method: 'POST', body: JSON.stringify(payload) });
  }

  async updatePromoCode(id: string, body: Record<string, unknown>, managedCity?: string | null) {
    if (managedCity?.trim()) {
      const rows = (await this.listPromoCodes()) as Array<{ id?: string; cityNames?: string[] | null }>;
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      this.assertCityAdminOwnsPromo(managedCity, existing);
      // Empêche d'élargir le périmètre hors de sa ville.
      const payload = { ...body, cityNames: [managedCity.trim()] };
      return this.proxy('ride', `/internal/promo-codes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    }
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

  listPoiSuggestions(status?: string, skip = 0, take = 50, managedCity?: string | null) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (status) params.set('status', status);
    if (managedCity?.trim()) params.set('city', managedCity.trim());
    return this.fetchJson('ride', `/internal/poi-suggestions?${params.toString()}`);
  }

  async approvePoiSuggestion(id: string, body: Record<string, unknown> = {}, managedCity?: string | null) {
    if (managedCity) {
      const suggestion = await this.fetchJson<{ city?: string; lat?: number; lng?: number }>(
        'ride',
        `/internal/poi-suggestions/${id}`,
      );
      const byName = (suggestion.city?.trim().toLowerCase() ?? '') === managedCity.trim().toLowerCase();
      if (!byName) {
        assertCoordsInManagedCity(
          managedCity,
          suggestion.lat,
          suggestion.lng,
          'Suggestion POI hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/poi-suggestions/${id}/approve`, { method: 'POST', body: JSON.stringify(body) });
  }

  async rejectPoiSuggestion(id: string, body: Record<string, unknown> = {}, managedCity?: string | null) {
    if (managedCity) {
      const suggestion = await this.fetchJson<{ city?: string; lat?: number; lng?: number }>(
        'ride',
        `/internal/poi-suggestions/${id}`,
      );
      const byName = (suggestion.city?.trim().toLowerCase() ?? '') === managedCity.trim().toLowerCase();
      if (!byName) {
        assertCoordsInManagedCity(
          managedCity,
          suggestion.lat,
          suggestion.lng,
          'Suggestion POI hors de votre ville gérée.',
        );
      }
    }
    return this.proxy('ride', `/internal/poi-suggestions/${id}/reject`, { method: 'POST', body: JSON.stringify(body) });
  }
}
