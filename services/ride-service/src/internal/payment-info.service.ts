import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, ErrandOrderStatus, MovingRequestStatus, RentalInquiryStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, fromMobileRideStatus } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export type ServiceReferenceType = 'RIDE' | 'DELIVERY' | 'ERRAND' | 'MOVING' | 'RENTAL' | 'CARPOOL';

export interface ServicePaymentInfo {
  referenceType: ServiceReferenceType;
  referenceId: string;
  userId: string;
  amountCdf: number;
  status: string;
  paymentReady: boolean;
  title?: string;
}

@Injectable()
export class PaymentInfoService {
  constructor(private prisma: PrismaService) {}

  async getPaymentInfo(referenceType: string, referenceId: string): Promise<ServicePaymentInfo> {
    const type = referenceType.toUpperCase() as ServiceReferenceType;
    switch (type) {
      case 'RIDE':
        return this.rideInfo(referenceId);
      case 'DELIVERY':
        return this.deliveryInfo(referenceId);
      case 'ERRAND':
        return this.errandInfo(referenceId);
      case 'MOVING':
        return this.movingInfo(referenceId);
      case 'RENTAL':
        return this.rentalInfo(referenceId);
      case 'CARPOOL':
        return this.carpoolInfo(referenceId);
      default:
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Type de service invalide pour le paiement.');
    }
  }

  private async rideInfo(rideId: string): Promise<ServicePaymentInfo> {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const status = fromMobileRideStatus(ride.status);
    const amountCdf = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    return {
      referenceType: 'RIDE',
      referenceId: rideId,
      userId: ride.passengerId,
      amountCdf,
      status,
      paymentReady: status === 'COMPLETED',
      title: `${ride.pickupAddress ?? 'Départ'} → ${ride.dropoffAddress ?? 'Arrivée'}`,
    };
  }

  private async deliveryInfo(deliveryId: string): Promise<ServicePaymentInfo> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const amountCdf = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf;
    return {
      referenceType: 'DELIVERY',
      referenceId: deliveryId,
      userId: delivery.userId,
      amountCdf,
      status: delivery.status,
      paymentReady: delivery.status === DeliveryStatus.DELIVERED,
      title: delivery.dropoffAddress ?? delivery.deliveryAddress ?? 'Livraison',
    };
  }

  private async errandInfo(errandId: string): Promise<ServicePaymentInfo> {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: errandId } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    return {
      referenceType: 'ERRAND',
      referenceId: errandId,
      userId: order.userId,
      amountCdf: order.estimatedPriceCdf,
      status: order.status,
      paymentReady: order.status === ErrandOrderStatus.COMPLETED,
      title: order.description,
    };
  }

  private async movingInfo(movingId: string): Promise<ServicePaymentInfo> {
    const request = await this.prisma.movingRequest.findUnique({ where: { id: movingId } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    return {
      referenceType: 'MOVING',
      referenceId: movingId,
      userId: request.userId,
      amountCdf: request.estimatedPriceCdf,
      status: request.status,
      paymentReady: request.status === MovingRequestStatus.COMPLETED,
      title: `${request.pickupAddress} → ${request.dropoffAddress}`,
    };
  }

  private async rentalInfo(bookingId: string): Promise<ServicePaymentInfo> {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id: bookingId }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const ready = inquiry.status === RentalInquiryStatus.CONFIRMED || inquiry.status === RentalInquiryStatus.CONTACTED;
    return {
      referenceType: 'RENTAL',
      referenceId: bookingId,
      userId: inquiry.userId,
      amountCdf: inquiry.totalCdf ?? inquiry.estimatedPriceCdf ?? 0,
      status: inquiry.status,
      paymentReady: ready,
      title: inquiry.vehicle?.name ?? inquiry.vehicleType,
    };
  }

  private async carpoolInfo(tripId: string, userId?: string): Promise<ServicePaymentInfo> {
    const trip = await this.prisma.carpoolTrip.findUnique({
      where: { id: tripId },
      include: { passengers: true },
    });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    const passenger = userId ? trip.passengers.find((p) => p.userId === userId) : trip.passengers[0];
    const payerId = userId ?? passenger?.userId ?? trip.driverId;
    const seats = passenger?.seats ?? 1;
    const amountCdf = trip.pricePerSeatCdf * seats;
    return {
      referenceType: 'CARPOOL',
      referenceId: tripId,
      userId: payerId,
      amountCdf,
      status: trip.status,
      paymentReady: trip.status === 'COMPLETED',
      title: `${trip.pickupAddress ?? 'Départ'} → ${trip.dropoffAddress ?? 'Arrivée'}`,
    };
  }
}
