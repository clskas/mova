export enum UserRole {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
  FINANCE = 'FINANCE',
  CONTENT = 'CONTENT',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_KYC = 'PENDING_KYC',
}

export enum VehicleType {
  MOTO_TAXI = 'MOTO_TAXI',
  STANDARD = 'STANDARD',
  COMFORT = 'COMFORT',
  VIP = 'VIP',
}

export enum RideStatus {
  REQUESTED = 'REQUESTED',
  SEARCHING = 'SEARCHING',
  ACCEPTED = 'ACCEPTED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  WALLET = 'WALLET',
  ORANGE_MONEY = 'ORANGE_MONEY',
  MPESA = 'MPESA',
  AIRTEL_MONEY = 'AIRTEL_MONEY',
  CASH = 'CASH',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum KycStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum IncidentType {
  ACCIDENT = 'ACCIDENT',
  HARASSMENT = 'HARASSMENT',
  FRAUD = 'FRAUD',
  OTHER = 'OTHER',
}

export enum DeliveryType {
  PARCEL = 'PARCEL',
  FOOD = 'FOOD',
}

export enum WeightCategory {
  DOCUMENTS = 'DOCUMENTS',
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum ScheduledRideStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ServiceCategory {
  TRANSPORT = 'transport',
  DELIVERY = 'delivery',
  OTHER = 'other',
}
