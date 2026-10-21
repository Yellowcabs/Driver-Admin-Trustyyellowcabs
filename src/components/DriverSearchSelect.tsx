import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FirestoreDriver, FirestoreTrip, formatTripId } from '../types';
import { DriverAvatar } from './DriverAvatar';
import {
  Search,
  Car,
  PhoneCall,
  Check,
  X,
  Zap,
  ChevronDown,
  Radio,
  MapPin,
  UserCheck,
  MessageSquare,
  Ban,
  Clock,
  AlertTriangle,
} from 'lucide-react';

// Calculate distance in km between two GPS coordinates using the Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal place
}

interface DriverSearchSelectProps {
  drivers: FirestoreDriver[];
  selectedDriverId: string;
  onSelect: (driverId: string) => void;
  label?: string;
  dispatchType?: 'BROADCAST' | 'RADIUS';
  onDispatchTypeChange?: (type: 'BROADCAST' | 'RADIUS') => void;
  radiusKms?: number | string;
  onRadiusChange?: (radius: string) => void;
  required?: boolean;
  pickupLat?: number | string;
  pickupLng?: number | string;
  pickupLocation?: string;
  trips?: FirestoreTrip[];
  currentTripId?: string;
  selectionPage?: boolean;
  onBack?: () => void;
  onConfirm?: () => void;
  onAvailableCountChange?: (count: number) => void;
  cleanEditLayout?: boolean;
  onOpenSelectionPage?: () => void;
  preserveSelectedDriverId?: string;
}

export const DriverSearchSelect: React.FC<DriverSearchSelectProps> = ({
  drivers,
  selectedDriverId,
  onSelect,
  label = 'Direct Driver Assignment',
  dispatchType = 'RADIUS',
  onDispatchTypeChange,
  radiusKms = 5,
  onRadiusChange,
  pickupLat,
  pickupLng,
  pickupLocation,
  trips = [],
  currentTripId,
  selectionPage = false,
  onBack,
  onConfirm,
  onAvailableCountChange,
  cleanEditLayout = false,
  onOpenSelectionPage,
  preserveSelectedDriverId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [selectionFilter, setSelectionFilter] = useState<'ONLINE' | 'ALL'>('ONLINE');
  const [selectionPageLimit, setSelectionPageLimit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionPageScrollRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reference coordinates for distance calculation (pickup or Coimbatore center)
  const hasPickupCoord = Boolean(
    pickupLat !== undefined &&
      pickupLng !== undefined &&
      !isNaN(Number(pickupLat)) &&
      !isNaN(Number(pickupLng))
  );
  const refLat = hasPickupCoord ? Number(pickupLat) : 11.0168;
  const refLng = hasPickupCoord ? Number(pickupLng) : 76.9558;
  const radiusLimit = Number(radiusKms) > 0 ? Number(radiusKms) : 5;

  // Map of driver_id -> ongoing / in-process trip (IN_PROGRESS or ACCEPTED)
  const busyDriversMap = useMemo(() => {
    const map = new Map<string, FirestoreTrip>();
    if (!trips || !Array.isArray(trips)) return map;
    for (const t of trips) {
      if (
        t.driver_id &&
        (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') &&
        t.trip_id !== currentTripId &&
        t.doc_id !== currentTripId
      ) {
        map.set(t.driver_id, t);
      }
    }
    return map;
  }, [trips, currentTripId]);

  const getOngoingTrip = useCallback(
    (driverId: string, driverCurrentTripId?: string | null): FirestoreTrip | null => {
      if (busyDriversMap.has(driverId)) {
        return busyDriversMap.get(driverId)!;
      }
      if (driverCurrentTripId && trips && Array.isArray(trips)) {
        const match = trips.find(
          (t) =>
            (t.trip_id === driverCurrentTripId || t.doc_id === driverCurrentTripId) &&
            t.trip_id !== currentTripId &&
            t.doc_id !== currentTripId &&
            (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED')
        );
        if (match) return match;
      }
      return null;
    },
    [busyDriversMap, trips, currentTripId]
  );

  // Selected driver object - only compute for selected
  const selectedDriver = useMemo(() => {
    if (!selectedDriverId) return null;
    const found = drivers.find((d) => d.driver_id === selectedDriverId);
    if (!found) return null;
    const distanceKm =
      found.latitude != null && found.longitude != null
        ? calculateDistanceKm(refLat, refLng, found.latitude, found.longitude)
        : null;
    return { ...found, distanceKm };
  }, [drivers, selectedDriverId, refLat, refLng]);

  const selectedOngoingTrip = useMemo(() => {
    if (!selectedDriver) return null;
    return getOngoingTrip(selectedDriver.driver_id, selectedDriver.current_trip_id);
  }, [selectedDriver, getOngoingTrip]);

  // Compute distances for drivers lazily only when dropdown is open, with fast bounding-box pre-filtering
  const driversWithDistance = useMemo(() => {
    // If closed, return empty list or minimal to save CPU for 5000+ drivers
    if (!isOpen) return [];

    const isRadius = dispatchType === 'RADIUS';
    const latDelta = (radiusLimit / 110) * 1.25; // 25% safety margin in degrees
    const lngDelta = (radiusLimit / 105) * 1.25;

    const result = [];
    for (let i = 0; i < drivers.length; i++) {
      const d = drivers[i];
      if (d.status && d.status !== 'ACTIVE') continue;

      if (d.latitude == null || d.longitude == null) {
        if (!isRadius) {
          result.push({ ...d, distanceKm: null });
        }
        continue;
      }

      // Fast bounding box check before expensive trigonometric Haversine
      if (isRadius && d.driver_id !== selectedDriverId) {
        if (
          Math.abs(d.latitude - refLat) > latDelta ||
          Math.abs(d.longitude - refLng) > lngDelta
        ) {
          continue;
        }
      }

      const distanceKm = calculateDistanceKm(refLat, refLng, d.latitude, d.longitude);
      if (isRadius && d.driver_id !== selectedDriverId && distanceKm > radiusLimit) {
        continue;
      }

      result.push({ ...d, distanceKm });
    }

    return result;
  }, [drivers, refLat, refLng, isOpen, dispatchType, radiusLimit, selectedDriverId]);

  // Filtered and sorted drivers list according to radius and search
  const filteredDrivers = useMemo(() => {
    if (!isOpen) return [];
    const q = searchQuery.trim().toLowerCase();

    return driversWithDistance
      .filter((driver) => {
        // Online filter
        if (filterOnlineOnly && !driver.is_online) return false;

        // Available only filter: hide drivers with ongoing in-process trips
        const ongoingTrip = getOngoingTrip(driver.driver_id, driver.current_trip_id);
        if (filterAvailableOnly && ongoingTrip) return false;

        // Text search filter
        if (q) {
          const idMatch = (driver.driver_id || '').toLowerCase().includes(q);
          const nameMatch = (driver.driver_name || '').toLowerCase().includes(q);
          const vehicleMatch = (driver.vehicle_number || '').toLowerCase().includes(q);
          const categoryMatch = (driver.vehicle_category || '').toLowerCase().includes(q);
          const phoneMatch = (driver.mobile_number || '').toLowerCase().includes(q);
          if (!idMatch && !nameMatch && !vehicleMatch && !categoryMatch && !phoneMatch) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Ongoing trip busy drivers sort below available drivers
        const aBusy = Boolean(getOngoingTrip(a.driver_id, a.current_trip_id));
        const bBusy = Boolean(getOngoingTrip(b.driver_id, b.current_trip_id));
        if (aBusy && !bBusy) return 1;
        if (!aBusy && bBusy) return -1;

        // In radius mode or broadcast mode, sort by distance ascending (nearest first)
        if (a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
      });
  }, [
    driversWithDistance,
    filterOnlineOnly,
    filterAvailableOnly,
    searchQuery,
    isOpen,
    getOngoingTrip,
  ]);

  // Count of online drivers strictly within the radius (quick calculation)
  const nearbyRadiusCount = useMemo(() => {
    if (isOpen) {
      return driversWithDistance.filter(
        (d) => d.is_online && d.distanceKm !== null && d.distanceKm <= radiusLimit
      ).length;
    }
    // Lightweight count when closed
    const latDelta = radiusLimit / 110;
    const lngDelta = radiusLimit / 105;
    let count = 0;
    for (let i = 0; i < drivers.length; i++) {
      const d = drivers[i];
      if (!d.is_online || d.status !== 'ACTIVE' || d.latitude == null || d.longitude == null) continue;
      if (Math.abs(d.latitude - refLat) <= latDelta && Math.abs(d.longitude - refLng) <= lngDelta) {
        count++;
      }
    }
    return count;
  }, [driversWithDistance, radiusLimit, isOpen, drivers, refLat, refLng]);

  useEffect(() => {
    onAvailableCountChange?.(nearbyRadiusCount);
  }, [nearbyRadiusCount, onAvailableCountChange]);

  useEffect(() => {
    if (selectionPage) setIsOpen(true);
  }, [selectionPage]);

  // Visible sliced list to ensure rapid 60FPS mobile rendering
  const visibleDrivers = useMemo(() => {
    return filteredDrivers.slice(0, 50);
  }, [filteredDrivers]);

  const selectionPageDrivers = useMemo(() => {
    if (!selectionPage) return [];

    const query = searchQuery.trim().toLowerCase();
    const matchingDrivers = drivers
      .map((driver) => ({
        ...driver,
        distanceKm:
          driver.latitude != null && driver.longitude != null
            ? calculateDistanceKm(refLat, refLng, driver.latitude, driver.longitude)
            : null,
      }))
      .filter((driver) => {
        if (!query) return true;
        return (
          (driver.driver_name || '').toLowerCase().includes(query) ||
           (driver.driver_id || '').toLowerCase().includes(query) ||
           (cleanEditLayout && (driver.vehicle_number || '').toLowerCase().includes(query))
        );
      });

    if (selectionFilter === 'ALL') return matchingDrivers;

    return matchingDrivers.filter((driver) => {
      const isActive = !driver.status || driver.status === 'ACTIVE';
      const isNearby = driver.distanceKm !== null && driver.distanceKm <= radiusLimit;
      const isAvailable = !getOngoingTrip(driver.driver_id, driver.current_trip_id);
      return isActive && driver.is_online && isNearby && isAvailable;
    });
  }, [selectionPage, selectionFilter, searchQuery, drivers, refLat, refLng, radiusLimit, getOngoingTrip, cleanEditLayout]);

  const onlineSelectionCount = useMemo(() => {
    if (!selectionPage) return 0;
    const query = searchQuery.trim().toLowerCase();
    return drivers.filter((driver) => {
      const isActive = !driver.status || driver.status === 'ACTIVE';
      if (!isActive || !driver.is_online || driver.latitude == null || driver.longitude == null) return false;
      const distanceKm = calculateDistanceKm(refLat, refLng, driver.latitude, driver.longitude);
      const matchesSearch = !query ||
        (driver.driver_name || '').toLowerCase().includes(query) ||
         (driver.driver_id || '').toLowerCase().includes(query) ||
         (cleanEditLayout && (driver.vehicle_number || '').toLowerCase().includes(query));
      return distanceKm <= radiusLimit && !getOngoingTrip(driver.driver_id, driver.current_trip_id) && matchesSearch;
    }).length;
  }, [selectionPage, drivers, refLat, refLng, radiusLimit, getOngoingTrip, searchQuery, cleanEditLayout]);

  const allSelectionCount = useMemo(() => {
    if (!selectionPage) return 0;
    const query = searchQuery.trim().toLowerCase();
    return drivers.filter((driver) => !query ||
      (driver.driver_name || '').toLowerCase().includes(query) ||
      (driver.driver_id || '').toLowerCase().includes(query) ||
      (cleanEditLayout && (driver.vehicle_number || '').toLowerCase().includes(query))
    ).length;
  }, [selectionPage, drivers, searchQuery, cleanEditLayout]);
  const selectedDriverForPage = selectedDriverId
    ? drivers.find((driver) => driver.driver_id === selectedDriverId) || null
    : null;
  const selectedDriverIsEligible = Boolean(
    selectedDriverForPage &&
      (!selectedDriverForPage.status || selectedDriverForPage.status === 'ACTIVE') &&
      selectedDriverForPage.is_online &&
      !getOngoingTrip(selectedDriverForPage.driver_id, selectedDriverForPage.current_trip_id)
  );

  useEffect(() => {
    if (selectionPage) setSelectionPageLimit(50);
  }, [selectionPage, selectionFilter, searchQuery]);

  useEffect(() => {
    if (selectionPage && selectedDriverId && !selectedDriverIsEligible && selectedDriverId !== preserveSelectedDriverId) {
      onSelect('');
    }
  }, [selectionPage, selectedDriverId, selectedDriverIsEligible, onSelect, preserveSelectedDriverId]);

  useEffect(() => {
    if (selectionPage) {
      selectionPageScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [selectionPage]);

  if (selectionPage) {
    return (
      <div
        ref={selectionPageScrollRef}
        className="fixed inset-x-0 bottom-0 top-14 z-[70] overflow-y-auto bg-slate-50 sm:top-16 lg:top-0"
      >
        <div className="min-h-full w-full">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                {cleanEditLayout ? 'Select Driver' : 'Select Nearby Driver'}
              </h2>
              <p className="text-xs text-slate-500">
                {nearbyRadiusCount} available drivers · {radiusLimit} km radius
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Back
            </button>
          </div>

          <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 pb-28 sm:px-6 sm:py-6 min-[768px]:max-[1024px]:max-w-3xl min-[768px]:max-[1024px]:pb-24">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={cleanEditLayout ? 'Search by Driver Name, ID, or Vehicle Number' : 'Search by Driver Name or Driver ID'}
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionFilter('ONLINE')}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-bold transition ${
                    selectionFilter === 'ONLINE'
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Online Drivers ({onlineSelectionCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionFilter('ALL')}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-bold transition ${
                    selectionFilter === 'ALL'
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All Drivers ({allSelectionCount})
                </button>
              </div>
            </div>

            {selectionPageDrivers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">
                  {selectionFilter === 'ONLINE' ? 'No online drivers available' : 'No drivers found'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectionFilter === 'ONLINE'
                    ? `No eligible online drivers are available within ${radiusLimit} km.`
                    : 'No registered drivers match your search.'}
                </p>
              </div>
            ) : (
              selectionPageDrivers.slice(0, selectionPageLimit).map((driver) => {
                const ongoingTrip = getOngoingTrip(driver.driver_id, driver.current_trip_id);
                const isBusy = Boolean(ongoingTrip);
                const isSelected = selectedDriverId === driver.driver_id;
                const isEligible = Boolean(
                  (!driver.status || driver.status === 'ACTIVE') && driver.is_online && !isBusy
                );
                const cleanPhone = driver.mobile_number ? driver.mobile_number.replace(/\D/g, '') : '';
                const telLink = cleanPhone
                  ? cleanPhone.length === 10
                    ? `+91${cleanPhone}`
                    : `+${cleanPhone}`
                  : driver.mobile_number;
                const waLink = cleanPhone
                  ? cleanPhone.length === 10
                    ? `91${cleanPhone}`
                    : cleanPhone
                  : '';

                return (
                  <div
                    key={driver.driver_id}
                    className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                      isSelected ? 'border-amber-500 ring-2 ring-amber-500/15' : 'border-slate-200'
                    } ${isBusy ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{driver.driver_name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          driver.is_online
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}>
                          {driver.is_online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {driver.vehicle_category || 'Vehicle'}
                        {driver.distanceKm !== null ? ` · ${driver.distanceKm} km from pickup` : ''}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Driver ID</div>
                          <div className="mt-0.5 break-words font-semibold text-slate-900">{driver.driver_id}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Vehicle Number</div>
                          <div className="mt-0.5 break-words font-semibold text-slate-900">{driver.vehicle_number || 'Not provided'}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Vehicle Category</div>
                          <div className="mt-0.5 break-words font-semibold text-slate-900">{driver.vehicle_category || 'Not provided'}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">Phone Number</div>
                          <div className="mt-0.5 break-all font-semibold text-slate-900">{driver.mobile_number || 'Not provided'}</div>
                        </div>
                      </div>
                    </div>
                    <div className={cleanEditLayout ? 'mt-3 grid min-w-0 grid-cols-2 gap-2' : 'mt-3 grid grid-cols-[minmax(0,1fr)_44px] gap-2'}>
                      <a
                        href={`tel:${telLink}`}
                        aria-disabled={!cleanPhone}
                          className={`flex min-w-0 min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition ${
                          cleanPhone
                            ? 'bg-[#009966] text-white hover:bg-[#007a52]'
                            : 'pointer-events-none bg-slate-100 text-slate-400'
                        }`}
                      >
                        {!cleanEditLayout && <PhoneCall className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        <span>Call Driver</span>
                      </a>
                      {waLink ? (
                        <a
                          href={`https://wa.me/${waLink}?text=${encodeURIComponent(
                            `Hello ${driver.driver_name}, ride dispatch assignment from Trusty Yellow Cab.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="WhatsApp"
                          title="WhatsApp"
                           className={cleanEditLayout
                             ? 'flex min-h-[44px] items-center justify-center rounded-lg border border-[#009966] bg-white px-3 text-sm font-bold text-[#009966] transition hover:bg-emerald-50'
                             : 'flex min-h-[44px] w-11 items-center justify-center rounded-lg border border-[#009966] bg-white text-[#009966] transition hover:bg-emerald-50'}
                        >
                          {!cleanEditLayout && <MessageSquare className="h-4 w-4" aria-hidden="true" />}
                          {cleanEditLayout && 'WhatsApp'}
                        </a>
                      ) : cleanEditLayout ? (
                        <span className="flex min-h-[44px] min-w-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-400">
                          WhatsApp
                        </span>
                      ) : (
                        <span />
                      )}
                    <button
                      type="button"
                      disabled={!isEligible}
                      onClick={() => onSelect(isSelected ? '' : driver.driver_id)}
                       className={`col-span-2 mt-3 min-h-[44px] w-full min-w-0 rounded-xl px-5 text-sm font-bold transition sm:mt-0 sm:w-auto ${
                        !isEligible
                          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                          : isSelected
                          ? 'border border-[#FF9800] bg-[#FF9800] text-white hover:bg-[#e68900]'
                          : 'border border-[#FF9800] bg-white text-[#FF9800] hover:bg-orange-50'
                      }`}
                      >
                        {isSelected ? (cleanEditLayout ? 'Selected' : 'Deselect Driver') : 'Select Driver'}
                      </button>
                      {cleanEditLayout && !isEligible && (
                        <span className="col-span-2 text-center text-[11px] text-slate-500">
                          {!driver.is_online
                            ? 'Offline drivers cannot be assigned'
                            : driver.status && driver.status !== 'ACTIVE'
                            ? 'Inactive drivers cannot be assigned'
                            : isBusy
                            ? 'Driver has an ongoing trip'
                            : 'Driver unavailable'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {selectionPageDrivers.length > selectionPageLimit && (
              <button
                type="button"
                onClick={() => setSelectionPageLimit((limit) => limit + 50)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Load more drivers ({selectionPageDrivers.length - selectionPageLimit} remaining)
              </button>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
            <div className="mx-auto flex w-full max-w-4xl justify-end">
              <button
                type="button"
                disabled={!selectedDriverId || !selectedDriverIsEligible}
                onClick={onConfirm}
                className="min-h-[44px] w-full rounded-xl bg-amber-500 px-6 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Confirm Driver
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && (
      <div className="flex items-center justify-between">
          <label className="block text-slate-700 font-bold text-xs flex items-center gap-1.5">
            {!cleanEditLayout && <Car className="w-3.5 h-3.5 text-amber-600" />} {label}
          </label>
          {dispatchType === 'RADIUS' && (
            <span className={cleanEditLayout
              ? 'text-[11px] font-medium text-slate-500'
              : 'text-[11px] font-bold text-sky-700 flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200'}>
              {!cleanEditLayout && <MapPin className="w-3 h-3" />}
              <span>{nearbyRadiusCount} online within {radiusLimit} km</span>
            </span>
          )}
        </div>
      )}

      {/* Selected Driver Profile Card OR Driver Selector Trigger */}
      {selectedDriver ? (
        <div className={cleanEditLayout
          ? 'w-full bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 animate-in fade-in duration-150'
          : 'w-full bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 border-2 border-amber-400/90 rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 animate-in fade-in duration-150'}>
          {/* Top Status & Controls */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-1.5 min-w-0">
              {!cleanEditLayout && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
              {!cleanEditLayout && <UserCheck className="w-3.5 h-3.5 text-emerald-600" />}
              {cleanEditLayout ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="break-words text-sm font-extrabold leading-tight text-slate-900 sm:text-base">{selectedDriver.driver_name}</h4>
                    <span className={selectedDriver.is_online ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-slate-500'}>
                      {selectedDriver.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-xs font-black text-amber-950 uppercase tracking-wider">Directly Assigned Driver</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => (onOpenSelectionPage ? onOpenSelectionPage() : setIsOpen(!isOpen))}
                className={cleanEditLayout
                  ? 'min-h-[40px] px-3 py-1 text-xs font-bold rounded-lg bg-white hover:bg-orange-50 text-orange-700 border border-orange-400 transition cursor-pointer'
                  : 'px-2.5 py-1 text-xs font-bold rounded-lg bg-white hover:bg-amber-100 text-slate-700 border border-slate-200 transition cursor-pointer flex items-center gap-1'}
                title="Change or reassign driver"
              >
                <span>{cleanEditLayout ? 'Change Driver' : 'Change'}</span>
                {!cleanEditLayout && <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect('');
                }}
                className={cleanEditLayout
                  ? 'min-h-[40px] px-3 py-1 text-xs font-bold rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 transition cursor-pointer'
                  : 'px-2 py-1 text-xs font-bold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer flex items-center gap-1'}
                title="Unassign driver and switch to Auto-Broadcast"
              >
                {!cleanEditLayout && <X className="w-3.5 h-3.5" />}
                <span className={cleanEditLayout ? '' : 'hidden sm:inline'}>Unassign</span>
              </button>
            </div>
          </div>

          {cleanEditLayout ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">Driver ID</div>
                  <div className="font-semibold text-slate-900 break-words">{selectedDriver.driver_id}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Vehicle Category</div>
                  <div className="font-semibold text-slate-900 break-words">{selectedDriver.vehicle_category}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Vehicle Number</div>
                  <div className="font-semibold text-slate-900 break-words">{selectedDriver.vehicle_number}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Distance</div>
                  <div className="font-semibold text-slate-900">{selectedDriver.distanceKm !== null ? `${selectedDriver.distanceKm} km from pickup` : '—'}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Driver Profile Info (Responsive mobile & desktop) */}
              <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <DriverAvatar
                    photoUrl={selectedDriver.photo_url || selectedDriver.profile_photo_url}
                    name={selectedDriver.driver_name}
                    size="lg"
                    isOnline={selectedDriver.is_online}
                    showStatusBadge={true}
                  />

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">{selectedDriver.driver_name}</h4>
                      <span className="bg-amber-100 text-amber-950 text-[10px] font-mono font-black px-2 py-0.5 rounded border border-amber-300 shrink-0">{selectedDriver.driver_id}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedDriver.is_online ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedDriver.is_online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {selectedDriver.is_online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-slate-600">
                      <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1"><Car className="w-3.5 h-3.5 text-amber-600" />{selectedDriver.vehicle_number}</span>
                      <span className="text-slate-600 font-sans font-medium">{selectedDriver.vehicle_category}</span>
                      {selectedDriver.distanceKm !== null && <span className="bg-sky-100 text-sky-800 font-sans font-bold text-[11px] px-2 py-0.5 rounded-full border border-sky-200 flex items-center gap-1"><MapPin className="w-3 h-3 text-sky-600" />{selectedDriver.distanceKm} km from pickup</span>}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Warning banner if selected driver is currently on an ongoing in-process trip */}
          {selectedOngoingTrip && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-900">
              <div className="flex items-center gap-2 min-w-0">
                {!cleanEditLayout && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span className="leading-snug">
                  <strong>Driver Busy:</strong> This driver is currently on Trip{' '}
                  <span className="font-mono font-bold text-rose-800">#{formatTripId(selectedOngoingTrip.trip_id)}</span> ({selectedOngoingTrip.status}). Trips cannot be assigned until the ongoing trip is finished.
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect('');
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-200 hover:bg-rose-300 text-rose-950 font-bold text-[11px] shrink-0 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}

          {/* Action Buttons: Clear-to-use Prominent Call Button & WhatsApp */}
          <div className={cleanEditLayout ? 'pt-1 grid grid-cols-2 items-stretch gap-2' : 'pt-1 flex flex-col xs:flex-row sm:flex-row items-stretch gap-2'}>
            <a
              href={`tel:${
                selectedDriver.mobile_number.replace(/\D/g, '')
                  ? `+91${selectedDriver.mobile_number.replace(/\D/g, '').slice(-10)}`
                  : selectedDriver.mobile_number
              }`}
              className={cleanEditLayout ? 'min-h-[44px] px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs transition flex items-center justify-center cursor-pointer select-none' : 'min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer select-none'}
            >
              {!cleanEditLayout && <PhoneCall className="w-4 h-4 text-white shrink-0" />}
              <span>{cleanEditLayout ? 'Call Driver' : `Call Driver (${selectedDriver.mobile_number})`}</span>
            </a>

            <a
              href={`https://wa.me/91${(selectedDriver.mobile_number || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                `Hello ${selectedDriver.driver_name}, ride dispatch assignment from Trusty Yellow Cab.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cleanEditLayout ? 'min-h-[44px] px-3 py-2.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center transition cursor-pointer' : 'px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer'}
              title="Open WhatsApp chat with driver"
            >
              {!cleanEditLayout && <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />}
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      ) : (
        <div
          onClick={() => (onOpenSelectionPage ? onOpenSelectionPage() : setIsOpen(!isOpen))}
          className={`w-full border rounded-xl p-3 bg-white cursor-pointer transition flex items-center justify-between gap-2 min-h-[52px] ${
            cleanEditLayout
              ? 'border-slate-200 hover:border-orange-400'
              : `shadow-2xs hover:border-amber-400 ${isOpen ? 'ring-2 ring-amber-500/30 border-amber-500' : 'border-slate-300'}`
          }`}
        >
          <div className="flex items-center gap-2.5 text-slate-600 min-w-0">
            {!cleanEditLayout && <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
              {dispatchType === 'RADIUS' ? <Radio className="w-4 h-4 text-sky-600" /> : <Zap className="w-4 h-4 text-amber-600" />}
            </div>}
            <div className="text-left min-w-0">
              <div className="break-words text-xs font-bold leading-tight text-slate-900">
                 {cleanEditLayout ? 'Select Driver' : dispatchType === 'RADIUS' ? 'Select Nearby Driver' : 'Select Driver or Auto-Broadcast'}
              </div>
              <div className="break-words text-[11px] leading-tight text-slate-500">
                 {cleanEditLayout ? `${nearbyRadiusCount} online within ${radiusLimit} km` : dispatchType === 'RADIUS' ? `${nearbyRadiusCount} active drivers found within ${radiusLimit} km` : 'Tap to choose a specific driver from fleet'}
              </div>
            </div>
          </div>

          {!cleanEditLayout && <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-amber-600' : ''}`} />}
        </div>
      )}

      {/* Popover / Expandable Dropdown Search List */}
      {isOpen && !cleanEditLayout && (
        <div className="p-3 bg-white rounded-2xl border border-slate-300 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-100 z-30">
          {/* Search Box with Search Icon & Instant Reset */}
          <div className="relative">
            {!cleanEditLayout && <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />}
            <input
              type="text"
              placeholder={
                dispatchType === 'RADIUS'
                  ? `Search drivers within ${radiusLimit} km radius...`
                  : 'Search by Driver ID, Name, or Vehicle Number...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white ${cleanEditLayout ? 'pl-3' : 'pl-8'}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {!cleanEditLayout && <X className="w-3.5 h-3.5" />}
                {cleanEditLayout && 'Clear'}
              </button>
            )}
          </div>

          {/* Filter Status Bar */}
          <div className="flex items-center justify-between text-[11px] px-0.5 gap-2 flex-wrap">
            <span className="text-slate-600 font-medium">
              {dispatchType === 'RADIUS' ? (
                <span>
                  Found <strong>{filteredDrivers.length}</strong> drivers within{' '}
                  <strong className="text-sky-700">{radiusLimit} km</strong>
                </span>
              ) : (
                <span>
                  Found <strong>{filteredDrivers.length}</strong> fleet drivers
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilterAvailableOnly(!filterAvailableOnly)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                  filterAvailableOnly
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
                title="Hide drivers currently on an ongoing in-process trip"
              >
                {!cleanEditLayout && <UserCheck className="w-3 h-3 text-emerald-600" />}
                <span>{filterAvailableOnly ? 'Available Only' : 'All Drivers'}</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterOnlineOnly(!filterOnlineOnly)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                  filterOnlineOnly
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {filterOnlineOnly ? '● Online Only' : 'Show All'}
              </button>
            </div>
          </div>

          {/* Drivers List */}
          <div className="max-h-72 sm:max-h-80 overflow-y-auto space-y-2 pr-0.5">
            {/* Auto-Broadcast / No Specific Driver Option */}
            <div
              onClick={() => {
                onSelect('');
                setIsOpen(false);
              }}
              className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                !selectedDriverId
                  ? 'bg-amber-50 border-amber-400 text-slate-950 font-bold ring-2 ring-amber-400/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs'
              }`}
            >
              <div className="min-w-0">
                <div className="break-words text-xs font-bold leading-tight text-slate-900 sm:text-sm">
                  {dispatchType === 'RADIUS'
                    ? `Auto-Broadcast (${nearbyRadiusCount} drivers within ${radiusLimit} km)`
                    : 'Auto-Broadcast to All Fleet'}
                </div>
                <div className="mt-0.5 break-words text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                  Open dispatch — fastest active driver takes the ride
                </div>
              </div>

              <div className="shrink-0">
                {!selectedDriverId ? (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-200 text-amber-950 text-xs font-black flex items-center gap-1">
                    {!cleanEditLayout && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    Active
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">
                    Choose
                  </span>
                )}
              </div>
            </div>

            {/* Drivers within radius list */}
            {filteredDrivers.length === 0 ? (
              <div className="py-6 px-3 text-center space-y-2 bg-slate-50/70 rounded-2xl border border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  {!cleanEditLayout && <MapPin className="w-5 h-5" />}
                </div>
                <div className="text-xs font-bold text-slate-700">
                  {dispatchType === 'RADIUS'
                    ? `No drivers found within ${radiusLimit} km radius`
                    : 'No matching drivers found'}
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  {dispatchType === 'RADIUS'
                    ? 'Try expanding the geofence radius to view more drivers or switch to broadcast.'
                    : 'Try changing your search terms or turning off Online Only filter.'}
                </p>
                {dispatchType === 'RADIUS' && onRadiusChange && (
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onRadiusChange('10')}
                      className="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Expand to 10 km
                    </button>
                    <button
                      type="button"
                      onClick={() => onRadiusChange('15')}
                      className="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Expand to 15 km
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDispatchTypeChange) onDispatchTypeChange('BROADCAST');
                      }}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Broadcast to All
                    </button>
                  </div>
                )}
              </div>
            ) : (
              visibleDrivers.map((driver) => {
                const isSelected = selectedDriverId === driver.driver_id;
                const cleanPhone = driver.mobile_number ? driver.mobile_number.replace(/\D/g, '') : '';
                const telLink = cleanPhone ? (cleanPhone.length === 10 ? `+91${cleanPhone}` : `+${cleanPhone}`) : driver.mobile_number;
                const waLink = cleanPhone ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : cleanPhone;
                const ongoingTrip = getOngoingTrip(driver.driver_id, driver.current_trip_id);
                const isBusy = Boolean(ongoingTrip);

                return (
                  <div
                    key={driver.driver_id}
                    onClick={() => {
                      if (isBusy) return;
                      onSelect(driver.driver_id);
                      setIsOpen(false);
                    }}
                    className={`p-3 rounded-2xl transition border space-y-2.5 ${
                      isBusy
                        ? 'bg-slate-50/80 border-slate-300/80 cursor-not-allowed opacity-90'
                        : isSelected
                        ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-400/20 shadow-xs cursor-pointer'
                        : 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-2xs cursor-pointer'
                    }`}
                  >
                    {/* Top Row: Name, ID, Phone + Online status badge */}
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            driver.is_online ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-400'
                          }`}
                          title={driver.is_online ? 'Driver Online' : 'Driver Offline'}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="break-words text-xs font-bold leading-tight text-slate-900 sm:text-sm">
                              {driver.driver_name}
                            </span>
                            <span className="bg-slate-800 text-amber-400 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0">
                              {driver.driver_id}
                            </span>
                          </div>
                          <div className="mt-0.5 break-all font-mono text-[11px] leading-tight text-slate-500">
                            {driver.mobile_number}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isBusy && (
                          <span
                            className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                            title={`Already on active trip #${formatTripId(ongoingTrip?.trip_id)}`}
                          >
                            <Clock className="w-2.5 h-2.5 text-rose-600 animate-pulse" />
                            <span>On Trip</span>
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            driver.is_online
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {driver.is_online ? '● Online' : 'Offline'}
                        </span>
                        {isSelected && !isBusy && (
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-2xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Vehicle & Distance Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="font-bold font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                        <Car className="w-3 h-3 text-amber-600" />
                        {driver.vehicle_number}
                      </span>
                      <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">
                        {driver.vehicle_category}
                      </span>
                      {driver.distanceKm !== null && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            driver.distanceKm <= radiusLimit
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <MapPin className="w-2.5 h-2.5 text-sky-600" />
                          {driver.distanceKm} km away
                        </span>
                      )}
                      {ongoingTrip && (
                        <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                          Trip: #{formatTripId(ongoingTrip.trip_id)} ({ongoingTrip.status})
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Clear Action Buttons with Direct Call, WhatsApp & Select */}
                    <div className="pt-0.5 grid grid-cols-12 gap-2" onClick={(e) => e.stopPropagation()}>
                      {driver.mobile_number ? (
                        <a
                          href={`tel:${telLink}`}
                          className="col-span-5 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-[11px] sm:text-xs shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] select-none"
                          title={`Direct Phone Call to ${driver.driver_name}`}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span className="truncate">Call Driver</span>
                        </a>
                      ) : (
                        <div className="col-span-5" />
                      )}

                      {waLink ? (
                        <a
                          href={`https://wa.me/${waLink}?text=${encodeURIComponent(
                            `Hello ${driver.driver_name}, ride dispatch assignment from Trusty Yellow Cab.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="col-span-3 py-2 px-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[11px] transition flex items-center justify-center gap-1 cursor-pointer min-h-[38px] select-none"
                          title="Chat on WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      ) : (
                        <div className="col-span-3" />
                      )}

                      {isBusy ? (
                        <button
                          type="button"
                          disabled
                          title={`Driver ${driver.driver_name} is already on an ongoing trip (#${formatTripId(ongoingTrip?.trip_id)} - ${ongoingTrip?.status}). Assignment is blocked.`}
                          className="col-span-4 py-2 px-2 rounded-xl font-bold text-[10px] sm:text-xs bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed flex items-center justify-center gap-1 select-none"
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-500" />
                          <span>On Trip</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(driver.driver_id);
                            setIsOpen(false);
                          }}
                          className={`col-span-4 py-2 px-2 rounded-xl font-black text-[11px] sm:text-xs transition flex items-center justify-center gap-1 cursor-pointer min-h-[38px] select-none ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Assigned</span>
                            </>
                          ) : (
                            <span>Assign</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
