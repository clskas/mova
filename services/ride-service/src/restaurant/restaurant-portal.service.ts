import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, PartnerKycStatus, Prisma } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import {
  fetchPartnerWallet,
  fetchPartnerCashVirtual,
  filterPartnerTransactions,
  startOfDay,
  startOfMonth,
  sumTransactionAmounts,
} from '../common/partner-wallet.util';
import { PrismaService } from '../prisma/prisma.service';
import { formatParcelDelivery } from '../deliveries/parcel.util';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { UploadsService } from '../uploads/uploads.service';
import { PartnerKycService } from '../partner-kyc/partner-kyc.service';
import { UpdateRestaurantLocationDto, UpdateRestaurantMenuDto } from './restaurant-portal.dto';
import {
  assertRestaurantProfileComplete,
  parseCommerceType,
  restaurantNeedsProfileSetup,
} from './restaurant-profile.util';
import { fetchServicePaymentStatuses } from '../common/payment-status.util';
import { refundEscrow } from '../common/escrow.util';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { computeRestaurantPartnerDisplay } from '../billing/partner-display.util';
import { parseOrderPlacedMetadata } from '../deliveries/food-delivery-settlement.util';
import { normalizeMenuCatalogInput, parseMenuCatalog } from './menu-catalog.util';

@Injectable()
export class RestaurantPortalService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private uploads: UploadsService,
    private partnerBilling: PartnerBillingService,
    private deliveries: DeliveriesService,
    private partnerKyc: PartnerKycService,
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
    const dossier = await this.partnerKyc.getRestaurantDossier(ownerUserId);
    return {
      id: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      address: restaurant.address,
      lat: restaurant.lat,
      lng: restaurant.lng,
      rating: restaurant.rating,
      isAcceptingOrders: restaurant.isAcceptingOrders && dossier.canOperate,
      prepTimeMin: restaurant.prepTimeMin,
      promotionLabel: restaurant.promotionLabel,
      menuItems: restaurant.menuItems ?? [],
      courierMode: 'PLATFORM' as const,
      commerceType: restaurant.commerceType ?? 'RESTAURANT',
      kycStatus: restaurant.kycStatus,
      canOperate: dossier.canOperate,
      documentsRequiredForJobs: dossier.documentsRequiredForJobs,
      documentsJobsGateOk: dossier.documentsJobsGateOk,
      documentsReminder: dossier.documentsReminder,
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
    const method = String(payment?.paymentMethod ?? '').trim().toUpperCase();
    const isCash =
      opts?.guaranteed === false ||
      method === 'CASH' ||
      method === 'COD' ||
      method === 'ESPECES' ||
      method === 'ESPÈCES';

    if (payment?.isPaid || opts?.escrowReady) {
      return isCash ? 'Espèces confirmées' : 'Séquestrée — paiement garanti';
    }

    // COD / cash : paiement à la remise — le resto peut préparer tout de suite.
    if (isCash) {
      if (status === DeliveryStatus.DELIVERED) {
        return payment?.paymentStatus === 'PENDING' ? 'Espèces en attente (à la remise)' : 'Espèces à régulariser';
      }
      return 'Espèces à la livraison';
    }

    if (status === DeliveryStatus.PENDING) return 'Non payée — acceptez pour demander le paiement';
    if (status === DeliveryStatus.RESTAURANT_CONFIRMED) return 'En attente du paiement client';
    if (status !== DeliveryStatus.DELIVERED) return 'En attente de paiement client';
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
    const guaranteed = Boolean(d.guaranteed);
    const escrowReady = Boolean(d.escrowReady);
    const isPaid = payment?.isPaid ?? escrowReady;
    const canPrepare = !guaranteed || isPaid || escrowReady;
    return {
      id: d.id,
      status: d.status,
      statusLabel: this.statusLabel(d.status, { guaranteed, escrowReady }),
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
      isPaid,
      paymentStatus: payment?.paymentStatus ?? null,
      paymentMethod: payment?.paymentMethod ?? null,
      paymentStatusLabel: this.paymentStatusLabel(d.status, payment, {
        guaranteed,
        escrowReady,
      }),
      guaranteed,
      escrowReady,
      canPrepare,
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
    const [wallet, cashVirtual, delivered] = await Promise.all([
      fetchPartnerWallet(ownerUserId),
      fetchPartnerCashVirtual(ownerUserId),
      this.prisma.delivery.findMany({
        where: {
          type: DeliveryType.FOOD,
          status: DeliveryStatus.DELIVERED,
          restaurantId: restaurant.id,
        },
        include: { events: { orderBy: { createdAt: 'asc' } } },
        take: 500,
        orderBy: { deliveredAt: 'desc' },
      }),
    ]);
    const foodCredits = filterPartnerTransactions(wallet.transactions, 'Vente repas');

    let salesNetCdf = 0;
    let deliveryFeeCdf = 0;
    for (const d of delivered) {
      const amounts = computeRestaurantPartnerDisplay({
        items: d.items,
        restaurantId: restaurant.id,
        events: d.events,
        deliveryDiscountCdf: d.discountCdf,
        deliveryPromoCode: d.promoCode,
      });
      salesNetCdf += amounts.partnerNetCdf;
      const meta = parseOrderPlacedMetadata(d.events);
      deliveryFeeCdf += Math.round(meta?.deliveryFeeCdf ?? 0);
    }

    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      balanceCdf: wallet.balanceCdf,
      formattedBalance: wallet.formattedBalance,
      walletAvailable: wallet.available,
      walletMessage: wallet.unavailableReason,
      withdrawableCdf: cashVirtual.withdrawableCdf ?? wallet.balanceCdf,
      cashEarningsCdf: cashVirtual.cashEarningsCdf,
      salesNetCdf,
      deliveryFeeCdf,
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
    let payload: {
      name?: string;
      cuisine?: string;
      address?: string;
      lat?: number;
      lng?: number;
      commerceType?: ReturnType<typeof parseCommerceType>;
    };

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
          err instanceof Error ? err.message : 'Informations magasin incomplètes.',
        );
      }
      if (dto.commerceType != null) {
        payload.commerceType = parseCommerceType(dto.commerceType);
      } else if (!restaurant.commerceType) {
        payload.commerceType = 'RESTAURANT';
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
        ...(dto.commerceType != null ? { commerceType: parseCommerceType(dto.commerceType) } : {}),
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
      commerceType: updated.commerceType ?? 'RESTAURANT',
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
    if (dto.isAcceptingOrders === true) {
      const dossier = await this.partnerKyc.getRestaurantDossier(ownerUserId);
      if (!dossier.canOperate) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          'Documents requis par SENGA : déposez et faites valider les justificatifs pour accepter des commandes.',
        );
      }
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
    const mode = (courierMode ?? '').toUpperCase();
    if (mode !== 'PLATFORM') {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Les livraisons sont assurées uniquement par les livreurs SENGA. Le mode flotte partenaire n\'est plus disponible.',
      );
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { courierMode: 'PLATFORM' },
    });
    return { id: updated.id, courierMode: updated.courierMode };
  }

  async listDrivers(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    return {
      restaurantId: restaurant.id,
      courierMode: 'PLATFORM' as const,
      drivers: [] as {
        id: string;
        driverUserId: string;
        isActive: boolean;
        phone?: string;
        name?: string;
      }[],
    };
  }

  async addDriver(_ownerUserId: string, _dto: { driverUserId?: string; phone?: string }) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Vous ne pouvez plus ajouter de livreurs internes. SENGA gère toutes les livraisons.',
    );
  }

  async removeDriver(_ownerUserId: string, _driverUserId: string) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Vous ne pouvez plus retirer de livreurs internes. SENGA gère toutes les livraisons.',
    );
  }

  async assignOwnDriver(_deliveryId: string, _ownerUserId: string, _driverUserId: string) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Vous ne pouvez plus assigner un livreur interne. Un livreur SENGA prendra la commande.',
    );
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
