export const MOVA_EVENTS = {
  USER_CREATED: 'user.created',
  RIDE_CREATED: 'ride.created',
  RIDE_COMPLETED: 'ride.completed',
  PAYMENT_COMPLETED: 'payment.completed',
  DRIVER_RATING_UPDATED: 'driver.rating.updated',
  DELIVERY_CREATED: 'delivery.created',
  DELIVERY_STATUS_UPDATED: 'delivery.status.updated',
} as const;

export type MovaEventName = (typeof MOVA_EVENTS)[keyof typeof MOVA_EVENTS];

export interface UserCreatedPayload {
  userId: string;
  phone: string;
  role: string;
}

export interface RideCreatedPayload {
  rideId: string;
  passengerId: string;
  vehicleType: string;
  estimatedFareCdf?: number;
}

export interface PaymentCompletedPayload {
  rideId: string;
  userId: string;
  amountCdf: number;
  method: string;
}

export interface DeliveryCreatedPayload {
  deliveryId: string;
  userId: string;
  type: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantOwnerUserId?: string;
  estimatedPriceCdf?: number;
}

export interface DeliveryStatusUpdatedPayload {
  deliveryId: string;
  userId: string;
  type: string;
  status: string;
  restaurantName?: string;
}
