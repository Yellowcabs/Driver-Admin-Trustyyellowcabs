import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  where,
  query,
  orderBy,
  limit,
  Unsubscribe,
  deleteField,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { FirestoreDriver, FirestoreTrip, SystemControlSettings, FirebaseConnectionConfig, DriverStatus, CustomerTrackingSession } from '../types';
import { DEFAULT_FIREBASE_CONFIG } from '../data/seedData';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: true,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.warn(`[Firestore Error Handled] ${operationType.toUpperCase()} on "${path}": ${errMessage}`);
  return errInfo;
}

export function getStoredFirebaseConfig(): FirebaseConnectionConfig {
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
  const envStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;

  const projectId = envProjectId || DEFAULT_FIREBASE_CONFIG.projectId || 'trusty-yellow-cab';
  const apiKey = envApiKey || DEFAULT_FIREBASE_CONFIG.apiKey || '';
  const authDomain = envAuthDomain || (projectId ? `${projectId}.firebaseapp.com` : DEFAULT_FIREBASE_CONFIG.authDomain);
  const appId = envAppId || DEFAULT_FIREBASE_CONFIG.appId || '';
  const storageBucket = envStorageBucket || (projectId ? `${projectId}.firebasestorage.app` : DEFAULT_FIREBASE_CONFIG.storageBucket);

  return {
    projectId,
    apiKey,
    authDomain,
    appId,
    storageBucket,
    isLiveConnected: Boolean(apiKey && projectId),
  };
}

export function saveStoredFirebaseConfig(_config: FirebaseConnectionConfig) {
  // Credentials are managed securely via .env environment variables
}

let activeApp: FirebaseApp | null = null;
let activeDb: Firestore | null = null;

export function getOrCreateFirebaseInstance(config: FirebaseConnectionConfig): { app: FirebaseApp | null; db: Firestore | null } {
  try {
    if (!config.apiKey || !config.projectId) {
      return { app: null, db: null };
    }

    const appName = `cab_admin_${config.projectId}`;
    const existingApps = getApps();
    const found = existingApps.find(a => a.name === appName || (appName === 'cab_admin_trusty-yellow-cab' && a.name === '[DEFAULT]'));

    if (found) {
      activeApp = found;
      activeDb = getFirestore(found);
      return { app: activeApp, db: activeDb };
    }

    activeApp = initializeApp({
      apiKey: config.apiKey,
      projectId: config.projectId,
      appId: config.appId,
      storageBucket: config.storageBucket,
      authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
    }, appName);

    activeDb = getFirestore(activeApp);
    return { app: activeApp, db: activeDb };
  } catch (error) {
    console.warn('Firebase initialization notice:', error);
    return { app: null, db: null };
  }
}

/**
 * Tests live connection by attempting a lightweight read on system_settings or drivers
 */
export async function testFirebaseConnection(config: FirebaseConnectionConfig): Promise<{
  success: boolean;
  message: string;
  isUnavailable?: boolean;
  permissionIssue?: boolean;
}> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) {
      return { success: false, message: 'Could not initialize Firebase SDK with provided credentials.' };
    }
    // Probe the same single document used by the live settings listener instead
    // of reading the entire system_settings collection just to verify access.
    const testPromise = getDoc(doc(db, 'system_settings', 'dispatch_control'));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out. Cloud Firestore backend may be unreachable or offline.')), 6000)
    );

    await Promise.race([testPromise, timeoutPromise]);
    return {
      success: true,
      message: `Successfully connected to Firebase Project "${config.projectId}".`,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isUnavailable = errMsg.includes('unavailable') || errMsg.includes('timed out') || errMsg.includes('client is offline');
    const isPermission = errMsg.includes('insufficient permissions') || errMsg.includes('permission-denied');

    console.warn(`Firebase connection status for "${config.projectId}": ${errMsg}`);

    return {
      success: false,
      message: isUnavailable
        ? 'Operating in offline local console mode. Cloud Firestore backend is currently unreachable.'
        : isPermission
        ? 'Connected, but read permissions on system_settings are restricted.'
        : errMsg,
      isUnavailable,
      permissionIssue: isPermission,
    };
  }
}

/**
 * Subscribes to the live Firestore `drivers` collection supporting 2000+ to 5000+ active drivers
 * using high-performance Map-based delta caching and throttled dispatch to ensure 60fps UI performance.
 */
export function subscribeToFirestoreDrivers(
  config: FirebaseConnectionConfig,
  onData: (drivers: FirestoreDriver[]) => void,
  onError: (err: any) => void
): Unsubscribe | null {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return null;

    const driversQuery = collection(db, 'drivers');
    const driverCache = new Map<string, FirestoreDriver>();
    let hasLoadedFirstSnapshot = false;
    let dispatchTimer: ReturnType<typeof setTimeout> | null = null;

    const parseDriverDoc = (docSnap: any): FirestoreDriver | null => {
      if (docSnap.id.startsWith('_')) return null;
      const data = docSnap.data();
      const rawStatus = (data.status || data.driver_status || '').toString().trim().toUpperCase();
      const isBlocked = Boolean(
        data.is_blocked ||
        data.blocked ||
        rawStatus === 'BLOCKED' ||
        (typeof data.is_active === 'boolean' && !data.is_active)
      );
      const finalStatus: DriverStatus = isBlocked ? 'BLOCKED' : 'ACTIVE';

      // Standardize clean fields (canonical names)
      const driverId = (data.driver_id || docSnap.id || '').toString().trim();
      const driverName = (data.driver_name || data.name || '').toString().trim();
      const mobileNumber = (data.mobile_number || data.driver_mobile || data.phone || data.driver_phone || '').toString().trim();
      const vehicleNumber = (data.vehicle_number || data.vehicle_no || '').toString().trim();
      const vehicleCategory = (data.vehicle_category || data.vehicle_type || 'Mini').toString().trim().toUpperCase();
      return {
        doc_id: docSnap.id,
        driver_id: driverId,
        driver_name: driverName,
        mobile_number: mobileNumber,
        vehicle_number: vehicleNumber,
        vehicle_category: vehicleCategory,
        status: finalStatus,
        is_online: Boolean(data.is_online),
        latitude: typeof data.latitude === 'number' ? data.latitude : null,
        longitude: typeof data.longitude === 'number' ? data.longitude : null,
        photo_url: data.photo_url || data.photoUrl || '',
        expiry_date: data.expiry_date || '',
        photo_version: Number(data.photo_version || 1),
        device_id: data.device_id || '',
        last_heartbeat: typeof data.last_heartbeat === 'number' ? data.last_heartbeat : (typeof data.last_seen === 'number' ? data.last_seen : 0),
        fcm_token: data.fcm_token || '',
        rating: typeof data.rating === 'number' ? data.rating : 4.8,
        total_trips: typeof data.total_trips === 'number' ? data.total_trips : 0,
        current_trip_id: data.current_trip_id || null,
        payment_amount: typeof data.payment_amount === 'number' ? data.payment_amount : Number(data.payment_amount || 0),
        payment_status: data.payment_status || (Number(data.payment_amount || 0) > 0 ? 'DUE' : 'CLEARED'),
        payment_note: data.payment_note || '',
        office_upi_id: data.office_upi_id !== undefined ? String(data.office_upi_id).trim() : (data.upi_id ? String(data.upi_id).trim() : ''),
        driver_payment_status: data.driver_payment_status || (data.payment_status === 'CLEARED' ? 'VERIFIED' : undefined),
        payment_updated_at: typeof data.payment_updated_at === 'number' ? data.payment_updated_at : undefined,
        updated_at: data.updated_at,
      };
    };

    const flushDrivers = () => {
      dispatchTimer = null;
      // Deduplicate by driver_id and mobile_number so multiple documents with the same driver do NOT create duplicate rows
      const uniqueDriversMap = new Map<string, FirestoreDriver>();
      const mobileToKey = new Map<string, string>();

      for (const d of driverCache.values()) {
        const key = (d.driver_id || d.doc_id).trim().toUpperCase();
        const mobile = (d.mobile_number || '').trim();

        const existingKey = uniqueDriversMap.has(key)
          ? key
          : mobile && mobileToKey.has(mobile)
          ? mobileToKey.get(mobile)!
          : undefined;

        if (!existingKey) {
          uniqueDriversMap.set(key, d);
          if (mobile) mobileToKey.set(mobile, key);
        } else {
          const existing = uniqueDriversMap.get(existingKey)!;
          // Prefer document where doc_id matches driver_id
          const isCurrentBetter = d.doc_id === d.driver_id;
          if (isCurrentBetter) {
            uniqueDriversMap.set(existingKey, d);
          } else {
            // Keep the preferred document in memory only. Realtime reads must not
            // mutate or delete production records.
          }
        }
      }

      onData(Array.from(uniqueDriversMap.values()));

    };

    const scheduleFlush = () => {
      if (!dispatchTimer) {
        // Micro-batch rapid GPS pings over 150ms window to keep React silky smooth
        dispatchTimer = setTimeout(flushDrivers, 150);
      }
    };

    const unsubscribe = onSnapshot(
      driversQuery,
      (snapshot) => {
        if (!hasLoadedFirstSnapshot) {
          // Initial bulk population
          driverCache.clear();
          snapshot.forEach((docSnap) => {
            const parsed = parseDriverDoc(docSnap);
            if (parsed) {
              driverCache.set(docSnap.id, parsed);
            }
          });
          hasLoadedFirstSnapshot = true;
          flushDrivers();
          return;
        }

        // High-scale optimization: Delta-only updates for 2000-5000+ drivers
        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        changes.forEach((change) => {
          if (change.type === 'removed') {
            driverCache.delete(change.doc.id);
          } else {
            const parsed = parseDriverDoc(change.doc);
            if (parsed) {
              driverCache.set(change.doc.id, parsed);
            }
          }
        });

        scheduleFlush();
      },
      (err) => {
        console.warn('Firestore drivers listener error:', err);
        onError(err);
      }
    );

    return () => {
      if (dispatchTimer) clearTimeout(dispatchTimer);
      unsubscribe();
    };
  } catch (err) {
    onError(err);
    return null;
  }
}

function parseFirestoreTripDoc(docSnap: any): FirestoreTrip {
  const data = docSnap.data();
  const rawTripId = (data.trip_id || docSnap.id || '').toString().trim();
  const cleanTripId = rawTripId.replace(/^TRIP-?/i, '');
  return {
    doc_id: docSnap.id,
    trip_id: cleanTripId || rawTripId,
    customer_name: data.customer_name || 'Customer',
    customer_phone: data.customer_phone || data.customer_mobile || '',
    pickup_location: data.pickup_location || '',
    drop_location: data.drop_location || '',
    pickup_lat: typeof data.pickup_lat === 'number' ? data.pickup_lat : null,
    pickup_lng: typeof data.pickup_lng === 'number' ? data.pickup_lng : null,
    drop_lat: typeof data.drop_lat === 'number' ? data.drop_lat : null,
    drop_lng: typeof data.drop_lng === 'number' ? data.drop_lng : null,
    status: data.status || 'OPEN',
    driver_id: data.driver_id || null,
    driver_name: data.driver_name || null,
    driver_phone: data.driver_phone || null,
    vehicle_number: data.vehicle_number || null,
    vehicle_category: data.vehicle_category || null,
    estimated_fare: Number(data.estimated_fare || data.fare || 0),
    final_fare: typeof data.final_fare === 'number' ? data.final_fare : null,
    notes: data.notes || '',
    created_at: Number(data.created_at || Date.now()),
    updated_at: Number(data.updated_at || Date.now()),
    accepted_at: typeof data.accepted_at === 'number' ? data.accepted_at : null,
    started_at: typeof data.started_at === 'number' ? data.started_at : null,
    completed_at: typeof data.completed_at === 'number' ? data.completed_at : null,
    trip_type: data.trip_type || 'REGULAR',
    base_fare: typeof data.base_fare === 'number' ? data.base_fare : null,
    kms_fare: typeof data.kms_fare === 'number' ? data.kms_fare : null,
    hour_fare: typeof data.hour_fare === 'number' ? data.hour_fare : null,
    is_package: Boolean(data.is_package),
    package_hours: typeof data.package_hours === 'number' ? data.package_hours : undefined,
    package_kms: typeof data.package_kms === 'number' ? data.package_kms : undefined,
    dispatch_type: data.dispatch_type || 'BROADCAST',
    radius_kms: typeof data.radius_kms === 'number' ? data.radius_kms : null,
    otp: data.otp ? String(data.otp) : null,
    distance_km: typeof data.distance_km === 'number' ? data.distance_km : undefined,
    duration_seconds: typeof data.duration_seconds === 'number' ? data.duration_seconds : undefined,
    waiting_seconds: typeof data.waiting_seconds === 'number' ? data.waiting_seconds : undefined,
    tracking_token: data.tracking_token || undefined,
    tracking_enabled: typeof data.tracking_enabled === 'boolean' ? data.tracking_enabled : undefined,
    tracking_created_at: typeof data.tracking_created_at === 'number' ? data.tracking_created_at : undefined,
  };
}

/**
 * Subscribes to the live Firestore `trips` collection with Map cache,
 * docChanges() delta processing, and throttled batching.
 */
export function subscribeToFirestoreTrips(
  config: FirebaseConnectionConfig,
  onData: (trips: FirestoreTrip[]) => void,
  onError: (err: any) => void
): Unsubscribe | null {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return null;

    let tripsTargetQuery;
    try {
      tripsTargetQuery = query(collection(db, 'trips'), orderBy('created_at', 'desc'));
    } catch {
      tripsTargetQuery = collection(db, 'trips');
    }

    const tripsMap = new Map<string, FirestoreTrip>();
    let hasLoadedFirstTrips = false;
    let dispatchTimer: any = null;
    let fallbackUnsubscribe: Unsubscribe | null = null;

    const flushTrips = () => {
      const list = Array.from(tripsMap.values()).sort((a, b) => b.created_at - a.created_at);
      onData(list);
    };

    const scheduleFlush = () => {
      if (dispatchTimer) return;
      dispatchTimer = setTimeout(() => {
        dispatchTimer = null;
        flushTrips();
      }, 150);
    };

    const unsubscribe = onSnapshot(
      tripsTargetQuery,
      (snapshot) => {
        if (!hasLoadedFirstTrips) {
          hasLoadedFirstTrips = true;
          tripsMap.clear();
          snapshot.forEach((docSnap) => {
            tripsMap.set(docSnap.id, parseFirestoreTripDoc(docSnap));
          });
          flushTrips();
          return;
        }

        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          if (change.type === 'removed') {
            tripsMap.delete(change.doc.id);
          } else {
            tripsMap.set(change.doc.id, parseFirestoreTripDoc(change.doc));
          }
        }

        scheduleFlush();
      },
      (err) => {
        console.warn('Firestore trips listener error:', err);
        try {
          if (fallbackUnsubscribe) return;
          fallbackUnsubscribe = onSnapshot(
            collection(db, 'trips'),
            (snapshot) => {
              tripsMap.clear();
              snapshot.forEach((docSnap) => {
                tripsMap.set(docSnap.id, parseFirestoreTripDoc(docSnap));
              });
              flushTrips();
            },
            onError
          );
        } catch {
          onError(err);
        }
      }
    );

    return () => {
      if (dispatchTimer) clearTimeout(dispatchTimer);
      if (fallbackUnsubscribe) fallbackUnsubscribe();
      unsubscribe();
    };
  } catch (err) {
    onError(err);
    return null;
  }
}

/**
 * Subscribes to the single system_settings/dispatch_control document in Firestore
 */
export function subscribeToFirestoreSystemSettings(
  config: FirebaseConnectionConfig,
  onData: (settings: SystemControlSettings) => void,
  onError: (err: any) => void
): Unsubscribe | null {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return null;

    // Single document listener: system_settings/dispatch_control
    const unsub = onSnapshot(
      doc(db, 'system_settings', 'dispatch_control'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          onData({
            admin_online: data.admin_online !== false && data.status !== 'OFFLINE' && data.status !== 'CUTOFF',
            sync_enabled: data.sync_enabled !== false,
            status: data.status || 'ONLINE',
            updated_at: Number(data.updated_at || Date.now()),
            broadcast_notice: data.broadcast_notice || '',
            emergency_mode: Boolean(data.emergency_mode),
            driver_app_min_version: data.driver_app_min_version || '2.4.0',
            dual_sync_active: false,
          });
        }
      },
      (err) => {
        console.warn('system_settings listener notice:', err?.message || err);
      }
    );

    return () => {
      try {
        unsub();
      } catch {}
    };
  } catch (err) {
    onError(err);
    return null;
  }
}

/**
 * Upserts a driver document in Firestore using the clean, canonical schema.
 * Explicitly removes redundant/unwanted fields (name, driver_mobile, driver_phone, phone, vehicle_no, vehicle_type, is_active, last_sync_time, last_seen)
 * to prevent repeated data in Firestore.
 */
export async function upsertDriverInFirestore(config: FirebaseConnectionConfig, driver: FirestoreDriver): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    const targetDocId = driver.driver_id || driver.doc_id;
    if (!targetDocId) return false;

    const docRef = doc(db, 'drivers', targetDocId);
    const mapData: Record<string, any> = {
      driver_id: targetDocId,
      driver_name: driver.driver_name || '',
      mobile_number: driver.mobile_number || '',
      vehicle_number: driver.vehicle_number || '',
      vehicle_category: (driver.vehicle_category || 'MINI').trim().toUpperCase(),
      status: driver.status || 'ACTIVE',
      is_online: Boolean(driver.is_online),
      is_blocked: driver.status === 'BLOCKED',
      expiry_date: driver.expiry_date || '',
      photo_url: driver.photo_url || '',
      photo_version: driver.photo_version || 1,
      device_id: driver.device_id || '',
      fcm_token: driver.fcm_token || '',
      // Explicitly delete unwanted and redundant fields from Firebase
      last_seen: deleteField(),
      last_sync_time: deleteField(),
      name: deleteField(),
      driver_mobile: deleteField(),
      driver_phone: deleteField(),
      phone: deleteField(),
      vehicle_no: deleteField(),
      vehicle_type: deleteField(),
      is_active: deleteField(),
      upi_id: deleteField(),
    };

    if (driver.latitude !== null && driver.latitude !== undefined) mapData.latitude = driver.latitude;
    if (driver.longitude !== null && driver.longitude !== undefined) mapData.longitude = driver.longitude;
    if (driver.last_heartbeat !== undefined) mapData.last_heartbeat = driver.last_heartbeat;
    if (driver.current_trip_id !== undefined) mapData.current_trip_id = driver.current_trip_id;
    if (driver.payment_amount !== undefined) mapData.payment_amount = Number(driver.payment_amount);
    if (driver.payment_status !== undefined) mapData.payment_status = driver.payment_status;
    if (driver.payment_note !== undefined) mapData.payment_note = driver.payment_note;
    if (driver.office_upi_id !== undefined || driver.upi_id !== undefined) {
      mapData.office_upi_id = driver.office_upi_id !== undefined ? String(driver.office_upi_id).trim() : (driver.upi_id ? String(driver.upi_id).trim() : '');
    }
    if (driver.payment_updated_at !== undefined) mapData.payment_updated_at = driver.payment_updated_at;

    await setDoc(docRef, mapData, { merge: true });

    return true;
  } catch (err) {
    console.error('Error writing driver to Firestore:', err);
    return false;
  }
}

/**
 * Scans the Firestore 'drivers' collection, detects repeated / duplicate fields and duplicate documents,
 * and fixes them directly in Firestore:
 * 1. Purges redundant alias and removed fields: name, driver_mobile, driver_phone, phone, vehicle_no, vehicle_type, is_active, last_sync_time, last_seen.
 * 2. Normalizes canonical fields: driver_id, driver_name, mobile_number, vehicle_number, vehicle_category, status, is_blocked, is_online.
 * 3. Consolidates duplicate documents for the same driver (e.g. where doc.id is device_id or auto-id vs driver_id).
 */
export async function cleanAndDeduplicateDriversInFirestore(
  config: FirebaseConnectionConfig
): Promise<{
  totalScanned: number;
  fieldsCleaned: number;
  duplicatesRemoved: number;
  success: boolean;
}> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return { totalScanned: 0, fieldsCleaned: 0, duplicatesRemoved: 0, success: false };

    const snapshot = await getDocs(collection(db, 'drivers'));
    let totalScanned = 0;
    let fieldsCleaned = 0;
    let duplicatesRemoved = 0;

    // Group documents by canonical driver_id (or mobile_number if driver_id is absent)
    const driverGroups = new Map<string, any[]>();

    snapshot.docs.forEach((docSnap) => {
      if (docSnap.id.startsWith('_')) return; // skip internal control documents
      totalScanned++;
      const data = docSnap.data();
      const driverId = (data.driver_id || docSnap.id || '').toString().trim();
      const key = driverId || (data.mobile_number || data.driver_mobile || data.phone || '').toString().trim();

      if (!driverGroups.has(key)) {
        driverGroups.set(key, []);
      }
      driverGroups.get(key)!.push({ id: docSnap.id, ref: docSnap.ref, data });
    });

    for (const [key, docList] of driverGroups.entries()) {
      if (docList.length === 0) continue;

      // Pick the primary canonical document (prefer doc whose id === driver_id)
      const primaryDoc = docList.find((d) => d.id === (d.data.driver_id || key)) || docList[0];

      // Merge data from any duplicate secondary docs into primary
      const mergedData = { ...primaryDoc.data };
      for (let i = 0; i < docList.length; i++) {
        const item = docList[i];
        if (item.id !== primaryDoc.id) {
          Object.keys(item.data).forEach((k) => {
            if (mergedData[k] === undefined || mergedData[k] === '' || mergedData[k] === null) {
              mergedData[k] = item.data[k];
            }
          });
          // Delete duplicate document
          try {
            await deleteDoc(item.ref);
            duplicatesRemoved++;
          } catch (delErr) {
            console.warn('Error deleting duplicate driver doc:', delErr);
          }
        }
      }

      // Check if document has duplicate / repeated / unwanted fields
      const redundantKeys = [
        'name',
        'driver_mobile',
        'driver_phone',
        'phone',
        'vehicle_no',
        'vehicle_type',
        'is_active',
        'last_sync_time',
        'last_seen',
        'upi_id',
      ];

      const hasRedundantKeys = redundantKeys.some((k) => k in mergedData);

      // Extract canonical values
      const driverId = (mergedData.driver_id || primaryDoc.id || key).toString().trim();
      const driverName = (mergedData.driver_name || mergedData.name || '').toString().trim();
      const mobileNumber = (mergedData.mobile_number || mergedData.driver_mobile || mergedData.driver_phone || mergedData.phone || '').toString().trim();
      const vehicleNumber = (mergedData.vehicle_number || mergedData.vehicle_no || '').toString().trim();
      const vehicleCategory = (mergedData.vehicle_category || mergedData.vehicle_type || 'MINI').toString().trim().toUpperCase();
      const rawStatus = (mergedData.status || mergedData.driver_status || '').toString().trim().toUpperCase();
      const isBlocked = Boolean(
        mergedData.is_blocked ||
        mergedData.blocked ||
        rawStatus === 'BLOCKED' ||
        (typeof mergedData.is_active === 'boolean' && !mergedData.is_active)
      );
      const status = isBlocked ? 'BLOCKED' : 'ACTIVE';

      const officeUpi = (mergedData.office_upi_id !== undefined ? mergedData.office_upi_id : (mergedData.upi_id || '')).toString().trim();

      const cleanDocData: Record<string, any> = {
        driver_id: driverId,
        driver_name: driverName,
        mobile_number: mobileNumber,
        vehicle_number: vehicleNumber,
        vehicle_category: vehicleCategory,
        status,
        is_blocked: isBlocked,
        is_online: Boolean(mergedData.is_online),
        expiry_date: mergedData.expiry_date || '',
        photo_url: mergedData.photo_url || '',
        photo_version: Number(mergedData.photo_version || 1),
        device_id: mergedData.device_id || '',
        fcm_token: mergedData.fcm_token || '',
        office_upi_id: officeUpi,
        // Explicitly purge redundant repeated and removed keys
        name: deleteField(),
        driver_mobile: deleteField(),
        driver_phone: deleteField(),
        phone: deleteField(),
        vehicle_no: deleteField(),
        vehicle_type: deleteField(),
        is_active: deleteField(),
        last_sync_time: deleteField(),
        last_seen: deleteField(),
        upi_id: deleteField(),
      };

      if (typeof mergedData.latitude === 'number') cleanDocData.latitude = mergedData.latitude;
      if (typeof mergedData.longitude === 'number') cleanDocData.longitude = mergedData.longitude;
      if (typeof mergedData.last_heartbeat === 'number') cleanDocData.last_heartbeat = mergedData.last_heartbeat;
      if (mergedData.current_trip_id !== undefined) cleanDocData.current_trip_id = mergedData.current_trip_id;
      if (mergedData.payment_amount !== undefined) cleanDocData.payment_amount = Number(mergedData.payment_amount);
      if (mergedData.payment_status !== undefined) cleanDocData.payment_status = mergedData.payment_status;
      if (mergedData.payment_note !== undefined) cleanDocData.payment_note = mergedData.payment_note;
      if (mergedData.payment_updated_at !== undefined) cleanDocData.payment_updated_at = mergedData.payment_updated_at;

      const canonicalDocRef = doc(db, 'drivers', driverId);
      if (primaryDoc.id !== driverId) {
        // Transfer to canonical document ID and delete old document ID
        await setDoc(canonicalDocRef, cleanDocData, { merge: true });
        try {
          await deleteDoc(primaryDoc.ref);
          duplicatesRemoved++;
        } catch {}
        fieldsCleaned++;
      } else if (hasRedundantKeys) {
        await updateDoc(canonicalDocRef, cleanDocData);
        fieldsCleaned++;
      }
    }

    return {
      totalScanned,
      fieldsCleaned,
      duplicatesRemoved,
      success: true,
    };
  } catch (err) {
    console.error('cleanAndDeduplicateDriversInFirestore error:', err);
    return {
      totalScanned: 0,
      fieldsCleaned: 0,
      duplicatesRemoved: 0,
      success: false,
    };
  }
}

/**
 * Removes driver from Firestore
 */
export async function deleteDriverFromFirestore(
  config: FirebaseConnectionConfig,
  driverId: string,
  docId?: string
): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    const targetDocId = (docId || driverId).trim();
    if (!targetDocId) return false;
    await deleteDoc(doc(db, 'drivers', targetDocId));
    return true;
  } catch (err) {
    console.error('Error deleting driver from Firestore:', err);
    return false;
  }
}

/**
 * Sets or updates a driver's due payment from the Admin Panel.
 * Collection: drivers, Document: {driver_id}
 * Fields written:
 * payment_amount, payment_status, payment_note, office_upi_id, payment_updated_at
 */
export async function setDriverOfficeDue(
  config: FirebaseConnectionConfig,
  driverId: string,
  amount: number,
  note: string = 'Trip CC (Convenience Charge)',
  officeUpiId: string = '',
  docId?: string
): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    const targetDocId = (docId || driverId).trim();
    if (!targetDocId) return false;
    const cleanAmount = Math.max(0, Number(amount) || 0);
    const paymentStatus = cleanAmount > 0 ? 'DUE' : 'CLEARED';
    const paymentUpdatedAt = Date.now();

    const paymentPayload: Record<string, any> = {
      payment_amount: cleanAmount,
      payment_status: paymentStatus,
      payment_note: note || 'Trip CC (Convenience Charge)',
      office_upi_id: (officeUpiId || '').trim(),
      updated_at: serverTimestamp(),
      payment_updated_at: paymentUpdatedAt,
    };

    // Update the exact document already loaded by the admin UI. Never migrate or
    // delete a driver profile as a side effect of changing payment fields.
    const primaryRef = doc(db, 'drivers', targetDocId);
    await setDoc(primaryRef, paymentPayload, { merge: true });

    return true;
  } catch (error) {
    console.error('Error setting driver due:', error);
    return false;
  }
}

/**
 * Direct alias matching user snippet:
 * setDriverOfficePayment(driverId, amount, note, upiId = "123mdcreation@okaxis")
 */
export async function setDriverOfficePayment(
  config: FirebaseConnectionConfig,
  driverId: string,
  amount: number,
  note: string = 'Trip CC (Convenience Charge)',
  upiId: string = '',
  docId?: string
): Promise<boolean> {
  return setDriverOfficeDue(config, driverId, amount, note, upiId, docId);
}

/**
 * Clears driver office dues once payment is verified.
 * Updates payment_amount: 0.0, payment_status: "CLEARED", payment_note: "No Dues Pending",
 * driver_payment_status: "VERIFIED", updated_at: serverTimestamp()
 */
export async function clearDriverOfficeDue(
  config: FirebaseConnectionConfig,
  driverId: string,
  docId?: string
): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    const targetDocId = (docId || driverId).trim();
    if (!targetDocId) return false;
    const paymentPayload = {
      payment_amount: 0.0,
      payment_status: 'CLEARED',
      payment_note: 'No Dues Pending',
      driver_payment_status: 'VERIFIED',
      updated_at: serverTimestamp(),
      payment_updated_at: Date.now(),
    };

    const primaryRef = doc(db, 'drivers', targetDocId);
    await setDoc(primaryRef, paymentPayload, { merge: true });

    return true;
  } catch (error) {
    console.error('Error clearing driver due:', error);
    return false;
  }
}

/**
 * Direct alias matching user snippet: markPaymentCleared(driverId)
 */
export async function markPaymentCleared(
  config: FirebaseConnectionConfig,
  driverId: string,
  docId?: string
): Promise<boolean> {
  return clearDriverOfficeDue(config, driverId, docId);
}

/**
 * Upserts a trip document in Firestore matching Android Driver App format
 */
function serializeTripForFirestore(trip: FirestoreTrip): Record<string, unknown> {
  const tripMap: Record<string, unknown> = {
    trip_id: (trip.trip_id || '').toString().replace(/^TRIP-?/i, '').trim(),
    customer_name: trip.customer_name,
    customer_phone: trip.customer_phone,
    pickup_location: trip.pickup_location,
    drop_location: trip.drop_location,
    pickup_lat: trip.pickup_lat,
    pickup_lng: trip.pickup_lng,
    drop_lat: trip.drop_lat,
    drop_lng: trip.drop_lng,
    status: trip.status,
    driver_id: trip.driver_id,
    driver_name: trip.driver_name,
    driver_phone: trip.driver_phone,
    vehicle_number: trip.vehicle_number,
    vehicle_category: trip.vehicle_category,
    estimated_fare: trip.estimated_fare,
    final_fare: trip.final_fare,
    notes: trip.notes,
    created_at: trip.created_at || Date.now(),
    updated_at: trip.updated_at || Date.now(),
    accepted_at: trip.accepted_at,
    started_at: trip.started_at,
    completed_at: trip.completed_at,
    trip_type: trip.trip_type,
    base_fare: trip.base_fare,
    kms_fare: trip.kms_fare,
    hour_fare: trip.hour_fare,
    is_package: trip.is_package,
    package_hours: trip.package_hours ?? null,
    package_kms: trip.package_kms ?? null,
    dispatch_type: trip.dispatch_type,
    radius_kms: trip.radius_kms,
    otp: trip.otp,
  };
  if (trip.distance_km !== undefined) tripMap.distance_km = trip.distance_km;
  if (trip.duration_seconds !== undefined) tripMap.duration_seconds = trip.duration_seconds;
  if (trip.waiting_seconds !== undefined) tripMap.waiting_seconds = trip.waiting_seconds;
  if (trip.tracking_token !== undefined) tripMap.tracking_token = trip.tracking_token;
  if (trip.tracking_enabled !== undefined) tripMap.tracking_enabled = trip.tracking_enabled;
  if (trip.tracking_created_at !== undefined) tripMap.tracking_created_at = trip.tracking_created_at;
  return tripMap;
}

export async function upsertTripInFirestore(config: FirebaseConnectionConfig, trip: FirestoreTrip): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    const docId = trip.doc_id || `trip_doc_${Date.now()}`;
    const docRef = doc(db, 'trips', docId);

    await setDoc(docRef, serializeTripForFirestore(trip), { merge: true });
    return true;
  } catch (err) {
    console.error('Error writing trip to Firestore:', err);
    return false;
  }
}

/** Atomically claims a trip and a driver so two dispatchers cannot assign them concurrently. */
export async function assignDriverToTripAtomically(
  config: FirebaseConnectionConfig,
  trip: FirestoreTrip,
  driver: FirestoreDriver
): Promise<void> {
  const { db } = getOrCreateFirebaseInstance(config);
  if (!db || !trip.doc_id) throw new Error('Trip database record is unavailable.');

  const tripRef = doc(db, 'trips', trip.doc_id);
  const driverRef = doc(db, 'drivers', driver.doc_id || driver.driver_id);
  await runTransaction(db, async (transaction) => {
    const [tripSnapshot, driverSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(driverRef),
    ]);
    if (!tripSnapshot.exists()) throw new Error('Trip no longer exists. Refresh and try again.');
    if (!driverSnapshot.exists()) throw new Error('Driver no longer exists. Refresh and try again.');

    const currentTrip = tripSnapshot.data();
    const currentDriver = driverSnapshot.data();
    if (currentTrip.status !== 'OPEN' && currentTrip.driver_id !== driver.driver_id) {
      throw new Error('Trip was already assigned or changed by another dispatcher.');
    }
    const busyTripId = currentDriver.current_trip_id;
    if (busyTripId && busyTripId !== trip.trip_id && busyTripId !== trip.doc_id) {
      throw new Error('Driver was assigned to another trip. Refresh and choose another driver.');
    }

    transaction.update(tripRef, {
      status: 'ACCEPTED',
      driver_id: driver.driver_id,
      driver_name: driver.driver_name,
      driver_phone: driver.mobile_number,
      vehicle_number: driver.vehicle_number,
      vehicle_category: driver.vehicle_category,
      accepted_at: trip.accepted_at,
      updated_at: trip.updated_at,
    });
    transaction.update(driverRef, {
      current_trip_id: trip.trip_id,
      updated_at: serverTimestamp(),
    });
  });
}

/** Atomically changes trip status and, when supplied, releases its driver. */
export async function transitionTripAtomically(
  config: FirebaseConnectionConfig,
  trip: FirestoreTrip,
  expectedStatuses: string[],
  driver?: FirestoreDriver | null,
  incrementDriverTrips: boolean = false
): Promise<void> {
  const { db } = getOrCreateFirebaseInstance(config);
  if (!db || !trip.doc_id) throw new Error('Trip database record is unavailable.');

  const tripRef = doc(db, 'trips', trip.doc_id);
  const driverRef = driver ? doc(db, 'drivers', driver.doc_id || driver.driver_id) : null;
  await runTransaction(db, async (transaction) => {
    const tripSnapshot = await transaction.get(tripRef);
    if (!tripSnapshot.exists()) throw new Error('Trip no longer exists. Refresh and try again.');
    const persistedStatus = String(tripSnapshot.data().status || 'OPEN');
    if (persistedStatus !== trip.status && !expectedStatuses.includes(persistedStatus)) {
      throw new Error(`Trip status changed to ${persistedStatus}. Refresh before updating it.`);
    }

    const driverSnapshot = driverRef ? await transaction.get(driverRef) : null;
    const tripUpdates: Record<string, unknown> = {
      status: trip.status,
      updated_at: trip.updated_at,
    };
    if (trip.started_at !== undefined) tripUpdates.started_at = trip.started_at;
    if (trip.completed_at !== undefined) tripUpdates.completed_at = trip.completed_at;
    if (trip.final_fare !== undefined) tripUpdates.final_fare = trip.final_fare;
    if (trip.distance_km !== undefined) tripUpdates.distance_km = trip.distance_km;
    if (trip.duration_seconds !== undefined) tripUpdates.duration_seconds = trip.duration_seconds;
    if (trip.waiting_seconds !== undefined) tripUpdates.waiting_seconds = trip.waiting_seconds;
    if (trip.tracking_enabled !== undefined) tripUpdates.tracking_enabled = trip.tracking_enabled;
    if (trip.notes !== undefined) tripUpdates.notes = trip.notes;
    if (trip.status === 'OPEN') {
      tripUpdates.driver_id = null;
      tripUpdates.driver_name = null;
      tripUpdates.driver_phone = null;
      tripUpdates.vehicle_number = null;
    }
    transaction.update(tripRef, tripUpdates);

    if (driverRef && driverSnapshot?.exists()) {
      const driverUpdates: Record<string, unknown> = {
        current_trip_id: null,
        updated_at: serverTimestamp(),
      };
      if (incrementDriverTrips) {
        driverUpdates.total_trips = Number(driverSnapshot.data().total_trips || 0) + 1;
      }
      transaction.update(driverRef, driverUpdates);
    }
    if (
      trip.tracking_token &&
      (trip.status === 'COMPLETED' || trip.status === 'CANCELLED')
    ) {
      transaction.set(doc(db, 'tracking_sessions', trip.tracking_token), {
        is_active: false,
        disabled_at: Date.now(),
      }, { merge: true });
    }
  });
}

/** Atomically edits a trip and synchronizes old/new driver availability. */
export async function updateTripDetailsAtomically(
  config: FirebaseConnectionConfig,
  originalTrip: FirestoreTrip,
  updatedTrip: FirestoreTrip,
  oldDriver?: FirestoreDriver | null,
  newDriver?: FirestoreDriver | null
): Promise<void> {
  const { db } = getOrCreateFirebaseInstance(config);
  if (!db || !originalTrip.doc_id) throw new Error('Trip database record is unavailable.');

  const tripRef = doc(db, 'trips', originalTrip.doc_id);
  const oldDriverRef = oldDriver ? doc(db, 'drivers', oldDriver.doc_id || oldDriver.driver_id) : null;
  const newDriverRef = newDriver ? doc(db, 'drivers', newDriver.doc_id || newDriver.driver_id) : null;
  await runTransaction(db, async (transaction) => {
    const tripSnapshot = await transaction.get(tripRef);
    const oldDriverSnapshot = oldDriverRef ? await transaction.get(oldDriverRef) : null;
    const newDriverSnapshot = newDriverRef && newDriverRef.path !== oldDriverRef?.path
      ? await transaction.get(newDriverRef)
      : oldDriverSnapshot;
    if (!tripSnapshot.exists()) throw new Error('Trip no longer exists. Refresh and try again.');

    const persisted = tripSnapshot.data();
    if ((persisted.driver_id || null) !== (originalTrip.driver_id || null)) {
      throw new Error('Trip assignment changed in another session. Refresh before saving.');
    }
    if (newDriverSnapshot?.exists()) {
      const busyTripId = newDriverSnapshot.data().current_trip_id;
      if (busyTripId && busyTripId !== originalTrip.trip_id && busyTripId !== originalTrip.doc_id) {
        throw new Error('The selected driver was assigned to another trip.');
      }
    }

    transaction.set(tripRef, serializeTripForFirestore(updatedTrip), { merge: true });
    if (oldDriverRef && oldDriverRef.path !== newDriverRef?.path && oldDriverSnapshot?.exists()) {
      transaction.update(oldDriverRef, { current_trip_id: null, updated_at: serverTimestamp() });
    }
    if (newDriverRef && newDriverSnapshot?.exists()) {
      const terminal = updatedTrip.status === 'COMPLETED' || updatedTrip.status === 'CANCELLED';
      transaction.update(newDriverRef, {
        current_trip_id: terminal ? null : updatedTrip.trip_id,
        updated_at: serverTimestamp(),
      });
    }
  });
}

/**
 * Removes trip from Firestore
 */
export async function deleteTripFromFirestore(config: FirebaseConnectionConfig, docId: string): Promise<boolean> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return false;

    await deleteDoc(doc(db, 'trips', docId));
    return true;
  } catch (err) {
    console.error('Error deleting trip from Firestore:', err);
    return false;
  }
}

export interface SystemUpdateResult {
  success: boolean;
  permissionDenied: boolean;
  wroteFallback: boolean;
  error?: string;
}

/**
 * Updates the single system_settings/dispatch_control document in Firestore.
 * Does NOT touch driver table or create multiple documents.
 */
export async function updateSystemSettingsInFirestore(
  config: FirebaseConnectionConfig,
  settings: SystemControlSettings
): Promise<SystemUpdateResult> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) {
      return { success: false, permissionDenied: false, wroteFallback: false, error: 'Database not initialized' };
    }

    const data = {
      admin_online: settings.admin_online,
      sync_enabled: settings.sync_enabled,
      status: settings.admin_online ? 'ONLINE' : 'CUTOFF',
      updated_at: settings.updated_at || Date.now(),
      broadcast_notice: settings.broadcast_notice || '',
      emergency_mode: settings.emergency_mode || false,
      driver_app_min_version: settings.driver_app_min_version || '2.4.0',
    };

    // Single document write: system_settings/dispatch_control
    let permDenied = false;
    let lastErrMessage = '';

    try {
      await setDoc(doc(db, 'system_settings', 'dispatch_control'), data, { merge: true });
      return {
        success: true,
        permissionDenied: false,
        wroteFallback: false,
      };
    } catch (systemErr: any) {
      lastErrMessage = systemErr?.message || String(systemErr);
      if (lastErrMessage.includes('insufficient permissions') || systemErr?.code === 'permission-denied') {
        permDenied = true;
      }
      return {
        success: false,
        permissionDenied: permDenied,
        wroteFallback: false,
        error: lastErrMessage,
      };
    }
  } catch (err: any) {
    console.warn('Error in updateSystemSettingsInFirestore:', err);
    return {
      success: false,
      permissionDenied: false,
      wroteFallback: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Creates an optional tracking session for a customer-requested live tracking link.
 * Only called on explicit admin generation.
 */
export async function createTrackingSessionInFirestore(
  config: FirebaseConnectionConfig,
  session: CustomerTrackingSession,
  tripDocId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return { success: false, error: 'Database not initialized' };

    if (!tripDocId) return { success: false, error: 'Trip document ID is required' };

    const batch = writeBatch(db);
    batch.set(doc(db, 'trips', tripDocId), {
      tracking_token: session.token,
      tracking_enabled: true,
      tracking_created_at: session.created_at,
    }, { merge: true });
    batch.set(doc(db, 'tracking_sessions', session.token), {
      token: session.token,
      trip_id: session.trip_id,
      created_at: session.created_at,
      is_active: true,
      customer_name: session.customer_name || 'Customer',
      customer_phone: session.customer_phone || '',
      driver_id: session.driver_id || null,
    });
    await batch.commit();

    return { success: true };
  } catch (err: any) {
    handleFirestoreError(err, OperationType.CREATE, `tracking_sessions/${session.token}`);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Manually revokes or disables a customer tracking link
 */
export async function disableTrackingSessionInFirestore(
  config: FirebaseConnectionConfig,
  token: string,
  tripDocId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) return { success: false, error: 'Database not initialized' };

    if (!tripDocId) return { success: false, error: 'Trip document ID is required' };
    const batch = writeBatch(db);
    batch.set(doc(db, 'trips', tripDocId), {
      tracking_enabled: false,
      tracking_disabled_at: Date.now(),
    }, { merge: true });

    // 2. Deactivate tracking session doc if accessible
    if (token) {
      batch.set(doc(db, 'tracking_sessions', token), {
        is_active: false,
        disabled_at: Date.now(),
      }, { merge: true });
    }
    await batch.commit();

    return { success: true };
  } catch (err: any) {
    handleFirestoreError(err, OperationType.UPDATE, `tracking_sessions/${token}`);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dedicated single-trip customer tracking listener.
 * Strictly scopes reads only to the requested trip and its assigned driver.
 * Automatically tears down when trip completes or expires.
 */
export function subscribeToCustomerTrackingSession(
  config: FirebaseConnectionConfig,
  token: string,
  onUpdate: (payload: {
    session: CustomerTrackingSession | null;
    trip: FirestoreTrip | null;
    driver: FirestoreDriver | null;
    isExpired: boolean;
    reason?: string;
  }) => void,
  onError: (err: any) => void
): () => void {
  let isTornDown = false;
  let unsubSession: Unsubscribe | null = null;
  let unsubTrip: Unsubscribe | null = null;
  let unsubDriver: Unsubscribe | null = null;
  let unsubTripsQuery: Unsubscribe | null = null;

  const teardown = () => {
    isTornDown = true;
    if (unsubSession) {
      unsubSession();
      unsubSession = null;
    }
    if (unsubTrip) {
      unsubTrip();
      unsubTrip = null;
    }
    if (unsubDriver) {
      unsubDriver();
      unsubDriver = null;
    }
    if (unsubTripsQuery) {
      unsubTripsQuery();
      unsubTripsQuery = null;
    }
  };

  try {
    const { db } = getOrCreateFirebaseInstance(config);
    if (!db) {
      onError(new Error('Firebase DB not initialized'));
      return teardown;
    }

    let currentSession: CustomerTrackingSession | null = null;
    let currentTrip: FirestoreTrip | null = null;
    let currentDriver: FirestoreDriver | null = null;
    let currentDriverId: string | null = null;

    const parseTripSnapshot = (docSnap: any): FirestoreTrip => {
      const liveTData = docSnap.data();
      const rawTripId = (liveTData.trip_id || docSnap.id || '').toString().trim();
      const cleanTripId = rawTripId.replace(/^TRIP-?/i, '');
      return {
        doc_id: docSnap.id,
        trip_id: cleanTripId || rawTripId,
        customer_name: liveTData.customer_name || 'Customer',
        customer_phone: liveTData.customer_phone || liveTData.customer_mobile || '',
        pickup_location: liveTData.pickup_location || '',
        drop_location: liveTData.drop_location || '',
        pickup_lat: typeof liveTData.pickup_lat === 'number' ? liveTData.pickup_lat : null,
        pickup_lng: typeof liveTData.pickup_lng === 'number' ? liveTData.pickup_lng : null,
        drop_lat: typeof liveTData.drop_lat === 'number' ? liveTData.drop_lat : null,
        drop_lng: typeof liveTData.drop_lng === 'number' ? liveTData.drop_lng : null,
        status: liveTData.status || 'OPEN',
        driver_id: liveTData.driver_id || null,
        driver_name: liveTData.driver_name || null,
        driver_phone: liveTData.driver_phone || null,
        vehicle_number: liveTData.vehicle_number || null,
        vehicle_category: liveTData.vehicle_category || null,
        estimated_fare: Number(liveTData.estimated_fare || liveTData.fare || 0),
        final_fare: typeof liveTData.final_fare === 'number' ? liveTData.final_fare : null,
        notes: liveTData.notes || '',
        created_at: Number(liveTData.created_at || Date.now()),
        updated_at: Number(liveTData.updated_at || Date.now()),
        accepted_at: typeof liveTData.accepted_at === 'number' ? liveTData.accepted_at : null,
        started_at: typeof liveTData.started_at === 'number' ? liveTData.started_at : null,
        completed_at: typeof liveTData.completed_at === 'number' ? liveTData.completed_at : null,
        trip_type: liveTData.trip_type || 'REGULAR',
        base_fare: typeof liveTData.base_fare === 'number' ? liveTData.base_fare : null,
        kms_fare: typeof liveTData.kms_fare === 'number' ? liveTData.kms_fare : null,
        hour_fare: typeof liveTData.hour_fare === 'number' ? liveTData.hour_fare : null,
        is_package: Boolean(liveTData.is_package),
        dispatch_type: liveTData.dispatch_type || 'BROADCAST',
        otp: liveTData.otp ? String(liveTData.otp) : null,
        distance_km: typeof liveTData.distance_km === 'number' ? liveTData.distance_km : undefined,
        duration_seconds: typeof liveTData.duration_seconds === 'number' ? liveTData.duration_seconds : undefined,
        waiting_seconds: typeof liveTData.waiting_seconds === 'number' ? liveTData.waiting_seconds : undefined,
        tracking_token: liveTData.tracking_token,
        tracking_enabled: liveTData.tracking_enabled,
      };
    };

    const handleTripUpdate = (liveTrip: FirestoreTrip) => {
      currentTrip = liveTrip;

      const isFinished = liveTrip.status === 'COMPLETED' || liveTrip.status === 'CANCELLED';
      const isRevoked = liveTrip.tracking_enabled === false || currentSession?.is_active === false;
      const isExpired = isFinished || isRevoked;

      if (!currentSession) {
        currentSession = {
          token,
          trip_id: liveTrip.trip_id,
          created_at: liveTrip.created_at,
          is_active: !isExpired,
          customer_name: liveTrip.customer_name,
          customer_phone: liveTrip.customer_phone,
          driver_id: liveTrip.driver_id,
        };
      }

      // If driver is assigned and ride not completed, stream live GPS
      const activeDriverId = liveTrip.driver_id;
      if (activeDriverId && activeDriverId !== currentDriverId && !isExpired) {
        if (unsubDriver) unsubDriver();
        currentDriverId = activeDriverId;

        const applyDriverSnapshot = (driverSnap: any) => {
          const dData = driverSnap.data();
          currentDriver = {
            doc_id: driverSnap.id,
            driver_id: dData.driver_id || driverSnap.id,
            driver_name: dData.driver_name || dData.name || '',
            mobile_number: dData.mobile_number || dData.driver_mobile || dData.phone || '',
            vehicle_number: dData.vehicle_number || dData.vehicle_no || '',
            vehicle_category: dData.vehicle_category || dData.vehicle_type || 'Mini',
            status: dData.status || 'ACTIVE',
            is_online: Boolean(dData.is_online),
            latitude: typeof dData.latitude === 'number' ? dData.latitude : null,
            longitude: typeof dData.longitude === 'number' ? dData.longitude : null,
            photo_url: dData.photo_url || '',
            expiry_date: dData.expiry_date || '',
            photo_version: Number(dData.photo_version || 1),
            device_id: dData.device_id || '',
            rating: typeof dData.rating === 'number' ? dData.rating : 4.9,
            total_trips: typeof dData.total_trips === 'number' ? dData.total_trips : 0,
          };
          onUpdate({
            session: currentSession,
            trip: currentTrip,
            driver: currentDriver,
            isExpired: false,
          });
        };

        unsubDriver = onSnapshot(
          doc(db, 'drivers', activeDriverId),
          (driverSnap) => {
            if (isTornDown) return;
            if (driverSnap.exists()) {
              applyDriverSnapshot(driverSnap);
              return;
            }

            // Some projects store the driver's canonical ID in a field while
            // using a different Firestore document ID. Resolve that existing
            // record without adding a second live listener when the direct ID
            // lookup succeeds.
            if (unsubDriver) unsubDriver();
            unsubDriver = onSnapshot(
              query(collection(db, 'drivers'), where('driver_id', '==', activeDriverId), limit(1)),
              (driverSnapQuery) => {
                if (isTornDown || driverSnapQuery.empty) return;
                applyDriverSnapshot(driverSnapQuery.docs[0]);
              },
              (err) => console.warn('Driver tracking query note:', err)
            );
          },
          (err) => console.warn('Driver tracking listener note:', err)
        );
      }

      onUpdate({
        session: currentSession,
        trip: currentTrip,
        driver: currentDriver,
        isExpired,
        reason: isRevoked
          ? 'This tracking link has been disabled by dispatch.'
          : isFinished
          ? liveTrip.status === 'COMPLETED'
            ? 'This ride has completed. Thank you for traveling with us!'
            : 'This trip has been cancelled.'
          : undefined,
      });

      if (isExpired) {
        teardown();
      }
    };

    // 1. Subscribe to trips where tracking_token == token
    const tokenQuery = query(collection(db, 'trips'), where('tracking_token', '==', token));
    unsubTripsQuery = onSnapshot(
      tokenQuery,
      (snap) => {
        if (isTornDown) return;
        if (!snap.empty) {
          handleTripUpdate(parseTripSnapshot(snap.docs[0]));
          return;
        }

        // 2. If not matched by tracking_token, check where trip_id == token
        const idQuery = query(collection(db, 'trips'), where('trip_id', '==', token));
        getDocs(idQuery).then((idSnap) => {
          if (isTornDown) return;
          if (!idSnap.empty) {
            handleTripUpdate(parseTripSnapshot(idSnap.docs[0]));
            return;
          }

          // 3. Check if token is the doc_id itself in trips
          getDoc(doc(db, 'trips', token)).then((docSnap) => {
            if (isTornDown) return;
            if (docSnap.exists()) {
              handleTripUpdate(parseTripSnapshot(docSnap));
              return;
            }

            // 4. Check tracking_sessions collection
            getDoc(doc(db, 'tracking_sessions', token)).then((sessSnap) => {
              if (isTornDown) return;
              if (sessSnap.exists()) {
                const sData = sessSnap.data();
                const targetTripId = sData.trip_id;
                if (targetTripId) {
                  const targetQuery = query(collection(db, 'trips'), where('trip_id', '==', targetTripId));
                  getDocs(targetQuery).then((tSnap) => {
                    if (isTornDown) return;
                    if (!tSnap.empty) {
                      handleTripUpdate(parseTripSnapshot(tSnap.docs[0]));
                    } else {
                      getDoc(doc(db, 'trips', targetTripId)).then((tDoc) => {
                        if (isTornDown) return;
                        if (tDoc.exists()) {
                          handleTripUpdate(parseTripSnapshot(tDoc));
                        } else {
                          onUpdate({
                            session: null,
                            trip: null,
                            driver: null,
                            isExpired: true,
                            reason: 'Tracking link not found or has been removed.',
                          });
                        }
                      }).catch(() => {});
                    }
                  }).catch(() => {});
                  return;
                }
              }

              onUpdate({
                session: null,
                trip: null,
                driver: null,
                isExpired: true,
                reason: 'Tracking link not found or has been removed.',
              });
            }).catch(() => {
              onUpdate({
                session: null,
                trip: null,
                driver: null,
                isExpired: true,
                reason: 'Tracking link not found or has been removed.',
              });
            });
          }).catch(() => {});
        }).catch(() => {});
      },
      (err) => {
        console.warn('Trips token query error, falling back:', err);
        // Direct document fetch fallback
        getDoc(doc(db, 'trips', token)).then((docSnap) => {
          if (isTornDown) return;
          if (docSnap.exists()) {
            handleTripUpdate(parseTripSnapshot(docSnap));
          } else {
            onError(err);
          }
        }).catch(() => onError(err));
      }
    );
  } catch (err) {
    onError(err);
  }

  return teardown;
}

