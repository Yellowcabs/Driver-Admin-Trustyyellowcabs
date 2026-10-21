/**
 * Core Type Definitions for Trusty Yellow Cab Admin Console
 * Strictly matches Android Kotlin Driver App `FirebaseManager.kt` data structures
 */

export type VehicleCategory =
  | 'MINI'
  | 'SEDAN'
  | 'SUV'
  | 'SUV+'
  | 'INNOVA'
  | 'INNOVA CRYSTA'
  | 'Mini'
  | 'Sedan'
  | 'Innova'
  | 'Auto'
  | 'Bike'
  | 'Luxury'
  | string;

export type DriverStatus = 'ACTIVE' | 'BLOCKED' | 'INACTIVE';

export interface FirestoreDriver {
  doc_id?: string;
  driver_id: string;
  driver_name: string;
  mobile_number: string;
  vehicle_number: string;
  vehicle_category: VehicleCategory | string;
  status: DriverStatus | string;
  is_online: boolean;
  latitude: number | null;
  longitude: number | null;
  photo_url: string;
  profile_photo_url?: string;
  expiry_date: string;
  photo_version: number;
  device_id: string;
  last_heartbeat?: number;
  fcm_token?: string;
  rating?: number;
  total_trips?: number;
  current_trip_id?: string | null;
  cutoff_suspended?: boolean;
  payment_amount?: number;
  payment_status?: 'DUE' | 'CLEARED' | string;
  payment_note?: string;
  office_upi_id?: string;
  upi_id?: string;
  driver_payment_status?: 'VERIFIED' | string;
  payment_updated_at?: number;
  updated_at?: any;
}

export type TripStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripType = 'REGULAR' | 'PACKAGE';
export type DispatchType = 'BROADCAST' | 'RADIUS';

export interface FirestoreTrip {
  doc_id: string;
  trip_id: string;
  customer_name: string;
  customer_phone: string;
  pickup_location: string;
  drop_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_lat: number | null;
  drop_lng: number | null;
  status: TripStatus | string;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_number: string | null;
  vehicle_category: string | null;
  estimated_fare: number;
  final_fare: number | null;
  notes: string;
  created_at: number;
  updated_at: number;
  accepted_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  trip_type: TripType | string;
  base_fare: number | null;
  kms_fare: number | null;
  hour_fare: number | null;
  is_package: boolean;
  package_hours?: number;
  package_kms?: number;
  dispatch_type: DispatchType | string;
  radius_kms?: number | null;
  otp: string | null;
  distance_km?: number;
  duration_seconds?: number;
  waiting_seconds?: number;
  start_location?: string;
  end_location?: string;
  // Optional customer live tracking fields (only generated on customer request)
  tracking_token?: string;
  tracking_enabled?: boolean;
  tracking_created_at?: number;
}

export interface CustomerTrackingSession {
  token: string;
  trip_id: string;
  created_at: number;
  is_active: boolean;
  customer_name: string;
  customer_phone: string;
  driver_id: string | null;
  disabled_at?: number;
}

export interface SystemControlSettings {
  admin_online: boolean;
  sync_enabled: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'CUTOFF' | string;
  updated_at: number;
  broadcast_notice?: string;
  emergency_mode?: boolean;
  driver_app_min_version?: string;
  rule_permission_notice?: string;
  dual_sync_active?: boolean;
}

export type SystemSettings = SystemControlSettings;

export interface FareRateCard {
  id: string;
  category: VehicleCategory;
  name: string;
  base_fare: number;
  base_distance_km: number;
  per_km_rate: number;
  per_hour_rate: number;
  kms_fare?: number;
  hour_fare?: number;
  minimum_fare: number;
  waiting_fare_per_min: number;
  night_surge_multiplier: number;
  seats: number;
  description: string;
}

export interface FirebaseConnectionConfig {
  apiKey: string;
  projectId: string;
  appId: string;
  storageBucket: string;
  authDomain?: string;
  databaseURL?: string;
  isLiveConnected: boolean;
}

export interface SystemEventLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  source: 'DRIVER' | 'ADMIN' | 'DISPATCH' | 'FIRESTORE';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export type AdminTab =
  | 'dispatch'
  | 'analytics'
  | 'radar'
  | 'drivers'
  | 'trips';

export type AdminRole = 'SUPER_ADMIN' | 'DISPATCH_MANAGER' | 'FLEET_SUPERVISOR' | 'OPERATOR';

export interface AdminPermissions {
  can_dispatch: boolean;
  can_manage_drivers: boolean;
  can_change_rates: boolean;
  can_toggle_killswitch: boolean;
  can_view_audit_logs: boolean;
  can_manage_admins: boolean;
  can_export_data: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: boolean;
  permissions: AdminPermissions;
  last_login?: number;
  created_at: number;
}

/**
 * Formats a trip ID to strictly numbers only (strips "TRIP-", "TRIP", etc.)
 */
export function formatTripId(tripId?: string | null): string {
  if (!tripId) return '';
  return tripId.toString().replace(/^TRIP-?/i, '').trim();
}
