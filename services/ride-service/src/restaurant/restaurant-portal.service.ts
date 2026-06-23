import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma } from '@prisma/client';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { formatParcelDelivery } from '../deliveries/parcel.util';
import { UploadsService } from '../uploads/uploads.service';
import { MenuItemDto, UpdateRestaurantLocationDto, UpdateRestaurantMenuDto } from './restaurant-portal.dto';
import { MatchingService } from '../matching/matching.service';
import { notifyNearbyDrivers } from '../common/driver-job-alert.util';

type StoredMenuItem = {
  name: string;
  unitPriceCdf: number;
  imageUrl?: string;
  description?: string;
  isAvailable?: boolean;
};

@Injectable()
export class RestaurantPortalService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private uploads: UploadsService,
    private matching: MatchingService,
  ) {}

  async getRestaurantForOwner(ownerUserId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { ownerUserId, isActive: true },
    });
    if (!restaurant) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Aucun restaurant lié à ce compte.');
    }
    return restaurant;
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
    };
  }

  async listOrders(ownerUserId: string, status?: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const statuses = status
      ? status.split(',').map((s) => s.trim()).filter(Boolean)
      : [
          DeliveryStatus.PENDING,
          DeliveryStatus.RESTAURANT_CONFIRMED,
          DeliveryStatus.READY_FOR_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
        ];
    const rows = await this.prisma.delivery.findMany({
      where: {
        restaurantId: restaurant.id,
        type: DeliveryType.FOOD,
        status: { in: statuses as DeliveryStatus[] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      orders: rows.map((d) => this.formatOrder(d)),
    };
  }

  private formatOrder(d: {
    id: string;
    status: DeliveryStatus;
    items: unknown;
    deliveryAddress: string | null;
    estimatedPriceCdf: number;
    createdAt: Date;
    driverId: string | null;
  }) {
    return {
      id: d.id,
      status: d.status,
      statusLabel: this.statusLabel(d.status),
      items: d.items,
      deliveryAddress: d.deliveryAddress,
      estimatedPriceCdf: d.estimatedPriceCdf,
      createdAt: d.createdAt.toISOString(),
      driverAssigned: Boolean(d.driverId),
    };
  }

  private statusLabel(status: DeliveryStatus): string {
    return (
      {
        [DeliveryStatus.PENDING]: 'Nouvelle commande',
        [DeliveryStatus.RESTAURANT_CONFIRMED]: 'En préparation',
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
    if (!delivery || delivery.restaurantId !== restaurant.id) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (delivery.type !== DeliveryType.FOOD) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Commande repas uniquement.');
    }
    return { delivery, restaurant };
  }

  async confirmOrder(deliveryId: string, ownerUserId: string) {
    const { delivery } = await this.assertOrderAccess(deliveryId, ownerUserId);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    return this.transition(delivery.id, DeliveryStatus.RESTAURANT_CONFIRMED, ownerUserId, 'RESTAURANT_CONFIRMED');
  }

  async markReady(deliveryId: string, ownerUserId: string) {
    const { delivery } = await this.assertOrderAccess(deliveryId, ownerUserId);
    if (delivery.status !== DeliveryStatus.RESTAURANT_CONFIRMED) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
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
    await this.publishStatus(updated, DeliveryStatus.CANCELLED);
    return { order: this.formatOrder(updated), delivery: formatParcelDelivery(updated) };
  }

  async getMenu(ownerUserId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const items = this.parseMenuItems(restaurant.menuItems);
    return { restaurantId: restaurant.id, menuItems: items };
  }

  async uploadMenuPhoto(ownerUserId: string, imageBase64: string, mimeType?: string) {
    await this.getRestaurantForOwner(ownerUserId);
    return this.uploads.uploadMenuPhoto(imageBase64, mimeType);
  }

  private parseMenuItems(raw: unknown): StoredMenuItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as Record<string, unknown>;
        const name = String(row.name ?? '').trim();
        const price = Number(row.unitPriceCdf ?? row.priceCdf ?? 0);
        if (!name || !Number.isFinite(price) || price <= 0) return null;
        const item: StoredMenuItem = {
          name,
          unitPriceCdf: Math.round(price),
          isAvailable: row.isAvailable !== false,
        };
        if (row.imageUrl) item.imageUrl = String(row.imageUrl);
        if (row.description) item.description = String(row.description);
        return item;
      })
      .filter((x): x is StoredMenuItem => x !== null);
  }

  private normalizeMenuItems(items: MenuItemDto[]): StoredMenuItem[] {
    const seen = new Set<string>();
    const normalized: StoredMenuItem[] = [];
    for (const item of items) {
      const name = item.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        name,
        unitPriceCdf: Math.round(item.unitPriceCdf),
        ...(item.imageUrl?.trim() ? { imageUrl: item.imageUrl.trim() } : {}),
        ...(item.description?.trim() ? { description: item.description.trim() } : {}),
        isAvailable: item.isAvailable !== false,
      });
    }
    if (!normalized.length) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ajoutez au moins un plat au menu.');
    }
    return normalized;
  }

  async updateLocation(ownerUserId: string, dto: UpdateRestaurantLocationDto) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    if (dto.lat != null && (dto.lat < -90 || dto.lat > 90)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Latitude invalide.');
    }
    if (dto.lng != null && (dto.lng < -180 || dto.lng > 180)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Longitude invalide.');
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(dto.address !== undefined ? { address: dto.address.trim() || restaurant.address } : {}),
        ...(dto.lat != null ? { lat: dto.lat } : {}),
        ...(dto.lng != null ? { lng: dto.lng } : {}),
      },
    });
    return {
      id: updated.id,
      address: updated.address,
      lat: updated.lat,
      lng: updated.lng,
    };
  }

  async updateMenu(ownerUserId: string, dto: UpdateRestaurantMenuDto) {
    const restaurant = await this.getRestaurantForOwner(ownerUserId);
    const menuItems =
      dto.menuItems != null ? this.normalizeMenuItems(dto.menuItems) : undefined;
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(menuItems != null ? { menuItems: menuItems as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.promotionLabel !== undefined ? { promotionLabel: dto.promotionLabel } : {}),
        ...(dto.isAcceptingOrders !== undefined ? { isAcceptingOrders: dto.isAcceptingOrders } : {}),
        ...(dto.prepTimeMin !== undefined ? { prepTimeMin: dto.prepTimeMin } : {}),
      },
    });
    return {
      id: updated.id,
      menuItems: updated.menuItems ?? [],
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
    if (status === DeliveryStatus.READY_FOR_PICKUP && !updated.driverId) {
      const pickupLat = updated.pickupLat ?? updated.restaurant?.lat;
      const pickupLng = updated.pickupLng ?? updated.restaurant?.lng;
      if (pickupLat != null && pickupLng != null) {
        const pickup = updated.pickupAddress?.trim() || updated.restaurant?.address?.trim() || updated.restaurant?.name?.trim() || 'près de vous';
        await notifyNearbyDrivers(this.redis, this.matching, {
          jobKind: 'DELIVERY_OFFER',
          referenceId: updated.id,
          pickupLat,
          pickupLng,
          pickupAddress: pickup,
          title: 'Nouvelle livraison MOVA',
          body: `Repas · ${pickup}`,
          data: { deliveryType: updated.type },
        }).catch(() => undefined);
      }
    }
    return { order: this.formatOrder(updated), delivery: formatParcelDelivery(updated) };
  }

  private async publishStatus(
    delivery: { id: string; userId: string; type: DeliveryType; restaurant?: { name: string } | null },
    status: DeliveryStatus,
  ) {
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: delivery.id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: delivery.restaurant?.name,
    });
  }
}
