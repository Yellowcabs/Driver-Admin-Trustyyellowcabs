import React, { useState, useMemo, useEffect } from 'react';
import {
  FirestoreTrip,
  FirestoreDriver,
  SystemControlSettings,
  formatTripId,
} from '../types';
import {
  Car,
  Clock,
  MapPin,
  Map,
  Phone,
  PhoneCall,
  User,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Radio,
  Zap,
  IndianRupee,
  Gauge,
  Edit3,
  UserMinus,
  Ban,
  RotateCcw,
  Search,
  KeyRound,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  Plus,
  Navigation,
  Sparkles,
  LayoutGrid,
  List,
  Star,
  Check,
  ShieldCheck,
  ShieldAlert,
  Users,
  Smartphone,
  Trash2,
  ArrowRight,
  Copy,
  Info,
  Calendar,
  AlertCircle,
  FileText,
  BadgePercent,
  Timer,
  AlertTriangle,
  Share2,
  History,
  ClipboardPaste,
} from 'lucide-react';
import { CustomerOtpSender } from './CustomerOtpSender';

interface DispatchBoardProps {
  trips: FirestoreTrip[];
  drivers: FirestoreDriver[];
  onOpenNewTripModal: () => void;
  onOpenPasteBookingModal?: () => void;
  onOpenAssignModal: (trip: FirestoreTrip) => void;
  onOpenEditModal: (trip: FirestoreTrip) => void;
  onOpenCompleteModal?: (trip: FirestoreTrip) => void;
  onOpenTrackingModal: (trip: FirestoreTrip) => void;
  onStartTripWithOtp?: (tripId: string, otp?: string) => Promise<void>;
  onUnassignDriver: (tripId: string, reason?: string) => Promise<void>;
  onCancelTrip: (tripId: string, reason: string) => Promise<void>;
  onDeleteTrip: (tripId: string) => Promise<void>;
  globalSearchQuery: string;
  onNavigateToRadar?: () => void;
  systemSettings?: SystemControlSettings;
  onToggleKillswitch?: (online: boolean) => Promise<void>;
  onNavigateToRules?: () => void;
  onNavigateToTrips?: () => void;
}

const ITEMS_PER_PAGE = 6;

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  trips,
  drivers,
  onOpenNewTripModal,
  onOpenPasteBookingModal,
  onOpenAssignModal,
  onOpenEditModal,
  onOpenCompleteModal,
  onOpenTrackingModal,
  onStartTripWithOtp,
  onUnassignDriver,
  onCancelTrip,
  onDeleteTrip,
  globalSearchQuery,
  onNavigateToRadar,
  systemSettings,
  onToggleKillswitch,
  onNavigateToRules,
  onNavigateToTrips,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [tripTypeFilter, setTripTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tripToDelete, setTripToDelete] = useState<FirestoreTrip | null>(null);
  const [tripToUnassign, setTripToUnassign] = useState<FirestoreTrip | null>(null);
  const [tripToCancel, setTripToCancel] = useState<FirestoreTrip | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Active operations on Dashboard (Exclude COMPLETED and CANCELLED / closed trips) - Memoized for Admin Panel Optimization
  const activeTrips = useMemo(
    () => trips.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'),
    [trips]
  );
  const openTrips = useMemo(() => activeTrips.filter((t) => t.status === 'OPEN'), [activeTrips]);
  const acceptedTrips = useMemo(() => activeTrips.filter((t) => t.status === 'ACCEPTED'), [activeTrips]);
  const inProgressTrips = useMemo(() => activeTrips.filter((t) => t.status === 'IN_PROGRESS'), [activeTrips]);
  const completedTripsCount = useMemo(() => trips.filter((t) => t.status === 'COMPLETED').length, [trips]);
  const closedTripsCount = useMemo(() => trips.filter((t) => t.status === 'CANCELLED').length, [trips]);

  const onlineDrivers = useMemo(
    () => drivers.filter((d) => d.is_online && d.status === 'ACTIVE'),
    [drivers]
  );

  // Filtered trips for live dispatch display - Memoized for high performance
  const filteredTrips = useMemo(() => {
    return activeTrips.filter((trip) => {
      if (statusFilter === 'OPEN' && trip.status !== 'OPEN') return false;
      if (statusFilter === 'ACCEPTED' && trip.status !== 'ACCEPTED') return false;
      if (statusFilter === 'IN_PROGRESS' && trip.status !== 'IN_PROGRESS') return false;
      if (vehicleFilter !== 'ALL') {
        const tripCat = (trip.vehicle_category || '').trim().toUpperCase();
        const fCat = vehicleFilter.trim().toUpperCase();
        if (tripCat !== fCat) return false;
      }
      if (tripTypeFilter !== 'ALL') {
        if (tripTypeFilter === 'PACKAGE') {
          if (!trip.is_package && trip.trip_type !== 'PACKAGE') return false;
        } else if (trip.trip_type !== tripTypeFilter) {
          return false;
        }
      }

      // Global Search filter from Navbar
      const activeSearch = (globalSearchQuery || '').trim().toLowerCase();
      if (activeSearch) {
        const matchTripId = trip.trip_id.toLowerCase().includes(activeSearch);
        const matchCustomer =
          trip.customer_name.toLowerCase().includes(activeSearch) ||
          trip.customer_phone.includes(activeSearch);
        const matchDriver =
          (trip.driver_name || '').toLowerCase().includes(activeSearch) ||
          (trip.driver_id || '').toLowerCase().includes(activeSearch) ||
          (trip.driver_phone || '').includes(activeSearch);
        const matchLocation =
          trip.pickup_location.toLowerCase().includes(activeSearch) ||
          trip.drop_location.toLowerCase().includes(activeSearch);
        const matchOtp = (trip.otp || '').includes(activeSearch);
        if (
          !matchTripId &&
          !matchCustomer &&
          !matchDriver &&
          !matchLocation &&
          !matchOtp
        ) {
          return false;
        }
      }
      return true;
    });
  }, [activeTrips, statusFilter, vehicleFilter, tripTypeFilter, globalSearchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredTrips.length / ITEMS_PER_PAGE) || 1;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedTrips = useMemo(
    () => filteredTrips.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filteredTrips, currentPage]
  );

  const getInitials = (name: string) => {
    if (!name) return 'WC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const copyTripId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (ts: number | null | undefined) => {
    if (!ts) return 'Just now';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleCancelClick = (trip: FirestoreTrip) => {
    setActionError(null);
    setCancelReasonInput(
      trip.status === 'ACCEPTED'
        ? 'Customer cancelled after driver acceptance'
        : 'Cancelled by Dispatch Console'
    );
    setTripToCancel(trip);
  };

  const handleUnassignClick = (trip: FirestoreTrip) => {
    setActionError(null);
    setTripToUnassign(trip);
  };

  const handleDeleteClick = (trip: FirestoreTrip) => {
    setActionError(null);
    setTripToDelete(trip);
  };

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden sm:space-y-6 min-[768px]:max-[1024px]:space-y-4 lg:space-y-5 [&_svg]:hidden">
      {/* Firestore Rule Advisory Notice */}
      {systemSettings?.rule_permission_notice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{systemSettings.rule_permission_notice}</span>
          </div>
          {onNavigateToRules && (
            <button
              onClick={onNavigateToRules}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg cursor-pointer shrink-0 transition"
            >
              Open Security Settings
            </button>
          )}
        </div>
      )}

      {/* 4 Overview KPI Cards - Active Operations Only (Hidden on mobile screens, shown on sm+) */}
      <div className="hidden sm:grid grid-cols-2 gap-2 sm:gap-3.5 w-full min-w-0 min-[768px]:max-[1024px]:grid-cols-4 min-[768px]:max-[1024px]:gap-3 lg:grid-cols-4">
        {/* Total Active Queue */}
        <div
          onClick={() => {
            setStatusFilter('ALL');
            setCurrentPage(1);
          }}
          className={`min-w-0 bg-violet-50/70 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer shadow-[0_8px_24px_rgba(124,58,237,0.06)] ${
            statusFilter === 'ALL'
              ? 'border-violet-500 ring-2 ring-violet-500/15 bg-violet-100/70'
              : 'border-violet-100 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <p className="break-words text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Active
            </p>
              <div className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-700 items-center justify-center border border-slate-200 shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5 flex-wrap min-w-0">
            <span className="max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-black leading-none tracking-tight text-slate-900 tabular-nums lg:text-[clamp(1rem,1.5vw,1.875rem)]">
              {activeTrips.length}
            </span>
          </div>
        </div>

        {/* Online & Ready / In-Transit */}
        <div
          onClick={() => {
            setStatusFilter('IN_PROGRESS');
            setCurrentPage(1);
          }}
          className={`min-w-0 bg-violet-50/70 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer shadow-[0_8px_24px_rgba(124,58,237,0.06)] ${
            statusFilter === 'IN_PROGRESS'
              ? 'border-violet-500 ring-2 ring-violet-500/15 bg-violet-100/70'
              : 'border-violet-100 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <p className="break-words text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              In Transit
            </p>
              <div className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-100 text-violet-700 items-center justify-center border border-violet-200 shrink-0">
              <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5 flex-wrap min-w-0">
            <span className="max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-black leading-none tracking-tight text-violet-700 tabular-nums lg:text-[clamp(1rem,1.5vw,1.875rem)]">
              {inProgressTrips.length}
            </span>
          </div>
        </div>

        {/* Open Queue */}
        <div
          onClick={() => {
            setStatusFilter('OPEN');
            setCurrentPage(1);
          }}
          className={`min-w-0 bg-violet-50/70 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer shadow-[0_8px_24px_rgba(124,58,237,0.06)] ${
            statusFilter === 'OPEN'
              ? 'border-violet-500 ring-2 ring-violet-500/15 bg-violet-100/70'
              : 'border-violet-100 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <p className="break-words text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Open
            </p>
              <div className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-100 text-violet-700 items-center justify-center border border-violet-200 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5 flex-wrap min-w-0">
            <span className="max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-black leading-none tracking-tight text-violet-700 tabular-nums lg:text-[clamp(1rem,1.5vw,1.875rem)]">
              {openTrips.length}
            </span>
          </div>
        </div>

        {/* Assigned & En Route */}
        <div
          onClick={() => {
            setStatusFilter('ACCEPTED');
            setCurrentPage(1);
          }}
          className={`min-w-0 bg-violet-50/70 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer shadow-[0_8px_24px_rgba(124,58,237,0.06)] ${
            statusFilter === 'ACCEPTED'
              ? 'border-violet-500 ring-2 ring-violet-500/15 bg-violet-100/70'
              : 'border-violet-100 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <p className="break-words text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Assigned
            </p>
              <div className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-100 text-violet-700 items-center justify-center border border-violet-200 shrink-0">
              <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5 flex-wrap min-w-0">
            <span className="max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-black leading-none tracking-tight text-violet-700 tabular-nums lg:text-[clamp(1rem,1.5vw,1.875rem)]">
              {acceptedTrips.length}
            </span>
          </div>
        </div>
      </div>

      {/* Control & Filter Toolbar Panel */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 transition-all">
        {/* ===================== MOBILE DEDICATED LAYOUT (< sm) ===================== */}
        <div className="sm:hidden space-y-3">
          {/* Top Quick Header: Live Badge + Quick Action Buttons */}
          <div className="flex flex-col items-stretch gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Active
              </span>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                ({activeTrips.length})
              </span>
            </div>

            <div className="grid w-full grid-cols-3 gap-1.5">
              {/* Quick Create New Ride */}
              <button
                onClick={onOpenNewTripModal}
                className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold text-xs px-2 py-1.5 rounded-xl flex items-center justify-center gap-1 shadow-sm min-h-[38px] cursor-pointer select-none active:scale-95 transition"
                title="Dispatch New Ride"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>New Ride</span>
              </button>

              {/* Paste Booking from WhatsApp */}
              {onOpenPasteBookingModal && (
                <button
                  onClick={onOpenPasteBookingModal}
                  className="w-full bg-white hover:bg-violet-50 active:bg-violet-100 text-slate-700 font-bold text-xs px-2 py-1.5 rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition cursor-pointer shadow-sm select-none min-h-[38px] active:scale-95"
                  title="Paste copied booking from WhatsApp or SMS"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Paste Booking</span>
                </button>
              )}

              {/* History Button */}
              {onNavigateToTrips && (
                <button
                  onClick={onNavigateToTrips}
                  className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs px-2 py-1.5 rounded-xl border border-slate-200/90 flex items-center justify-center gap-1 transition cursor-pointer select-none min-h-[38px] active:scale-95"
                  title="Trip History & Billing"
                >
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] tabular-nums font-extrabold text-slate-600">
                    History {completedTripsCount + closedTripsCount}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 4-Segment Status Tab Matrix: 100% visible, no scrolling needed, thumb-friendly */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/95 rounded-2xl border border-slate-200/80">
            {[
              {
                id: 'ALL',
                label: 'Active',
                count: activeTrips.length,
                countClass: statusFilter === 'ALL' ? 'text-white' : 'text-slate-900',
              },
              {
                id: 'OPEN',
                label: 'Open',
                count: openTrips.length,
                countClass: statusFilter === 'OPEN' ? 'text-violet-200' : 'text-violet-700',
              },
              {
                id: 'ACCEPTED',
                label: 'Assigned',
                count: acceptedTrips.length,
                countClass: statusFilter === 'ACCEPTED' ? 'text-violet-200' : 'text-violet-700',
              },
              {
                id: 'IN_PROGRESS',
                label: 'In Transit',
                count: inProgressTrips.length,
                countClass: statusFilter === 'IN_PROGRESS' ? 'text-purple-300' : 'text-purple-700',
              },
            ].map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer min-h-[52px] select-none active:scale-95 ${
                    isActive
                      ? 'bg-purple-700 text-white shadow-sm ring-1 ring-purple-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className={`text-base font-black tabular-nums leading-none mb-1 ${tab.countClass}`}>
                    {tab.count}
                  </span>
                  <span className={`text-[11px] font-bold tracking-tight leading-none ${isActive ? 'text-white' : 'text-slate-600'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Secondary Filters on Mobile: Equal 2-Column Selects */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            {/* Vehicle Category */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500">
                <Car className="w-3.5 h-3.5" />
              </div>
              <select
                value={vehicleFilter}
                onChange={(e) => {
                  setVehicleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full text-xs font-semibold appearance-none border rounded-xl pl-3 pr-7 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer min-h-[44px] transition-all truncate ${
                  vehicleFilter !== 'ALL'
                    ? 'bg-violet-50 border-violet-300 text-violet-900 font-bold ring-1 ring-violet-300/30'
                    : 'bg-slate-50 border-slate-200/90'
                }`}
                title="Filter by Vehicle Category"
              >
                <option value="ALL">All Vehicles</option>
                <option value="MINI">MINI</option>
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
                <option value="SUV+">SUV+</option>
                <option value="INNOVA">INNOVA</option>
                <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                {Array.from(
                  new Set(
                    trips
                      .map((t) => (t.vehicle_category || '').trim().toUpperCase())
                      .filter((cat) => cat && !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(cat))
                  )
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} (Custom)
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Trip Type */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <select
                value={tripTypeFilter}
                onChange={(e) => {
                  setTripTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full text-xs font-semibold appearance-none border rounded-xl pl-3 pr-7 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer min-h-[44px] transition-all truncate ${
                  tripTypeFilter !== 'ALL'
                    ? 'bg-violet-50 border-violet-300 text-violet-900 font-bold ring-1 ring-violet-300/30'
                    : 'bg-slate-50 border-slate-200/90'
                }`}
                title="Filter by Trip Type"
              >
                <option value="ALL">All Trip Types</option>
                <option value="ONE_WAY">One Way (Drop)</option>
                <option value="ROUND_TRIP">Round Trip</option>
                <option value="PACKAGE">Rental Package</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Reset Filters & Showing Counts */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                Showing <strong className="text-slate-800 font-bold">{filteredTrips.length}</strong>
              </span>
            </div>

            {(statusFilter !== 'ALL' || vehicleFilter !== 'ALL' || tripTypeFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setVehicleFilter('ALL');
                  setTripTypeFilter('ALL');
                  setCurrentPage(1);
                }}
                className="text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 cursor-pointer transition"
              >
                <RotateCcw className="w-3 h-3 text-amber-700" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* ===================== DESKTOP / TABLET LAYOUT (sm+) ===================== */}
        <div className="hidden sm:block space-y-3">
          {/* Top Row: Status Filter Tabs & Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              {
                id: 'ALL',
                 label: 'Active',
                count: activeTrips.length,
                badgeClass: statusFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
              },
              {
                id: 'OPEN',
                 label: 'Open',
                count: openTrips.length,
                badgeClass: statusFilter === 'OPEN' ? 'bg-violet-200 text-violet-900 font-black' : 'bg-violet-100 text-violet-800 font-bold',
              },
              {
                id: 'ACCEPTED',
                label: 'Assigned',
                count: acceptedTrips.length,
                badgeClass: statusFilter === 'ACCEPTED' ? 'bg-violet-200 text-violet-900 font-black' : 'bg-violet-100 text-violet-800 font-bold',
              },
              {
                id: 'IN_PROGRESS',
                 label: 'In Transit',
                count: inProgressTrips.length,
                badgeClass: statusFilter === 'IN_PROGRESS' ? 'bg-purple-300 text-purple-950 font-black' : 'bg-purple-100 text-purple-900 font-bold',
              },
            ].map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-[0.98] ${
                    isActive
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-slate-100/90 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 border border-slate-200/60'
                  }`}
                >
                  <span className="whitespace-nowrap">{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums whitespace-nowrap ${tab.badgeClass}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}

            {onNavigateToTrips && (
              <button
                onClick={onNavigateToTrips}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer border border-slate-200/80 select-none active:scale-[0.98]"
                title="View Completed & Closed Trips in Trip History & Billing"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>History</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 tabular-nums">
                  {completedTripsCount + closedTripsCount}
                </span>
              </button>
            )}

            <button
              onClick={onOpenNewTripModal}
              className="bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl border border-violet-600 flex items-center gap-1.5 transition cursor-pointer shadow-sm select-none active:scale-[0.98] ml-auto"
              title="Dispatch New Ride"
            >
              <Plus className="w-4 h-4" />
              <span>New Ride</span>
            </button>

            {/* Paste Booking from WhatsApp */}
            {onOpenPasteBookingModal && (
              <button
                onClick={onOpenPasteBookingModal}
                 className="bg-white hover:bg-violet-50 active:bg-violet-100 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl border border-slate-200 flex items-center gap-1.5 transition cursor-pointer shadow-sm select-none active:scale-[0.98]"
                title="Paste copied booking text from WhatsApp or email"
              >
                <ClipboardPaste className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Paste Booking</span>
              </button>
            )}
          </div>

          {/* Secondary Filters (Vehicle Category, Trip Type) & Count */}
          <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Vehicle Category Filter */}
              <div className="relative w-[160px]">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500">
                  <Car className="w-3.5 h-3.5" />
                </div>
                <select
                  value={vehicleFilter}
                  onChange={(e) => {
                    setVehicleFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full text-xs font-semibold appearance-none border rounded-xl pl-3 pr-7 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer min-h-[38px] transition-all truncate ${
                    vehicleFilter !== 'ALL'
                      ? 'bg-violet-50 border-violet-300 text-violet-900 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200/90'
                  }`}
                  title="Filter by Vehicle Category"
                >
                  <option value="ALL">All Vehicles</option>
                  <option value="MINI">MINI</option>
                  <option value="SEDAN">SEDAN</option>
                  <option value="SUV">SUV</option>
                  <option value="SUV+">SUV+</option>
                  <option value="INNOVA">INNOVA</option>
                  <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                  {Array.from(
                    new Set(
                      trips
                        .map((t) => (t.vehicle_category || '').trim().toUpperCase())
                        .filter((cat) => cat && !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(cat))
                    )
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} (Custom)
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Trip Type Filter */}
              <div className="relative w-[160px]">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500">
                  <Navigation className="w-3.5 h-3.5" />
                </div>
                <select
                  value={tripTypeFilter}
                  onChange={(e) => {
                    setTripTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full text-xs font-semibold appearance-none border rounded-xl pl-3 pr-7 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer min-h-[38px] transition-all truncate ${
                    tripTypeFilter !== 'ALL'
                      ? 'bg-violet-50 border-violet-300 text-violet-900 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200/90'
                  }`}
                  title="Filter by Trip Type"
                >
                  <option value="ALL">All Trip Types</option>
                  <option value="ONE_WAY">One Way (Drop)</option>
                  <option value="ROUND_TRIP">Round Trip</option>
                  <option value="PACKAGE">Rental Package</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Clear active filters button */}
              {(statusFilter !== 'ALL' || vehicleFilter !== 'ALL' || tripTypeFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setVehicleFilter('ALL');
                    setTripTypeFilter('ALL');
                    setCurrentPage(1);
                  }}
                className="text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-xl transition cursor-pointer min-h-[36px] flex items-center gap-1.5 active:scale-[0.98]"
                  title="Reset All Active Filters"
                >
                  <RotateCcw className="w-3 h-3 text-amber-700" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            {/* Active count with pulsating live indicator */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                Showing <strong className="text-slate-800 font-bold">{filteredTrips.length}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
       {filteredTrips.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-10 sm:py-14 text-center shadow-2xs">
          <h4 className="font-extrabold text-slate-900 text-base">No active trips</h4>
        </div>
      ) : viewMode === 'grid' ? (
        /* SEPARATE, DISTINCT TRIP CARDS (Mobile-First, completely separated layout) */
        <div className="space-y-6 sm:space-y-0 sm:grid sm:grid-cols-1 min-[900px]:max-[1024px]:grid-cols-2 min-[768px]:max-[1024px]:gap-4 lg:grid-cols-2 sm:gap-6">
          {paginatedTrips.map((trip, idx) => {
            const matchedDriver = drivers.find((d) => d.driver_id === trip.driver_id);
            const driverPhone = trip.driver_phone || matchedDriver?.mobile_number;
            const isAssigned = !!(trip.driver_id || trip.driver_name);
            const tripSequenceNumber = idx + 1 + (currentPage - 1) * ITEMS_PER_PAGE;

            return (
              <div
                key={trip.doc_id || trip.trip_id}
                className="relative"
              >
                <div
                    className={`bg-white rounded-xl border border-slate-200 transition-all shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden ${
                    trip.status === 'IN_PROGRESS'
                      ? 'border-slate-300 ring-1 ring-slate-200'
                      : trip.status === 'ACCEPTED'
                      ? 'border-slate-300 ring-1 ring-slate-200'
                      : trip.status === 'OPEN'
                      ? 'border-orange-300 ring-1 ring-orange-100'
                      : 'border-slate-300'
                  }`}
                >
                  <div className="min-w-0 p-3 sm:p-4 space-y-3">
                    {/* 1. TOP HEADER: Trip ID, Sequence, Passenger Name, Category & Status Badge */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        {/* Passenger Name & Trip ID */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-slate-900 text-white text-[11px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 shadow-xs">
                            Ride {tripSequenceNumber} of {filteredTrips.length}
                          </span>
                          <button
                            onClick={() => copyTripId(formatTripId(trip.trip_id))}
                            className="inline-flex items-center gap-1 text-xs font-mono font-bold text-slate-700 bg-white hover:bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Click to copy Trip ID"
                          >
                            <span>#{formatTripId(trip.trip_id)}</span>
                            {copiedId === formatTripId(trip.trip_id) || copiedId === trip.trip_id ? 'Copied' : 'Copy'}
                          </button>
                        </div>

                        {/* Passenger Name & Category Tags */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                            {trip.customer_name || 'Walk-in Customer'}
                          </h3>
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                            {trip.vehicle_category || 'Mini'}
                          </span>
                          {trip.is_package || trip.trip_type === 'PACKAGE' ? (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <span>
                                {trip.package_hours && trip.package_kms
                                  ? `Package (${trip.package_hours}h / ${trip.package_kms}km)`
                                  : trip.package_hours
                                  ? `Package (${trip.package_hours}h)`
                                  : trip.package_kms
                                  ? `Package (${trip.package_kms}km)`
                                  : 'Package'}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <span>Regular</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Badge & Timestamp */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border shadow-2xs ${
                            trip.status === 'IN_PROGRESS'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : trip.status === 'ACCEPTED'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : trip.status === 'OPEN'
                              ? 'bg-orange-50 text-orange-800 border-orange-200'
                              : trip.status === 'COMPLETED'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <span>{trip.status === 'OPEN' ? 'OPEN QUEUE' : trip.status.replace('_', ' ')}</span>
                        </span>

                        <div className="text-[10px] text-slate-500 font-medium flex items-center justify-end gap-1">
                          <span>{formatTimestamp(trip.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 2. CUSTOMER CONTACT & SPECIAL NOTES (Mobile-Friendly 44px Tap) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-y border-slate-100 py-2 text-xs">
                      <div className="flex flex-col gap-1 text-slate-700 font-semibold min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Passenger</span>
                        {trip.customer_phone?.trim() ? (
                          <a
                            href={`tel:${trip.customer_phone}`}
                            className="w-full sm:w-auto inline-flex items-center justify-center bg-[#009966] hover:bg-[#007a52] text-white font-bold px-4 py-2.5 rounded-lg transition cursor-pointer min-h-[44px]"
                          >
                            <span className="min-w-0 break-all text-center">Call Passenger · {trip.customer_phone}</span>
                          </a>
                        ) : (
                          <span className="font-mono font-bold text-slate-500">Phone not provided</span>
                        )}
                      </div>

                      {trip.notes && (
                        <div className="text-slate-600 text-[11px]">
                          <span className="max-w-full break-words" title={trip.notes}>
                            {trip.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 3. TRIP ROUTE STEPPER (Green Pickup to Red Dropoff with Distance) */}
                    <div className="space-y-3 border-b border-slate-100 pb-3">
                      {/* Pickup Address */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <span>Pickup</span>
                          </div>
                          <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5 leading-snug">
                            {trip.pickup_location || 'Address not specified'}
                          </div>
                        </div>
                      </div>

                      {/* Connecting Line with Distance & Duration */}
                      <div className="flex items-center gap-3 pl-0">
                        <div className="w-0.5 h-5 bg-slate-200 ml-0" />
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                          <span>{trip.distance_km ? `${trip.distance_km} km` : '~10 km route'}</span>
                          {trip.duration_seconds && (
                            <span className="text-slate-400 font-normal">
                              • ~{Math.round(trip.duration_seconds / 60)} mins
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Drop-off Address */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <span>Drop</span>
                          </div>
                          <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5 leading-snug">
                            {trip.drop_location || 'Drop destination not specified'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. ASSIGNED DRIVER PROFILE OR OPEN BROADCAST ALERT */}
                    {isAssigned ? (
                      <div className="border-y border-slate-100 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm sm:text-base">
                              {trip.driver_name || 'Assigned Driver'}
                            </span>
                            {trip.driver_id && (
                              <span className="text-[10px] font-mono font-bold text-slate-600">
                                {trip.driver_id}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                            <span className="font-mono font-black text-slate-900">
                              {trip.vehicle_number || matchedDriver?.vehicle_number || 'TN 66 AV 6589'}
                            </span>
                            <span className="text-slate-600 font-bold">
                              {trip.vehicle_category || matchedDriver?.vehicle_category || 'Mini'}
                            </span>
                          </div>
                        </div>

                        {/* Call Driver Button (min-h-[44px] touch target) */}
                        {driverPhone && (
                          <a
                            href={`tel:${driverPhone}`}
                            className="bg-[#009966] hover:bg-[#007a52] text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center justify-center transition self-start sm:self-center min-h-[44px]"
                          >
                            <span>Call Driver ({driverPhone})</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="border-y border-slate-100 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            <span>Waiting for Driver Assignment</span>
                          </div>
                          <div className="text-[11px] text-amber-800 font-medium mt-0.5">
                           
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. FARE & SECURITY START OTP BOX */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-y border-slate-100 py-3">
                      {/* Fare Summary */}
                      <div className="flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {trip.status === 'COMPLETED' ? 'Settled Fare' : 'Estimated Fare'}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <span className="text-xl sm:text-2xl font-black text-orange-700 tracking-tight tabular-nums">
                            ₹{trip.final_fare || trip.estimated_fare || 0}
                          </span>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {trip.base_fare ? `Base ₹${trip.base_fare} + ₹${trip.kms_fare || 14}/km` : 'Inclusive of standard fare'}
                          </div>
                        </div>
                      </div>

                      {/* Security OTP Start Box */}
                      <div className="flex flex-col justify-between sm:border-l sm:border-slate-100 sm:pl-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Security Start OTP
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <div className="text-xl sm:text-2xl font-mono font-black text-slate-900 tracking-widest tabular-nums">
                              {trip.otp || '----'}
                            </div>
                            {trip.otp && (
                              <CustomerOtpSender
                                otp={trip.otp}
                                customerPhone={trip.customer_phone}
                                customerName={trip.customer_name}
                                compact
                                className="[&_a]:min-h-[44px] [&_a]:px-3 [&_a]:py-2 [&_a]:rounded-lg [&_button]:min-h-[44px] [&_button]:px-3 [&_button]:py-2 [&>button]:hidden [&_svg]:hidden"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 6. OPTIONAL CUSTOMER LIVE TRACKING */}
                    <div className="pt-2 border-t border-slate-100">
                      {trip.tracking_enabled && trip.tracking_token ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-emerald-700">
                                Live Customer Tracking Active
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => onOpenTrackingModal(trip)}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center cursor-pointer transition min-h-[44px]"
                          >
                            <span>Share Link</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800">
                                  Customer Live Tracking
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold">
                                  Optional
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">
                                Generate live link if requested by passenger
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => onOpenTrackingModal(trip)}
                            className="border border-orange-300 text-orange-700 hover:bg-orange-50 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition self-stretch sm:self-auto min-h-[38px]"
                          >
                            <span>Generate Tracking Link</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 7. OPERATIONAL ACTION TOOLBAR (Touch-Friendly 44px Target Buttons on Every Card) */}
                  <div className="border-t border-slate-200 p-3 sm:p-4 flex items-center justify-between gap-2 flex-wrap">
                    {trip.status === 'OPEN' && (
                      <>
                        <button
                          onClick={() => onOpenAssignModal(trip)}
                          className="bg-[#FF9800] hover:bg-[#e68900] active:bg-[#cc7a00] text-white font-bold text-xs px-4 py-2.5 rounded-lg transition flex items-center justify-center cursor-pointer min-h-[44px] flex-1 sm:flex-none"
                        >
                          <span>Assign Driver</span>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                          <button
                            onClick={() => onOpenEditModal(trip)}
                            className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-lg border border-slate-200 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                            title="Edit Trip Details"
                          >
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleCancelClick(trip)}
                            className="bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs px-3 py-2.5 rounded-lg border border-rose-200 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                            title="Cancel Trip"
                          >
                            <span>Cancel</span>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(trip)}
                            className="px-3 py-2.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer min-h-[44px] flex items-center justify-center border border-slate-200 text-xs font-bold"
                            title="Delete Record"
                          >
                            <span>Delete</span>
                          </button>
                        </div>
                      </>
                    )}

                    {trip.status === 'ACCEPTED' && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
                        <button
                          onClick={() => handleUnassignClick(trip)}
                          className="bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs px-3 py-2.5 rounded-lg border border-amber-300 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                          title="Unassign Driver and Return to Queue"
                        >
                          <span>Unassign</span>
                        </button>
                        <button
                          onClick={() => onOpenEditModal(trip)}
                          className="bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                          title="Edit Trip Details"
                        >
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleCancelClick(trip)}
                          className="bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs px-3 py-2.5 rounded-lg border border-rose-200 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                          title="Cancel Trip"
                        >
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}

                    {trip.status === 'IN_PROGRESS' && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
                        <button
                          onClick={() => onOpenEditModal(trip)}
                          className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-lg border border-slate-200 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                          title="Edit Trip Details"
                        >
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleCancelClick(trip)}
                          className="bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs px-3 py-2.5 rounded-lg border border-rose-200 transition flex items-center justify-center cursor-pointer min-h-[44px]"
                          title="Cancel Trip"
                        >
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* STRUCTURED TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Trip ID & Category</th>
                  <th className="py-3.5 px-4">Passenger Details</th>
                  <th className="py-3.5 px-4">Pickup & Drop Route</th>
                  <th className="py-3.5 px-4">Assigned Driver</th>
                  <th className="py-3.5 px-4">Status & OTP</th>
                  <th className="py-3.5 px-4">Fare</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTrips.map((trip) => {
                  const matchedDriver = drivers.find((d) => d.driver_id === trip.driver_id);
                  const driverPhone = trip.driver_phone || matchedDriver?.mobile_number;

                  return (
                    <tr key={trip.doc_id || trip.trip_id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-black text-slate-900 text-xs font-mono">#{formatTripId(trip.trip_id)}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase">
                            {trip.vehicle_category || 'Mini'}
                          </span>
                          {trip.is_package || trip.trip_type === 'PACKAGE' ? (
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              {trip.package_hours && trip.package_kms
                                ? `Package (${trip.package_hours}h/${trip.package_kms}km)`
                                : trip.package_hours
                                ? `Package (${trip.package_hours}h)`
                                : trip.package_kms
                                ? `Package (${trip.package_kms}km)`
                                : 'Package'}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                              Regular
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {formatTimestamp(trip.created_at)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900">{trip.customer_name}</div>
                        {trip.customer_phone ? (
                          <a
                            href={`tel:${trip.customer_phone}`}
                            className="text-[11px] text-amber-700 font-mono font-bold mt-0.5 hover:underline flex items-center gap-1"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>{trip.customer_phone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">No phone</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <div className="flex min-w-0 items-start gap-1.5 break-words font-bold text-slate-900">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="min-w-0 break-words">{trip.pickup_location}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-start gap-1.5 break-words text-[11px] text-slate-500">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span className="min-w-0 break-words">{trip.drop_location}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        {trip.driver_name ? (
                          <div>
                            <div className="font-bold text-slate-900">{trip.driver_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{trip.vehicle_number}</div>
                            {driverPhone && (
                              <a
                                href={`tel:${driverPhone}`}
                                className="text-[10px] text-emerald-700 font-bold hover:underline"
                              >
                                {driverPhone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            trip.status === 'IN_PROGRESS'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : trip.status === 'ACCEPTED'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : trip.status === 'OPEN'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : trip.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {trip.status}
                        </span>
                        {trip.otp && (
                          <div className="mt-1 flex flex-col gap-1 items-start">
                            <div className="font-mono font-black text-[11px] text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
                              OTP: {trip.otp}
                            </div>
                            <CustomerOtpSender
                              otp={trip.otp}
                              customerPhone={trip.customer_phone}
                              customerName={trip.customer_name}
                              compact
                            />
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top font-black text-slate-900 text-sm">
                        ₹{trip.final_fare || trip.estimated_fare || 0}
                      </td>

                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {trip.tracking_enabled && trip.tracking_token ? (
                            <button
                              onClick={() => onOpenTrackingModal(trip)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 transition"
                              title={`Live Tracking Active (${trip.tracking_token})`}
                            >
                              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="hidden sm:inline">Track</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => onOpenTrackingModal(trip)}
                              className="bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 font-medium px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 transition"
                              title="Generate Customer Tracking Link"
                            >
                              <Navigation className="w-3.5 h-3.5 text-amber-600" />
                              <span className="hidden sm:inline">Track</span>
                            </button>
                          )}
                          {trip.status === 'OPEN' && (
                            <button
                              onClick={() => onOpenAssignModal(trip)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2.5 py-1.5 rounded-lg text-xs cursor-pointer shadow-2xs"
                            >
                              Assign
                            </button>
                          )}
                          {trip.status === 'ACCEPTED' && (
                            <button
                              onClick={() => handleUnassignClick(trip)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2 py-1.5 rounded-lg text-xs cursor-pointer flex items-center gap-1"
                              title="Unassign Driver"
                            >
                              <UserMinus className="w-3 h-3 text-amber-700" />
                              <span>Unassign</span>
                            </button>
                          )}
                          {(trip.status === 'OPEN' || trip.status === 'ACCEPTED' || trip.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => handleCancelClick(trip)}
                              className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer text-xs font-bold"
                              title="Cancel Trip"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          )}
                            <button
                              onClick={() => onOpenEditModal(trip)}
                              className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                              title="Edit details"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteClick(trip)}
                              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer text-xs font-bold"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                <p className="text-xs text-slate-500">Permanently remove from database</p>
              </div>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Trip #{formatTripId(tripToDelete.trip_id)}</span>
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
              Are you sure you want to permanently delete this trip? This operation removes it from the dispatch board and trip history.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={async () => {
                  setIsProcessingAction(true);
                  setActionError(null);
                  try {
                    const idToDelete = tripToDelete.doc_id || tripToDelete.trip_id;
                    await onDeleteTrip(idToDelete);
                    setTripToDelete(null);
                  } catch (err) {
                    console.error('Failed to delete trip:', err);
                    setActionError(err instanceof Error ? err.message : 'Failed to delete trip.');
                  } finally {
                    setIsProcessingAction(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isProcessingAction ? 'Deleting...' : 'Delete Trip'}</span>
              </button>
            </div>
            {actionError && (
              <p className="mt-3 text-xs font-semibold text-rose-600" role="alert">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Unassign Driver Confirmation Modal */}
      {tripToUnassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
            <h3 className="text-base font-bold text-slate-900">Unassign Driver</h3>
            <p className="mt-3 break-words text-sm leading-relaxed text-slate-600">
              Unassign <strong>{tripToUnassign.driver_name || 'assigned driver'}</strong> from Trip #{formatTripId(tripToUnassign.trip_id)}?
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setTripToUnassign(null)}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Keep Assignment
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={async () => {
                  setIsProcessingAction(true);
                  setActionError(null);
                  try {
                    const idToUnassign = tripToUnassign.doc_id || tripToUnassign.trip_id;
                    await onUnassignDriver(idToUnassign, '');
                    setTripToUnassign(null);
                  } catch (err) {
                    console.error('Failed to unassign driver:', err);
                    setActionError(err instanceof Error ? err.message : 'Failed to unassign driver.');
                  } finally {
                    setIsProcessingAction(false);
                  }
                }}
                className="min-h-10 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 cursor-pointer disabled:opacity-50"
              >
                <span>{isProcessingAction ? 'Unassigning...' : 'Unassign Driver'}</span>
              </button>
            </div>
            {actionError && (
              <p className="mt-3 text-xs font-semibold text-rose-600" role="alert">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cancel Trip Modal */}
      {tripToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Cancel Dispatch Trip</h3>
                <p className="text-xs text-slate-500">Trip #{formatTripId(tripToCancel.trip_id)}</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Cancellation Reason</label>
              <input
                type="text"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="Enter cancellation reason"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:border-rose-500"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setTripToCancel(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Keep Active
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={async () => {
                  setIsProcessingAction(true);
                  setActionError(null);
                  try {
                    const idToCancel = tripToCancel.doc_id || tripToCancel.trip_id;
                    await onCancelTrip(idToCancel, cancelReasonInput || 'Cancelled by Admin');
                    setTripToCancel(null);
                  } catch (err) {
                    console.error('Failed to cancel trip:', err);
                    setActionError(err instanceof Error ? err.message : 'Failed to cancel trip.');
                  } finally {
                    setIsProcessingAction(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isProcessingAction ? 'Cancelling...' : 'Confirm Cancellation'}</span>
              </button>
            </div>
            {actionError && (
              <p className="mt-3 text-xs font-semibold text-rose-600" role="alert">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing{' '}
            <strong className="text-slate-800">
              {Math.min(1 + (currentPage - 1) * ITEMS_PER_PAGE, filteredTrips.length)}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-800">
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredTrips.length)}
            </strong>{' '}
            of <strong className="text-slate-800">{filteredTrips.length}</strong> entries
          </div>

          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700 px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
