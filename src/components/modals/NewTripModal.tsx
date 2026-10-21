import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FirestoreTrip, FirestoreDriver, VehicleCategory, TripType, DispatchType } from '../../types';
import {
  Car,
  MapPin,
  User,
  Phone,
  KeyRound,
  X,
  Radio,
  Zap,
  Clock,
  Compass,
  Calculator,
  RotateCcw,
  Navigation,
  Check,
  ChevronRight,
  FileText,
  Send,
  Sliders,
  AlertTriangle,
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { DriverSearchSelect } from '../DriverSearchSelect';
import { GooglePlacesInput } from '../GooglePlacesInput';
import { RouteMapPreview } from '../RouteMapPreview';
import { CustomerOtpSender } from '../CustomerOtpSender';
import { parseBookingText, ParsedBookingData } from '../../services/bookingParser';
import { geocodeAddress } from '../../services/googleMapsService';

interface NewTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (trip: Partial<FirestoreTrip>) => Promise<FirestoreTrip>;
  drivers: FirestoreDriver[];
  trips?: FirestoreTrip[];
  initialBookingData?: ParsedBookingData | null;
}

const CATEGORY_DEFAULT_RATES: Record<
  string,
  {
    regular: { baseFare: number | null; kmsFare: number | null };
    rental: { hourFare: number | null; kmsFare: number | null };
  }
> = {
  MINI: {
    regular: { baseFare: 80, kmsFare: 28 },
    rental: { hourFare: 350, kmsFare: 25 },
  },
  SEDAN: {
    regular: { baseFare: 80, kmsFare: 28 },
    rental: { hourFare: 375, kmsFare: 25 },
  },
  SUV: {
    regular: { baseFare: 150, kmsFare: 35 },
    rental: { hourFare: 425, kmsFare: 30 },
  },
  'SUV+': {
    regular: { baseFare: 200, kmsFare: 40 },
    rental: { hourFare: 450, kmsFare: 30 },
  },
  INNOVA: {
    regular: { baseFare: 250, kmsFare: 45 },
    rental: { hourFare: 500, kmsFare: 30 },
  },
  'INNOVA CRYSTA': {
    regular: { baseFare: 300, kmsFare: 50 },
    rental: { hourFare: 550, kmsFare: 35 },
  },
  CUSTOM: {
    regular: { baseFare: null, kmsFare: null },
    rental: { hourFare: null, kmsFare: null },
  },
};

const fareInputValue = (value: number | null) => (value === null ? '' : String(value));

export const NewTripModal: React.FC<NewTripModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  drivers,
  trips = [],
  initialBookingData,
}) => {
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tripType, setTripType] = useState<TripType>('REGULAR');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [dropLat, setDropLat] = useState('');
  const [dropLng, setDropLng] = useState('');
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('MINI');
  const [customVehicleName, setCustomVehicleName] = useState('');

  // Quick Paste Drawer State
  const [isPasteDrawerOpen, setIsPasteDrawerOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);

  // Pricing inputs - blank by default, fully optional
  const [baseFare, setBaseFare] = useState('');
  const [kmsFare, setKmsFare] = useState('');
  const [distanceKm, setDistanceKm] = useState('');

  // Package pricing inputs - blank by default
  const [hourFare, setHourFare] = useState('');
  const [packageHours, setPackageHours] = useState('');
  const [packageKms, setPackageKms] = useState('');
  const [includeKmInPackageTotal, setIncludeKmInPackageTotal] = useState(false);

  // Total Estimated Fare
  const [estimatedFare, setEstimatedFare] = useState('');
  const [assignedDriverId, setAssignedDriverId] = useState<string>('');
  const [isDriverSelectionOpen, setIsDriverSelectionOpen] = useState(false);
  const [nearbyDriverCount, setNearbyDriverCount] = useState<number | null>(null);
  const [dispatchType, setDispatchType] = useState<DispatchType>('RADIUS');
  const [radiusKms, setRadiusKms] = useState('5');
  const [notes, setNotes] = useState('');
  const [sendSmsNotification, setSendSmsNotification] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (Number(radiusKms) > 10) {
      setRadiusKms('5');
    }
  }, [radiusKms]);

  // OTP - Optional! Starts blank
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Booking flow state (1: booking details, 2: dispatch & confirmation)
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3 | 4>(1);
  const [mobileActionBarHeight, setMobileActionBarHeight] = useState(65);
  const mobileActionBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const actionBar = mobileActionBarRef.current;
    if (!actionBar) return;

    const updateActionBarHeight = () => {
      setMobileActionBarHeight(Math.ceil(actionBar.getBoundingClientRect().height));
    };

    const resizeObserver = new ResizeObserver(updateActionBarHeight);
    resizeObserver.observe(actionBar);
    updateActionBarHeight();

    return () => resizeObserver.disconnect();
  }, []);

  // Apply parsed booking data to form fields
  const applyParsedData = useCallback(async (data: ParsedBookingData) => {
    if (data.customerName) setCustomerName(data.customerName);
    if (data.customerPhone) setCustomerPhone(data.customerPhone);
    if (data.tripType) setTripType(data.tripType);
    if (data.vehicleCategory) setVehicleCategory(data.vehicleCategory);
    if (data.pickupLocation) setPickupLocation(data.pickupLocation);
    if (data.dropLocation) setDropLocation(data.dropLocation);
    if (data.packageHours) setPackageHours(data.packageHours);
    if (data.packageKms) setPackageKms(data.packageKms);
    if (data.estimatedFare) setEstimatedFare(data.estimatedFare);
    if (data.notes) setNotes(data.notes);

    setPasteNotice('Booking details extracted & filled successfully!');
    setTimeout(() => setPasteNotice(null), 6000);

    // Asynchronously resolve coordinates for pickup & drop
    if (data.pickupLat && data.pickupLng) {
      setPickupLat(String(data.pickupLat));
      setPickupLng(String(data.pickupLng));
    } else if (data.pickupLocation) {
      try {
        const geo = await geocodeAddress(data.pickupLocation);
        if (geo) {
          setPickupLat(String(geo.lat));
          setPickupLng(String(geo.lng));
        }
      } catch (err) {
        console.warn('Geocoding pickup failed:', err);
      }
    }

    if (data.dropLat && data.dropLng) {
      setDropLat(String(data.dropLat));
      setDropLng(String(data.dropLng));
    } else if (data.dropLocation) {
      try {
        const geo = await geocodeAddress(data.dropLocation);
        if (geo) {
          setDropLat(String(geo.lat));
          setDropLng(String(geo.lng));
        }
      } catch (err) {
        console.warn('Geocoding drop failed:', err);
      }
    }
  }, []);

  const NEW_TRIP_DRAFT_KEY = 'trusty_cab_new_trip_draft_v1';

  // Check whether form contains meaningful user-entered data
  const hasEnteredData = Boolean(
    (customerPhone && customerPhone.trim()) ||
    (pickupLocation && pickupLocation.trim()) ||
    (dropLocation && dropLocation.trim()) ||
    (notes && notes.trim()) ||
    (estimatedFare && estimatedFare !== '0' && estimatedFare.trim()) ||
    (customerName && customerName !== 'Walk-in Customer')
  );

  // Complete reset to clean default values
  const resetForm = useCallback(() => {
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setTripType('REGULAR');
    setPickupLocation('');
    setDropLocation('');
    setPickupLat('');
    setPickupLng('');
    setDropLat('');
    setDropLng('');
    setShowCoordinates(false);
    setVehicleCategory('MINI');
    setCustomVehicleName('');
    setBaseFare('');
    setKmsFare('');
    setDistanceKm('');
    setHourFare('');
    setPackageHours('');
    setPackageKms('');
    setIncludeKmInPackageTotal(false);
    setEstimatedFare('');
    setAssignedDriverId('');
    setIsDriverSelectionOpen(false);
    setNearbyDriverCount(null);
    setDispatchType('RADIUS');
    setRadiusKms('5');
    setNotes('');
    setSendSmsNotification(true);
    setOtp('');
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsPasteDrawerOpen(false);
    setPastedText('');
    setPasteNotice(null);
    setMobileStep(1);
  }, []);

  // Clear draft from localStorage and reset form
  const handleClearDraft = useCallback(() => {
    try {
      localStorage.removeItem(NEW_TRIP_DRAFT_KEY);
    } catch {}
    resetForm();
  }, [resetForm]);

  // Auto-save form draft to localStorage while typing
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (hasEnteredData) {
        try {
          const draft = {
            customerName,
            customerPhone,
            tripType,
            pickupLocation,
            dropLocation,
            pickupLat,
            pickupLng,
            dropLat,
            dropLng,
            vehicleCategory,
            customVehicleName,
            baseFare,
            kmsFare,
            distanceKm,
            hourFare,
            packageHours,
            packageKms,
            estimatedFare,
            assignedDriverId,
            dispatchType,
            radiusKms,
            otp,
            notes,
          };
          localStorage.setItem(NEW_TRIP_DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    isOpen,
    hasEnteredData,
    customerName,
    customerPhone,
    tripType,
    pickupLocation,
    dropLocation,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    vehicleCategory,
    customVehicleName,
    baseFare,
    kmsFare,
    distanceKm,
    hourFare,
    packageHours,
    packageKms,
    estimatedFare,
    assignedDriverId,
    dispatchType,
    radiusKms,
    otp,
    notes,
  ]);

  // Prevent accidental tab closure or browser refresh while user is typing in form
  useEffect(() => {
    if (!isOpen) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasEnteredData) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, hasEnteredData]);

  // When modal is opened, restore draft if present, or apply initialBookingData
  useEffect(() => {
    if (isOpen) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        if (initialBookingData) {
          applyParsedData(initialBookingData);
        } else {
          try {
            const rawDraft = localStorage.getItem(NEW_TRIP_DRAFT_KEY);
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft && typeof draft === 'object') {
                if (draft.customerName) setCustomerName(draft.customerName);
                if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
                if (draft.tripType) setTripType(draft.tripType);
                if (draft.pickupLocation) setPickupLocation(draft.pickupLocation);
                if (draft.dropLocation) setDropLocation(draft.dropLocation);
                if (draft.pickupLat) setPickupLat(draft.pickupLat);
                if (draft.pickupLng) setPickupLng(draft.pickupLng);
                if (draft.dropLat) setDropLat(draft.dropLat);
                if (draft.dropLng) setDropLng(draft.dropLng);
                if (draft.vehicleCategory) setVehicleCategory(draft.vehicleCategory);
                if (draft.customVehicleName) setCustomVehicleName(draft.customVehicleName);
                if (draft.baseFare) setBaseFare(draft.baseFare);
                if (draft.kmsFare) setKmsFare(draft.kmsFare);
                if (draft.distanceKm) setDistanceKm(draft.distanceKm);
                if (draft.hourFare) setHourFare(draft.hourFare);
                if (draft.packageHours) setPackageHours(draft.packageHours);
                if (draft.packageKms) setPackageKms(draft.packageKms);
                if (draft.estimatedFare) setEstimatedFare(draft.estimatedFare);
                if (draft.assignedDriverId) setAssignedDriverId(draft.assignedDriverId);
                if (draft.dispatchType) setDispatchType(draft.dispatchType);
                if (draft.radiusKms) setRadiusKms(draft.radiusKms);
                if (draft.otp) setOtp(draft.otp);
                if (draft.notes) setNotes(draft.notes);
                return;
              }
            }
          } catch {}
          // Otherwise clean defaults
          resetForm();
        }
      }
    } else {
      hasInitializedRef.current = false;
    }
  }, [isOpen, initialBookingData, applyParsedData, resetForm]);

  useEffect(() => {
    if (
      !isOpen ||
      vehicleCategory !== 'MINI' ||
      baseFare ||
      kmsFare ||
      hourFare ||
      estimatedFare
    ) {
      return;
    }

    handleCategoryChange('MINI');
  }, [isOpen, vehicleCategory, baseFare, kmsFare, hourFare, estimatedFare]);

  const handleClose = useCallback(() => {
    try {
      localStorage.removeItem(NEW_TRIP_DRAFT_KEY);
    } catch {}
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Handle ESC key to go back and close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If user is actively typing in an input, do not close modal on ESC
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return;
        }
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  function handleCategoryChange(cat: VehicleCategory, selectedTripType: TripType = tripType) {
    setVehicleCategory(cat);
    const defaults =
      CATEGORY_DEFAULT_RATES[cat] ||
      CATEGORY_DEFAULT_RATES[String(cat).toUpperCase()] ||
      CATEGORY_DEFAULT_RATES.MINI;
    const regularDefaults = defaults.regular;
    const rentalDefaults = defaults.rental;

    setBaseFare(fareInputValue(regularDefaults.baseFare));
    setHourFare(fareInputValue(rentalDefaults.hourFare));

    if (selectedTripType === 'REGULAR') {
      setKmsFare(fareInputValue(regularDefaults.kmsFare));
      const dist = distanceKm ? Number(distanceKm) : 0;
      if (regularDefaults.baseFare !== null && regularDefaults.kmsFare !== null) {
        const calc = regularDefaults.baseFare + regularDefaults.kmsFare * dist;
        setEstimatedFare(String(Math.max(regularDefaults.baseFare, Math.round(calc))));
      } else {
        setEstimatedFare('');
      }
    } else {
      setKmsFare(fareInputValue(rentalDefaults.kmsFare));
      recalculatePackageFare(
        fareInputValue(rentalDefaults.hourFare),
        packageHours,
        fareInputValue(rentalDefaults.kmsFare),
        packageKms,
        includeKmInPackageTotal
      );
      if (rentalDefaults.hourFare === null && rentalDefaults.kmsFare === null) {
        setEstimatedFare('');
      }
    }
  }

  const recalculateRegularFare = (b: string, k: string, d: string) => {
    const base = Number(b) || 0;
    const perKm = Number(k) || 0;
    const dist = d ? Number(d) || 0 : 0;
    const total = base + perKm * dist;
    if (total > 0) {
      setEstimatedFare(String(Math.round(total)));
    }
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
    handleCategoryChange(vehicleCategory, type);
  };

  const regenerateOtp = () => {
    setOtp(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const handleRouteCalculated = (distKm: number) => {
    setDistanceKm(String(distKm));
    if (tripType === 'REGULAR') {
      const b = Number(baseFare) || 0;
      const k = Number(kmsFare) || 0;
      const total = b + k * distKm;
      if (total > 0) {
        setEstimatedFare(String(Math.round(total)));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const selectedDriver = drivers.find((d) => d.driver_id === assignedDriverId);
    const isPkg = tripType === 'PACKAGE';

    try {
      await onSubmit({
        customer_name: customerName.trim() || 'Passenger',
        customer_phone: customerPhone.trim() || '',
        trip_type: tripType,
        is_package: isPkg,
        pickup_location: pickupLocation.trim() || 'Coimbatore',
        drop_location: dropLocation.trim() || (isPkg ? pickupLocation.trim() || 'Coimbatore' : ''),
        pickup_lat: pickupLat ? Number(pickupLat) : 11.0168,
        pickup_lng: pickupLng ? Number(pickupLng) : 76.9558,
        drop_lat: dropLat ? Number(dropLat) : (pickupLat ? Number(pickupLat) : 11.0268),
        drop_lng: dropLng ? Number(dropLng) : (pickupLng ? Number(pickupLng) : 76.9658),
        vehicle_category:
          vehicleCategory === 'CUSTOM'
            ? customVehicleName.trim() || 'Custom Vehicle'
            : vehicleCategory,
        base_fare: !isPkg ? (baseFare ? Number(baseFare) : null) : null,
        kms_fare: kmsFare ? Number(kmsFare) : null,
        distance_km: !isPkg && distanceKm ? Number(distanceKm) : (isPkg && packageKms ? Number(packageKms) : undefined),
        hour_fare: isPkg ? (hourFare ? Number(hourFare) : null) : null,
        package_hours: isPkg && packageHours ? Number(packageHours) : undefined,
        package_kms: isPkg && packageKms ? Number(packageKms) : undefined,
        estimated_fare: estimatedFare ? Number(estimatedFare) : 0,
        driver_id: selectedDriver ? selectedDriver.driver_id : null,
        driver_name: selectedDriver ? selectedDriver.driver_name : null,
        driver_phone: selectedDriver ? selectedDriver.mobile_number : null,
        vehicle_number: selectedDriver ? selectedDriver.vehicle_number : null,
        dispatch_type: dispatchType,
        radius_kms: dispatchType === 'RADIUS' && radiusKms ? Number(radiusKms) : null,
        otp: otp && otp.trim() ? otp.trim() : null,
        notes: notes.trim(),
      });
      try {
        localStorage.removeItem(NEW_TRIP_DRAFT_KEY);
      } catch {}
      resetForm();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error dispatching trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDriver = drivers.find((d) => d.driver_id === assignedDriverId);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          // If user has already entered ride info, don't close on accidental backdrop click
          if (!hasEnteredData) {
            handleClose();
          }
        }
      }}
    >
      <div className="min-h-screen w-full bg-slate-50 flex flex-col animate-in fade-in duration-200 lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="sticky top-0 z-30 px-3.5 sm:px-6 py-2.5 sm:py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 lg:h-16 lg:px-8 lg:py-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden w-8 h-8 rounded-xl bg-amber-500 text-slate-950 items-center justify-center font-bold shadow-xs shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-400 font-medium">
                <span className="break-words font-semibold text-slate-700">New Ride</span>
              </div>
              <h2 className="break-words text-sm font-bold leading-tight text-slate-900 sm:text-base md:text-lg">
                Dispatch
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPastedText('');
                setIsPasteDrawerOpen((prev) => !prev);
              }}
              title="Paste booking from Email or WhatsApp"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                isPasteDrawerOpen
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200/80'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden xs:inline sm:inline">{isPasteDrawerOpen ? 'Close' : 'Paste'}</span>
            </button>
            <button
              type="button"
              onClick={resetForm}
              title="Reset all form fields to default"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              title="Close and Reset"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            >
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Quick Paste Booking Drawer */}
        {isPasteDrawerOpen && (
          <div className="mx-4 sm:mx-6 mt-3 p-4 bg-amber-50/70 border-2 border-amber-300/80 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 min-[768px]:max-[1024px]:mx-auto min-[768px]:max-[1024px]:w-full min-[768px]:max-[1024px]:max-w-2xl lg:mx-auto lg:w-full lg:max-w-3xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold text-slate-900">
                  Paste Booking Details (From Email, Website or WhatsApp)
                </h4>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (navigator?.clipboard?.readText) {
                      const text = await navigator.clipboard.readText();
                      if (text) setPastedText(text);
                    }
                  } catch {}
                }}
                className="text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 bg-amber-100 hover:bg-amber-200/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Paste Clipboard</span>
              </button>
            </div>

            <textarea
              rows={4}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste booking text here (e.g. Pickup, Drop, Phone, Vehicle, Fare)..."
              className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/20 resize-none shadow-2xs"
            />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500">
                Detects booking fields automatically.
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setPastedText('');
                    setIsPasteDrawerOpen(false);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pastedText.trim()}
                  onClick={() => {
                    const parsed = parseBookingText(pastedText);
                    applyParsedData(parsed);
                    setPastedText('');
                    setIsPasteDrawerOpen(false);
                  }}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Auto-Fill Form</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paste Success Notice */}
        {pasteNotice && (
          <div className="mx-4 sm:mx-6 mt-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between animate-in fade-in min-[768px]:max-[1024px]:mx-auto min-[768px]:max-[1024px]:w-full min-[768px]:max-[1024px]:max-w-2xl lg:mx-auto lg:w-full lg:max-w-3xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pasteNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPasteNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Inline Error Notice */}
        {errorMessage && (
          <div className="mx-5 sm:mx-7 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between min-[768px]:max-[1024px]:mx-auto min-[768px]:max-[1024px]:w-full min-[768px]:max-[1024px]:max-w-2xl lg:mx-auto lg:w-full lg:max-w-3xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Step Navigation */}
        <div className="sticky top-0 z-40 shrink-0 select-none border-b border-slate-200 bg-white px-2 sm:px-4 pt-1.5 lg:hidden">
          <div className="grid grid-cols-4">
            {[
              { step: 1, title: 'Ride & Route' },
              { step: 2, title: 'Vehicle & Fare' },
              { step: 3, title: 'Passenger' },
              { step: 4, title: 'Dispatch' },
            ].map(({ step, title }) => {
              const isActive = mobileStep === step;
              const isCompleted = mobileStep > step;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => setMobileStep(step as 1 | 2 | 3 | 4)}
                  className={`min-w-0 border-b-2 px-1 py-1.5 transition flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer ${
                    isActive
                      ? 'border-amber-500 text-slate-950 font-bold'
                      : isCompleted
                      ? 'border-amber-200 text-slate-950 font-medium hover:text-slate-700'
                      : 'border-transparent text-slate-400 font-medium hover:text-slate-600'
                  }`}
                >
                  <span
                    data-step={String(step).padStart(2, '0')}
                    className="text-[0px] leading-none before:content-[attr(data-step)] before:text-[9px] before:font-semibold before:tracking-[0.08em]"
                  >
                    {isCompleted ? '✓' : step}
                  </span>
                  <span className="max-w-full break-words text-[10px] font-semibold leading-tight sm:text-xs">
                    {title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2-Column Responsive Body */}
        <form
          id="new-trip-form"
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // Prevent accidental form submission and modal closing on Enter key in input fields
            if (e.key === 'Enter') {
              const target = e.target as HTMLElement;
              const isSubmitButton = target.tagName === 'BUTTON' && target.getAttribute('type') === 'submit';
              if (!isSubmitButton && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }
          }}
          className={`w-full p-3 sm:p-4 md:p-5 min-[768px]:max-[1024px]:mx-auto min-[768px]:max-[1024px]:max-w-3xl min-[768px]:max-[1024px]:px-6 lg:flex-1 lg:p-0 ${mobileStep === 1 ? 'pb-0' : 'pb-28'} lg:pb-0 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] gap-3 sm:gap-4 lg:gap-0 lg:overflow-hidden lg:min-h-0`}
        >
          {/* Active step content. Steps 1-3 are centered; Step 4 shares space with the summary. */}
          <div className="lg:col-span-1 lg:mx-auto lg:h-full lg:min-h-0 lg:w-full lg:max-w-[720px] lg:overflow-y-auto lg:overflow-x-hidden lg:p-5 xl:p-6 grid grid-cols-1 gap-3 sm:gap-4 lg:gap-4 items-start w-full">

            {/* STEP 1 (Mobile): Ride Type & Passenger Details */}
            <div className={`space-y-3.5 sm:space-y-4 xl:space-y-3 lg:contents lg:space-y-0 ${mobileStep === 1 || mobileStep === 3 ? 'block lg:contents' : 'hidden lg:contents'}`}>

              {/* SECTION 1: Ride Type Selection */}
              <div className={`bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 lg:order-1 lg:p-4 ${mobileStep === 1 ? 'block' : 'hidden lg:block'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Ride Type</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTripTypeChange('REGULAR')}
                  className={`min-h-12 w-full rounded-lg border px-3 text-left transition cursor-pointer ${
                    tripType === 'REGULAR'
                      ? 'border-amber-500 bg-amber-50 text-slate-950 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <span className="block break-words text-xs font-bold leading-tight sm:text-sm">Regular Ride</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTripTypeChange('PACKAGE')}
                  className={`min-h-12 w-full rounded-lg border px-3 text-left transition cursor-pointer ${
                    tripType === 'PACKAGE'
                      ? 'border-amber-500 bg-amber-50 text-slate-950 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <span className="block break-words text-xs font-bold leading-tight sm:text-sm">Rental Package</span>
                </button>
              </div>
            </div>

            {/* SECTION 2: Passenger & Contact Info */}
            <div className={`rounded-none border-0 bg-transparent p-0 shadow-none space-y-3 lg:order-4 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm ${mobileStep === 3 ? 'block' : 'hidden lg:block'}`}>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Passenger Information
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Passenger Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-10 lg:h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 shadow-2xs transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm lg:rounded-xl lg:px-3.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative flex h-10 lg:h-11 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs transition focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 lg:rounded-xl">
                    <div className="pl-3 pr-2.5 flex items-center gap-1 border-r border-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                      <span>+91</span>
                    </div>
                    <input
                      type="tel"
                      placeholder="98000 00000"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="h-full w-full bg-transparent px-3 text-xs font-mono font-medium text-slate-900 focus:outline-none sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Start OTP & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-0.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Start OTP
                    </label>
                    <button
                      type="button"
                      onClick={regenerateOtp}
                      className="text-[10px] text-amber-700 hover:underline font-bold cursor-pointer"
                    >
                      {otp ? 'New' : 'Generate'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    placeholder="Optional OTP"
                    className="h-10 lg:h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono font-bold text-left text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 lg:rounded-xl lg:text-center"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 lg:h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm lg:rounded-xl lg:px-3.5"
                  />
                </div>
              </div>

              {/* Instant Customer OTP Sender */}
              {otp && otp.trim().length > 0 && (
                <div className="pt-1">
                  <CustomerOtpSender
                    otp={otp.trim()}
                    customerPhone={customerPhone}
                    customerName={customerName}
                  />
                </div>
              )}
            </div>
          </div>

          {/* STEP 2 (Mobile): Route & Locations */}
          <div className={`space-y-3 sm:space-y-3.5 xl:space-y-3 lg:col-span-1 lg:order-2 ${mobileStep === 1 ? 'block lg:block' : 'hidden lg:block'}`}>

            {/* SECTION 3: Route & Locations (Clean Google Places Autocomplete) */}
            <div
              className="flex min-w-0 flex-col gap-2.5 lg:contents"
              style={{ minHeight: `calc(100dvh - 220px - ${mobileActionBarHeight}px + 9px)` }}
            >
              <div className={`relative z-30 space-y-2.5 lg:col-span-1 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm ${mobileStep === 1 ? 'block' : 'hidden lg:block'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                     Route
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCoordinates(!showCoordinates)}
                  className="min-h-[32px] text-[11px] text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3 h-3" />
                  {showCoordinates ? 'Hide GPS Lat/Lng' : 'GPS Lat/Lng'}
                </button>
              </div>

              {/* Pickup Location */}
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
                placeholder="Search pickup address or landmark..."
                pinColor="emerald"
                iconType="pickup"
                required={false}
                className="[&>div:nth-child(2)]:min-h-[44px]"
                suggestionGroup="new-trip-route"
                isActive={mobileStep === 1}
              />

              {showCoordinates && (
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">Pickup Lat</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={pickupLat}
                      onChange={(e) => setPickupLat(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs bg-white"
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
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Drop Location */}
              <GooglePlacesInput
                label={tripType === 'PACKAGE' ? 'Rental Scope / Destination (Optional)' : 'Drop Destination'}
                value={dropLocation}
                onChange={(address, lat, lng) => {
                  setDropLocation(address);
                  if (lat !== undefined && lng !== undefined) {
                    setDropLat(String(lat));
                    setDropLng(String(lng));
                  }
                }}
                placeholder={tripType === 'PACKAGE' ? 'e.g. Coimbatore Local / Return to pickup' : 'Search drop destination...'}
                pinColor="rose"
                iconType="drop"
                required={false}
                className="[&>div:nth-child(2)]:min-h-[44px]"
                suggestionGroup="new-trip-route"
                isActive={mobileStep === 1}
              />

              {showCoordinates && (
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">Drop Lat</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={dropLat}
                      onChange={(e) => setDropLat(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs bg-white"
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
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              </div>

              {/* Big, Clear & Responsive Route Map */}
              <RouteMapPreview
                className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col rounded-xl lg:fixed lg:top-16 lg:right-0 lg:z-20 lg:h-[calc(100dvh-4rem)] lg:w-1/2 lg:min-h-0 lg:overflow-hidden lg:rounded-none lg:border-0 xl:left-[42%] xl:w-auto"
                minimalOverlays
                fillContainer
                pickupLocation={pickupLocation}
                pickupLat={pickupLat ? Number(pickupLat) : undefined}
                pickupLng={pickupLng ? Number(pickupLng) : undefined}
                dropLocation={dropLocation}
                dropLat={dropLat ? Number(dropLat) : undefined}
                dropLng={dropLng ? Number(dropLng) : undefined}
                onCalculatedDistance={handleRouteCalculated}
                onPickupSelect={(address, lat, lng) => {
                  // Only set address text if empty, never overwrite user's typed address
                  if (!pickupLocation || !pickupLocation.trim()) {
                    setPickupLocation(address);
                  }
                  setPickupLat(String(lat));
                  setPickupLng(String(lng));
                }}
                onDropSelect={(address, lat, lng) => {
                  // Only set address text if empty, never overwrite user's typed address
                  if (!dropLocation || !dropLocation.trim()) {
                    setDropLocation(address);
                  }
                  setDropLat(String(lat));
                  setDropLng(String(lng));
                }}
              />
            </div>
          </div>

          {/* STEP 3 (Mobile): Vehicle Category & Pricing */}
          <div className={`space-y-3.5 sm:space-y-4 xl:space-y-3 lg:col-span-1 lg:order-3 ${mobileStep === 2 ? 'block lg:block' : 'hidden lg:block'}`}>

            {/* SECTION 4: Vehicle Category & Pricing */}
            <div className="rounded-none border-0 bg-transparent p-0 shadow-none space-y-3 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Vehicle & Fare
                </h3>
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="mb-1 block text-[11px] sm:text-xs font-semibold text-slate-700">Vehicle Category</label>
                <div className="relative">
                  <select
                    value={vehicleCategory}
                    onChange={(e) => handleCategoryChange(e.target.value as VehicleCategory)}
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-xs font-semibold text-slate-900 shadow-sm transition focus:border-[#FF9800] focus:outline-none focus:ring-2 focus:ring-[#FF9800]/20 sm:text-sm"
                  >
                  <option value="MINI">MINI</option>
                  <option value="SEDAN">SEDAN</option>
                  <option value="SUV">SUV</option>
                  <option value="SUV+">SUV+</option>
                  <option value="INNOVA">INNOVA</option>
                  <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                  <option value="CUSTOM">Custom Vehicle Type...</option>
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  />
                </div>

                {vehicleCategory === 'CUSTOM' && (
                  <div className="mt-2.5">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custom Vehicle Name
                    </label>
                    <input
                      type="text"
                      value={customVehicleName}
                      onChange={(e) => setCustomVehicleName(e.target.value)}
                      placeholder="Enter custom vehicle name"
                      className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs placeholder:font-normal placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* REGULAR FARE INPUTS: 2x2 grid on mobile, 4 columns on sm+ */}
              {tripType === 'REGULAR' ? (
                <div className="grid grid-cols-2 gap-2 pt-0.5 sm:grid-cols-4 sm:gap-2.5">
                  <div>
                    <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
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
                      className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                      placeholder="150"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                      KM Rate (₹/km)
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
                      className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                      placeholder="28"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                      Distance (km)
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
                      placeholder="e.g. 37.2"
                      className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                    />
                  </div>
                  <div>
                      <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                      Total Fare (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 250"
                      value={estimatedFare}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setEstimatedFare(val);
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="h-11 lg:h-10 w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                    />
                  </div>
                </div>
              ) : (
                /* PACKAGE FARE INPUTS */
                <div className="space-y-3 pt-0.5">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                    <div>
                      <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
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
                        className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                        placeholder="e.g. 140"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                        Hours
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
                        className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                        placeholder="e.g. 4"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                        KM Rate (₹/km)
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
                        className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                        placeholder="e.g. 15"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block break-words text-xs font-semibold leading-tight text-slate-700">
                        Package KMs
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
                        className="h-11 lg:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                        placeholder="e.g. 40"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block break-words text-xs font-bold leading-tight text-slate-700">
                        Total Fare (₹)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 500"
                        value={estimatedFare}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setEstimatedFare(val);
                          }
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="h-11 lg:h-10 w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Calculation Mode */}
                  <div className="space-y-1 pt-1 text-xs">
                    <label className="flex min-h-[44px] items-center gap-2 text-slate-700 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        aria-label="Include KM Charges in Total"
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
                        className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Include KM Charges in Total</span>
                    </label>

                    <span className="block text-[11px] font-semibold text-slate-900">
                      Calculated: ₹{
                        includeKmInPackageTotal
                          ? (Number(hourFare) || 0) * (Number(packageHours) || 0) +
                            (Number(kmsFare) || 0) * (Number(packageKms) || 0)
                          : (Number(hourFare) || 0) * (Number(packageHours) || 0)
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STEP 4 (Mobile): Dispatch Mode & Driver Allocation */}
          <div className={`space-y-3.5 sm:space-y-4 xl:space-y-3 lg:col-span-1 lg:order-5 ${mobileStep === 4 ? 'block lg:block' : 'hidden lg:block'}`}>

            {/* SECTION 5: Dispatch Mode & Driver Allocation */}
            <div className="rounded-none border-0 bg-transparent p-0 shadow-none space-y-3.5 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                   Dispatch
                </h3>
              </div>

              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setDispatchType('RADIUS')}
                  className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-2.5 transition cursor-pointer text-left min-h-[58px] ${
                    dispatchType === 'RADIUS'
                      ? 'bg-amber-50 text-amber-950 border-amber-500 font-bold shadow-xs ring-1 ring-amber-500/15'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium'
                  }`}
                >
                   <div className="min-w-0">
                    <div className="break-words text-xs font-bold leading-tight">RADIUS GEOFENCE</div>
                    <div className={`break-words text-[10px] leading-tight ${dispatchType === 'RADIUS' ? 'text-amber-950' : 'text-slate-500'}`}>
                      Nearby within {radiusKms || 5} km
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchType('BROADCAST')}
                  className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-2.5 transition cursor-pointer text-left min-h-[58px] ${
                    dispatchType === 'BROADCAST'
                      ? 'bg-amber-50 text-amber-950 border-amber-500 font-bold shadow-xs ring-1 ring-amber-500/15'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="break-words text-xs font-bold leading-tight">BROADCAST</div>
                    <div className={`break-words text-[10px] leading-tight ${dispatchType === 'BROADCAST' ? 'text-slate-900' : 'text-slate-500'}`}>
                      All online fleet
                    </div>
                  </div>
                </button>
              </div>

              {dispatchType === 'RADIUS' && (
                <div className="space-y-2.5 pt-1 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-800">Search Radius</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={radiusKms}
                        onChange={(e) => setRadiusKms(e.target.value)}
                        className="w-14 h-10 text-center font-bold font-mono text-slate-900 border border-slate-300 rounded-lg px-1.5 bg-white text-sm"
                      />
                      <span className="font-bold text-amber-800">km</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-0.5">
                    {[3, 5, 8, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRadiusKms(String(preset))}
                        className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer text-center border ${
                          Number(radiusKms) === preset
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                        }`}
                      >
                          {preset} km
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative z-20 space-y-2">
                {isDriverSelectionOpen ? (
                  <DriverSearchSelect
                    drivers={drivers}
                    selectedDriverId={assignedDriverId}
                    onSelect={setAssignedDriverId}
                    dispatchType={dispatchType}
                    onDispatchTypeChange={setDispatchType}
                    radiusKms={radiusKms}
                    onRadiusChange={setRadiusKms}
                    pickupLat={pickupLat ? Number(pickupLat) : undefined}
                    pickupLng={pickupLng ? Number(pickupLng) : undefined}
                    pickupLocation={pickupLocation}
                    trips={trips}
                    selectionPage
                    onBack={() => setIsDriverSelectionOpen(false)}
                    onConfirm={() => setIsDriverSelectionOpen(false)}
                    onAvailableCountChange={setNearbyDriverCount}
                  />
                ) : (
                  <div className="rounded-none border-0 bg-transparent p-0 shadow-none lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-3 lg:shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900">Direct Driver Assignment</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {nearbyDriverCount ?? drivers.filter((driver) => driver.status === 'ACTIVE' && driver.is_online).length} available drivers · {radiusKms} km radius
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDriverSelectionOpen(true)}
                        className="min-h-[44px] w-full rounded-xl border border-amber-500 bg-white px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50 sm:w-auto"
                      >
                        Select Driver
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Trip Summary remains in the left booking panel on desktop. */}
         <div className={`space-y-2 lg:col-span-1 lg:order-6 ${mobileStep === 4 ? 'block lg:block' : 'hidden lg:block'}`}>
            
            {/* Form Summary Card */}
             <div className="space-y-3 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Trip Summary</h3>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="min-w-0">
                    <span className="block text-slate-500">
                    Passenger
                  </span>
                  <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-900">
                    {customerName || 'Passenger'}
                  </span>
                </div>

                <div className="min-w-0">
                    <span className="block text-slate-500">
                    Vehicle
                  </span>
                  <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-900">
                    {vehicleCategory === 'CUSTOM'
                      ? customVehicleName.trim() || 'Custom Vehicle'
                      : vehicleCategory}
                  </span>
                </div>

                <div className="min-w-0">
                    <span className="block text-slate-500">
                    Type
                  </span>
                  <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-900">
                    {tripType === 'REGULAR'
                      ? 'Regular'
                      : packageHours && packageKms
                      ? `Package (${packageHours}h / ${packageKms}km)`
                      : packageHours
                      ? `Package (${packageHours}h)`
                      : packageKms
                      ? `Package (${packageKms}km)`
                      : 'Package'}
                  </span>
                </div>

                <div className="min-w-0">
                    <span className="block text-slate-500">
                    Mode
                  </span>
                  <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-900">
                    {dispatchType === 'BROADCAST' ? 'Broadcast' : `Radius (${radiusKms}km)`}
                  </span>
                </div>

                {/* Direct Driver Profile Card in Summary */}
                {selectedDriver ? (
                  <div className="col-span-2 border-t border-slate-200 pt-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Assigned Driver
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                            <span className="min-w-0 break-words uppercase leading-tight">{selectedDriver.driver_name}</span>
                            <span className={`shrink-0 font-medium ${selectedDriver.is_online ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {selectedDriver.is_online ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-[11px] text-slate-600 [&>span:nth-child(2)]:hidden">
                            <span className="min-w-0">
                              <span className="block text-slate-500">Driver ID</span>
                              <strong className="block font-semibold text-slate-900">{selectedDriver.driver_id}</strong>
                            </span>
                            <span>•</span>
                            <span className="min-w-0">
                              <span className="block text-slate-500">Vehicle Category</span>
                              <strong className="block break-words font-semibold leading-tight text-slate-900">{selectedDriver.vehicle_category || 'Not provided'}</strong>
                            </span>
                            <span className="col-span-2 min-w-0">
                              <span className="block text-slate-500">Vehicle Number</span>
                              <strong className="block font-semibold text-slate-900">{selectedDriver.vehicle_number || 'Not provided'}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Direct Driver Call & WhatsApp Quick Buttons */}
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                        <a
                          href={`tel:${
                            selectedDriver.mobile_number.replace(/\D/g, '')
                              ? `+91${selectedDriver.mobile_number.replace(/\D/g, '').slice(-10)}`
                              : selectedDriver.mobile_number
                          }`}
                          className="flex min-h-[42px] items-center justify-center rounded-lg bg-[#009966] px-3 text-xs font-bold text-white transition hover:bg-[#007a52] active:bg-[#006b48]"
                        >
                          <span>Call Driver</span>
                        </a>
                        <a
                          href={`https://wa.me/${
                            selectedDriver.mobile_number.replace(/\D/g, '').length === 10
                              ? `91${selectedDriver.mobile_number.replace(/\D/g, '')}`
                              : selectedDriver.mobile_number.replace(/\D/g, '')
                          }?text=${encodeURIComponent(
                            `Hello ${selectedDriver.driver_name}, you are assigned to a new ride: Pickup: ${pickupLocation || 'Pickup Point'} | Drop: ${dropLocation || 'Destination'}. Fare: ₹${estimatedFare || '0'}.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-[42px] items-center justify-center rounded-lg border border-[#009966] bg-white px-3 text-xs font-bold text-[#009966] transition hover:bg-emerald-50"
                        >
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 px-0 py-1 lg:rounded-lg lg:bg-slate-50 lg:px-2 lg:py-1.5">
                    <span className="block text-slate-500">
                      Driver
                    </span>
                    <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-900">
                      Auto Broadcast
                    </span>
                  </div>
                )}

              </div>

              {/* Total Estimated Fare Box */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  Estimated Trip Fare
                </div>
                <div className="text-lg font-black text-slate-950">
                  ₹{estimatedFare || '0'}
                </div>
              </div>

              {/* Publish & Notification Settings */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs font-bold text-slate-800">Dispatch Settings</div>
                
                <label className="flex min-h-[32px] items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendSmsNotification}
                    onChange={(e) => setSendSmsNotification(e.target.checked)}
                    className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Driver notification</span>
                </label>
              </div>

              {/* Action Buttons (Visible only on desktop screens lg+, mobile uses step navigation bottom bar) */}
              <div className={`pt-2 space-y-1.5 ${mobileStep === 4 ? 'block' : 'hidden'} lg:block lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-2`}>
                <button
                  type="submit"
                  form="new-trip-form"
                  disabled={isSubmitting}
                  className="hidden lg:flex w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold text-xs shadow-md hover:shadow-lg transition items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Creating Trip...'
                      : `Dispatch Booking (₹${estimatedFare || '0'})`}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 lg:contents">
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Reset</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClose}
                    className="hidden lg:flex w-full py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer text-center items-center justify-center"
                  >
                    Cancel / Back
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
        </form>

        {/* Desktop step actions. Final dispatch remains in the Step 4 summary. */}
        {mobileStep === 1 && (
          <div className="hidden items-center justify-between gap-3 px-5 pb-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-rose-600 font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {mobileStep > 1 && (
                <button
                  type="button"
                  onClick={() => setMobileStep((mobileStep - 1) as 1 | 2 | 3 | 4)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Back
                </button>
              )}
              {mobileStep === 1 && (
                <button
                  type="button"
                  onClick={() => setMobileStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition cursor-pointer"
                >
                  Next: Vehicle & Fare
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sticky Mobile Step-by-Step Bottom Bar */}
        {!isDriverSelectionOpen && (
          <div ref={mobileActionBarRef} className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-1.5 sm:gap-2 shadow-lg min-[768px]:max-[1024px]:left-1/2 min-[768px]:max-[1024px]:right-auto min-[768px]:max-[1024px]:w-full min-[768px]:max-[1024px]:max-w-3xl min-[768px]:max-[1024px]:-translate-x-1/2 min-[768px]:max-[1024px]:px-6">
          {mobileStep === 1 && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-rose-600 hover:text-rose-700 font-bold text-xs transition cursor-pointer min-h-[44px] shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setMobileStep(2)}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer min-h-[44px] shrink-0"
              >
                <span>Next: Vehicle & Fare</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {mobileStep === 2 && (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-rose-600 hover:text-rose-700 font-bold text-xs transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setMobileStep(1)}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMobileStep(3)}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer min-h-[44px] shrink-0"
              >
                <span>Next: Passenger</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {mobileStep === 3 && (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-rose-600 hover:text-rose-700 font-bold text-xs transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setMobileStep(2)}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>
              <div className="hidden">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Step 3 of 4 · Fare
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileStep(4)}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer min-h-[44px] shrink-0"
              >
                <span>Next: Dispatch</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {mobileStep === 4 && (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-rose-600 hover:text-rose-700 font-bold text-xs transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setMobileStep(3)}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>
              <button
                type="submit"
                form="new-trip-form"
                disabled={isSubmitting}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px] shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Dispatching...' : 'Dispatch'}</span>
              </button>
            </>
          )}
          </div>
        )}

      </div>
    </div>
  );
};

