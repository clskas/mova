import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, PartnerKycStatus, Prisma } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  INTERNAL_API_KEY,
  serviceUrl,
  UserRole,
  normalizePhoneRdc,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import {
  fetchPartnerWallet,
  filterPartnerTransactions,
  startOfDay,
  startOfMonth,
  sumTransactionAmounts,
} from '../common/partner-wallet.util';
import { PrismaService } from '../prisma/prisma.service';
import { formatParcelDelivery } from '../deliveries/parcel.util';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { UploadsService } from '../uploads/uploads.service';
import { UpdateRestaurantLocationDto, UpdateRestaurantMenuDto } from './restaurant-portal.dto';
import {
  assertRestaurantProfileComplete,
  restaurantNeedsProfileSetup,
} from './restaurant-profile.util';
import { fetchServicePaymentStatuses } from '../common/payment-status.util';
import { refundEscrow } from '../common/escrow.util';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { computeRestaurantPartnerDisplay } from '../billing/partner-display.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { normalizeMenuCatalogInput, parseMenuCatalog } from './menu-catalog.util';

@Injectable()
export class RestaurantPortalService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private uploads: UploadsService,
    private partnerBilling: PartnerBillingService,
    private deliveries: DeliveriesService,
  ) {}

  async getEarningsReport(
    ownerUserId: string,
    query?: { from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    return this.partnerBilling.getPartnerEarningsReport(ownerUserId, 'restaurant', restaurant.name, query);
  }

  async getEarningsReportCsv(ownerUserId: string, query?: { from?: string; to?: string; q?: string }) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const report = await this.partnerBilling.getPartnerEarningsReport(ownerUserId, 'restaurant', restaurant.name, {
      ...query,
      take: 500,
    });
    return this.partnerBilling.buildPartnerStatementCsv('restaurant', restaurant.name, report);
  }

  async getEarningsReportPdf(ownerUserId: string, query?: { from?: string; to?: string; q?: string }) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const { buffer, filename } = await this.partnerBilling.getPartnerStatementPdf(
      ownerUserId,
      'restaurant',
      restaurant.name,
      query,
    );
    return { buffer, filename };
  }

  async getRestaurantForOwner(ownerUserId: string) {
    return this.ensureRestaurantForOwner(ownerUserId);
  }

  private assertRestaurantKycApproved(restaurant: { kycStatus?: string | null }) {
    if (restaurant.kycStatus !== PartnerKycStatus.APPROVED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Votre compte doit être validé avant de publier le menu.',
      );
    }
  }

  async ensureRestaurantForOwner(ownerUserId: string, name?: string) {
    return this.deliveries.ensureRestaurantForOwner(ownerUserId, name);
  }

  async getProfile(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    return {
      id: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      address: restaurant.address,
      lat: restaurant.lat,
      lng: restaurant.lng,
      rating: restaurant.rating,
      isAcceptingOrders: restaurant.isAcceptingOrders,
      prepTimeMin: restaurant.prepTimeMin,
      promotionLabel: restaurant.promotionLabel,
      menuItems: restaurant.menuItems ?? [],
      courierMode: restaurant.courierMode ?? 'PLATFORM',
      commerceType: restaurant.commerceType ?? 'RESTAURANT',
      kycStatus: restaurant.kycStatus,
      canOperate: restaurant.kycStatus === 'APPROVED',
      needsProfileSetup: restaurantNeedsProfileSetup(restaurant),
    };
  }

  private deliveryIncludesRestaurant(items: unknown, restaurantId: string): boolean {
    if (!Array.isArray(items)) return false;
    return items.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as { restaurantId?: string };
      return row.restaurantId === restaurantId;
    });
  }

  private orderItemsForRestaurant(items: unknown, restaurantId: string) {
    if (!Array.isArray(items)) return items;
    const multi = this.deliveryIncludesRestaurant(items, restaurantId);
    if (!multi) return items;
    const block = items.find(
      (entry) => entry && typeof entry === 'object' && (entry as { restaurantId?: string }).restaurantId === restaurantId,
    ) as { items?: unknown } | undefined;
    return block?.items ?? items;
  }

  async listOrders(
    ownerUserId: string,
    query?: { status?: string; from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const statusParam = query?.status;
    const statuses = statusParam
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      : [
          DeliveryStatus.PENDING,
          DeliveryStatus.RESTAURANT_CONFIRMED,
          DeliveryStatus.READY_FOR_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
        ];
    const from = query?.from ? new Date(query.from) : undefined;
    const to = query?.to ? new Date(query.to) : undefined;
    const q = query?.q?.trim().toLowerCase();
    const skip = Math.max(query?.skip ?? 0, 0);
    const take = Math.min(Math.max(query?.take ?? 50, 1), 100);

    const rows = await this.prisma.delivery.findMany({
      where: {
        type: DeliveryType.FOOD,
        status: { in: statuses as DeliveryStatus[] },
        OR: [{ restaurantId: restaurant.id }, { restaurantId: null }],
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    let scoped = rows.filter(
      (d) => d.restaurantId === restaurant.id || this.deliveryIncludesRestaurant(d.items, restaurant.id),
    );
    if (q) {
      scoped = scoped.filter((d) => {
        const hay = `${d.id} ${d.deliveryAddress ?? ''} ${JSON.stringify(d.items ?? '')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const total = scoped.length;
    const page = scoped.slice(skip, skip + take);
    const paymentStatuses = await fetchServicePaymentStatuses(
      'DELIVERY',
      page.map((d) => d.id),
    );
    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      orders: page.map((d) => this.formatOrder(d, restaurant.id, paymentStatuses[d.id])),
      pagination: { skip, take, total },
    };
  }

  private paymentStatusLabel(
    status: DeliveryStatus,
    payment?: { isPaid?: boolean; paymentStatus?: string | null; paymentMethod?: string | null },
    opts?: { guaranteed?: boolean; escrowReady?: boolean },
  ): string | null {
    if (payment?.isPaid || opts?.escrowReady) return 'Séquestrée — paiement garanti';
    if (status === DeliveryStatus.PENDING) return 'Non payée — acceptez pour demander le paiement';
    if (status === DeliveryStatus.RESTAURANT_CONFIRMED) return 'En attente du paiement client';
    if (status !== DeliveryStatus.DELIVERED) return 'En attente de paiement client';
    if (payment?.paymentStatus === 'PENDING' && payment?.paymentMethod === 'CASH') return 'Espèces en attente';
    return 'En attente de paiement';
  }

  private formatOrder(
    d: {
    id: string;
    status: DeliveryStatus;
    items: unknown;
    deliveryAddress: string | null;
    estimatedPriceCdf: number;
    discountCdf?: number | null;
    promoCode?: string | null;
    createdAt: Date;
    driverId: string | null;
    restaurantId?: string | null;
    guaranteed?: boolean;
    escrowReady?: boolean;
    events?: { event: string; metadata: unknown }[];
  },
    restaurantId?: string,
    payment?: { isPaid?: boolean; paymentStatus?: string | null; paymentMethod?: string | null },
  ) {
    const items = restaurantId ? this.orderItemsForRestaurant(d.items, restaurantId) : d.items;
    const amounts = computeRestaurantPartnerDisplay({
      items: d.items,
      restaurantId,
      events: d.events,
      deliveryDiscountCdf: d.discountCdf,
      deliveryPromoCode: d.promoCode,
    });
    return {
      id: d.id,
      status: d.status,
      statusLabel: this.statusLabel(d.status, { guaranteed: Boolean(d.guaranteed), escrowReady: Boolean(d.escrowReady) }),
      items,
      deliveryAddress: d.deliveryAddress,
      estimatedPriceCdf: d.estimatedPriceCdf,
      itemsSubtotalCdf: amounts.itemsSubtotalCdf,
      partnerNetCdf: amounts.partnerNetCdf,
      partnerDiscountCdf: amounts.partnerDiscountCdf,
      promoCode: amounts.promoCode,
      createdAt: d.createdAt.toISOString(),
      driverAssigned: Boolean(d.driverId),
      multiRestaurant: Boolean(restaurantId && !d.restaurantId && this.deliveryIncludesRestaurant(d.items, restaurantId)),
      isPaid: payment?.isPaid ?? Boolean(d.escrowReady),
      paymentStatus: payment?.paymentStatus ?? null,
      paymentMethod: payment?.paymentMethod ?? null,
      paymentStatusLabel: this.paymentStatusLabel(d.status, payment, {
        guaranteed: Boolean(d.guaranteed),
        escrowReady: Boolean(d.escrowReady),
      }),
      guaranteed: Boolean(d.guaranteed),
      escrowReady: Boolean(d.escrowReady),
    };
  }

  private statusLabel(status: DeliveryStatus, opts?: { guaranteed?: boolean; escrowReady?: boolean }): string {
    if (status === DeliveryStatus.PENDING) return 'Nouvelle commande';
    if (status === DeliveryStatus.RESTAURANT_CONFIRMED) {
      if (opts?.guaranteed && !opts.escrowReady) return 'Acceptée — en attente paiement';
      return 'En préparation';
    }
    return (
      {
        [DeliveryStatus.READY_FOR_PICKUP]: 'Prête pour livreur',
        [DeliveryStatus.PICKED_UP]: 'Livreur assigné',
        [DeliveryStatus.IN_TRANSIT]: 'En livraison',
        [DeliveryStatus.DELIVERED]: 'Livrée',
        [DeliveryStatus.CANCELLED]: 'Annulée',
      }[status] ?? status
    );
  }

  private async assertOrderAccess(deliveryId: string, ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery || delivery.type !== DeliveryType.FOOD) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const ownsOrder =
      delivery.restaurantId === restaurant.id || this.deliveryIncludesRestaurant(delivery.items, restaurant.id);
    if (!ownsOrder) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return { delivery, restaurant };
  }

  async confirmOrder(deliveryId: string, ownerUserId: string) {
    const { delivery, restaurant } = await this.assertOrderAccess(deliveryId, ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    return this.transition(delivery.id, DeliveryStatus.RESTAURANT_CONFIRMED, ownerUserId, 'RESTAURANT_CONFIRMED');
  }

  async markReady(deliveryId: string, ownerUserId: string) {
    const { delivery, restaurant } = await this.assertOrderAccess(deliveryId, ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    if (delivery.status !== DeliveryStatus.RESTAURANT_CONFIRMED) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    if (delivery.guaranteed && !delivery.escrowReady) {
      throw new MovaHttpException(
        MovaErrorCode.DELIVERY_ESCROW_REQUIRED,
        HttpStatus.CONFLICT,
        'Attendez le paiement du client avant de préparer et marquer la commande prête.',
      );
    }
    return this.transition(delivery.id, DeliveryStatus.READY_FOR_PICKUP, ownerUserId, 'READY_FOR_PICKUP');
  }

  async rejectOrder(deliveryId: string, ownerUserId: string, reason?: string) {
    const { delivery } = await this.assertOrderAccess(deliveryId, ownerUserId);
    if (delivery.status !== DeliveryStatus.PENDING && delivery.status !== DeliveryStatus.RESTAURANT_CONFIRMED) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.CANCELLED, cancelledAt: new Date() },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId,
        event: 'CANCELLED',
        metadata: { updatedBy: ownerUserId, reason: reason ?? 'Refus restaurant' } as Prisma.InputJsonValue,
      },
    });
    if (delivery.guaranteed && delivery.escrowReady) {
      await refundEscrow('DELIVERY', deliveryId, 'Refus restaurant — remboursement intégral avant enlèvement.').catch(
        () => undefined,
      );
    }
    await this.publishStatus(updated, DeliveryStatus.CANCELLED);
    return { order: this.formatOrder(updated), delivery: formatParcelDelivery(updated) };
  }

  async getDashboard(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const todayStart = startOfDay();
    const monthStart = startOfMonth();
    const [pendingOrders, activeOrders, deliveredToday, wallet] = await Promise.all([
      this.prisma.delivery.count({
        where: {
          type: DeliveryType.FOOD,
          status: DeliveryStatus.PENDING,
          AND: [{ OR: [{ restaurantId: restaurant.id }, { restaurantId: null }] }],
        },
      }),
      this.prisma.delivery.count({
        where: {
          type: DeliveryType.FOOD,
          status: {
            in: [
              DeliveryStatus.RESTAURANT_CONFIRMED,
              DeliveryStatus.READY_FOR_PICKUP,
              DeliveryStatus.PICKED_UP,
              DeliveryStatus.IN_TRANSIT,
            ],
          },
          AND: [{ OR: [{ restaurantId: restaurant.id }, { restaurantId: null }] }],
        },
      }),
      this.prisma.delivery.findMany({
        where: {
          type: DeliveryType.FOOD,
          status: DeliveryStatus.DELIVERED,
          restaurantId: restaurant.id,
          createdAt: { gte: todayStart },
        },
        select: { finalPriceCdf: true, estimatedPriceCdf: true },
      }),
      fetchPartnerWallet(ownerUserId),
    ]);
    const foodCredits = filterPartnerTransactions(wallet.transactions, 'Vente repas');
    const revenueTodayCdf = sumTransactionAmounts(
      filterPartnerTransactions(wallet.transactions, 'Vente repas', { from: todayStart }),
    );
    const revenueMonthCdf = sumTransactionAmounts(
      filterPartnerTransactions(wallet.transactions, 'Vente repas', { from: monthStart }),
    );
    const recent = await this.listOrders(ownerUserId, { take: 5 });
    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        isAcceptingOrders: restaurant.isAcceptingOrders,
        prepTimeMin: restaurant.prepTimeMin,
        commerceType: restaurant.commerceType ?? 'RESTAURANT',
      },
      kpis: {
        pendingOrders,
        activeOrders,
        deliveredTodayCount: deliveredToday.length,
        deliveredTodayGrossCdf: deliveredToday.reduce(
          (s, d) => s + (d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0),
          0,
        ),
        balanceCdf: wallet.balanceCdf,
        formattedBalance: wallet.formattedBalance,
        walletAvailable: wallet.available,
        walletMessage: wallet.unavailableReason,
        revenueTodayCdf,
        revenueMonthCdf,
        totalSalesCount: foodCredits.length,
      },
      recentOrders: recent.orders,
    };
  }

  async getEarnings(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const wallet = await fetchPartnerWallet(ownerUserId);
    const foodCredits = filterPartnerTransactions(wallet.transactions, 'Vente repas');
    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      balanceCdf: wallet.balanceCdf,
      formattedBalance: wallet.formattedBalance,
      walletAvailable: wallet.available,
      walletMessage: wallet.unavailableReason,
      recentFoodSales: foodCredits.slice(0, 20).map((tx) => ({
        id: tx.id,
        amountCdf: tx.amountCdf,
        description: tx.description,
        reference: tx.reference,
        createdAt: tx.createdAt,
      })),
    };
  }

  async getMenu(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const catalog = parseMenuCatalog(restaurant.menuItems);
    return {
      restaurantId: restaurant.id,
      categories: catalog.categories,
      menuItems: catalog.items,
      catalog,
    };
  }

  async uploadMenuPhoto(ownerUserId: string, imageBase64: string, mimeType?: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    return this.uploads.uploadMenuPhoto(imageBase64, mimeType);
  }

  async updateLocation(ownerUserId: string, dto: UpdateRestaurantLocationDto) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    let payload: { name?: string; cuisine?: string; address?: string; lat?: number; lng?: number };

    if (dto.completeSetup) {
      try {
        payload = assertRestaurantProfileComplete({
          name: dto.name ?? restaurant.name,
          cuisine: dto.cuisine ?? restaurant.cuisine,
          address: dto.address ?? restaurant.address,
          lat: dto.lat ?? restaurant.lat,
          lng: dto.lng ?? restaurant.lng,
        });
      } catch (err) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          err instanceof Error ? err.message : 'Informations restaurant incomplètes.',
        );
      }
    } else {
      if (dto.lat != null && (dto.lat < -90 || dto.lat > 90)) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Latitude invalide.');
      }
      if (dto.lng != null && (dto.lng < -180 || dto.lng > 180)) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Longitude invalide.');
      }
      payload = {
        ...(dto.name !== undefined ? { name: dto.name.trim() || restaurant.name } : {}),
        ...(dto.cuisine !== undefined ? { cuisine: dto.cuisine.trim() || restaurant.cuisine } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || restaurant.address } : {}),
        ...(dto.lat != null ? { lat: dto.lat } : {}),
        ...(dto.lng != null ? { lng: dto.lng } : {}),
      };
    }

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: payload,
    });
    return {
      id: updated.id,
      name: updated.name,
      cuisine: updated.cuisine,
      address: updated.address,
      lat: updated.lat,
      lng: updated.lng,
      needsProfileSetup: restaurantNeedsProfileSetup(updated),
    };
  }

  async updateMenu(ownerUserId: string, dto: UpdateRestaurantMenuDto) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    if (
      dto.menuItems != null ||
      dto.categories != null ||
      dto.isAcceptingOrders === true ||
      dto.promotionLabel !== undefined ||
      dto.prepTimeMin !== undefined
    ) {
      this.assertRestaurantKycApproved(restaurant);
    }
    let menuItems: Prisma.InputJsonValue | undefined;
    let catalog = parseMenuCatalog(restaurant.menuItems);
    if (dto.menuItems != null || dto.categories != null) {
      try {
        const normalized = normalizeMenuCatalogInput({
          menuItems: dto.menuItems,
          categories: dto.categories,
        });
        menuItems = normalized.stored as unknown as Prisma.InputJsonValue;
        catalog = { categories: normalized.categories, items: normalized.items };
      } catch (err) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          err instanceof Error ? err.message : 'Catalogue invalide.',
        );
      }
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(menuItems != null ? { menuItems } : {}),
        ...(dto.promotionLabel !== undefined ? { promotionLabel: dto.promotionLabel } : {}),
        ...(dto.isAcceptingOrders !== undefined ? { isAcceptingOrders: dto.isAcceptingOrders } : {}),
        ...(dto.prepTimeMin !== undefined ? { prepTimeMin: dto.prepTimeMin } : {}),
      },
    });
    const saved = menuItems != null ? catalog : parseMenuCatalog(updated.menuItems);
    return {
      id: updated.id,
      categories: saved.categories,
      menuItems: saved.items,
      catalog: saved,
      promotionLabel: updated.promotionLabel,
      isAcceptingOrders: updated.isAcceptingOrders,
      prepTimeMin: updated.prepTimeMin,
    };
  }

  private async transition(deliveryId: string, status: DeliveryStatus, ownerUserId: string, event: string) {
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId, event, metadata: { updatedBy: ownerUserId } as Prisma.InputJsonValue },
    });
    await this.publishStatus(updated, status);
    if (status === DeliveryStatus.READY_FOR_PICKUP && !updated.driverId && updated.escrowReady) {
      await this.deliveries.dispatchDeliveryOffer(updated.id);
    }
    return { order: this.formatOrder(updated), delivery: formatParcelDelivery(updated) };
  }

  async updateCourierMode(ownerUserId: string, courierMode: 'PLATFORM' | 'OWN' | 'HYBRID') {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    const mode = courierMode.toUpperCase();
    if (!['PLATFORM', 'OWN', 'HYBRID'].includes(mode)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Mode livreurs invalide.');
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { courierMode: mode as 'PLATFORM' | 'OWN' | 'HYBRID' },
    });
    return { id: updated.id, courierMode: updated.courierMode };
  }

  async listDrivers(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const rows = await this.prisma.restaurantDriver.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'asc' },
    });
    const drivers = await Promise.all(
      rows.map(async (r) => {
        const brief = await fetchAuthUserBrief(r.driverUserId);
        return {
          id: r.id,
          driverUserId: r.driverUserId,
          isActive: r.isActive,
          phone: brief?.phone,
          name: brief?.name,
        };
      }),
    );
    return {
      restaurantId: restaurant.id,
      courierMode: restaurant.courierMode,
      drivers,
    };
  }

  async addDriver(ownerUserId: string, dto: { driverUserId?: string; phone?: string }) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    const driver = await this.resolveSengaDriverAccount(dto);
    if (!driver) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Aucun livreur SENGA pour ce numéro. La personne doit déjà avoir un compte livreur dans l\'application SENGA.',
      );
    }
    const row = await this.prisma.restaurantDriver.upsert({
      where: { restaurantId_driverUserId: { restaurantId: restaurant.id, driverUserId: driver.id } },
      create: { restaurantId: restaurant.id, driverUserId: driver.id, isActive: true },
      update: { isActive: true },
    });
    return {
      id: row.id,
      driverUserId: row.driverUserId,
      isActive: row.isActive,
      phone: driver.phone,
      name: driver.name,
    };
  }

  private async resolveSengaDriverAccount(dto: { driverUserId?: string; phone?: string }) {
    const directId = dto.driverUserId?.trim();
    if (directId) {
      return this.loadSengaDriverAccount(directId);
    }
    const rawPhone = dto.phone?.trim();
    if (!rawPhone) return null;
    const normalized = normalizePhoneRdc(rawPhone);
    try {
      const res = await fetch(
        serviceUrl('auth', `/internal/users?search=${encodeURIComponent(normalized || rawPhone)}&take=5`),
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      const body = (await res.json()) as {
        data?: { id: string; role?: string; phone?: string; firstName?: string; lastName?: string }[];
      };
      const rows = body.data ?? [];
      const match =
        rows.find((u) => normalizePhoneRdc(u.phone ?? '') === normalized) ??
        rows.find((u) => u.role === UserRole.DRIVER) ??
        rows[0];
      if (!match?.id) return null;
      return this.loadSengaDriverAccount(match.id, match);
    } catch {
      return null;
    }
  }

  private async loadSengaDriverAccount(
    userId: string,
    hint?: { role?: string; phone?: string; firstName?: string; lastName?: string },
  ) {
    let role = hint?.role;
    let phone = hint?.phone;
    let firstName = hint?.firstName;
    let lastName = hint?.lastName;
    if (!role || !phone) {
      try {
        const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        });
        if (!res.ok) return null;
        const user = (await res.json()) as {
          role?: string;
          phone?: string;
          firstName?: string;
          lastName?: string;
        };
        role = user.role ?? role;
        phone = user.phone ?? phone;
        firstName = user.firstName ?? firstName;
        lastName = user.lastName ?? lastName;
      } catch {
        return null;
      }
    }
    if (role !== UserRole.DRIVER) return null;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    return { id: userId, phone, name: name || undefined };
  }

  async removeDriver(ownerUserId: string, driverUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    await this.prisma.restaurantDriver.deleteMany({
      where: { restaurantId: restaurant.id, driverUserId },
    });
    return { removed: true };
  }

  async assignOwnDriver(deliveryId: string, ownerUserId: string, driverUserId: string) {
    const { delivery, restaurant } = await this.assertOrderAccess(deliveryId, ownerUserId);
    this.assertRestaurantKycApproved(restaurant);
    if (delivery.guaranteed && !delivery.escrowReady) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_ESCROW_REQUIRED);
    }
    const fleet = await this.prisma.restaurantDriver.findUnique({
      where: { restaurantId_driverUserId: { restaurantId: restaurant.id, driverUserId } },
    });
    if (!fleet?.isActive) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Ce livreur n\'est pas dans votre flotte. Ajoutez-le dans Paramètres.',
      );
    }
    return this.deliveries.acceptDelivery(deliveryId, driverUserId);
  }

  private async publishStatus(
    delivery: { id: string; userId: string; type: DeliveryType; restaurant?: { name: string; ownerUserId?: string | null } | null },
    status: DeliveryStatus,
  ) {
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: delivery.id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: delivery.restaurant?.name,
      restaurantOwnerUserId: delivery.restaurant?.ownerUserId ?? undefined,
    });
  }
}
