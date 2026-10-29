import { HttpStatus, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, resolveCityFromCoords, serviceUrl } from '@mova/shared';

type MovaService = 'auth' | 'ride' | 'driver' | 'payment' | 'notification';

/**
 * Ops aggregation for admin console: inbox, search, fleet map, scores, SLA, P&L, alerts.
 */
@Injectable()
export class OpsService {
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };
  private jsonHeaders = { ...this.headers, 'Content-Type': 'application/json' };

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
      const detail = await res.text().catch(() => '');
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.BAD_GATEWAY,
        `Ops proxy failed: ${service}${path} (${res.status}) ${detail.slice(0, 120)}`,
      );
    }
    const text = await res.text();
    if (!text.trim()) return [] as T;
    return JSON.parse(text) as T;
  }

  private softFetch<T>(service: MovaService, path: string, fallback: T): Promise<T> {
    return this.fetchJson<T>(service, path).catch(() => fallback);
  }

  async writeAudit(
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    meta?: Record<string, unknown>,
  ) {
    return this.fetchJson('auth', '/internal/audit', {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({ actorUserId, action, resourceType, resourceId, meta }),
    }).catch(() => null);
  }

  listAudit(qs: URLSearchParams) {
    return this.fetchJson('auth', `/internal/audit?${qs}`);
  }

  listBlacklist(qs: URLSearchParams) {
    return this.fetchJson('auth', `/internal/blacklist?${qs}`);
  }

  async upsertBlacklist(body: Record<string, unknown>, actorUserId: string) {
    const row = await this.fetchJson('auth', '/internal/blacklist', {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({ ...body, createdBy: actorUserId }),
    });
    await this.writeAudit(actorUserId, 'blacklist.upsert', 'blacklist', (row as { id?: string })?.id, body);
    return row;
  }

  async deactivateBlacklist(id: string, actorUserId: string) {
    const row = await this.fetchJson('auth', `/internal/blacklist/${id}/deactivate`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: '{}',
    });
    await this.writeAudit(actorUserId, 'blacklist.deactivate', 'blacklist', id);
    return row;
  }

  listStaffAlerts(qs: URLSearchParams) {
    return this.fetchJson('notification', `/internal/staff-alerts?${qs}`);
  }

  createStaffAlert(body: Record<string, unknown>) {
    return this.fetchJson('notification', '/internal/staff-alerts', {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });
  }

  markStaffAlertRead(id: string) {
    return this.fetchJson('notification', `/internal/staff-alerts/${id}/read`, {
      method: 'PATCH',
      headers: this.jsonHeaders,
      body: '{}',
    });
  }

  markAllStaffAlertsRead() {
    return this.fetchJson('notification', '/internal/staff-alerts/read-all', {
      method: 'PATCH',
      headers: this.jsonHeaders,
      body: '{}',
    });
  }

  /** Unified ops inbox. */
  async getInbox(city?: string | null) {
    const cityQ = city?.trim() || '';
    const driversQs = new URLSearchParams({ take: '200', includeHidden: 'false' });
    if (cityQ) driversQs.set('city', cityQ);
    const kycQs = new URLSearchParams({ status: 'PENDING' });
    if (cityQ) kycQs.set('city', cityQ);
    const partnerQs = new URLSearchParams({ status: 'PENDING' });

    const [kycPending, partnerKyc, incidents, driversRes, fraud] = await Promise.all([
      this.softFetch<unknown[]>('driver', `/internal/kyc/pending?${kycQs}`, []),
      this.softFetch<{
        restaurants?: unknown[];
        rentalPartners?: unknown[];
      }>('ride', `/internal/partner-kyc/pending?${partnerQs}`, { restaurants: [], rentalPartners: [] }),
      this.softFetch<Array<{ id?: string; status?: string; type?: string; description?: string; createdAt?: string; lat?: number; lng?: number }>>(
        'driver',
        '/internal/incidents',
        [],
      ),
      this.softFetch<{ data?: Array<Record<string, unknown>> }>('driver', `/internal/drivers?${driversQs}`, {
        data: [],
      }),
      this.softFetch<{ alerts?: Array<{ severity?: string; title?: string; userId?: string }> }>(
        // fraud is computed in admin FraudService — soft empty here; controller may merge
        'ride',
        '/internal/fraud/signals?days=7',
        { alerts: [] },
      ).catch(() => ({ alerts: [] as Array<{ severity?: string; title?: string; userId?: string }> })),
    ]);

    const drivers = driversRes.data ?? [];
    const items: Array<{
      id: string;
      kind: string;
      priority: number;
      title: string;
      subtitle: string;
      href: string;
      createdAt?: string;
    }> = [];

    for (const d of Array.isArray(kycPending) ? kycPending : []) {
      const row = d as { id?: string; userId?: string; firstName?: string; lastName?: string; createdAt?: string };
      items.push({
        id: `kyc-${row.id ?? row.userId}`,
        kind: 'KYC_DRIVER',
        priority: 2,
        title: 'KYC chauffeur à valider',
        subtitle: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.userId || '—',
        href: '/kyc',
        createdAt: row.createdAt,
      });
    }

    for (const r of partnerKyc.restaurants ?? []) {
      const row = r as { userId?: string; name?: string; createdAt?: string };
      items.push({
        id: `pkyc-r-${row.userId}`,
        kind: 'KYC_PARTNER',
        priority: 2,
        title: 'KYC partenaire commerce',
        subtitle: row.name || row.userId || '—',
        href: '/kyc',
        createdAt: row.createdAt,
      });
    }
    for (const r of partnerKyc.rentalPartners ?? []) {
      const row = r as { userId?: string; name?: string; createdAt?: string };
      items.push({
        id: `pkyc-l-${row.userId}`,
        kind: 'KYC_PARTNER',
        priority: 2,
        title: 'KYC partenaire location',
        subtitle: row.name || row.userId || '—',
        href: '/kyc',
        createdAt: row.createdAt,
      });
    }

    const openIncidents = (Array.isArray(incidents) ? incidents : []).filter(
      (i) => String(i.status ?? '').toUpperCase() === 'OPEN',
    );
    for (const i of openIncidents) {
      if (cityQ && i.lat != null && i.lng != null) {
        const c = resolveCityFromCoords(Number(i.lat), Number(i.lng));
        if (c && c.toLowerCase() !== cityQ.toLowerCase()) continue;
      }
      const sos = String(i.type ?? '').toUpperCase() === 'SOS';
      items.push({
        id: `inc-${i.id}`,
        kind: sos ? 'SOS' : 'LITIGE',
        priority: sos ? 1 : 3,
        title: sos ? 'Alerte SOS ouverte' : 'Litige ouvert',
        subtitle: i.description || i.type || i.id || '—',
        href: '/litiges',
        createdAt: i.createdAt,
      });
    }

    for (const d of drivers) {
      if (d.documentsRenewalPending === true) {
        items.push({
          id: `renew-${d.userId}`,
          kind: 'DOCS_RENEWAL',
          priority: 3,
          title: 'Renouvellement documents',
          subtitle: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || String(d.userId ?? ''),
          href: `/chauffeurs`,
        });
      }
      if (
        String(d.kycStatus ?? '').toUpperCase() === 'APPROVED' &&
        d.activationPinVerified !== true &&
        d.onboardingCompleted === true
      ) {
        items.push({
          id: `pin-${d.userId}`,
          kind: 'PIN_PENDING',
          priority: 4,
          title: 'PIN activation à transmettre',
          subtitle: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || String(d.userId ?? ''),
          href: '/chauffeurs',
        });
      }
    }

    // fraud signals optional
    const fraudAlerts = (fraud as { alerts?: unknown[]; highRisk?: unknown[] }).alerts
      ?? (fraud as { highRisk?: unknown[] }).highRisk
      ?? [];
    for (const a of Array.isArray(fraudAlerts) ? fraudAlerts.slice(0, 20) : []) {
      const row = a as { id?: string; userId?: string; title?: string; severity?: string; reason?: string };
      items.push({
        id: `fraud-${row.id ?? row.userId ?? Math.random()}`,
        kind: 'FRAUDE',
        priority: 2,
        title: 'Signal fraude',
        subtitle: row.title || row.reason || row.userId || '—',
        href: '/fraude',
      });
    }

    items.sort((a, b) => a.priority - b.priority || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const counts = {
      total: items.length,
      sos: items.filter((i) => i.kind === 'SOS').length,
      kyc: items.filter((i) => i.kind.startsWith('KYC')).length,
      litiges: items.filter((i) => i.kind === 'LITIGE').length,
      docs: items.filter((i) => i.kind === 'DOCS_RENEWAL' || i.kind === 'PIN_PENDING').length,
      fraude: items.filter((i) => i.kind === 'FRAUDE').length,
    };
    return { items, counts, city: cityQ || null, generatedAt: new Date().toISOString() };
  }

  async globalSearch(q: string, city?: string | null) {
    const query = q.trim();
    if (query.length < 2) return { users: [], drivers: [], rides: [], restaurants: [], query };
    const cityQ = city?.trim() || '';
    const usersQs = new URLSearchParams({ skip: '0', take: '10', search: query });
    if (cityQ) usersQs.set('city', cityQ); // admin listUsers uses city via BFF — search hits auth directly
    const driversQs = new URLSearchParams({ take: '20', includeHidden: 'false' });
    if (cityQ) driversQs.set('city', cityQ);

    const [usersRes, driversRes, rides, restaurants] = await Promise.all([
      this.softFetch<{ data?: Array<Record<string, unknown>> }>('auth', `/internal/users?${usersQs}`, { data: [] }),
      this.softFetch<{ data?: Array<Record<string, unknown>> }>('driver', `/internal/drivers?${driversQs}`, {
        data: [],
      }),
      this.softFetch<Array<Record<string, unknown>>>('ride', `/internal/rides?take=20&search=${encodeURIComponent(query)}`, []).catch(
        () => [] as Array<Record<string, unknown>>,
      ),
      this.softFetch<Array<Record<string, unknown>>>('ride', '/internal/restaurants', []),
    ]);

    const qLower = query.toLowerCase();
    const drivers = (driversRes.data ?? []).filter((d) => {
      const hay = [
        d.userId,
        d.publicId,
        d.phone,
        d.firstName,
        d.lastName,
        d.operatingCity,
        ...(Array.isArray(d.vehicles) ? (d.vehicles as Array<{ plateNumber?: string }>).map((v) => v.plateNumber) : []),
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      return hay.includes(qLower);
    }).slice(0, 10);

    const restos = (Array.isArray(restaurants) ? restaurants : [])
      .filter((r) => {
        const hay = [r.name, r.address, r.ownerUserId, r.cuisine].map((x) => String(x ?? '').toLowerCase()).join(' ');
        return hay.includes(qLower);
      })
      .slice(0, 10);

    const rideRows = Array.isArray(rides)
      ? rides.filter((r) => {
          const hay = [r.id, r.publicId, r.passengerId, r.driverId, r.status]
            .map((x) => String(x ?? '').toLowerCase())
            .join(' ');
          return hay.includes(qLower);
        }).slice(0, 10)
      : [];

    return {
      query,
      users: (usersRes.data ?? []).slice(0, 10),
      drivers,
      rides: rideRows,
      restaurants: restos,
    };
  }

  async fleetMap(city?: string | null) {
    const cityQ = city?.trim() || '';
    const driversQs = new URLSearchParams({ take: '500', includeHidden: 'false' });
    if (cityQ) driversQs.set('city', cityQ);
    const [driversRes, incidents] = await Promise.all([
      this.softFetch<{ data?: Array<Record<string, unknown>> }>('driver', `/internal/drivers?${driversQs}`, {
        data: [],
      }),
      this.softFetch<Array<{ id?: string; status?: string; type?: string; lat?: number; lng?: number; description?: string }>>(
        'driver',
        '/internal/incidents',
        [],
      ),
    ]);
    const drivers = (driversRes.data ?? [])
      .filter((d) => d.currentLat != null && d.currentLng != null)
      .map((d) => ({
        userId: d.userId,
        publicId: d.publicId,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        operatingCity: d.operatingCity,
        dutyStatus: d.dutyStatus,
        isAvailable: d.isAvailable,
        kycStatus: d.kycStatus,
        lat: Number(d.currentLat),
        lng: Number(d.currentLng),
      }));
    const sos = (Array.isArray(incidents) ? incidents : [])
      .filter((i) => String(i.status ?? '').toUpperCase() === 'OPEN' && i.lat != null && i.lng != null)
      .filter((i) => {
        if (!cityQ) return true;
        const c = resolveCityFromCoords(Number(i.lat), Number(i.lng));
        return !c || c.toLowerCase() === cityQ.toLowerCase();
      })
      .map((i) => ({
        id: i.id,
        type: i.type,
        lat: Number(i.lat),
        lng: Number(i.lng),
        description: i.description,
      }));
    return {
      city: cityQ || null,
      drivers,
      sos,
      counts: {
        online: drivers.filter((d) => d.isAvailable === true).length,
        totalWithGps: drivers.length,
        sos: sos.length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async driverScore(userId: string) {
    const [detail, rides] = await Promise.all([
      this.softFetch<Record<string, unknown>>('driver', `/internal/drivers/${userId}/detail`, {}),
      this.softFetch<Array<{ status?: string; cancelledBy?: string; driverId?: string }>>(
        'ride',
        `/internal/rides?take=100&driverId=${encodeURIComponent(userId)}`,
        [],
      ).catch(() => [] as Array<{ status?: string; cancelledBy?: string }>),
    ]);
    const rideRows = Array.isArray(rides) ? rides : [];
    const cancelled = rideRows.filter((r) => String(r.status ?? '').toUpperCase() === 'CANCELLED').length;
    const completed = rideRows.filter((r) => String(r.status ?? '').toUpperCase() === 'COMPLETED').length;
    const cancelRate = rideRows.length > 0 ? cancelled / rideRows.length : 0;
    const rating = Number(detail.ratingAvg ?? 5);
    const totalRides = Number(detail.totalRides ?? rideRows.length);
    const docsPending = detail.documentsRenewalPending === true;
    // Score 0–100: rating 40%, volume 20%, cancel 30%, docs 10%
    const ratingPts = Math.min(40, (rating / 5) * 40);
    const volumePts = Math.min(20, Math.log10(Math.max(1, totalRides) + 1) * 10);
    const cancelPts = Math.max(0, 30 * (1 - cancelRate * 2));
    const docsPts = docsPending ? 0 : 10;
    const score = Math.round(ratingPts + volumePts + cancelPts + docsPts);
    return {
      userId,
      score,
      ratingAvg: rating,
      totalRides,
      sampleRides: rideRows.length,
      cancelled,
      completed,
      cancelRate: Math.round(cancelRate * 1000) / 10,
      documentsRenewalPending: docsPending,
      kycStatus: detail.kycStatus,
      operatingCity: detail.operatingCity,
      band: score >= 80 ? 'excellent' : score >= 60 ? 'bon' : score >= 40 ? 'moyen' : 'risque',
    };
  }

  async partnerSla(city?: string | null, days = 30) {
    const restaurants = await this.softFetch<
      Array<{
        id?: string;
        name?: string;
        rating?: number;
        prepTimeMin?: number;
        lat?: number;
        lng?: number;
        isActive?: boolean;
        isAcceptingOrders?: boolean;
        kycStatus?: string;
        commerceType?: string;
      }>
    >('ride', '/internal/restaurants', []);
    const cityQ = city?.trim().toLowerCase() || '';
    let rows = Array.isArray(restaurants) ? restaurants : [];
    if (cityQ) {
      rows = rows.filter((r) => {
        if (r.lat == null || r.lng == null) return false;
        const c = resolveCityFromCoords(Number(r.lat), Number(r.lng));
        return (c ?? '').toLowerCase() === cityQ;
      });
    }
    const deliveries = await this.softFetch<Array<{ restaurantId?: string; status?: string; createdAt?: string }>>(
      'ride',
      `/internal/deliveries?take=300`,
      [],
    ).catch(() => [] as Array<{ restaurantId?: string; status?: string }>);
    const byRest = new Map<string, { total: number; cancelled: number; delivered: number }>();
    for (const d of Array.isArray(deliveries) ? deliveries : []) {
      const id = String(d.restaurantId ?? '');
      if (!id) continue;
      const cur = byRest.get(id) ?? { total: 0, cancelled: 0, delivered: 0 };
      cur.total += 1;
      const st = String(d.status ?? '').toUpperCase();
      if (st === 'CANCELLED') cur.cancelled += 1;
      if (st === 'DELIVERED' || st === 'COMPLETED') cur.delivered += 1;
      byRest.set(id, cur);
    }
    const partners = rows.map((r) => {
      const stats = byRest.get(String(r.id ?? '')) ?? { total: 0, cancelled: 0, delivered: 0 };
      const cancelRate = stats.total > 0 ? stats.cancelled / stats.total : 0;
      const alert = cancelRate > 0.25 || Number(r.rating ?? 5) < 3.5;
      return {
        id: r.id,
        name: r.name,
        commerceType: r.commerceType,
        rating: r.rating ?? null,
        prepTimeMin: r.prepTimeMin ?? null,
        isAcceptingOrders: r.isAcceptingOrders !== false,
        kycStatus: r.kycStatus,
        orders: stats.total,
        cancelled: stats.cancelled,
        delivered: stats.delivered,
        cancelRate: Math.round(cancelRate * 1000) / 10,
        alert,
      };
    });
    partners.sort((a, b) => Number(b.alert) - Number(a.alert) || b.cancelRate - a.cancelRate);

    const rentalProfiles = await this.softFetch<
      Array<{ userId?: string; businessName?: string; city?: string; kycStatus?: string }>
    >('ride', '/internal/rental-partners', []).catch(() => []);
    const rentalBookings = await this.softFetch<
      Array<{ ownerUserId?: string; status?: string; createdAt?: string; vehicleOwnerUserId?: string }>
    >('ride', `/internal/rental-inquiries?take=400`, []).catch(() => []);
    const rentalByOwner = new Map<string, { total: number; closed: number; pending: number }>();
    for (const b of Array.isArray(rentalBookings) ? rentalBookings : []) {
      const oid = String(b.ownerUserId ?? b.vehicleOwnerUserId ?? '');
      if (!oid) continue;
      const cur = rentalByOwner.get(oid) ?? { total: 0, closed: 0, pending: 0 };
      cur.total += 1;
      const st = String(b.status ?? '').toUpperCase();
      if (st === 'CLOSED') cur.closed += 1;
      if (st === 'PENDING') cur.pending += 1;
      rentalByOwner.set(oid, cur);
    }
    let rentalPartners = (Array.isArray(rentalProfiles) ? rentalProfiles : []).map((p) => {
      const stats = rentalByOwner.get(String(p.userId ?? '')) ?? { total: 0, closed: 0, pending: 0 };
      const declineRate = stats.total > 0 ? stats.closed / stats.total : 0;
      const alert = declineRate > 0.3 || stats.pending > 5;
      return {
        id: p.userId,
        name: p.businessName ?? 'Loueur',
        kind: 'RENTAL' as const,
        city: p.city ?? null,
        kycStatus: p.kycStatus,
        bookings: stats.total,
        pending: stats.pending,
        closed: stats.closed,
        declineRate: Math.round(declineRate * 1000) / 10,
        alert,
      };
    });
    if (cityQ) {
      rentalPartners = rentalPartners.filter((p) => (p.city ?? '').toLowerCase() === cityQ);
    }
    rentalPartners.sort((a, b) => Number(b.alert) - Number(a.alert) || b.declineRate - a.declineRate);

    return {
      days,
      city: city?.trim() || null,
      partners,
      rentalPartners,
      counts: {
        total: partners.length,
        alerts: partners.filter((p) => p.alert).length,
        rentalTotal: rentalPartners.length,
        rentalAlerts: rentalPartners.filter((p) => p.alert).length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async pnl(days = 30, city?: string | null, range?: { from?: string; to?: string }) {
    const reportDays = Math.min(366, Math.max(1, Math.floor(Number(days)) || 30));
    const params = new URLSearchParams({ days: String(reportDays) });
    if (city?.trim()) params.set('city', city.trim());
    if (range?.from?.trim()) params.set('from', range.from.trim());
    if (range?.to?.trim()) params.set('to', range.to.trim());
    const [reports, wallet] = await Promise.all([
      this.softFetch<{
        kpis?: Record<string, number>;
        commissionsByCity?: Array<Record<string, unknown>>;
        periodDays?: number;
        periodFrom?: string;
        periodTo?: string;
        daily?: unknown[];
      }>('ride', `/internal/rides/reports?${params}`, {}),
      this.softFetch<{ totalBalanceCdf?: number; walletCount?: number }>(
        'payment',
        '/internal/wallets/overview',
        {},
      ),
    ]);
    const kpis = reports.kpis ?? {};
    const revenue = Number(kpis.totalRevenueCdf ?? 0);
    const commission = Number(kpis.totalPlatformCommissionCdf ?? 0);
    const deliveryRev = Number(kpis.deliveryRevenueCdf ?? 0);
    return {
      periodDays: reports.periodDays ?? reportDays,
      periodFrom: reports.periodFrom,
      periodTo: reports.periodTo,
      city: city?.trim() || null,
      revenueCdf: revenue,
      platformCommissionCdf: commission,
      deliveryRevenueCdf: deliveryRev,
      rideRevenueCdf: Math.max(0, revenue - deliveryRev),
      estimatedNetMarginCdf: commission,
      avgTicketCdf: Number(kpis.avgTicketCdf ?? 0),
      completedRides: Number(kpis.completedRides ?? 0),
      cancelledRides: Number(kpis.cancelledRides ?? 0),
      completionRate: Number(kpis.completionRate ?? 0),
      walletBalanceCdf: wallet.totalBalanceCdf ?? 0,
      walletCount: wallet.walletCount ?? 0,
      commissionsByCity: reports.commissionsByCity ?? [],
      daily: reports.daily ?? [],
      generatedAt: new Date().toISOString(),
    };
  }

  async evaluateAlerts(city?: string | null) {
    const cityQ = city?.trim() || '';
    const created: unknown[] = [];
    const inbox = await this.getInbox(cityQ || null);
    if (inbox.counts.sos > 0) {
      created.push(
        await this.createStaffAlert({
          severity: 'CRITICAL',
          title: `${inbox.counts.sos} SOS ouvert(s)`,
          body: 'Des alertes SOS sont ouvertes — traiter immédiatement.',
          city: cityQ || null,
          href: '/litiges',
        }).catch(() => null),
      );
    }
    if (inbox.counts.kyc >= 10) {
      created.push(
        await this.createStaffAlert({
          severity: 'HIGH',
          title: `File KYC : ${inbox.counts.kyc} dossiers`,
          body: 'La file KYC dépasse le seuil (10).',
          city: cityQ || null,
          href: '/kyc',
        }).catch(() => null),
      );
    }
    if (inbox.counts.docs > 0) {
      created.push(
        await this.createStaffAlert({
          severity: 'INFO',
          title: `${inbox.counts.docs} action(s) docs / PIN`,
          body: 'Renouvellements documents ou PIN à transmettre.',
          city: cityQ || null,
          href: '/a-traiter',
        }).catch(() => null),
      );
    }
    const sla = await this.partnerSla(cityQ || null);
    if (sla.counts.alerts > 0) {
      created.push(
        await this.createStaffAlert({
          severity: 'HIGH',
          title: `${sla.counts.alerts} partenaire(s) hors SLA`,
          body: 'Annulations élevées ou note basse.',
          city: cityQ || null,
          href: '/sla-partenaires',
        }).catch(() => null),
      );
    }
    return {
      created: created.filter(Boolean).length,
      inboxCounts: inbox.counts,
      partnerAlerts: sla.counts.alerts,
      generatedAt: new Date().toISOString(),
    };
  }

  async bulkDriverCity(userIds: string[], operatingCity: string, actorUserId: string) {
    const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
    for (const userId of userIds) {
      try {
        await this.fetchJson('driver', `/internal/drivers/${userId}/status`, {
          method: 'PATCH',
          headers: this.jsonHeaders,
          body: JSON.stringify({ operatingCity }),
        });
        results.push({ userId, ok: true });
      } catch (e) {
        results.push({ userId, ok: false, error: e instanceof Error ? e.message : 'échec' });
      }
    }
    await this.writeAudit(actorUserId, 'drivers.bulk_operating_city', 'driver', undefined, {
      operatingCity,
      count: userIds.length,
      ok: results.filter((r) => r.ok).length,
    });
    return { results };
  }

  async bulkKycReview(ids: string[], approved: boolean, notes: string | undefined, actorUserId: string) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        // id may be userId — use driver kyc review by userId path when possible
        await this.fetchJson('driver', `/internal/drivers/${id}/kyc`, {
          method: 'PATCH',
          headers: this.jsonHeaders,
          body: JSON.stringify({ approved, notes }),
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : 'échec' });
      }
    }
    await this.writeAudit(actorUserId, approved ? 'kyc.bulk_approve' : 'kyc.bulk_reject', 'kyc', undefined, {
      count: ids.length,
      ok: results.filter((r) => r.ok).length,
    });
    return { results };
  }

  async bulkSuspendUsers(userIds: string[], actorUserId: string) {
    const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
    for (const userId of userIds) {
      try {
        await this.fetchJson('auth', `/internal/users/${userId}`, {
          method: 'PATCH',
          headers: this.jsonHeaders,
          body: JSON.stringify({ status: 'SUSPENDED' }),
        });
        results.push({ userId, ok: true });
      } catch (e) {
        results.push({ userId, ok: false, error: e instanceof Error ? e.message : 'échec' });
      }
    }
    await this.writeAudit(actorUserId, 'users.bulk_suspend', 'user', undefined, {
      count: userIds.length,
      ok: results.filter((r) => r.ok).length,
    });
    return { results };
  }
}
