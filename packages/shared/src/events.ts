export const MOVA_EVENTS = {
  USER_CREATED: 'user.created',
  RIDE_CREATED: 'ride.created',
  RIDE_COMPLETED: 'ride.completed',
  RIDE_STATUS_SMS: 'ride.status.sms',
  PAYMENT_COMPLETED: 'payment.completed',
  RIDE_CASH_PENDING: 'ride.cash.pending',
  SERVICE_CASH_PENDING: 'service.cash.pending',
  DRIVER_RATING_UPDATED: 'driver.rating.updated',
  DELIVERY_CREATED: 'delivery.created',
  DELIVERY_STATUS_UPDATED: 'delivery.status.updated',
  SERVICE_ASSIGNED: 'service.assigned',
  SERVICE_STATUS_UPDATED: 'service.status.updated',
  RENTAL_BOOKING: 'rental.booking',
  RENTAL_PARTNER_VEHICLE: 'rental.partner.vehicle',
  INCIDENT_CREATED: 'incident.created',
  DRIVER_JOB_ALERT: 'driver.job.alert',
  SCHEDULED_REMINDER: 'scheduled.reminder',
  ERRAND_CREATED: 'errand.created',
  CHAT_MESSAGE: 'chat.message',
} as const;

export type MovaEventName = (typeof MOVA_EVENTS)[keyof typeof MOVA_EVENTS];

export interface UserCreatedPayload {
  userId: string;
  phone?: string;
  role: string;
}

export interface RideCreatedPayload {
  rideId: string;
  passengerId: string;
  vehicleType: string;
  estimatedFareCdf?: number;
}

export interface RideStatusSmsPayload {
  rideId: string;
  userId: string;
  phone: string;
  status: string;
  message: string;
}

export interface PaymentCompletedPayload {
  rideId?: string;
  referenceType?: string;
  referenceId?: string;
  userId: string;
  amountCdf: number;
  method: string;
}

export interface RideCashPendingPayload {
  rideId: string;
  driverId?: string;
  passengerId?: string;
  amountCdf: number;
}

export interface ServiceCashPendingPayload {
  referenceType: string;
  referenceId: string;
  driverId?: string;
  userId?: string;
  amountCdf: number;
}

export interface IncidentCreatedPayload {
  incidentId: string;
  userId: string;
  type: string;
  rideId?: string;
  referenceType?: string;
  referenceId?: string;
  lat?: number;
  lng?: number;
  isEmergency?: boolean;
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
  restaurantOwnerUserId?: string;
}

export interface ServiceAssignedPayload {
  serviceType: 'RENTAL' | 'MOVING' | 'SCHEDULED' | 'ERRAND';
  referenceId: string;
  driverId: string;
  passengerId: string;
  summary: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupCity?: string;
  returnCity?: string;
  scheduledAt?: string;
}

export interface ServiceStatusUpdatedPayload {
  serviceType: 'RENTAL' | 'MOVING' | 'SCHEDULED' | 'ERRAND';
  referenceId: string;
  userId: string;
  status: string;
}

export type RentalBookingEventKind = 'NEW_BOOKING' | 'CONFIRMED' | 'CANCELLED' | 'LOGISTICS_ASSIGNED';

export type DriverJobKind = 'RIDE_OFFER' | 'DELIVERY_OFFER' | 'MISSION';

export interface DriverJobAlertPayload {
  jobKind: DriverJobKind;
  referenceId: string;
  driverUserIds: string[];
  title: string;
  body: string;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  data?: Record<string, unknown>;
}

export interface RentalBookingPayload {
  kind: RentalBookingEventKind;
  inquiryId: string;
  ownerUserId: string;
  passengerId: string;
  passengerName?: string;
  passengerPhone?: string;
  vehicleName: string;
  pickupCity?: string | null;
  returnCity?: string | null;
  pickupAddress?: string | null;
  startDate: string;
  endDate: string;
  priceCdf?: number | null;
  status: string;
  logisticsSummary?: string;
}

export interface ScheduledReminderPayload {
  scheduledRideId: string;
  passengerId: string;
  driverId?: string;
  passengerPhone?: string;
  driverPhone?: string;
  reminderKind: 'DAY_BEFORE' | 'HOUR_BEFORE';
  scheduledAt: string;
  summary: string;
}

export interface ErrandCreatedPayload {
  errandId: string;
  userId: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  estimatedPriceCdf: number;
}

export type ChatThreadKind = 'ride' | 'delivery' | 'errand' | 'rental';

export interface ChatMessagePayload {
  kind: ChatThreadKind;
  threadId: string;
  messageId: string;
  senderId: string;
  senderRole: string;
  recipientIds: string[];
  text: string;
}

export interface RentalPartnerVehiclePayload {
  vehicleId: string;
  ownerUserId: string;
  action: 'created' | 'updated' | 'deleted' | 'reviewed';
  approvalStatus?: string;
  isActive?: boolean;
}
