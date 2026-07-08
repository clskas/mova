import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  ErrandOrderStatus,
  MovingRequestStatus,
  RentalInquiryStatus,
  ScheduledRideStatus,
} from '@prisma/client';
import { MovaErrorCode, MovaHttpException, fromMobileRideStatus } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RentalService } from '../rental/rental.service';

export type ServiceReferenceType = 'RIDE' | 'DELIVERY' | 'ERRAND' | 'MOVING' | 'RENTAL' | 'CARPOOL' | 'SCHEDULED';

export interface ServicePaymentInfo {
  referenceType: ServiceReferenceType;
  referenceId: string;
  userId: string;
  amountCdf: number;
  status: string;
  paymentReady: boolean;
  title?: string;
  driverId?: string | null;
  ownerUserId?: string | null;
  cashPin?: string | null;
}

@Injectable()
export class PaymentInfoService {
  constructor(
    private prisma: PrismaService,
    private rental: RentalService,
  ) {}

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
      case 'SCHEDULED':
        return this.scheduledInfo(referenceId);
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
      driverId: ride.driverId,
      cashPin: ride.completionPin,
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
      driverId: delivery.driverId,
      cashPin: delivery.deliveryPin,
      title: delivery.dropoffAddress ?? delivery.deliveryAddress ?? 'Livraison',
    };
  }

  private async errandInfo(errandId: string): Promise<ServicePaymentInfo> {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: errandId } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    const amountCdf = (order.finalPriceCdf ?? order.estimatedPriceCdf) + (order.purchaseTotalCdf ?? 0);
    return {
      referenceType: 'ERRAND',
      referenceId: errandId,
      userId: order.userId,
      amountCdf,
      status: order.status,
      paymentReady: order.status === ErrandOrderStatus.COMPLETED,
      driverId: order.driverId,
      cashPin: order.completionPin,
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
      driverId: request.driverId,
      cashPin: request.completionPin,
      title: `${request.pickupAddress} → ${request.dropoffAddress}`,
    };
  }

  private async rentalInfo(bookingId: string): Promise<ServicePaymentInfo> {
    let inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id: bookingId }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    inquiry = await this.rental.ensureCompletionPinForPayment(inquiry);
    return {
      referenceType: 'RENTAL',
      referenceId: bookingId,
      userId: inquiry.userId,
      amountCdf: inquiry.totalCdf ?? inquiry.estimatedPriceCdf ?? 0,
      status: inquiry.status,
      paymentReady: inquiry.status === RentalInquiryStatus.RETURNED,
      driverId: inquiry.driverId ?? inquiry.vehicle?.ownerUserId ?? null,
      ownerUserId: inquiry.vehicle?.ownerUserId ?? null,
      cashPin: inquiry.completionPin,
      title: inquiry.vehicle?.name ?? inquiry.vehicleType,
    };
  }

  private async carpoolInfo(referenceId: string): Promise<ServicePaymentInfo> {
    const booking = await this.prisma.carpoolPassenger.findUnique({
      where: { id: referenceId },
      include: { trip: true },
    });
    if (booking) {
      const trip = booking.trip;
      return {
        referenceType: 'CARPOOL',
        referenceId,
        userId: booking.userId,
        amountCdf: trip.pricePerSeatCdf * booking.seats,
        status: trip.status,
        paymentReady: trip.status === 'COMPLETED',
        driverId: trip.driverId,
        title: `${trip.pickupAddress ?? 'Départ'} → ${trip.dropoffAddress ?? 'Arrivée'}`,
      };
    }

    const trip = await this.prisma.carpoolTrip.findUnique({
      where: { id: referenceId },
      include: { passengers: true },
    });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    const passenger = trip.passengers[0];
    if (!passenger) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Aucune réservation passager pour ce trajet.',
      );
    }
    return {
      referenceType: 'CARPOOL',
      referenceId: passenger.id,
      userId: passenger.userId,
      amountCdf: trip.pricePerSeatCdf * passenger.seats,
      status: trip.status,
      paymentReady: trip.status === 'COMPLETED',
      driverId: trip.driverId,
      title: `${trip.pickupAddress ?? 'Départ'} → ${trip.dropoffAddress ?? 'Arrivée'}`,
    };
  }

  private async scheduledInfo(scheduledId: string): Promise<ServicePaymentInfo> {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id: scheduledId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return {
      referenceType: 'SCHEDULED',
      referenceId: scheduledId,
      userId: ride.passengerId,
      amountCdf: ride.estimatedPriceCdf,
      status: ride.status,
      paymentReady: ride.status === ScheduledRideStatus.COMPLETED,
      driverId: ride.driverId,
      cashPin: ride.completionPin,
      title: `${ride.pickupAddress ?? 'Départ'} → ${ride.dropoffAddress ?? 'Arrivée'}`,
    };
  }
}
