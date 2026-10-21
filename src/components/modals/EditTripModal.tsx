import React, { useState, useEffect, useRef } from 'react';
import { FirestoreTrip, FirestoreDriver, VehicleCategory, TripStatus, TripType, DispatchType, formatTripId } from '../../types';
import {
  Car,
  MapPin,
  User,
  Phone,
  KeyRound,
  X,
  UserMinus,
  Ban,
  Save,
  Clock,
  RotateCcw,
  Radio,
  Zap,
  Compass,
  Calculator,
  Navigation,
  Share2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { DriverSearchSelect } from '../DriverSearchSelect';
import { GooglePlacesInput } from '../GooglePlacesInput';
import { RouteMapPreview } from '../RouteMapPreview';
import { CustomerOtpSender } from '../CustomerOtpSender';

interface EditTripModalProps {
  isOpen: boolean;
  presentation?: 'modal' | 'page';
  trip: FirestoreTrip | null;
  drivers: FirestoreDriver[];
  trips?: FirestoreTrip[];
  onClose: () => void;
  onSave: (tripDocId: string, updates: Partial<FirestoreTrip>) => Promise<void>;
  onUnassignDriver: (tripDocId: string, reason?: string) => Promise<void>;
  onCancelTrip: (tripDocId: string, reason?: string) => Promise<void>;
  onOpenTrackingModal?: (trip: FirestoreTrip) => void;
  onGenerateTrackingLink?: (tripDocId: string) => Promise<{ token: string; link: string }>;
}

const CATEGORY_DEFAULT_RATES: Record<
  string,
  { baseFare: number; kmsFare: number; hourFare: number }
> = {
  Mini: { baseFare: 80, kmsFare: 28, hourFare: 350 },
  MINI: { baseFare: 80, kmsFare: 28, hourFare: 350 },
  Sedan: { baseFare: 80, kmsFare: 28, hourFare: 375 },
  SEDAN: { baseFare: 80, kmsFare: 28, hourFare: 375 },
  SUV: { baseFare: 200, kmsFare: 35, hourFare: 425 },
  'SUV+': { baseFare: 250, kmsFare: 45, hourFare: 450 },
  Innova: { baseFare: 250, kmsFare: 45, hourFare: 450 },
  INNOVA: { baseFare: 250, kmsFare: 24, hourFare: 450 },
  'INNOVA CRYSTA': { baseFare: 300, kmsFare: 50, hourFare: 500 },
  CUSTOM: { baseFare: 300, kmsFare: 45, hourFare: 500 },
};

export const EditTripModal: React.FC<EditTripModalProps> = ({
  isOpen,
  presentation = 'modal',
  trip,
  drivers,
  trips = [],
  onClose,
  onSave,
  onUnassignDriver,
  onCancelTrip,
  onOpenTrackingModal,
  onGenerateTrackingLink,
}) => {
  const isPage = presentation === 'page';
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tripType, setTripType] = useState<TripType>('REGULAR');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [pickupLat, setPickupLat] = useState('11.0168');
  const [pickupLng, setPickupLng] = useState('76.9558');
  const [dropLat, setDropLat] = useState('11.0268');
  const [dropLng, setDropLng] = useState('76.9658');
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('MINI');
  const [customVehicleName, setCustomVehicleName] = useState('');

  // Pricing inputs - editable & flexible
  const [baseFare, setBaseFare] = useState('80');
  const [kmsFare, setKmsFare] = useState('15');
  const [distanceKm, setDistanceKm] = useState(''); // Optional

  // Package pricing inputs
  const [hourFare, setHourFare] = useState('');
  const [packageHours, setPackageHours] = useState('');
  const [packageKms, setPackageKms] = useState('');
  const [includeKmInPackageTotal, setIncludeKmInPackageTotal] = useState(false);

  // Total Estimated Fare - directly editable
  const [estimatedFare, setEstimatedFare] = useState('');
  const [status, setStatus] = useState<TripStatus>('OPEN');
  const [assignedDriverId, setAssignedDriverId] = useState<string>('');
  const [pendingAssignedDriverId, setPendingAssignedDriverId] = useState<string>('');
  const [isDriverSelectionOpen, setIsDriverSelectionOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState<DispatchType>('BROADCAST');
  const [radiusKms, setRadiusKms] = useState('5');
  const [otp, setOtp] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setIsQuickActionSubmitting] = useState(false);
  const saveInFlightRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const editSteps = [
    'Trip & Passenger',
    'Route',
    'Vehicle & Fare',
    'Dispatch & Driver',
    'OTP & Save',
  ];

  useEffect(() => {
    if (trip) {
      setCustomerName(trip.customer_name || '');
      setCustomerPhone(trip.customer_phone || '');
      const isPkg = Boolean(trip.is_package || trip.trip_type === 'PACKAGE');
      setTripType(isPkg ? 'PACKAGE' : 'REGULAR');
      setPickupLocation(trip.pickup_location || '');
      setDropLocation(trip.drop_location || '');
      setPickupLat(String(trip.pickup_lat ?? 11.0168));
      setPickupLng(String(trip.pickup_lng ?? 76.9558));
      setDropLat(String(trip.drop_lat ?? 11.0268));
      setDropLng(String(trip.drop_lng ?? 76.9658));
      const knownCats = ['MINI', 'Mini', 'SEDAN', 'Sedan', 'SUV', 'SUV+', 'INNOVA', 'Innova', 'INNOVA CRYSTA'];
      const rawCat = trip.vehicle_category || 'MINI';
      if (knownCats.includes(rawCat)) {
        setVehicleCategory(rawCat as VehicleCategory);
        setCustomVehicleName('');
      } else {
        setVehicleCategory('CUSTOM');
        setCustomVehicleName(rawCat);
      }

      const catDefaults = CATEGORY_DEFAULT_RATES[trip.vehicle_category || 'MINI'] || {
        baseFare: 80,
        kmsFare: 28,
        hourFare: 350,
      };
      setBaseFare(String(trip.base_fare ?? catDefaults.baseFare));
      setKmsFare(String(trip.kms_fare ?? catDefaults.kmsFare));
      setDistanceKm(trip.distance_km !== undefined && trip.distance_km !== null ? String(trip.distance_km) : '');

      setHourFare(trip.hour_fare !== undefined && trip.hour_fare !== null ? String(trip.hour_fare) : (isPkg ? String(catDefaults.hourFare) : ''));
      setPackageHours(trip.package_hours ? String(trip.package_hours) : '');
      setPackageKms(trip.package_kms ? String(trip.package_kms) : '');

      setEstimatedFare(trip.estimated_fare !== undefined && trip.estimated_fare !== null ? String(trip.estimated_fare) : '');
      setStatus(trip.status as TripStatus);
      setAssignedDriverId(trip.driver_id || '');
      setPendingAssignedDriverId(trip.driver_id || '');
      setDispatchType((trip.dispatch_type as DispatchType) || 'BROADCAST');
      setRadiusKms(trip.dispatch_type === 'RADIUS' && trip.radius_kms ? String(trip.radius_kms) : '');
      setOtp(trip.otp || '');
      setNotes(trip.notes || '');
    }
  }, [trip]);

  useEffect(() => {
    if (isOpen && trip) {
      setCurrentStep(1);
    }
  }, [isOpen, trip?.doc_id, trip?.trip_id]);

  if (!isOpen || !trip) return null;

  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    const defaults = CATEGORY_DEFAULT_RATES[cat] || { baseFare: 80, kmsFare: 15, hourFare: 140 };
    setBaseFare(String(defaults.baseFare));
    setKmsFare(String(defaults.kmsFare));
    setHourFare(String(defaults.hourFare));

    if (tripType === 'REGULAR') {
      const dist = distanceKm ? Number(distanceKm) : 0;
      const calc = defaults.baseFare + defaults.kmsFare * dist;
      setEstimatedFare(String(Math.max(defaults.baseFare, Math.round(calc))));
    } else {
      recalculatePackageFare(
        String(defaults.hourFare),
        packageHours,
        String(defaults.kmsFare),
        packageKms,
        includeKmInPackageTotal
      );
    }
  };

  const recalculateRegularFare = (b: string, k: string, d: string) => {
    const base = Number(b) || 0;
    const perKm = Number(k) || 0;
    const dist = d ? Number(d) || 0 : 0;
    const total = base + perKm * dist;
    setEstimatedFare(String(Math.max(base || 50, Math.round(total))));
  };

  const recalculatePackageFare = (
    hFare: string,
    hours: string,
    kFare: string = kmsFare,
    kms: string = packageKms,
    includeKm: boolean = includeKmInPackageTotal
  ) => {
    const rate = Number(hFare) || 0;
    const hrs = Number(hours) || 0;
    const kRate = Number(kFare) || 0;
    const distKm = Number(kms) || 0;
    let total = rate * hrs;
    if (includeKm && distKm > 0 && kRate > 0) {
      total += kRate * distKm;
    }
    if (total > 0) {
      setEstimatedFare(String(Math.round(total)));
    }
  };

  const handleTripTypeChange = (type: TripType) => {
    setTripType(type);
    if (type === 'REGULAR') {
      recalculateRegularFare(baseFare, kmsFare, distanceKm);
    } else {
      recalculatePackageFare(hourFare, packageHours, kmsFare, packageKms, includeKmInPackageTotal);
    }
  };

  const regenerateOtp = () => {
    setOtp(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const handleRouteCalculated = (distKm: number) => {
    setDistanceKm(String(distKm));
    if (tripType === 'REGULAR') {
      const b = Number(baseFare) || 80;
      const k = Number(kmsFare) || 15;
      const total = b + k * distKm;
      setEstimatedFare(String(Math.max(b, Math.round(total))));
    }
  };

  const handleSave = async () => {
    if (isSubmitting || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSubmitting(true);

    const selectedDriver = drivers.find((d) => d.driver_id === assignedDriverId);
    const isPkg = tripType === 'PACKAGE';

    // Status transition logic strictly limited to: OPEN (Unassign), COMPLETED, CANCELLED (and ACCEPTED if driver selected)
    let newStatus: TripStatus = status;
    let finalDriverId: string | null = assignedDriverId || null;
    let finalDriverName: string | null = selectedDriver ? selectedDriver.driver_name : null;
    let finalDriverPhone: string | null = selectedDriver ? selectedDriver.mobile_number : null;
    let finalVehicleNumber: string | null = selectedDriver ? selectedDriver.vehicle_number : null;
    let finalNotes = notes.trim();

    if (status === 'OPEN') {
      // Unassigned: remove driver and make notes blank
      newStatus = 'OPEN';
      finalDriverId = null;
      finalDriverName = null;
      finalDriverPhone = null;
      finalVehicleNumber = null;
      finalNotes = '';
    } else if (status === 'COMPLETED' || status === 'CANCELLED') {
      newStatus = status;
    } else if (finalDriverId) {
      newStatus = 'ACCEPTED';
    } else {
      newStatus = 'OPEN';
    }

    if (finalDriverId && finalDriverId !== trip.driver_id) {
      const currentId = trip.doc_id || trip.trip_id;
      const busyTrip = trips?.find(
        (t) =>
          t.driver_id === finalDriverId &&
          (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') &&
          t.trip_id !== currentId &&
          t.doc_id !== currentId
      );
      if (busyTrip) {
        setErrorMessage(
          `Cannot assign driver ${finalDriverName || finalDriverId}: Driver is currently on ongoing Trip #${formatTripId(busyTrip.trip_id)} (${busyTrip.status}). Complete or cancel that trip first.`
        );
        saveInFlightRef.current = false;
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const targetId = trip.doc_id || trip.trip_id;
      await onSave(targetId, {
        customer_name: customerName.trim() || 'Passenger',
        customer_phone: customerPhone.trim() || '',
        trip_type: tripType,
        is_package: isPkg,
        pickup_location: pickupLocation.trim() || 'Coimbatore',
        drop_location: dropLocation.trim() || '',
        pickup_lat: pickupLat ? Number(pickupLat) : 11.0168,
        pickup_lng: pickupLng ? Number(pickupLng) : 76.9558,
        drop_lat: dropLat ? Number(dropLat) : 11.0268,
        drop_lng: dropLng ? Number(dropLng) : 76.9658,
        vehicle_category:
          vehicleCategory === 'CUSTOM'
            ? customVehicleName.trim() || 'Custom Vehicle'
            : vehicleCategory,
        // In package base dont want
        base_fare: !isPkg ? (baseFare ? Number(baseFare) : null) : null,
        kms_fare: kmsFare ? Number(kmsFare) : null,
        distance_km: !isPkg && distanceKm ? Number(distanceKm) : (isPkg && packageKms ? Number(packageKms) : undefined),
        hour_fare: isPkg ? (hourFare ? Number(hourFare) : null) : null,
        package_hours: isPkg && packageHours ? Number(packageHours) : undefined,
        package_kms: isPkg && packageKms ? Number(packageKms) : undefined,
        estimated_fare: estimatedFare ? Number(estimatedFare) : 0,
        status: newStatus,
        driver_id: finalDriverId,
        driver_name: finalDriverName,
        driver_phone: finalDriverPhone,
        vehicle_number: finalVehicleNumber,
        dispatch_type: dispatchType,
        // BROADCAST does NOT set or update radius; RADIUS mode strictly sets radius
        radius_kms: dispatchType === 'RADIUS' && radiusKms ? Number(radiusKms) : (null as any),
        otp: otp && otp.trim() ? otp.trim() : null,
        notes: finalNotes,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update trip details.');
    } finally {
      setIsSubmitting(false);
      saveInFlightRef.current = false;
    }
  };

  const openDriverSelection = () => {
    setPendingAssignedDriverId(assignedDriverId);
    setIsDriverSelectionOpen(true);
  };

  const closeDriverSelection = () => {
    setPendingAssignedDriverId(assignedDriverId);
    setIsDriverSelectionOpen(false);
  };

  const confirmDriverSelection = () => {
    setAssignedDriverId(pendingAssignedDriverId);
    setIsDriverSelectionOpen(false);
  };

  const handleQuickUnassign = async () => {
    setIsQuickActionSubmitting(true);
    try {
      await onUnassignDriver(trip.doc_id || trip.trip_id, '');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unassign driver');
      console.error('Failed to unassign driver:', err);
    } finally {
      setIsQuickActionSubmitting(false);
    }
  };

  const handleQuickCancelTrip = async () => {
    setIsQuickActionSubmitting(true);
    try {
      await onCancelTrip(trip.doc_id || trip.trip_id, notes || 'Cancelled by Dispatcher');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel trip');
      console.error('Failed to cancel trip:', err);
    } finally {
      setIsQuickActionSubmitting(false);
    }
  };

  const RADIUS_PRESETS = [5, 10, 15, 25, 50];

  return (
    <div className={isPage ? 'min-h-[calc(100dvh-4rem)] w-full bg-slate-50 min-[768px]:max-[1024px]:px-5 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:px-6 xl:px-8' : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs'}>
      <div className={isPage ? 'mx-auto w-full min-h-[calc(100dvh-4rem)] bg-slate-50 flex flex-col overflow-hidden min-[768px]:max-[1024px]:max-w-3xl min-[768px]:max-[1024px]:border-x min-[768px]:max-[1024px]:border-slate-200 min-[768px]:max-[1024px]:bg-white lg:h-full lg:min-h-0 lg:max-w-[1280px] lg:border-x lg:border-slate-200 lg:bg-white lg:shadow-sm' : 'w-full min-h-0 max-h-[96dvh] sm:max-h-[92vh] sm:max-w-4xl min-[768px]:max-[1024px]:max-w-3xl lg:max-w-5xl bg-white rounded-t-2xl sm:rounded-xl shadow-lg flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200'}>
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white lg:px-8 lg:py-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 leading-tight">
                Edit Trip
                <span className="text-slate-700 font-mono text-xs px-2 py-0.5 rounded-md border border-slate-200">
                  #{formatTripId(trip.trip_id)}
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200">
                  {trip.status}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 hidden sm:block mt-0.5">
                {trip.driver_name || 'Driver assignment pending'}{trip.vehicle_number ? ` · ${trip.vehicle_number}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition cursor-pointer text-xs font-bold"
          >
            {isPage ? 'Back to Trips' : 'Close'}
          </button>
        </div>

        {/* Inline Error Notice */}
        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between lg:mx-8">
            <div className="flex items-center gap-2">
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 p-1 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Current State Ribbon */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 lg:px-8 lg:py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {trip.driver_name && (
              <span className="text-slate-900 font-semibold text-xs">
                <strong>{trip.driver_name}</strong>{trip.vehicle_number && <span className="text-slate-500 font-medium"> {trip.vehicle_number}</span>}
              </span>
            )}
          </div>

        </div>

        {/* Scrollable Form Body */}
        <form
          id="edit-trip-form"
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const target = e.target as HTMLElement;
              const isSubmitButton = target.tagName === 'BUTTON' && target.getAttribute('type') === 'submit';
              if (!isSubmitButton && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }
          }}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 text-xs min-[768px]:max-[1024px]:mx-auto min-[768px]:max-[1024px]:w-full min-[768px]:max-[1024px]:max-w-2xl min-[768px]:max-[1024px]:py-5 lg:mx-auto lg:w-full lg:max-w-[1080px] lg:px-8 lg:py-6 lg:space-y-5"
        >
          {currentStep === 1 && (
            <>
          {/* Trip Type Selector */}
          <div className="grid grid-cols-2 gap-2 lg:max-w-xl lg:gap-3">
            <button
              type="button"
              onClick={() => handleTripTypeChange('REGULAR')}
              className={`min-h-[44px] py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                tripType === 'REGULAR'
                  ? 'bg-orange-50 text-slate-950 border border-orange-300'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>Regular Ride</span>
            </button>
            <button
              type="button"
              onClick={() => handleTripTypeChange('PACKAGE')}
              className={`min-h-[44px] py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                tripType === 'PACKAGE'
                  ? 'bg-orange-50 text-slate-950 border border-orange-300'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>Rental Package</span>
            </button>
          </div>

          {/* Passenger Info Card */}
          <div className="border-b border-slate-200 pb-3 space-y-3 lg:rounded-xl lg:border lg:bg-white lg:p-5 lg:shadow-sm">
            <span className="text-sm font-bold text-slate-900">Passenger</span>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Passenger Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full min-h-[46px] bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-medium focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98000 00000"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full min-h-[46px] bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-medium focus:border-orange-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

            </>
          )}

          {currentStep === 2 && (
            <>
          {/* Route Locations with Google Places Autocomplete */}
          <div className="border-b border-slate-200 pb-3 space-y-3 lg:rounded-xl lg:border lg:bg-white lg:p-5 lg:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Route
              </span>
              <button
                type="button"
                onClick={() => setShowCoordinates(!showCoordinates)}
                className="text-xs text-orange-700 hover:text-orange-800 font-semibold underline cursor-pointer"
              >
                {showCoordinates ? 'Hide GPS Lat/Lng' : 'Edit GPS Lat/Lng'}
              </button>
            </div>

            {/* Pickup */}
            <GooglePlacesInput
              label="Pickup Location"
              value={pickupLocation}
              onChange={(address, lat, lng) => {
                setPickupLocation(address);
                if (lat !== undefined && lng !== undefined) {
                  setPickupLat(String(lat));
                  setPickupLng(String(lng));
                }
              }}
              placeholder="Search pickup address..."
              pinColor="emerald"
              iconType="pickup"
              required={false}
            />

            {showCoordinates && (
              <div className="grid grid-cols-2 gap-2 p-2 rounded-lg border border-slate-200 lg:gap-3 lg:p-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500">Pickup Lat</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={pickupLat}
                    onChange={(e) => setPickupLat(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-200 rounded-md px-2 py-1 text-slate-900 font-mono text-xs bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500">Pickup Lng</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={pickupLng}
                    onChange={(e) => setPickupLng(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-200 rounded-md px-2 py-1 text-slate-900 font-mono text-xs bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* Drop / Rental Scope */}
            <GooglePlacesInput
              label={tripType === 'PACKAGE' ? 'Rental Destination / Scope' : 'Drop Destination'}
              value={dropLocation}
              onChange={(address, lat, lng) => {
                setDropLocation(address);
                if (lat !== undefined && lng !== undefined) {
                  setDropLat(String(lat));
                  setDropLng(String(lng));
                }
              }}
              placeholder={tripType === 'PACKAGE' ? 'e.g. City Tour / Return to pickup' : 'Search drop destination...'}
              pinColor="rose"
              iconType="drop"
              required={false}
            />

            {showCoordinates && (
              <div className="grid grid-cols-2 gap-2 p-2 rounded-lg border border-slate-200 lg:gap-3 lg:p-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500">Drop Lat</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={dropLat}
                    onChange={(e) => setDropLat(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-200 rounded-md px-2 py-1 text-slate-900 font-mono text-xs bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500">Drop Lng</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={dropLng}
                    onChange={(e) => setDropLng(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-200 rounded-md px-2 py-1 text-slate-900 font-mono text-xs bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* Mini Route Map Preview & Real Distance */}
            <RouteMapPreview
              pickupLocation={pickupLocation}
              pickupLat={pickupLat ? Number(pickupLat) : undefined}
              pickupLng={pickupLng ? Number(pickupLng) : undefined}
              dropLocation={dropLocation}
              dropLat={dropLat ? Number(dropLat) : undefined}
              dropLng={dropLng ? Number(dropLng) : undefined}
              onCalculatedDistance={handleRouteCalculated}
              initialCollapsed={false}
              minimalOverlays
              cleanAppearance
            />
          </div>

            </>
          )}

          {currentStep === 3 && (
            <>
          {/* Vehicle Category, Status & FARE CONFIGURATION */}
          <div className="border-b border-slate-200 pb-3 space-y-3 lg:rounded-xl lg:border lg:bg-white lg:p-5 lg:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Vehicle & Fare
              </span>
              <span className="text-[11px] text-slate-600 font-semibold">
                Class: <strong className="text-slate-900">{vehicleCategory}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:max-w-xl">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Vehicle Category</label>
                <select
                  value={vehicleCategory}
                  onChange={(e) => handleCategoryChange(e.target.value as VehicleCategory)}
                  className="w-full min-h-[46px] border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white font-bold focus:border-orange-400 focus:outline-none"
                >
                  <option value="MINI">MINI (Hatchback)</option>
                  <option value="SEDAN">SEDAN</option>
                  <option value="SUV">SUV</option>
                  <option value="SUV+">SUV+</option>
                  <option value="INNOVA">INNOVA</option>
                  <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                  <option value="CUSTOM">Custom Vehicle Type...</option>
                </select>

                {vehicleCategory === 'CUSTOM' && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custom Vehicle Name
                    </label>
                    <input
                      type="text"
                      value={customVehicleName}
                      onChange={(e) => setCustomVehicleName(e.target.value)}
                      placeholder="e.g. Tempo Traveller, Force Urbania"
                      className="w-full min-h-[46px] border border-slate-200 bg-white rounded-[10px] px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>

            </div>

            {/* REGULAR FARE INPUTS: Base Fare + Kms Fare + Distance (Optional & Editable) + Total Fare (Editable) */}
            {tripType === 'REGULAR' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 lg:gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Base Fare (₹)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={baseFare}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setBaseFare(val);
                        recalculateRegularFare(val, kmsFare, distanceKm);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold bg-white text-xs"
                    placeholder="80"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Per KM (₹/km)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={kmsFare}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setKmsFare(val);
                        recalculateRegularFare(baseFare, val, distanceKm);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold bg-white text-xs"
                    placeholder="15"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Distance (km) <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={distanceKm}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setDistanceKm(val);
                        recalculateRegularFare(baseFare, kmsFare, val);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="e.g. 15"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold bg-white text-xs"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-black text-amber-950 mb-0.5">
                    Total Fare (₹) <span className="text-[10px] text-amber-700 font-normal">(Editable)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={estimatedFare}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setEstimatedFare(val);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="e.g. 250"
                    className="w-full border border-orange-300 rounded-lg px-2.5 py-2 text-slate-950 font-black bg-orange-50 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            ) : (
              /* PACKAGE FARE INPUTS */
              <div className="space-y-3 pt-1">
                {/* 4 Rates + Total Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 lg:gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Hour Rate (₹/hr)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={hourFare}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setHourFare(val);
                          recalculatePackageFare(
                            val,
                            packageHours,
                            kmsFare,
                            packageKms,
                            includeKmInPackageTotal
                          );
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-300 rounded-lg px-2 py-2 text-slate-900 font-bold bg-white text-xs focus:outline-none focus:border-orange-400"
                      placeholder="e.g. 140"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Duration (Hours)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={packageHours}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setPackageHours(val);
                          recalculatePackageFare(
                            hourFare,
                            val,
                            kmsFare,
                            packageKms,
                            includeKmInPackageTotal
                          );
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-300 rounded-lg px-2 py-2 text-slate-900 font-bold bg-white text-xs focus:outline-none focus:border-orange-400"
                      placeholder="e.g. 4"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      KMs Rate (₹/km)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={kmsFare}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setKmsFare(val);
                          recalculatePackageFare(
                            hourFare,
                            packageHours,
                            val,
                            packageKms,
                            includeKmInPackageTotal
                          );
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-300 rounded-lg px-2 py-2 text-slate-900 font-bold bg-white text-xs focus:outline-none focus:border-orange-400"
                      placeholder="e.g. 15"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Package KMs <span className="text-[9px] text-purple-500 font-normal">(Opt)</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={packageKms}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setPackageKms(val);
                          recalculatePackageFare(
                            hourFare,
                            packageHours,
                            kmsFare,
                            val,
                            includeKmInPackageTotal
                          );
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-300 rounded-lg px-2 py-2 text-slate-900 font-bold bg-white text-xs focus:outline-none focus:border-orange-400"
                      placeholder="e.g. 40"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-orange-800 mb-0.5">
                      Total Fare (₹) <span className="text-[9px] text-purple-700 font-normal">(Edit)</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={estimatedFare}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setEstimatedFare(val);
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g. 500"
                      className="w-full border border-orange-300 rounded-lg px-2 py-2 text-slate-950 font-black bg-orange-50 text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Calculation Mode & Breakdown */}
                <div className="border-t border-slate-200 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-slate-800 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeKmInPackageTotal}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIncludeKmInPackageTotal(checked);
                          recalculatePackageFare(
                            hourFare,
                            packageHours,
                            kmsFare,
                            packageKms,
                            checked
                          );
                        }}
                        className="rounded text-orange-500 focus:ring-orange-500"
                      />
                      <span>Add KMs Fare to total</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

            </>
          )}

          {currentStep === 4 && (
            <>
          {/* DISPATCH TYPE: BROADCAST vs RADIUS */}
          <div className="border-b border-slate-200 pb-3 space-y-2.5 lg:rounded-xl lg:border lg:bg-white lg:p-5 lg:shadow-sm">
            <label className="text-slate-900 font-bold text-sm block">Dispatch</label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDispatchType('BROADCAST')}
                  className={`min-h-[48px] p-2.5 rounded-lg border transition cursor-pointer text-left ${
                  dispatchType === 'BROADCAST'
                    ? 'bg-orange-50 text-slate-950 border-orange-400 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium'
                }`}
              >
                <div>
                  <div className="text-xs font-bold leading-tight">Broadcast</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDispatchType('RADIUS')}
                  className={`min-h-[48px] p-2.5 rounded-lg border transition cursor-pointer text-left ${
                  dispatchType === 'RADIUS'
                    ? 'bg-orange-50 text-slate-950 border-orange-400 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium'
                }`}
              >
                <div>
                  <div className="text-xs font-bold leading-tight">Radius Geofence</div>
                </div>
              </button>
            </div>

            {/* ONLY show Radius configuration when dispatchType is RADIUS */}
            {dispatchType === 'RADIUS' && (
              <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">Search Radius</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={radiusKms}
                      onChange={(e) => setRadiusKms(e.target.value)}
                      className="w-14 text-center font-bold font-mono text-slate-900 border border-slate-300 rounded-md px-1 py-0.5 bg-white text-xs"
                    />
                    <span className="font-bold text-orange-700">km</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={radiusKms}
                  onChange={(e) => setRadiusKms(e.target.value)}
                  className="w-full accent-orange-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />

                <div className="grid grid-cols-5 gap-2 pt-0.5">
                  {RADIUS_PRESETS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setRadiusKms(String(km))}
                      className={`min-h-[40px] w-full rounded-md text-[10px] font-bold transition cursor-pointer ${
                        String(radiusKms) === String(km)
                          ? 'bg-orange-500 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SEARCHABLE DRIVER ALLOCATION */}
          <div className="lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-5 lg:shadow-sm">
            <DriverSearchSelect
              drivers={drivers}
              selectedDriverId={isDriverSelectionOpen ? pendingAssignedDriverId : assignedDriverId}
              onSelect={isDriverSelectionOpen ? setPendingAssignedDriverId : setAssignedDriverId}
              dispatchType={dispatchType}
              radiusKms={dispatchType === 'RADIUS' ? radiusKms : undefined}
              trips={trips}
              currentTripId={trip?.trip_id || trip?.doc_id}
              pickupLat={pickupLat ? Number(pickupLat) : undefined}
              pickupLng={pickupLng ? Number(pickupLng) : undefined}
              pickupLocation={pickupLocation}
              label="Driver Assignment"
              cleanEditLayout
              selectionPage={isDriverSelectionOpen}
              preserveSelectedDriverId={assignedDriverId}
              onOpenSelectionPage={openDriverSelection}
              onBack={closeDriverSelection}
              onConfirm={confirmDriverSelection}
            />
          </div>

          {/* CUSTOMER LIVE TRACKING SECTION */}
          {trip && (
            <div className="border-b border-slate-200 pb-3 space-y-2.5 lg:rounded-xl lg:border lg:bg-white lg:p-5 lg:shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  <span>Customer Tracking</span>
                </h4>
              </div>

              {trip.tracking_enabled && trip.tracking_token ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                  <div className="min-w-0 text-xs font-mono font-bold text-slate-700 bg-white px-3 py-2.5 rounded-lg border border-slate-300 break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/?track=${trip.tracking_token}` : `TRK:${trip.tracking_token}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenTrackingModal) {
                        onOpenTrackingModal(trip);
                      }
                    }}
                    className="min-h-[44px] w-full sm:w-auto bg-[#FF9800] hover:bg-[#e68900] text-white text-xs font-bold px-3 py-2 rounded-lg cursor-pointer transition shrink-0"
                  >
                  Share Tracking Link
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Generate this link only if the passenger requested real-time vehicle location tracking.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenTrackingModal) {
                        onOpenTrackingModal(trip);
                      }
                    }}
                    className="min-h-[44px] w-full sm:w-auto bg-[#FF9800] hover:bg-[#e68900] text-white font-bold text-xs px-3.5 py-2 rounded-lg cursor-pointer transition shrink-0"
                  >
                    Generate Customer Tracking Link
                  </button>
                </div>
              )}
            </div>
          )}

            </>
          )}

          {currentStep === 5 && (
            <>
          {/* Trip Status Selector (Only OPEN / UNASSIGN, COMPLETED, CANCELLED) */}
          <div className="space-y-2 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-5 lg:shadow-sm">
            <label className="text-xs font-bold text-slate-800 block">Trip Status</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatus('OPEN');
                  setAssignedDriverId('');
                  setNotes('');
                }}
                className={`min-h-[44px] py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center transition cursor-pointer text-center ${
                  status === 'OPEN' && !assignedDriverId
                    ? 'bg-[#FF9800] text-white border-[#FF9800]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>OPEN / UNASSIGN</span>
              </button>
              <button
                type="button"
                onClick={() => setStatus('COMPLETED')}
                className={`min-h-[44px] py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center transition cursor-pointer text-center ${
                  status === 'COMPLETED'
                    ? 'bg-[#FF9800] text-white border-[#FF9800]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>COMPLETED</span>
              </button>
              <button
                type="button"
                onClick={() => setStatus('CANCELLED')}
                className={`min-h-[44px] py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center transition cursor-pointer text-center ${
                  status === 'CANCELLED'
                    ? 'bg-rose-600 text-white border-rose-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>CANCELLED</span>
              </button>
            </div>
          </div>

          {/* Ride Start OTP & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs">
                  Start OTP <span className="text-slate-400 font-normal">(Optional)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={regenerateOtp}
                    className="text-[10px] text-orange-700 hover:underline font-bold cursor-pointer"
                  >
                    {otp ? 'Generate New' : 'Generate'}
                  </button>
                  {otp && (
                    <button
                      type="button"
                      onClick={() => setOtp('')}
                      className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                placeholder="Optional OTP"
                className="w-full min-h-[46px] border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold text-center bg-white text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Notes <span className="text-slate-400 font-normal">(Optional)</span></label>
              <input
                type="text"
                placeholder="notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[46px] border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white text-xs focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Instant Customer OTP Sender (SMS & WhatsApp) */}
          {otp && otp.trim().length > 0 && (
            <div className="pt-1">
              <CustomerOtpSender
                otp={otp.trim()}
                customerPhone={customerPhone}
                customerName={customerName}
                className="!rounded-none !border-0 !bg-transparent !p-0 !shadow-none [&_svg]:hidden [&_a]:min-h-[46px] [&_a]:rounded-lg [&_a]:shadow-none [&_a]:text-sm [&_button]:min-h-[46px] [&_button]:rounded-lg [&_button]:shadow-none [&_button]:text-sm"
              />
            </div>
          )}
            </>
          )}
        </form>

        {/* Sticky Bottom Actions Bar */}
        <div className="sticky bottom-0 z-20 px-4 sm:px-6 py-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 lg:px-8 lg:py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold transition cursor-pointer text-sm lg:min-w-28"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((step) => step - 1)}
                className="min-h-[46px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold transition cursor-pointer text-sm lg:min-w-28"
              >
                Back
              </button>
            )}
            {currentStep < editSteps.length ? (
              <button
                type="button"
                onClick={() => setCurrentStep((step) => step + 1)}
                className="min-h-[46px] px-5 py-2.5 rounded-lg bg-[#FF9800] hover:bg-[#e68900] active:bg-[#cc7a00] text-white font-bold transition cursor-pointer text-sm lg:min-w-32"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="min-h-[46px] px-5 py-2.5 rounded-lg bg-[#FF9800] hover:bg-[#e68900] active:bg-[#cc7a00] text-white font-bold transition cursor-pointer text-sm disabled:opacity-60 disabled:cursor-not-allowed lg:min-w-44"
              >
                {isSubmitting ? 'Saving...' : 'Save & Update Trip'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
