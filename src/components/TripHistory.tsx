import React, { useState, useMemo, useEffect } from 'react';
import { FirestoreTrip, FirestoreDriver, TripStatus } from '../types';
import {
  Download,
  MapPin,
  User,
  Car,
  CheckCircle2,
  KeyRound,
  Trash2,
  Zap,
  Eye,
  TrendingUp,
  Printer,
  RotateCcw,
  CalendarRange,
  ArrowRight,
  Check,
  FileSpreadsheet,
  BadgePercent,
  Receipt,
  X,
  Send,
  AlertCircle,
  Loader2,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

interface TripHistoryProps {
  trips: FirestoreTrip[];
  drivers?: FirestoreDriver[];
  onDeleteTrip: (tripDocId: string) => Promise<void>;
  globalSearchQuery: string;
  onOpenTrackingModal?: (trip: FirestoreTrip) => void;
  onOpenEditTrip?: (trip: FirestoreTrip) => void;
  onSetDriverOfficeDue?: (
    driverId: string,
    amount: number,
    note?: string,
    officeUpiId?: string
  ) => Promise<void>;
  onClearDriverOfficeDue?: (driverId: string) => Promise<void>;
  onClearLocalTripStorage?: (clearLocalViewOnly?: boolean) => void;
  isFirebaseConnected?: boolean;
}

type DateFilterPreset = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const TRIPS_PER_PAGE = 25;
const LOCAL_STORAGE_KEY = 'trusty_cab_trips_local_v1';

const PAYMENT_NOTE_PRESETS = [
  'Trip CC (Convenience Charge)',
  'Driver Registration Fee',
  'Driver Renewal Fee',
  'Office Weekly Dispatch Fee',
  'CUSTOM',
];

export const TripHistory: React.FC<TripHistoryProps> = ({
  trips,
  drivers = [],
  onDeleteTrip,
  globalSearchQuery,
  onOpenTrackingModal,
  onOpenEditTrip,
  onSetDriverOfficeDue,
  onClearDriverOfficeDue,
  onClearLocalTripStorage,
  isFirebaseConnected = false,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [tripToDelete, setTripToDelete] = useState<FirestoreTrip | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Clear Local Storage states (Only removes browser cache - ZERO backend deletions)
  const [isClearStorageModalOpen, setIsClearStorageModalOpen] = useState<boolean>(false);
  const [storageCleanNotification, setStorageCleanNotification] = useState<string | null>(null);

  // Driver Office Due Management state (links trip to its assigned driver only)
  const [feeTrip, setFeeTrip] = useState<FirestoreTrip | null>(null);
  const [feeStep, setFeeStep] = useState<1 | 2 | 3>(1);
  const [feeAmount, setFeeAmount] = useState<string>('');
  const [feeNotePreset, setFeeNotePreset] = useState<string>('Trip CC (Convenience Charge)');
  const [customFeeNote, setCustomFeeNote] = useState<string>('');
  // Office UPI ID is blank always by default; populated only if user chooses default ID
  const [feeOfficeUpi, setFeeOfficeUpi] = useState<string>('');
  const [isSavingFee, setIsSavingFee] = useState<boolean>(false);
  const [feeFeedback, setFeeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Date Filtering State: Day, Week, Month, Custom Date Range
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState<string>('');
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState<string>('');
  
  // Grid-only view and pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [localStorageCount, setLocalStorageCount] = useState<number>(0);

  const handleConfirmClearLocalStorage = (clearViewToo: boolean) => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('trusty_cab_trips_local_v1');
    } catch (err) {
      console.warn('Could not remove trips from localStorage', err);
    }
    setLocalStorageCount(0);
    onClearLocalTripStorage?.(clearViewToo);
    setIsClearStorageModalOpen(false);

    if (clearViewToo) {
      setStorageCleanNotification(
        'Local storage cache cleared & ledger screen reset! (Backend Firestore database records remain 100% untouched)'
      );
    } else {
      setStorageCleanNotification(
        'Trip history successfully removed from browser local storage! (Backend Firestore database records remain 100% untouched)'
      );
    }
    setTimeout(() => {
      setStorageCleanNotification(null);
    }, 6000);
  };

  // Quick stats across full ledger
  const completedTrips = useMemo(() => trips.filter((t) => t.status === 'COMPLETED'), [trips]);
  const inProgressTrips = useMemo(
    () => trips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED'),
    [trips]
  );
  const cancelledTrips = useMemo(() => trips.filter((t) => t.status === 'CANCELLED'), [trips]);
  
  const totalRevenue = useMemo(() => {
    return completedTrips.reduce(
      (sum, t) => sum + (t.final_fare || t.estimated_fare || 0),
      0
    );
  }, [completedTrips]);

  const avgFare = completedTrips.length > 0 ? Math.round(totalRevenue / completedTrips.length) : 0;

  // Date Filter Predicate
  const matchesDateFilter = (trip: FirestoreTrip): boolean => {
    if (dateFilter === 'ALL') return true;

    const tripTime = trip.completed_at || trip.created_at || 0;
    if (!tripTime) return true;

    const tripDate = new Date(tripTime);
    const now = new Date();

    if (dateFilter === 'TODAY') {
      return (
        tripDate.getDate() === now.getDate() &&
        tripDate.getMonth() === now.getMonth() &&
        tripDate.getFullYear() === now.getFullYear()
      );
    }

    if (dateFilter === 'WEEK') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setHours(0, 0, 0, 0);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return tripTime >= sevenDaysAgo.getTime();
    }

    if (dateFilter === 'MONTH') {
      return (
        tripDate.getMonth() === now.getMonth() &&
        tripDate.getFullYear() === now.getFullYear()
      );
    }

    if (dateFilter === 'CUSTOM') {
      if (!appliedCustomStartDate || !appliedCustomEndDate) return true;

      if (appliedCustomStartDate) {
        const start = new Date(appliedCustomStartDate);
        start.setHours(0, 0, 0, 0);
        if (tripTime < start.getTime()) return false;
      }
      if (appliedCustomEndDate) {
        const end = new Date(appliedCustomEndDate);
        end.setHours(23, 59, 59, 999);
        if (tripTime > end.getTime()) return false;
      }
      return true;
    }

    return true;
  };

  // Filtered trips memoized
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      // 1. Status Filter
      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;

      // 2. Date Filter
      if (!matchesDateFilter(t)) return false;

      // 3. Search Query
      const q = (searchQuery || globalSearchQuery).trim().toLowerCase();
      if (q) {
        const matchId = t.trip_id.toLowerCase().includes(q);
        const matchCustomer =
          t.customer_name.toLowerCase().includes(q) || t.customer_phone.includes(q);
        const matchDriver =
          (t.driver_name || '').toLowerCase().includes(q) ||
          (t.driver_id || '').toLowerCase().includes(q);
        const matchVehicle = (t.vehicle_number || '').toLowerCase().includes(q);
        const matchPickup =
          t.pickup_location.toLowerCase().includes(q) || t.drop_location.toLowerCase().includes(q);
        if (!matchId && !matchCustomer && !matchDriver && !matchVehicle && !matchPickup) {
          return false;
        }
      }
      return true;
    });
  }, [
    trips,
    selectedStatus,
    dateFilter,
    appliedCustomStartDate,
    appliedCustomEndDate,
    searchQuery,
    globalSearchQuery,
  ]);

  const customDateError = useMemo(() => {
    if (dateFilter !== 'CUSTOM' || (!customStartDate && !customEndDate)) return null;
    if (!customStartDate || !customEndDate) return 'Select both dates to apply the custom range.';

    const start = new Date(`${customStartDate}T00:00:00`);
    const end = new Date(`${customEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return 'Choose a valid date range.';
    }
    return null;
  }, [dateFilter, customStartDate, customEndDate]);

  const isCustomDateReady =
    dateFilter !== 'CUSTOM' ||
    (Boolean(customStartDate) && Boolean(customEndDate) && !customDateError);
  const visibleFilteredTrips = isCustomDateReady ? filteredTrips : [];

  // Pagination calculation
  const totalPages = Math.ceil(visibleFilteredTrips.length / TRIPS_PER_PAGE) || 1;
  const paginatedTrips = useMemo(() => {
    const page = Math.min(currentPage, totalPages);
    return visibleFilteredTrips.slice((page - 1) * TRIPS_PER_PAGE, page * TRIPS_PER_PAGE);
  }, [visibleFilteredTrips, currentPage, totalPages]);

  // Reset page on filters change
  const handleDatePresetChange = (preset: DateFilterPreset) => {
    setDateFilter(preset);
    if (preset !== 'CUSTOM') {
      setAppliedCustomStartDate('');
      setAppliedCustomEndDate('');
    } else if (!customDateError && customStartDate && customEndDate) {
      setAppliedCustomStartDate(customStartDate);
      setAppliedCustomEndDate(customEndDate);
    } else {
      setCustomStartDate('');
      setCustomEndDate('');
      setAppliedCustomStartDate('');
      setAppliedCustomEndDate('');
    }
    setCurrentPage(1);
  };

  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    const nextStart = field === 'start' ? value : customStartDate;
    const nextEnd = field === 'end' ? value : customEndDate;
    setCustomStartDate(nextStart);
    setCustomEndDate(nextEnd);
    setCurrentPage(1);

    const start = new Date(`${nextStart}T00:00:00`);
    const end = new Date(`${nextEnd}T00:00:00`);
    if (nextStart && nextEnd && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      setAppliedCustomStartDate(nextStart);
      setAppliedCustomEndDate(nextEnd);
    }
  };

  const clearCustomDateRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setAppliedCustomStartDate('');
    setAppliedCustomEndDate('');
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (st: string) => {
    setSelectedStatus(st);
    setCurrentPage(1);
  };

  // Find driver associated with this specific trip record
  const getDriverForTrip = (t: FirestoreTrip): FirestoreDriver | null => {
    if (!drivers || drivers.length === 0) return null;
    const cleanDriverId = (t.driver_id || '').trim().toUpperCase();
    const cleanVeh = (t.vehicle_number || '').trim().toUpperCase().replace(/\s+/g, '');
    return (
      drivers.find(
        (d) =>
          (cleanDriverId && (d.driver_id.trim().toUpperCase() === cleanDriverId || d.doc_id === t.driver_id)) ||
          (cleanVeh && d.vehicle_number.trim().toUpperCase().replace(/\s+/g, '') === cleanVeh)
      ) || null
    );
  };

  const handleOpenDriverFeeModal = (t: FirestoreTrip) => {
    setFeeTrip(t);
    setFeeStep(1);
    setFeeFeedback(null);
    const drv = getDriverForTrip(t);
    if (drv) {
      setFeeAmount('');
      // Office UPI ID is set blank always by default; user can choose default ID if desired
      setFeeOfficeUpi('');
      if (drv.payment_note) {
        if (PAYMENT_NOTE_PRESETS.includes(drv.payment_note)) {
          setFeeNotePreset(drv.payment_note);
          setCustomFeeNote('');
        } else {
          setFeeNotePreset('CUSTOM');
          setCustomFeeNote(drv.payment_note);
        }
      } else {
        setFeeNotePreset('Trip CC (Convenience Charge)');
        setCustomFeeNote('');
      }
    } else {
      setFeeAmount('');
      setFeeOfficeUpi('');
      setFeeNotePreset('Trip CC (Convenience Charge)');
      setCustomFeeNote('');
    }
  };

  const handleSaveDriverFee = async () => {
    if (!feeTrip || !onSetDriverOfficeDue) return;
    const drv = getDriverForTrip(feeTrip);
    const targetDriverId = drv?.driver_id || feeTrip.driver_id;
    if (!targetDriverId) {
      setFeeFeedback({ type: 'error', message: 'No driver ID found for this trip record.' });
      return;
    }

    const numAmount = Math.max(0, Number(feeAmount) || 0);
    const note = feeNotePreset === 'CUSTOM' ? (customFeeNote.trim() || 'Trip CC (Convenience Charge)') : feeNotePreset;

    setIsSavingFee(true);
    setFeeFeedback(null);
    try {
      await onSetDriverOfficeDue(targetDriverId, numAmount, note, feeOfficeUpi);
      setFeeFeedback({
        type: 'success',
        message: numAmount > 0 
          ? `Updated driver ${drv?.driver_name || targetDriverId}: ₹${numAmount} due ("${note}")`
          : `Driver dues cleared to ₹0 (Verified)`,
      });
      setTimeout(() => {
        setFeeTrip(null);
        setFeeFeedback(null);
        setFeeStep(1);
      }, 1300);
    } catch (err: any) {
      setFeeFeedback({ type: 'error', message: err?.message || 'Failed to update office fee.' });
    } finally {
      setIsSavingFee(false);
    }
  };

  const handleClearDriverFee = async () => {
    if (!feeTrip || !onClearDriverOfficeDue) return;
    const drv = getDriverForTrip(feeTrip);
    const targetDriverId = drv?.driver_id || feeTrip.driver_id;
    if (!targetDriverId) {
      setFeeFeedback({ type: 'error', message: 'No driver ID found for this trip record.' });
      return;
    }

    setIsSavingFee(true);
    setFeeFeedback(null);
    try {
      await onClearDriverOfficeDue(targetDriverId);
      setFeeFeedback({
        type: 'success',
        message: `Driver ${drv?.driver_name || targetDriverId} dues marked CLEARED & VERIFIED (₹0).`,
      });
      setTimeout(() => {
        setFeeTrip(null);
        setFeeFeedback(null);
        setFeeStep(1);
      }, 1300);
    } catch (err: any) {
      setFeeFeedback({ type: 'error', message: err?.message || 'Failed to clear office fee.' });
    } finally {
      setIsSavingFee(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const csvCell = (value: unknown): string => {
      let text = String(value ?? '');
      // Spreadsheet applications evaluate these prefixes as formulas. Prefixing
      // with an apostrophe forces imported customer data to remain plain text.
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = [
      'Trip ID',
      'Status',
      'Date & Time',
      'Customer Name',
      'Customer Phone',
      'Pickup Location',
      'Dropoff Location',
      'Driver Name',
      'Driver ID',
      'Vehicle Number',
      'Vehicle Category',
      'Estimated Fare (INR)',
      'Final Fare (INR)',
      'Distance (KM)',
      'OTP',
      'Completed At',
    ];

    const rows = filteredTrips.map((t) => [
      t.trip_id.replace(/^TRIP-?/, ''),
      t.status,
      new Date(t.created_at).toLocaleString(),
      t.customer_name,
      t.customer_phone,
      t.pickup_location,
      t.drop_location,
      t.driver_name || 'Unassigned',
      t.driver_id || '',
      t.vehicle_number || '',
      t.vehicle_category || '',
      t.estimated_fare || 0,
      t.final_fare || t.estimated_fare || 0,
      t.distance_km || 0,
      t.otp || '',
      t.completed_at ? new Date(t.completed_at).toLocaleString() : 'N/A',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const downloadUrl = URL.createObjectURL(
      new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.setAttribute('href', downloadUrl);
    const dateLabel =
      dateFilter === 'TODAY'
        ? 'Today'
        : dateFilter === 'WEEK'
        ? 'ThisWeek'
        : dateFilter === 'MONTH'
        ? 'ThisMonth'
        : 'Ledger';
    link.setAttribute(
      'download',
      `TrustyYellowCab_Trips_${dateLabel}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const getStatusBadge = (status: string) => {
    const label = status === 'IN_PROGRESS' ? 'ON RIDE' : status.replace('_', ' ');
    const color =
      status === 'COMPLETED'
        ? 'text-emerald-700'
        : status === 'CANCELLED'
          ? 'text-rose-700'
          : status === 'OPEN'
            ? 'text-amber-800'
            : status === 'ACCEPTED'
              ? 'text-sky-700'
              : 'text-purple-700';

    return <span className={`text-[10px] font-semibold tracking-wide ${color}`}>{label}</span>;
  };

  return (
    <div className="min-w-0 space-y-3 pb-20 sm:space-y-4 sm:pb-0 min-[768px]:max-[1024px]:space-y-4 lg:space-y-5">
      {/* Toast Notification when Local Storage is Cleaned */}
      {storageCleanNotification && (
        <div className="bg-emerald-50 border border-emerald-200/90 text-emerald-950 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-xs transition animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{storageCleanNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setStorageCleanNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact Trip History header */}
      <div className="hidden flex-col gap-3 border-b border-slate-200 pb-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">Trip History</h2>

        {/* Quick Actions */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {/* Clear Local Storage Button (Only affects browser local cache, NOT backend) */}
          <button
            type="button"
            onClick={() => setIsClearStorageModalOpen(true)}
            className="min-h-10 flex-1 rounded-xl border border-rose-200/90 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 sm:flex-none"
            title="Clean local browser storage for trips (Backend database remains untouched)"
          >
            <span>Clean</span>
          </button>

          <button
            onClick={exportToCSV}
            className="min-h-10 flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 sm:flex-none"
            title="Export filtered records to CSV"
          >
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid w-full min-w-0 grid-cols-2 gap-2.5 sm:gap-3 min-[768px]:max-[1024px]:grid-cols-4 lg:grid-cols-4">
        {/* Total Ledger Fares */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Revenue
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              ₹{totalRevenue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Completed Rides */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Completed
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {completedTrips.length}
            </span>
          </div>
        </div>

        {/* Active Journeys */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              On Ride
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {inProgressTrips.length}
            </span>
          </div>
        </div>

        {/* Average Ticket Size */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Average Fare
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              ₹{avgFare}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Filter Toolbar: Date Wise Search (Day, Week, Month, Custom) + Status Tabs */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        {/* ===================== MOBILE DEDICATED LAYOUT (< sm) ===================== */}
        <div className="sm:hidden space-y-3">
          {/* Mobile view controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-bold text-slate-900">Trips</span>
              {isCustomDateReady && (
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  ({visibleFilteredTrips.length})
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Clear Local Storage & Export CSV Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsClearStorageModalOpen(true)}
                  className="min-h-9 rounded-lg border border-rose-200/90 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                  title="Clear Local Storage (Backend safe)"
                >
                  <span>Clean</span>
                </button>

                <button
                  type="button"
                  onClick={exportToCSV}
                  className="min-h-9 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800"
                  title="Export filtered records to CSV"
                >
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Full-width Touch-friendly Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search trip, customer, phone or vehicle"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px] transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center active:scale-90 transition"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Date Filter Segmented Carousel */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Date Range</span>
              </span>
              {dateFilter !== 'TODAY' && (
                <button
                  type="button"
                  onClick={() => handleDatePresetChange('TODAY')}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
                >
                  Reset Date
                </button>
              )}
            </div>

            <div className="flex flex-nowrap gap-1 py-0.5">
              {[
                { id: 'TODAY', label: 'Today' },
                { id: 'WEEK', label: 'This Week' },
                { id: 'MONTH', label: 'This Month' },
                { id: 'CUSTOM', label: 'Custom' },
              ].map((preset) => {
                const isActive = dateFilter === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleDatePresetChange(preset.id as DateFilterPreset)}
                    className={`min-h-9 min-w-0 flex-1 rounded-lg px-1.5 py-1 text-[10px] font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                      isActive
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Range Picker Card (Visible if CUSTOM is selected) */}
          {dateFilter === 'CUSTOM' && (
            <div className="p-3 bg-amber-50/60 border border-amber-200/90 rounded-xl space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[38px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[38px]"
                  />
                </div>
              </div>

              {customDateError && (
                <p className="text-[11px] font-medium text-amber-800">{customDateError}</p>
              )}

              {(customStartDate || customEndDate) && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={clearCustomDateRange}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer transition active:scale-95"
                  >
                    Clear Dates
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Filter Carousel with Count Badges */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Trip Status</span>
              </span>
              {selectedStatus !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('ALL')}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
                >
                  Reset Status
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 py-0.5">
              {[
                { key: 'ALL', label: 'All Trips', dot: '' },
                { key: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-500' },
                { key: 'IN_PROGRESS', label: 'On Ride', dot: 'bg-purple-500' },
                { key: 'ACCEPTED', label: 'Accepted', dot: 'bg-sky-500' },
                { key: 'OPEN', label: 'Open', dot: 'bg-amber-500' },
                { key: 'CANCELLED', label: 'Cancelled', dot: 'bg-slate-400' },
              ].map((st) => {
                const count =
                  st.key === 'ALL'
                    ? trips.length
                    : trips.filter((t) => t.status === st.key).length;
                const isActive = selectedStatus === st.key;
                return (
                  <button
                    key={st.key}
                    onClick={() => handleStatusFilterChange(st.key)}
                    className={`flex min-h-9 w-full items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                      isActive
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="text-[11px] font-medium tabular-nums whitespace-nowrap">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset All Filters Bar (When active) */}
          {(selectedStatus !== 'ALL' || dateFilter !== 'TODAY' || searchQuery || customStartDate || customEndDate) && (
            <button
              onClick={() => {
                setSelectedStatus('ALL');
                setDateFilter('TODAY');
                setAppliedCustomStartDate('');
                setAppliedCustomEndDate('');
                setSearchQuery('');
                setCustomStartDate('');
                setCustomEndDate('');
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold text-amber-950 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 cursor-pointer transition shadow-2xs"
              title="Reset All Filters to Default"
            >
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* ===================== DESKTOP / TABLET LAYOUT (sm+) ===================== */}
        <div className="hidden sm:block space-y-4">
          {/* Date Filter Selection Row */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1 mr-1">
                <span>Date Filter:</span>
              </span>

              {(
                [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: 'This Week' },
                  { id: 'MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleDatePresetChange(preset.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    dateFilter === preset.id
                      ? 'border border-amber-400 bg-amber-400 text-slate-950'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* If Custom Date Range is selected, show date inputs */}
            {dateFilter === 'CUSTOM' && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full lg:w-auto pt-1 lg:pt-0">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                  <span className="text-slate-500 font-medium">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                  <span className="text-slate-500 font-medium">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                {customDateError && (
                  <p className="w-full text-[11px] font-medium text-amber-800">{customDateError}</p>
                )}

                {(customStartDate || customEndDate) && (
                  <button
                    onClick={clearCustomDateRange}
                    className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Status Filter Tabs & Search Bar Row */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Status Tabs with count badges */}
            <div className="flex flex-wrap items-center gap-2 pb-1 md:pb-0">
              {[
                { key: 'ALL', label: 'All Trips' },
                { key: 'COMPLETED', label: 'Completed' },
                { key: 'IN_PROGRESS', label: 'On Ride' },
                { key: 'ACCEPTED', label: 'Accepted' },
                { key: 'OPEN', label: 'Open' },
                { key: 'CANCELLED', label: 'Cancelled' },
              ].map((st) => {
                const count =
                  st.key === 'ALL'
                    ? trips.length
                    : trips.filter((t) => t.status === st.key).length;
                return (
                  <button
                    key={st.key}
                    onClick={() => handleStatusFilterChange(st.key)}
                    className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      selectedStatus === st.key
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="text-[11px] font-semibold tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Box & Reset on Desktop */}
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Search trip, customer, phone or vehicle"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {(selectedStatus !== 'ALL' || dateFilter !== 'TODAY' || searchQuery || customStartDate || customEndDate) && (
                <button
                  onClick={() => {
                    setSelectedStatus('ALL');
                    setDateFilter('TODAY');
                    setAppliedCustomStartDate('');
                    setAppliedCustomEndDate('');
                    setSearchQuery('');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-95 shrink-0"
                  title="Reset All Active Filters"
                >
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Trip Records Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {visibleFilteredTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center sm:py-10">
            <h4 className="text-sm font-black text-slate-900">No matching trips found</h4>
            <button
              onClick={() => {
                setSelectedStatus('ALL');
                setDateFilter('TODAY');
                setAppliedCustomStartDate('');
                setAppliedCustomEndDate('');
                setSearchQuery('');
                setCustomStartDate('');
                setCustomEndDate('');
                setCurrentPage(1);
              }}
              className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : true ? (
          /* Cards Grid View (Responsive & Touch-Friendly) */
          <div className="grid grid-cols-1 gap-3 bg-slate-50/50 p-3">
            {paginatedTrips.map((t) => {
              const driverForTrip = getDriverForTrip(t);
              const createdAt = new Date(t.created_at);

              return (
                <article
                  key={t.doc_id || t.trip_id}
                  className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold text-slate-950">
                        #{t.trip_id.replace(/^TRIP-?/, '')} · {t.vehicle_category || 'Mini'}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {createdAt.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        · {createdAt.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">{getStatusBadge(t.status)}</div>
                  </div>

                  <div className="mt-2 min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-950">{t.customer_name}</p>
                    <a
                      href={`tel:${t.customer_phone}`}
                      className="mt-0.5 inline-block text-xs text-amber-800 hover:underline"
                    >
                      {t.customer_phone}
                    </a>
                  </div>

                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex items-start gap-3">
                      <dt className="w-14 shrink-0 pt-0.5 font-medium text-slate-500">Pickup</dt>
                      <dd className="min-w-0 break-words leading-relaxed text-slate-800">
                        {t.pickup_location}
                      </dd>
                    </div>
                    <div className="flex items-start gap-3">
                      <dt className="w-14 shrink-0 pt-0.5 font-medium text-slate-500">Drop</dt>
                      <dd className="min-w-0 break-words leading-relaxed text-slate-800">
                        {t.drop_location}
                      </dd>
                    </div>
                  </dl>

                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">Fare</dt>
                      <dd className="text-right text-base font-bold text-slate-950 tabular-nums">
                        ₹{t.final_fare || t.estimated_fare || 0}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">Driver</dt>
                      <dd className="min-w-0 break-words text-right text-slate-800">
                        {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                        {(t.vehicle_number || driverForTrip?.vehicle_number) && (
                          <span className="ml-1 text-slate-500">
                            · {t.vehicle_number || driverForTrip?.vehicle_number}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 grid grid-cols-3 gap-2 pt-1">
                    {(t.driver_id || driverForTrip) && onSetDriverOfficeDue && (
                      <button
                        type="button"
                        onClick={() => handleOpenDriverFeeModal(t)}
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit Office Fee
                      </button>
                    )}
                    {onOpenEditTrip && (
                      <button
                        type="button"
                        onClick={() => onOpenEditTrip(t)}
                        className="min-h-10 rounded-lg bg-amber-400 px-2 py-2 text-xs font-medium text-slate-950 transition hover:bg-amber-300"
                      >
                        Edit Trip
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTripToDelete(t)}
                      className="min-h-10 rounded-lg border border-rose-300 bg-white px-2 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Delete Record
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <>
          {/* Desktop table view */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/90 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Trip ID</th>
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Journey Route</th>
                  <th className="py-3.5 px-4">Driver &amp; Cab</th>
                  <th className="py-3.5 px-4">Fare (INR)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTrips.map((t) => (
                  <tr key={t.doc_id || t.trip_id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-black text-slate-900">
                        #{t.trip_id.replace(/^TRIP-?/, '')}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {t.vehicle_category || 'Mini'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {new Date(t.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(t.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{t.customer_name}</div>
                      <a href={`tel:${t.customer_phone}`} className="text-[10px] text-amber-800 font-mono hover:underline">
                        {t.customer_phone}
                      </a>
                    </td>

                    <td className="max-w-xs px-4 py-3.5">
                      <div className="space-y-2">
                        <div>
                          <span className="block text-[10px] font-medium text-slate-500">Pickup</span>
                          <span className="mt-0.5 block break-words leading-relaxed text-slate-800">{t.pickup_location}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-medium text-slate-500">Drop</span>
                          <span className="mt-0.5 block break-words leading-relaxed text-slate-600">{t.drop_location}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {(() => {
                        const driverForTrip = getDriverForTrip(t);
                        return (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              <span>{t.vehicle_number || driverForTrip?.vehicle_number || t.driver_id || 'No Cab'}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-black text-slate-950 text-sm font-mono">
                        ₹{t.final_fare || t.estimated_fare || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {t.distance_km ? `${t.distance_km} km` : 'Fixed'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">{getStatusBadge(t.status)}</td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {(t.driver_id || getDriverForTrip(t)) && onSetDriverOfficeDue && (
                          <button
                            type="button"
                            onClick={() => handleOpenDriverFeeModal(t)}
                            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            title={`Edit Office Fee for driver who completed this trip (${t.driver_name || t.driver_id})`}
                          >
                            <span>Edit Office Fee</span>
                          </button>
                        )}

                        {onOpenEditTrip && (
                          <button
                            type="button"
                            onClick={() => onOpenEditTrip(t)}
                            className="min-h-9 rounded-lg bg-amber-400 px-2.5 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-amber-300"
                          >
                            Edit Trip
                          </button>
                        )}

                        {onOpenTrackingModal && (
                          <button
                            onClick={() => onOpenTrackingModal(t)}
                            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            title="Open Live Tracking & Route"
                          >
                            <span>Track</span>
                          </button>
                        )}

                        <button
                          onClick={() => setTripToDelete(t)}
                          className="min-h-9 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                          title="Delete Trip"
                        >
                          Delete Record
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Compact mobile list view */}
          <div className="divide-y divide-slate-200 bg-white md:hidden">
            {paginatedTrips.map((t) => {
              const driverForTrip = getDriverForTrip(t);
              const fare = t.final_fare || t.estimated_fare || 0;
              const createdAt = new Date(t.created_at);

              return (
                <section key={t.doc_id || t.trip_id} className="px-3 py-4 sm:px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold text-slate-950">
                        #{t.trip_id.replace(/^TRIP-?/, '')} · {t.vehicle_category || 'Mini'}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {createdAt.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        · {createdAt.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">{getStatusBadge(t.status)}</div>
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-950">{t.customer_name}</p>
                    <a href={`tel:${t.customer_phone}`} className="mt-0.5 inline-block text-xs font-mono text-amber-800 hover:underline">
                      {t.customer_phone}
                    </a>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs">
                    <div>
                      <dt className="font-medium text-slate-500">Pickup</dt>
                      <dd className="mt-0.5 min-w-0 break-words leading-relaxed text-slate-800">{t.pickup_location}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Drop</dt>
                      <dd className="mt-0.5 min-w-0 break-words leading-relaxed text-slate-800">{t.drop_location}</dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <dt className="text-slate-500">Fare</dt>
                      <dd className="font-semibold text-slate-950">₹{fare}</dd>
                    </div>
                    {(t.driver_name || driverForTrip || t.vehicle_number || t.driver_id) && (
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pt-1">
                        <dt className="text-slate-500">Driver</dt>
                        <dd className="min-w-0 break-words text-right text-slate-800">
                          {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                          {(t.vehicle_number || driverForTrip?.vehicle_number) && (
                            <span className="ml-1 font-mono text-slate-500">
                              · {t.vehicle_number || driverForTrip?.vehicle_number}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 min-[360px]:grid-cols-3">
                    {(t.driver_id || driverForTrip) && onSetDriverOfficeDue && (
                      <button
                        type="button"
                        onClick={() => handleOpenDriverFeeModal(t)}
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit Office Fee
                      </button>
                    )}
                    {onOpenEditTrip && (
                      <button
                        type="button"
                        onClick={() => onOpenEditTrip(t)}
                        className="min-h-10 rounded-lg bg-amber-400 px-2 py-2 text-xs font-medium text-slate-950 transition hover:bg-amber-300"
                      >
                        Edit Trip
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTripToDelete(t)}
                      className="min-h-10 rounded-lg border border-rose-300 bg-white px-2 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Delete Record
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          </>
        )}

        {/* Pagination Toolbar */}
        {visibleFilteredTrips.length > TRIPS_PER_PAGE && (
          <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{(currentPage - 1) * TRIPS_PER_PAGE + 1}</strong> to{' '}
              <strong className="text-slate-800">
                {Math.min(currentPage * TRIPS_PER_PAGE, visibleFilteredTrips.length).toLocaleString()}
              </strong>{' '}
              of <strong className="text-slate-800">{visibleFilteredTrips.length.toLocaleString()}</strong> trips
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition flex items-center gap-1 font-semibold"
              >
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                <span className="font-bold text-slate-900 bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg">
                  {currentPage}
                </span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-600 font-medium">{totalPages}</span>
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition flex items-center gap-1 font-semibold"
              >
                <span>Next</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Trip Confirmation Modal */}
      {tripToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Trip Record</h3>
                <p className="text-xs text-slate-500">Permanently remove from trip history &amp; ledger</p>
              </div>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Trip #{tripToDelete.trip_id.replace(/^TRIP-?/, '')}</span>
                <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {tripToDelete.status}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                Customer: <strong>{tripToDelete.customer_name}</strong> ({tripToDelete.customer_phone})
              </div>
              <div className="mt-1 break-words text-xs text-slate-500">
                Route: {tripToDelete.pickup_location} → {tripToDelete.drop_location}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this trip record? This operation will remove it from both local storage and cloud database.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const idToDelete = tripToDelete.doc_id || tripToDelete.trip_id;
                    await onDeleteTrip(idToDelete);
                    setTripToDelete(null);
                  } catch (err) {
                    console.error('Failed to delete trip:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Record'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Office Fee Modal (Only for driver who took this trip) */}
      {feeTrip && (() => {
        const drv = getDriverForTrip(feeTrip);
        const targetDriverId = drv?.driver_id || feeTrip.driver_id || 'UNKNOWN';
        const targetDriverName = drv?.driver_name || feeTrip.driver_name || targetDriverId;
        const currentAmount = drv?.payment_amount || 0;
        const currentStatus = drv?.payment_status || 'CLEARED';

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
            <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-6 min-[768px]:max-[1024px]:max-w-2xl min-[768px]:max-[1024px]:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
              {/* Header */}
              <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-950">Trip Office Fee</h3>
                  <p className="mt-0.5 break-words text-xs text-slate-500">
                    Trip #{feeTrip.trip_id.replace(/^TRIP-?/, '')} · {targetDriverName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFeeTrip(null);
                    setFeeFeedback(null);
                    setFeeStep(1);
                  }}
                  className="min-h-10 self-end whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:self-auto"
                  aria-label="Back to Trips"
                >
                  Back to Trips
                </button>
              </div>

              {/* Compact Trip Summary */}
              <div className="mt-4 grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 text-xs">
                <div className="min-w-0">
                  <span className="block text-slate-500">Fare</span>
                  <span className="mt-0.5 block font-semibold text-slate-900 tabular-nums">
                    ₹{feeTrip.final_fare || feeTrip.estimated_fare || 0}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Status</span>
                  <span className="mt-0.5 block break-words font-semibold capitalize text-slate-900">
                    {feeTrip.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Vehicle</span>
                  <span className="mt-0.5 block break-words font-mono font-semibold text-slate-900">
                    {feeTrip.vehicle_number || drv?.vehicle_number || 'N/A'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Office Due</span>
                  <span className={`mt-0.5 block break-words font-semibold ${
                    currentStatus === 'DUE' && currentAmount > 0
                      ? 'text-amber-800'
                      : 'text-emerald-700'
                  }`}>
                    {currentStatus === 'DUE' && currentAmount > 0
                      ? `₹${currentAmount} Due`
                      : 'Cleared'}
                  </span>
                </div>

              </div>

              {/* Step-by-Step Progress Navigation */}
              <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFeeStep(1)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 1
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Amount</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeeStep(2)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 2
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Purpose</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeeStep(3)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 3
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Confirm</span>
                </button>
              </div>

              {/* Feedback Alert */}
              {feeFeedback && (
                <div
                  className={`mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 ${
                    feeFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  <span className="font-semibold">{feeFeedback.message}</span>
                </div>
              )}

              {/* Step Body */}
               <div className="mt-4 flex-1 space-y-3.5 overflow-visible pr-0.5 text-xs">
                {/* STEP 1: AMOUNT */}
                {feeStep === 1 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Office Fee Amount (₹)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          required
                          autoFocus
                          value={feeAmount}
                          onChange={(e) => setFeeAmount(e.target.value)}
                          placeholder="Enter amount"
                           className="w-full rounded-lg border border-slate-300 px-3 py-3 text-xl font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        />
                      </div>
                    </div>

                    {/* Instant Clear Due Option */}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setFeeAmount('0')}
                        className={`w-full min-h-11 rounded-lg px-3 text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                          feeAmount === '0'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <span>Clear Dues</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: PURPOSE / NOTE */}
                {feeStep === 2 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Payment Reason / Note
                      </label>
                      <div className="space-y-1.5">
                        {PAYMENT_NOTE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setFeeNotePreset(preset)}
                            className={`w-full min-h-11 rounded-lg border px-3 text-left font-bold text-xs transition cursor-pointer flex items-center justify-between ${
                              feeNotePreset === preset
                                ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-2xs'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>{preset}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Note Option */}
                    <div className="pt-1">
                      <label className="block text-slate-600 font-semibold text-[11px] mb-1">
                        Custom Note or Details (Optional)
                      </label>
                      <input
                        type="text"
                        value={customFeeNote}
                        onChange={(e) => {
                          setCustomFeeNote(e.target.value);
                          if (feeNotePreset !== 'CUSTOM') {
                            setFeeNotePreset('CUSTOM');
                          }
                        }}
                        placeholder={`e.g. Convenience charge for Trip #${feeTrip.trip_id}`}
                        className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: CONFIRMATION & OFFICE UPI */}
                {feeStep === 3 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Summary Card */}
                    <div className="space-y-2 border-y border-slate-200 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600 font-medium">Office Fee Amount:</span>
                        <span className="shrink-0 text-base font-black text-amber-950">
                          ₹{feeAmount || 0}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 font-medium">Payment Purpose:</span>
                        <span className="max-w-[60%] break-words text-right font-bold text-slate-900">
                          {feeNotePreset === 'CUSTOM' ? (customFeeNote.trim() || 'Trip CC (Convenience Charge)') : feeNotePreset}
                        </span>
                      </div>
                    </div>

                    {/* Office UPI ID */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-700 font-bold text-xs">
                          Office UPI ID
                        </label>
                        {feeOfficeUpi ? (
                          <button
                            type="button"
                            onClick={() => setFeeOfficeUpi('')}
                            className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                          >
                            Set Blank
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFeeOfficeUpi('123mdcreation@okaxis')}
                            className="text-[11px] text-amber-800 hover:text-amber-900 font-bold bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg transition cursor-pointer"
                          >
                            Choose Default ID
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={feeOfficeUpi}
                        onChange={(e) => setFeeOfficeUpi(e.target.value)}
                        placeholder="Enter UPI ID (optional)"
                        className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                        {feeOfficeUpi.trim() ? (
                          <span className="text-emerald-700 font-semibold">
                            {feeOfficeUpi.trim() === '123mdcreation@okaxis'
                              ? 'Default ID: 123mdcreation@okaxis'
                              : `Custom: ${feeOfficeUpi.trim()}`}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            No UPI ID selected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step Navigation & Actions Footer */}
              <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
                <div className="flex items-center gap-1.5">
                  {feeStep > 1 ? (
                    <button
                      type="button"
                      onClick={() => setFeeStep((prev) => (prev - 1) as 1 | 2)}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFeeTrip(null);
                        setFeeFeedback(null);
                        setFeeStep(1);
                      }}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}

                  {/* Optional Quick Clear Button if currently has dues */}
                  {currentAmount > 0 && (
                    <button
                      type="button"
                      disabled={isSavingFee}
                      onClick={handleClearDriverFee}
                      className="hidden"
                      title="Clear dues immediately to ₹0"
                    >
                      <span>Clear Dues</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {feeStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setFeeStep((prev) => (prev + 1) as 2 | 3)}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSavingFee}
                      onClick={handleSaveDriverFee}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingFee ? (
                        <>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <span>
                            Save Office Fee
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ===================== CLEAR LOCAL STORAGE MODAL ===================== */}
      {isClearStorageModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Clear Local Storage History
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Browser storage cleanup only
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClearStorageModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Reassurance Callout: NOT Backend */}
            <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Backend Database Protected (Zero Cloud Deletions)</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed pl-6">
                This action strictly removes trip records cached in your web browser's Local Storage. <strong>No trips or ledger history will be deleted from your Firestore database or remote servers.</strong>
              </p>
            </div>

            {/* Storage Details */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Storage Key:</span>
                <span className="font-mono font-bold text-slate-800">trusty_cab_trips_local_v1</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Current Cached Trips:</span>
                <span className="font-bold text-slate-900 tabular-nums">{localStorageCount} records</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Cloud Sync Status:</span>
                <span className="font-bold text-slate-900">
                  {isFirebaseConnected ? 'Connected (Firestore active)' : 'Standalone / Local cache'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmClearLocalStorage(false)}
                className="w-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clean Local Storage Cache Only</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmClearLocalStorage(true)}
                className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Clean Storage &amp; Reset Screen View</span>
              </button>

              <button
                type="button"
                onClick={() => setIsClearStorageModalOpen(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-bold transition cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
