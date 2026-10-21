import React, { useState, useMemo } from 'react';
import { FirestoreDriver, DriverStatus, VehicleCategory } from '../types';
import {
  Users,
  Plus,
  Search,
  Filter,
  Phone,
  PhoneCall,
  Car,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  RefreshCcw,
  Trash2,
  Edit2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  ExternalLink,
  LayoutGrid,
  List,
  Check,
  X,
  Zap,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Database,
  Loader2,
  Wallet,
  IndianRupee,
  User,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

interface DriverManagementProps {
  drivers: FirestoreDriver[];
  onOpenNewDriverModal: () => void;
  onToggleDriverStatus: (driverId: string) => Promise<void>;
  onResetDeviceBinding: (driverId: string) => Promise<void>;
  onDeleteDriver: (driverId: string) => Promise<void>;
  onUpdateDriver: (driverId: string, data: Partial<FirestoreDriver>) => Promise<void>;
  onCleanDriversTable?: () => Promise<{
    totalScanned: number;
    fieldsCleaned: number;
    duplicatesRemoved: number;
    success: boolean;
  }>;
  onSetDriverOfficeDue?: (
    driverId: string,
    amount: number,
    note?: string,
    officeUpiId?: string
  ) => Promise<void>;
  onClearDriverOfficeDue?: (driverId: string) => Promise<void>;
  isFirebaseConnected?: boolean;
  globalSearchQuery: string;
}

const DRIVERS_PER_PAGE = 36; // Optimized for 2000+ driver fleet (fits 1, 2, 3, 4 col grids evenly)

export const DEFAULT_PAYMENT_NOTE = 'Trip CC (Convenience Charge)';

export const PAYMENT_NOTE_PRESETS = [
  'Trip CC (Convenience Charge)',
  'Driver Registration Fee',
  'Driver Renewal Fee',
  'Office Weekly Dispatch Fee',
] as const;

export const DriverManagement: React.FC<DriverManagementProps> = ({
  drivers,
  onOpenNewDriverModal,
  onToggleDriverStatus,
  onResetDeviceBinding,
  onDeleteDriver,
  onUpdateDriver,
  onCleanDriversTable,
  onSetDriverOfficeDue,
  onClearDriverOfficeDue,
  isFirebaseConnected,
  globalSearchQuery,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [editingDriver, setEditingDriver] = useState<FirestoreDriver | null>(null);
  const [editDriverStep, setEditDriverStep] = useState<1 | 2 | 3>(1);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editFeedback, setEditFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<FirestoreDriver | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Office Dues Management State (Clean Step-by-Step UI)
  const [managingDueDriver, setManagingDueDriver] = useState<FirestoreDriver | null>(null);
  const [dueStep, setDueStep] = useState<1 | 2 | 3>(1);
  const [dueAmountInput, setDueAmountInput] = useState<string>('');
  const [dueNoteInput, setDueNoteInput] = useState<string>(DEFAULT_PAYMENT_NOTE);
  // Office UPI ID is blank always by default; populated only if user explicitly chooses default ID
  const [officeUpiInput, setOfficeUpiInput] = useState<string>('');
  const [isSavingDue, setIsSavingDue] = useState<boolean>(false);
  const [dueFeedbackMsg, setDueFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const openDueModal = (drv: FirestoreDriver) => {
    setManagingDueDriver(drv);
    setDueStep(1);
    setDueAmountInput('');
    setDueNoteInput(drv.payment_note || DEFAULT_PAYMENT_NOTE);
    // Always start blank as requested: user can click "Choose Default ID" if wanted
    setOfficeUpiInput('');
    setDueFeedbackMsg(null);
  };

  const handleSaveDue = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!managingDueDriver || !onSetDriverOfficeDue) return;
    if (dueAmountInput.trim() === '') {
      setDueFeedbackMsg({ text: 'Please enter an office due amount.', type: 'error' });
      return;
    }
    const amountNum = Math.max(0, Number(dueAmountInput) || 0);
    setIsSavingDue(true);
    setDueFeedbackMsg(null);
    try {
      await onSetDriverOfficeDue(
        managingDueDriver.driver_id,
        amountNum,
        dueNoteInput.trim() || DEFAULT_PAYMENT_NOTE,
        officeUpiInput.trim()
      );
      setDueFeedbackMsg({
        text:
          amountNum > 0
            ? `✓ ₹${amountNum} due set for ${managingDueDriver.driver_name}. Live sync sent to Driver App!`
            : `✓ Dues cleared for ${managingDueDriver.driver_name}!`,
        type: 'success',
      });
      setTimeout(() => {
        setManagingDueDriver(null);
        setDueFeedbackMsg(null);
        setDueStep(1);
      }, 1500);
    } catch {
      setDueFeedbackMsg({ text: 'Failed to update due in Firebase.', type: 'error' });
    } finally {
      setIsSavingDue(false);
    }
  };

  const handleClearDue = async () => {
    setDueFeedbackMsg(null);
    setDueAmountInput('0');
  };

  // Summary counts - memoized for 2000+ driver fleet
  const totalFleet = drivers.length;
  const onlineDrivers = useMemo(() => drivers.filter((d) => d.is_online && d.status === 'ACTIVE'), [drivers]);
  const activeKyc = useMemo(() => drivers.filter((d) => d.status === 'ACTIVE'), [drivers]);
  const offlineDriversCount = useMemo(() => drivers.filter((d) => !d.is_online).length, [drivers]);
  const blockedDrivers = useMemo(() => drivers.filter((d) => d.status === 'BLOCKED'), [drivers]);
  const driversWithDue = useMemo(() => drivers.filter((d) => (d.payment_amount || 0) > 0), [drivers]);
  const totalDueAmount = useMemo(() => drivers.reduce((sum, d) => sum + (d.payment_amount || 0), 0), [drivers]);

  // Filter drivers - memoized to prevent lag when interacting with UI
  const filteredDrivers = useMemo(() => {
    return drivers.filter((drv) => {
      if (statusFilter === 'ONLINE' && !drv.is_online) return false;
      if (statusFilter === 'OFFLINE' && drv.is_online) return false;
      if (statusFilter === 'ACTIVE' && drv.status !== 'ACTIVE') return false;
      if (statusFilter === 'BLOCKED' && drv.status !== 'BLOCKED') return false;
      if (statusFilter === 'WITH_DUES' && (!drv.payment_amount || drv.payment_amount <= 0)) return false;
      if (categoryFilter !== 'ALL') {
        const drvCat = (drv.vehicle_category || '').trim().toUpperCase();
        const filterCat = categoryFilter.trim().toUpperCase();
        if (drvCat !== filterCat) return false;
      }

      const q = (searchQuery || globalSearchQuery).trim().toLowerCase();
      if (q) {
        const matchName = drv.driver_name.toLowerCase().includes(q);
        const matchId = drv.driver_id.toLowerCase().includes(q);
        const matchPhone = drv.mobile_number.includes(q);
        const matchVehicle = drv.vehicle_number.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchPhone && !matchVehicle) return false;
      }

      return true;
    });
  }, [drivers, statusFilter, categoryFilter, searchQuery, globalSearchQuery]);

  // Pagination for 2000+ drivers
  const totalPages = Math.ceil(filteredDrivers.length / DRIVERS_PER_PAGE) || 1;
  const paginatedDrivers = useMemo(() => {
    const page = Math.min(currentPage, totalPages);
    return filteredDrivers.slice((page - 1) * DRIVERS_PER_PAGE, page * DRIVERS_PER_PAGE);
  }, [filteredDrivers, currentPage, totalPages]);

  const handleOpenEditDriver = (drv: FirestoreDriver) => {
    setEditingDriver({ ...drv });
    setEditDriverStep(1);
    setEditFeedback(null);
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingDriver) return;
    setIsSavingEdit(true);
    setEditFeedback(null);
    try {
      await onUpdateDriver(editingDriver.driver_id, editingDriver);
      setEditFeedback({
        text: `✓ Profile updated for ${editingDriver.driver_name}!`,
        type: 'success',
      });
      setTimeout(() => {
        setEditingDriver(null);
        setEditDriverStep(1);
        setEditFeedback(null);
      }, 1200);
    } catch (err: any) {
      console.error('Failed to update driver:', err);
      setEditFeedback({
        text: err?.message || 'Failed to update driver profile.',
        type: 'error',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-[768px]:max-[1024px]:space-y-4 lg:space-y-5">
      {/* Overview KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 min-[768px]:max-[900px]:grid-cols-3 min-[900px]:max-[1024px]:grid-cols-5 min-[768px]:max-[1024px]:gap-3 lg:grid-cols-5 w-full min-w-0">
        {/* Total Registered */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`min-w-0 bg-white p-3 sm:p-4 rounded-lg border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'border-slate-800 ring-2 ring-slate-800/10'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Total Drivers
            </p>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-900 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,1.7vw,1rem)] lg:text-[clamp(0.875rem,1.25vw,1.5rem)]">
              {totalFleet}
            </span>

          </div>
        </div>

        {/* Online Fleet */}
        <div
          onClick={() => setStatusFilter('ONLINE')}
          className={`min-w-0 bg-white p-3 sm:p-4 rounded-lg border transition-all cursor-pointer ${
            statusFilter === 'ONLINE'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
              : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Online
            </p>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-emerald-600 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,1.7vw,1rem)] lg:text-[clamp(0.875rem,1.25vw,1.5rem)]">
              {onlineDrivers.length}
            </span>

          </div>
        </div>

        {/* Active Verified */}
        <div
          onClick={() => setStatusFilter('ACTIVE')}
          className={`min-w-0 bg-white p-3 sm:p-4 rounded-lg border transition-all cursor-pointer ${
            statusFilter === 'ACTIVE'
              ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/20'
              : 'border-slate-200/80 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Active
            </p>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-emerald-600 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,1.7vw,1rem)] lg:text-[clamp(0.875rem,1.25vw,1.5rem)]">
              {activeKyc.length}
            </span>

          </div>
        </div>

        {/* Blocked */}
        <div
          onClick={() => setStatusFilter('BLOCKED')}
          className={`min-w-0 bg-white p-3 sm:p-4 rounded-lg border transition-all cursor-pointer ${
            statusFilter === 'BLOCKED'
              ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20'
              : 'border-slate-200/80 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Blocked
            </p>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-rose-600 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,1.7vw,1rem)] lg:text-[clamp(0.875rem,1.25vw,1.5rem)]">
              {blockedDrivers.length}
            </span>

          </div>
        </div>

        {/* Office Dues Pending */}
        <div
          onClick={() => {
            setStatusFilter(statusFilter === 'WITH_DUES' ? 'ALL' : 'WITH_DUES');
            setCurrentPage(1);
          }}
          className={`min-w-0 bg-white p-3 sm:p-4 rounded-lg border transition-all cursor-pointer col-span-2 lg:col-span-1 ${
            statusFilter === 'WITH_DUES'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30'
              : 'border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="break-words text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Office Due
            </p>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-amber-600 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,1.7vw,1rem)] lg:text-[clamp(0.875rem,1.25vw,1.5rem)]">
              ₹{totalDueAmount.toLocaleString('en-IN')}
            </span>
            <span className={`break-words text-sm font-medium leading-tight ${driversWithDue.length > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
              {driversWithDue.length > 0 ? `${driversWithDue.length} due` : 'Cleared'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Actions Bar */}
      <div className="space-y-3 border-b border-slate-200 bg-white p-3 sm:p-4 transition-all">
        {/* ===================== MOBILE DEDICATED LAYOUT (< sm) ===================== */}
        <div className="sm:hidden space-y-3">
          {/* Top Quick Header: Live Indicator, View Mode & Register Driver */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-900">
                Drivers
              </span>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                ({filteredDrivers.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Grid / List Toggle */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Card View"
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="List View"
                >
                  List
                </button>
              </div>

              {/* Quick Register Driver Button */}
              <button
                onClick={onOpenNewDriverModal}
                className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-2xs min-h-[38px] cursor-pointer select-none active:scale-95 transition"
                title="Register New Driver"
              >
                <span>Add Driver</span>
              </button>
            </div>
          </div>

          {/* Full-width Touch-friendly Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search name, ID, phone or vehicle"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px] transition-all font-medium"
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

          {/* Touch-Friendly Swipeable Status Filter Chips with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
            {[
              { id: 'ALL', label: 'All', count: totalFleet, badge: 'bg-slate-200 text-slate-700' },
              { id: 'ONLINE', label: 'Online', count: onlineDrivers.length, badge: 'bg-emerald-100 text-emerald-800 font-bold', dot: 'bg-emerald-500' },
              { id: 'ACTIVE', label: 'Active', count: activeKyc.length, badge: 'bg-sky-100 text-sky-800 font-bold' },
              { id: 'OFFLINE', label: 'Offline', count: offlineDriversCount, badge: 'bg-slate-100 text-slate-600' },
              { id: 'BLOCKED', label: 'Blocked', count: blockedDrivers.length, badge: 'bg-rose-100 text-rose-800 font-bold' },
              { id: 'WITH_DUES', label: 'Has Due', count: driversWithDue.length, badge: 'bg-amber-400 text-slate-950 font-black' },
            ].map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 min-h-[42px] active:scale-95 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100/90 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 border border-slate-200/60'
                  }`}
                >
                  {tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot} shrink-0`}></span>}
                  <span className="whitespace-nowrap">{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums whitespace-nowrap ${
                      isActive ? 'bg-white/20 text-white font-black' : tab.badge
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2-Column Secondary Row: Category Selector & 1-Tap Reset */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            {/* Category Filter */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full text-xs font-semibold appearance-none border rounded-xl pl-3 pr-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer min-h-[44px] transition-all truncate ${
                  categoryFilter !== 'ALL'
                    ? 'bg-amber-50/80 border-amber-400 text-amber-950 font-bold ring-1 ring-amber-400/30'
                    : 'bg-slate-50 border-slate-200/90'
                }`}
                title="Filter by Vehicle Category"
              >
                <option value="ALL">All Categories</option>
                <option value="MINI">MINI</option>
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
                <option value="SUV+">SUV+</option>
                <option value="INNOVA">INNOVA</option>
                <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                {Array.from(
                  new Set(
                    drivers
                      .map((d) => (d.vehicle_category || '').trim().toUpperCase())
                      .filter((cat) => cat && !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(cat))
                  )
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} (Custom)
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters / Count Pill */}
            {statusFilter !== 'ALL' || categoryFilter !== 'ALL' || searchQuery ? (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="w-full text-xs font-bold text-amber-950 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 cursor-pointer transition shadow-2xs"
                title="Reset All Filters"
              >
                <span>Reset</span>
              </button>
            ) : (
              <div className="flex items-center justify-center px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl min-h-[44px] text-xs font-semibold text-slate-500">
                <span className="truncate">All</span>
              </div>
            )}
          </div>
        </div>

        {/* ===================== DESKTOP / TABLET LAYOUT (sm+) ===================== */}
        <div className="hidden sm:flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Left Filter Tabs - Wrapping so NO options are hidden */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {['ALL', 'ACTIVE', 'ONLINE', 'OFFLINE', 'BLOCKED', 'WITH_DUES'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{st === 'WITH_DUES' ? 'Has Due' : st === 'ACTIVE' ? 'Active' : st}</span>
                {st === 'WITH_DUES' && driversWithDue.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-bold bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded-full">
                    {driversWithDue.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right Search, Category, View Mode & Registration */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Grid/Table toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Card View"
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table View"
              >
                List
              </button>
            </div>

            {/* Category Dropdown */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-7 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 shrink-0 cursor-pointer appearance-none min-w-[130px]"
                title="Filter by Vehicle Category"
              >
                <option value="ALL">All Categories</option>
                <option value="MINI">MINI</option>
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
                <option value="SUV+">SUV+</option>
                <option value="INNOVA">INNOVA</option>
                <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
                {Array.from(
                  new Set(
                    drivers
                      .map((d) => (d.vehicle_category || '').trim().toUpperCase())
                      .filter((cat) => cat && !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(cat))
                  )
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} (Custom)
                  </option>
                ))}
              </select>
            </div>

            {/* Search Box with clear button */}
            <div className="relative flex-1 min-w-[150px] sm:w-52">
              <input
                type="text"
                placeholder="Search name, ID, phone or vehicle"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
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

            {/* Clear active filters button */}
            {(statusFilter !== 'ALL' || categoryFilter !== 'ALL' || searchQuery) && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-2 rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95"
                title="Reset All Active Filters"
              >
                <span>Reset</span>
              </button>
            )}

            {/* Register Driver Button */}
            <button
              onClick={onOpenNewDriverModal}
              className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs shadow-2xs transition cursor-pointer shrink-0"
            >
                <span>Add Driver</span>
            </button>
          </div>
        </div>
      </div>

      {/* Driver List Display */}
      {filteredDrivers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs">
          <h4 className="text-sm font-bold text-slate-900">No drivers found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            No drivers match the current filter or search criteria.
          </p>
          <button
            onClick={onOpenNewDriverModal}
            className="mt-4 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition cursor-pointer"
          >
            <span>Add Driver</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Driver Grid Cards (Image 1 & 6 style) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedDrivers.map((drv) => (
            <div
              key={drv.driver_id}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-orange-300"
            >
              <div>
                {/* Header: Driver Name, ID, Category & Trips */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold leading-tight text-slate-950">
                      {drv.driver_name}{' '}
                      <span className={drv.status === 'ACTIVE' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                        — {drv.status === 'ACTIVE' ? 'Active' : 'Blocked'}
                      </span>
                    </h4>
                    <div className="mt-1 text-xs text-slate-600">
                      ID: <span className="font-mono text-slate-900">{drv.driver_id}</span> · {drv.vehicle_category}
                    </div>
                    <div className="hidden">
                      ID: <span className="font-mono text-slate-900">{drv.driver_id}</span> · {drv.vehicle_category} · <span className={drv.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-700'}>{drv.status === 'ACTIVE' ? 'Active' : 'Blocked'}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {drv.total_trips || 0} trips
                    </span>
                  </div>
                </div>

                {/* Details specs */}
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-500">Vehicle</span>
                    <strong className="text-slate-800 font-mono font-medium">{drv.vehicle_number}</strong>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-500">Phone</span>
                    <a
                      href={`tel:${drv.mobile_number}`}
                      className="text-orange-700 font-medium hover:underline"
                    >
                      {drv.mobile_number}
                    </a>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-500">License Expiry</span>
                    <span className="text-slate-700 font-normal">{drv.expiry_date || 'N/A'}</span>
                  </div>

                  {/* Android Hardware Device ID Box */}
                  <div className="space-y-1 border-t border-slate-100 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">Device Status</span>
                      {drv.device_id ? (
                        <span className="text-xs font-medium text-emerald-700">Bound</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-600">Unbound</span>
                      )}
                    </div>
                  </div>

                  {/* Office Due & Driver Payment Status */}
                  <div
                    className={`flex items-center justify-between gap-2 border-t pt-2 ${
                      (drv.payment_amount || 0) > 0
                        ? 'border-amber-200'
                        : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">Office Due</span>
                      {(drv.payment_amount || 0) > 0 ? (
                        <span className="text-[11px] font-semibold text-amber-800">
                          <span>₹{drv.payment_amount} · Due</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-700">
                          Cleared (₹0)
                        </span>
                      )}
                    </div>
                    <div className="contents">
                      <button
                        type="button"
                        onClick={() => openDueModal(drv)}
                        className="min-h-10 rounded-md border border-orange-300 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50"
                        title="Set Driver Office Due"
                      >
                        Set Due
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Toolbar */}
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => openDueModal(drv)}
                  title="Manage Driver Office Due (Update amount in driver app)"
                  className="min-h-10 w-full rounded-md border border-orange-300 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50"
                >
                  Dues
                </button>

                <button
                  onClick={() => onResetDeviceBinding(drv.driver_id)}
                  title="Clear phone binding if driver changed phone"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Reset Device
                </button>

                <button
                  onClick={() => onToggleDriverStatus(drv.driver_id)}
                  title={drv.status === 'BLOCKED' ? 'Unblock Driver & Set to Active' : 'Block Driver Account'}
                  className={`min-h-10 w-full rounded-md border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    drv.status === 'BLOCKED'
                      ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400'
                      : 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 hover:border-rose-400'
                  }`}
                >
                  {drv.status === 'BLOCKED' ? (
                    <>
                      <span>Unblock</span>
                    </>
                  ) : (
                    <>
                      <span>Block</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleOpenEditDriver(drv)}
                  className="min-h-10 w-full rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800 transition-colors hover:bg-orange-100"
                  title="Edit Driver Profile"
                >
                  Edit Driver
                </button>

                <button
                  onClick={() => setDriverToDelete(drv)}
                  className="col-span-2 min-h-10 w-full rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                  title="Delete Driver"
                >
                  Delete Driver
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Desktop Driver Table View */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/90 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Driver & ID</th>
                  <th className="py-3.5 px-4">Vehicle & Plate</th>
                  <th className="py-3.5 px-4">Mobile Phone</th>
                  <th className="py-3.5 px-4">GPS Status</th>
                  <th className="py-3.5 px-4">Office Due</th>
                  <th className="py-3.5 px-4">KYC State</th>
                  <th className="py-3.5 px-4">Device Lock</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDrivers.map((drv) => (
                  <tr key={drv.driver_id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-semibold text-slate-900">{drv.driver_name}</div>
                        <div className="text-[10px] text-amber-700 font-mono font-medium">
                          {drv.driver_id}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono font-medium text-slate-900">{drv.vehicle_number}</div>
                      <span className="bg-slate-100 text-slate-700 text-[10px] font-medium px-1.5 py-0.2 rounded border border-slate-200 mt-0.5 inline-block">
                        {drv.vehicle_category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <a
                        href={`tel:${drv.mobile_number}`}
                        className="text-amber-800 font-medium hover:underline flex items-center gap-1"
                      >
                        {drv.mobile_number}
                      </a>
                    </td>

                    <td className="py-3.5 px-4">
                      {drv.is_online ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200">
                          OFFLINE
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        {(drv.payment_amount || 0) > 0 ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-100 text-[11px] px-2 py-0.5 rounded border border-amber-300">
                              <span>₹{drv.payment_amount} DUE</span>
                            </span>
                            <span
                              className="mt-0.5 max-w-[120px] break-words text-[9px] leading-tight text-slate-500"
                              title={drv.payment_note || DEFAULT_PAYMENT_NOTE}
                            >
                              {drv.payment_note || DEFAULT_PAYMENT_NOTE}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Cleared (₹0)
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openDueModal(drv)}
                          className="p-1 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded transition cursor-pointer"
                          title="Manage Office Due"
                        >
                          Edit
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                          drv.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {drv.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => onResetDeviceBinding(drv.driver_id)}
                        className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                      >
                        <span>{drv.device_id ? 'Reset Device' : 'Unbound'}</span>
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDueModal(drv)}
                          className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                          title="Set Office Due"
                        >
                          Dues
                        </button>
                        <button
                          onClick={() => handleOpenEditDriver(drv)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                          title="Edit"
                        >
                          Edit Driver
                        </button>
                        <button
                          onClick={() => onToggleDriverStatus(drv.driver_id)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                            drv.status === 'BLOCKED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-semibold text-[11px] px-2'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title={drv.status === 'BLOCKED' ? 'Unblock Driver & Set to Active' : 'Block Driver'}
                        >
                          {drv.status === 'BLOCKED' ? (
                            <>
                              <span>Unblock</span>
                            </>
                          ) : (
                            <span>Block</span>
                          )}
                        </button>
                        <button
                          onClick={() => setDriverToDelete(drv)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete Driver"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          {/* Compact mobile list view keeps every driver action reachable without horizontal scrolling. */}
          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white pb-24 md:hidden">
            {paginatedDrivers.map((drv) => (
              <section key={drv.driver_id} className="px-3 py-4 sm:px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-tight text-slate-950">{drv.driver_name}</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      ID: <span className="font-mono text-slate-900">{drv.driver_id}</span> · {drv.vehicle_category} ·{' '}
                      <span className={drv.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-700'}>
                        {drv.status === 'ACTIVE' ? 'Active' : 'Blocked'}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium ${drv.is_online ? 'text-emerald-700' : 'text-slate-600'}`}
                  >
                    {drv.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-1.5 text-xs">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <dt className="text-slate-500">Vehicle</dt>
                    <dd className="max-w-full whitespace-nowrap text-right font-mono font-medium text-slate-900">
                      {drv.vehicle_number}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <dt className="text-slate-500">Phone</dt>
                    <dd>
                      <a href={`tel:${drv.mobile_number}`} className="font-medium text-amber-800 hover:underline">
                        {drv.mobile_number}
                      </a>
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <dt className="text-slate-500">Office Due</dt>
                    <dd className={(drv.payment_amount || 0) > 0 ? 'font-medium text-amber-900' : 'text-emerald-700'}>
                      {(drv.payment_amount || 0) > 0 ? `₹${drv.payment_amount} Due` : 'Cleared'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <dt className="text-slate-500">Device</dt>
                    <dd className="max-w-[68%] break-all text-right text-slate-700">
                      {drv.device_id || 'Unbound'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openDueModal(drv)}
                    className="min-h-10 rounded-md border border-amber-300 px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-50"
                  >
                    Dues
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetDeviceBinding(drv.driver_id)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {drv.device_id ? 'Reset Device' : 'Unbound'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDriverStatus(drv.driver_id)}
                    className={`min-h-10 rounded-md border px-3 py-2 text-xs font-medium transition ${
                      drv.status === 'BLOCKED'
                        ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                        : 'border-rose-300 text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    {drv.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditDriver(drv)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Edit Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriverToDelete(drv)}
                    className="min-h-10 rounded-md border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    Delete Driver
                  </button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {/* Pagination Controls for Fleet Scale (2000+ Drivers) */}
      {filteredDrivers.length > DRIVERS_PER_PAGE && (
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{(currentPage - 1) * DRIVERS_PER_PAGE + 1}</strong> to{' '}
            <strong className="text-slate-800">
              {Math.min(currentPage * DRIVERS_PER_PAGE, filteredDrivers.length).toLocaleString()}
            </strong>{' '}
            of <strong className="text-slate-800">{filteredDrivers.length.toLocaleString()}</strong> drivers
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition flex items-center gap-1 font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              <span className="font-bold text-slate-900 bg-amber-100 text-amber-950 px-2.5 py-1 rounded-lg">
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
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Driver Modal (Responsive Clean Step-by-Step UI) */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 animate-in fade-in duration-150">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-5 sm:px-6 sm:py-8 min-[768px]:max-[1024px]:max-w-3xl min-[768px]:max-[1024px]:py-6 lg:px-8">
            {/* Header: Clean, modern, no bulky icon container */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-slate-950">Edit Driver Profile</h3>
                </div>
                <p className="mt-1 break-words text-xs font-medium uppercase leading-tight text-slate-600">
                  {editingDriver.driver_name} · ID {editingDriver.driver_id} · {editingDriver.status || 'ACTIVE'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingDriver(null);
                  setEditDriverStep(1);
                  setEditFeedback(null);
                }}
                className="min-h-10 px-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 cursor-pointer shrink-0"
                aria-label="Close"
              >
                Back to Drivers
              </button>
            </div>

            {/* Step-by-Step Progress Navigation Tabs */}
            <div className="mt-3 grid grid-cols-3 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditDriverStep(1)}
                className={`min-h-10 rounded-lg border px-2 text-xs font-medium transition flex items-center justify-center cursor-pointer ${
                  editDriverStep === 1
                    ? 'border-orange-300 bg-orange-50 text-orange-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-slate-900'
                }`}
              >
                <span className="truncate">Profile</span>
              </button>

              <button
                type="button"
                onClick={() => setEditDriverStep(2)}
                className={`min-h-10 rounded-lg border px-2 text-xs font-medium transition flex items-center justify-center cursor-pointer ${
                  editDriverStep === 2
                    ? 'border-orange-300 bg-orange-50 text-orange-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-slate-900'
                }`}
              >
                <span className="truncate">Vehicle</span>
              </button>

              <button
                type="button"
                onClick={() => setEditDriverStep(3)}
                className={`min-h-10 rounded-lg border px-2 text-xs font-medium transition flex items-center justify-center cursor-pointer ${
                  editDriverStep === 3
                    ? 'border-orange-300 bg-orange-50 text-orange-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-slate-900'
                }`}
              >
                <span className="truncate">Office Dues</span>
              </button>
            </div>

            {/* Feedback Message */}
            {editFeedback && (
              <div
                className={`mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 ${
                  editFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>{editFeedback.text}</span>
              </div>
            )}

            {/* Step Body */}
            <form onSubmit={handleSaveEdit} className="mt-3 flex-1 overflow-y-auto space-y-4 text-xs pr-0.5">
              {/* STEP 1: DRIVER PROFILE & IDENTITY */}
              {editDriverStep === 1 && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Driver Name
                    </label>
                    <input
                        type="text"
                        required
                        value={editingDriver.driver_name}
                        onChange={(e) =>
                          setEditingDriver({ ...editingDriver, driver_name: e.target.value })
                        }
                        className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="Enter driver name"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Mobile Number
                    </label>
                    <input
                        type="tel"
                        required
                        value={editingDriver.mobile_number}
                        onChange={(e) =>
                          setEditingDriver({ ...editingDriver, mobile_number: e.target.value })
                        }
                        className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 font-mono font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="Enter 10-digit mobile number"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Driver Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingDriver({
                            ...editingDriver,
                            status: 'ACTIVE',
                            is_online: editingDriver.is_online ?? true,
                          })
                        }
                        className={`min-h-[46px] rounded-lg border px-3 text-left transition cursor-pointer ${
                          editingDriver.status !== 'BLOCKED'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-medium text-sm">Active</div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingDriver({
                            ...editingDriver,
                            status: 'BLOCKED',
                            is_online: false,
                          })
                        }
                        className={`min-h-[46px] rounded-lg border px-3 text-left transition cursor-pointer ${
                          editingDriver.status === 'BLOCKED'
                            ? 'border-red-400 bg-red-50 text-red-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-medium text-sm">Blocked</div>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Driver Photo URL
                    </label>
                    <input
                      type="url"
                      value={editingDriver.photo_url || ''}
                      onChange={(e) =>
                        setEditingDriver({
                          ...editingDriver,
                          photo_url: e.target.value,
                        })
                      }
                      className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      placeholder="Enter image URL (optional)"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: VEHICLE & CREDENTIALS */}
              {editDriverStep === 2 && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Vehicle Number
                    </label>
                    <input
                        type="text"
                        required
                        value={editingDriver.vehicle_number}
                        onChange={(e) =>
                          setEditingDriver({
                            ...editingDriver,
                            vehicle_number: e.target.value.toUpperCase(),
                          })
                        }
                        className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 font-mono font-medium uppercase focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="e.g. TN 66 AV 6589"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Vehicle Category
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-2">
                      {['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setEditingDriver({
                              ...editingDriver,
                              vehicle_category: cat,
                            })
                          }
                          className={`min-h-10 rounded-lg px-1 text-xs font-medium border transition cursor-pointer text-center ${
                            (editingDriver.vehicle_category || '').toUpperCase() === cat
                              ? 'bg-orange-500 text-slate-950 border-orange-600 font-semibold'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            ['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(
                              (editingDriver.vehicle_category || '').toUpperCase()
                            )
                          ) {
                            setEditingDriver({
                              ...editingDriver,
                              vehicle_category: '',
                            });
                          }
                        }}
                        className={`min-h-10 rounded-lg px-1 text-xs font-medium border transition cursor-pointer text-center ${
                          !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(
                            (editingDriver.vehicle_category || '').toUpperCase()
                          )
                            ? 'bg-orange-500 text-slate-950 border-orange-600 font-semibold'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                          Custom
                      </button>
                    </div>

                    {!['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(
                      (editingDriver.vehicle_category || '').toUpperCase()
                    ) && (
                      <div className="animate-in fade-in duration-150">
                        <label className="mb-1.5 block text-sm font-medium text-slate-800">
                          Custom Vehicle Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Tempo Traveller, Force Urbania"
                          value={editingDriver.vehicle_category || ''}
                          onChange={(e) =>
                            setEditingDriver({
                              ...editingDriver,
                              vehicle_category: e.target.value.toUpperCase(),
                            })
                          }
                          className="min-h-[46px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 uppercase focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-700 font-bold">
                        License Expiry Date
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setFullYear(d.getFullYear() + 1);
                          setEditingDriver({
                            ...editingDriver,
                            expiry_date: d.toISOString().split('T')[0],
                          });
                        }}
                        className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-md cursor-pointer transition"
                        title="Set to 1 Year from today"
                      >
                        Add 1 Year
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="date"
                        value={editingDriver.expiry_date || ''}
                        onChange={(e) =>
                          setEditingDriver({ ...editingDriver, expiry_date: e.target.value })
                        }
                        className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-700 font-bold">FCM Token (Optional)</label>
                    </div>
                    <input
                      type="text"
                      value={editingDriver.fcm_token || ''}
                      onChange={(e) =>
                        setEditingDriver({ ...editingDriver, fcm_token: e.target.value })
                      }
                      placeholder="Leave blank if unavailable"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono text-[11px] focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: OFFICE DUES & PAYMENT SETTINGS */}
              {editDriverStep === 3 && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Office Due (₹)
                    </label>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={editingDriver.payment_amount ?? 0}
                        onChange={(e) => {
                          const amt = Math.max(0, Number(e.target.value) || 0);
                          setEditingDriver({
                            ...editingDriver,
                            payment_amount: amt,
                            payment_status: amt > 0 ? 'DUE' : 'CLEARED',
                          });
                        }}
                        className="min-h-[46px] w-full rounded-lg border border-slate-200 px-3 text-lg font-semibold text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="e.g. 500"
                      />
                    </div>
                  </div>

                  {/* Payment Status Dropdown */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">Payment Status</label>
                    <select
                      value={
                        editingDriver.payment_status ||
                        ((editingDriver.payment_amount || 0) > 0 ? 'DUE' : 'CLEARED')
                      }
                      onChange={(e) =>
                        setEditingDriver({
                          ...editingDriver,
                          payment_status: e.target.value as 'DUE' | 'CLEARED',
                        })
                      }
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="DUE">Pending</option>
                      <option value="CLEARED">Cleared</option>
                    </select>
                  </div>

                  {/* Payment Note / Purpose */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Payment Purpose
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {PAYMENT_NOTE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setEditingDriver({
                              ...editingDriver,
                              payment_note: preset,
                            })
                          }
                          className={`min-h-11 rounded-lg border px-2 text-left text-xs font-medium transition cursor-pointer ${
                            (editingDriver.payment_note || DEFAULT_PAYMENT_NOTE) === preset
                              ? 'bg-orange-50 border-orange-300 text-orange-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50'
                          }`}
                        >
                          <span className="break-words">{preset}</span>
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={editingDriver.payment_note || ''}
                      onChange={(e) =>
                        setEditingDriver({
                          ...editingDriver,
                          payment_note: e.target.value,
                        })
                      }
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      placeholder="Enter payment purpose"
                    />
                  </div>

                  {/* Office UPI ID */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 font-bold text-xs">
                        Office UPI ID
                      </label>
                      {editingDriver.office_upi_id ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingDriver({
                              ...editingDriver,
                              office_upi_id: '',
                            })
                          }
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          Set Blank
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingDriver({
                              ...editingDriver,
                              office_upi_id: '123mdcreation@okaxis',
                            })
                          }
                          className="rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50 cursor-pointer"
                        >
                          Choose Default ID
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editingDriver.office_upi_id || ''}
                      onChange={(e) =>
                        setEditingDriver({
                          ...editingDriver,
                          office_upi_id: e.target.value,
                        })
                      }
                      placeholder="Enter UPI ID (optional)"
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <div className="text-[11px] text-slate-500 px-0.5">
                      {editingDriver.office_upi_id ? (
                        <span className="text-emerald-700 font-semibold">
                          {editingDriver.office_upi_id === '123mdcreation@okaxis'
                            ? '✓ Default ID: 123mdcreation@okaxis'
                            : `✓ Custom: ${editingDriver.office_upi_id}`}
                        </span>
                      ) : (
                        <span className="text-slate-400">No UPI ID selected</span>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* Bottom Actions Bar */}
              <div className="mt-3 flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDriver(null);
                    setEditDriverStep(1);
                    setEditFeedback(null);
                  }}
                  className="min-h-[46px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex flex-wrap justify-end gap-2">
                  {editDriverStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditDriverStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                      className="min-h-[46px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <span>Back</span>
                    </button>
                  )}

                  {editDriverStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setEditDriverStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
                      className="min-h-[46px] rounded-lg bg-orange-500 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-600 cursor-pointer"
                    >
                      <span>Next: {editDriverStep === 1 ? 'Vehicle' : 'Office Dues'}</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSavingEdit}
                      className="min-h-[46px] rounded-lg bg-orange-500 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-600 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingEdit ? (
                        <>
                          <span>Saving Profile...</span>
                        </>
                      ) : (
                        <>
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Driver Confirmation Modal */}
      {driverToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Driver Account</h3>
                <p className="text-xs text-slate-500">Permanently remove from fleet</p>
              </div>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>{driverToDelete.driver_name}</span>
                <span className="font-mono text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {driverToDelete.driver_id}
                </span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>{driverToDelete.vehicle_number}</span>
                <span>•</span>
                <span>{driverToDelete.mobile_number}</span>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this driver? Their registration and access will be removed from the fleet console.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDriverToDelete(null)}
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
                    await onDeleteDriver(driverToDelete.driver_id);
                    setDriverToDelete(null);
                  } catch (err: any) {
                    console.error('Delete driver error:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Driver'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 cursor-pointer"
        >
          <div className="relative max-w-sm w-full bg-white rounded-2xl overflow-hidden p-3 shadow-2xl">
            <img
              src={viewingPhoto}
              alt="Driver"
              referrerPolicy="no-referrer"
              className="w-full h-80 object-cover rounded-xl"
            />
            <p className="text-center text-xs text-slate-500 mt-2 font-medium">Click anywhere to close</p>
          </div>
        </div>
      )}

      {/* Dedicated Driver Office Due & Payment Page */}
      {managingDueDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
          <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-6 min-[768px]:max-[1024px]:max-w-2xl min-[768px]:max-[1024px]:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
            {/* Header */}
            <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-950">Driver Office Due</h3>
                <p className="mt-0.5 break-words text-xs text-slate-500">
                  {managingDueDriver.driver_name} · ID {managingDueDriver.driver_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setManagingDueDriver(null);
                  setDueFeedbackMsg(null);
                  setDueStep(1);
                }}
                className="min-h-10 self-end whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:self-auto"
                aria-label="Back to Drivers"
              >
                Back to Drivers
              </button>
            </div>

            {/* Compact driver summary */}
            <div className="mt-4 grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 text-xs sm:grid-cols-3">
              <div className="min-w-0">
                <span className="block text-slate-500">Vehicle</span>
                <span className="mt-0.5 block break-words font-mono font-semibold text-slate-900">{managingDueDriver.vehicle_number || 'N/A'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-slate-500">Current Due</span>
                <span className="mt-0.5 block font-semibold text-slate-900 tabular-nums">₹{managingDueDriver.payment_amount || 0}</span>
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <span className="block text-slate-500">Status</span>
                <span className={`mt-0.5 block break-words font-semibold capitalize ${(managingDueDriver.payment_amount || 0) > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                  {(managingDueDriver.payment_status || ((managingDueDriver.payment_amount || 0) > 0 ? 'DUE' : 'CLEARED')).toLowerCase()}
                </span>
              </div>
            </div>

            {/* Step-by-Step Progress Navigation */}
            <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDueStep(1)}
                className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                  dueStep === 1
                    ? 'border-amber-500 bg-amber-500 text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>Amount</span>
              </button>

              <button
                type="button"
                onClick={() => setDueStep(2)}
                className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                  dueStep === 2
                    ? 'border-amber-500 bg-amber-500 text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>Purpose</span>
              </button>

              <button
                type="button"
                onClick={() => setDueStep(3)}
                className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                  dueStep === 3
                    ? 'border-amber-500 bg-amber-500 text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>Confirm</span>
              </button>
            </div>

            {/* Feedback Message */}
            {dueFeedbackMsg && (
              <div
                className={`mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 ${
                  dueFeedbackMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>{dueFeedbackMsg.text}</span>
              </div>
            )}

            {/* Step Body */}
            <div className="mt-4 flex-1 space-y-4 overflow-visible pr-0.5 text-xs">
              {/* STEP 1: AMOUNT */}
              {dueStep === 1 && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Office Due Amount (₹)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        required
                        autoFocus
                        value={dueAmountInput}
                        onChange={(e) => setDueAmountInput(e.target.value)}
                        placeholder="Enter amount"
                        className="w-full min-h-12 rounded-lg border border-slate-300 px-3 py-3 text-xl font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>

                  {/* Instant Clear Due Option */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleClearDue}
                      className={`w-full min-h-11 rounded-lg px-3 text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                        dueAmountInput === '0'
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
              {dueStep === 2 && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Payment Purpose / Reason
                    </label>
                    <div className="space-y-1.5">
                      {PAYMENT_NOTE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDueNoteInput(preset)}
                          className={`w-full min-h-11 rounded-lg border px-3 text-left font-bold text-xs transition cursor-pointer flex items-center justify-between ${
                            dueNoteInput === preset
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
                      Custom Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={dueNoteInput}
                      onChange={(e) => setDueNoteInput(e.target.value)}
                      placeholder="Type custom note or trip reference..."
                      className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRMATION & OFFICE UPI */}
              {dueStep === 3 && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  {/* Summary Card */}
                  <div className="space-y-2 border-y border-slate-200 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600 font-medium">Previous Due:</span>
                      <span className="shrink-0 font-semibold text-slate-900 tabular-nums">₹{managingDueDriver.payment_amount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600 font-medium">New Due Amount:</span>
                      <span className="shrink-0 text-base font-black text-amber-950 tabular-nums">
                        ₹{dueAmountInput}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600 font-medium">Payment Status:</span>
                      <span className="shrink-0 font-semibold text-slate-900">
                        {managingDueDriver.payment_status || ((managingDueDriver.payment_amount || 0) > 0 ? 'DUE' : 'CLEARED')}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-600 font-medium">Selected Purpose:</span>
                      <span className="max-w-[60%] break-words text-right font-bold text-slate-900">
                        {dueNoteInput}
                      </span>
                    </div>
                  </div>

                  {/* Office UPI ID */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 font-bold text-xs">
                        Office UPI ID
                      </label>
                      {officeUpiInput ? (
                        <button
                          type="button"
                          onClick={() => setOfficeUpiInput('')}
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          Set Blank
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOfficeUpiInput('123mdcreation@okaxis')}
                          className="text-[11px] text-amber-800 hover:text-amber-900 font-bold bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg transition cursor-pointer"
                        >
                          Choose Default ID
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={officeUpiInput}
                      onChange={(e) => setOfficeUpiInput(e.target.value)}
                      placeholder="Enter UPI ID (optional)"
                      className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                      {officeUpiInput.trim() ? (
                        <span className="text-emerald-700 font-semibold">
                          {officeUpiInput.trim() === '123mdcreation@okaxis'
                            ? 'Default ID: 123mdcreation@okaxis'
                            : `Custom: ${officeUpiInput.trim()}`}
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

              {/* Step Navigation & Actions Footer */}
              <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManagingDueDriver(null);
                      setDueFeedbackMsg(null);
                      setDueStep(1);
                    }}
                    className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  {dueStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setDueStep((prev) => (prev - 1) as 1 | 2)}
                      className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                    >
                      Back
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {dueStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setDueStep((prev) => (prev + 1) as 2 | 3)}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSavingDue}
                      onClick={() => void handleSaveDue()}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingDue ? (
                        <>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <span>
                            Save Changes
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
