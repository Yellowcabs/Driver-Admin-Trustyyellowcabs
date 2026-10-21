import React, { useState } from 'react';
import {
  Settings,
  Search,
  X,
  Menu,
  LogOut,
  LayoutDashboard,
  TrendingUp,
  Navigation,
  Users,
  History,
  Zap,
} from 'lucide-react';
import {
  AdminTab,
  SystemSettings,
  AdminUser,
  FirestoreTrip,
  FirestoreDriver,
} from '../types';
import { MobileMenuDrawer } from './MobileMenuDrawer';

interface NavbarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  systemSettings: SystemSettings;
  isFirebaseConnected: boolean;
  isSyncing: boolean;
  connectionStatusText: string;
  currentAdmin: AdminUser;
  onOpenNewTripModal: () => void;
  onOpenSettingsModal: (tab?: 'system' | 'security' | 'environment') => void;
  onOpenNewDriverModal: () => void;
  onOpenAdminPermissionsModal: () => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  onToggleKillswitch: (online: boolean) => void;
  trips?: FirestoreTrip[];
  drivers?: FirestoreDriver[];
  isMenuDrawerOpen: boolean;
  setIsMenuDrawerOpen: (open: boolean) => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  systemSettings,
  isFirebaseConnected,
  isSyncing,
  connectionStatusText,
  currentAdmin,
  onOpenNewTripModal,
  onOpenSettingsModal,
  onOpenNewDriverModal,
  onOpenAdminPermissionsModal,
  globalSearchQuery,
  setGlobalSearchQuery,
  onToggleKillswitch,
  trips = [],
  drivers = [],
  isMenuDrawerOpen,
  setIsMenuDrawerOpen,
  onLogout,
}) => {
  const [isSearchOpenMobile, setIsSearchOpenMobile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const openTripCount = trips.filter((t) => t.status === 'OPEN').length;
  const onlineDriverCount = drivers.filter((d) => d.is_online && d.status === 'ACTIVE').length;

  const getTabTitle = (tab: AdminTab) => {
    switch (tab) {
      case 'dispatch':
        return { title: '', subtitle: '' };
      case 'analytics':
        return { title: 'Fleet Analytics & Performance', subtitle: 'Real-time revenue, category mix & driver performance' };
      case 'radar':
        return { title: 'Live Fleet Radar & Tracking', subtitle: 'Real-time vehicle GPS telemetry, active routes & geofencing' };
      case 'drivers':
        return { title: 'Driver & Fleet Management', subtitle: 'Active roster, KYC verification & device binding' };
      case 'trips':
        return { title: 'Trip History & Ledger', subtitle: 'Comprehensive audit logs, customer fares & route history' };
      default:
        return { title: 'Dashboard', subtitle: 'Fleet Management Console' };
    }
  };

  const { title, subtitle } = getTabTitle(activeTab);

  const tabletNavItems: {
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'dispatch',
      label: 'Dispatch',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
      badge: openTripCount > 0 ? `${openTripCount}` : undefined,
      badgeColor: 'bg-amber-500 text-slate-950',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: <TrendingUp className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'radar',
      label: 'Live Radar',
      icon: <Navigation className="w-4 h-4 shrink-0" />,
      badge: onlineDriverCount > 0 ? `${onlineDriverCount}` : undefined,
      badgeColor: 'bg-emerald-500 text-white',
    },
    {
      id: 'drivers',
      label: 'Drivers',
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'trips',
      label: 'Trips & Logs',
      icon: <History className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full px-3 sm:px-6 min-[768px]:max-[1024px]:px-4 lg:mx-auto lg:max-w-[1760px] lg:px-6 xl:px-8 2xl:px-10">
          <div className="flex min-h-14 items-center justify-between gap-1 py-2 sm:min-h-16 sm:gap-4">
            {/* Left Header Title / Breadcrumb (Desktop) & Mobile Brand */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {/* Mobile Drawer Hamburger Button */}
              <button
                onClick={() => setIsMenuDrawerOpen(true)}
                className="lg:hidden shrink-0 rounded-xl p-1.5 text-slate-700 transition hover:bg-slate-100 sm:p-2 cursor-pointer"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {activeTab !== 'dispatch' && (
                <>
                  {/* Desktop Section Title */}
                  <div className="hidden min-w-0 flex-1 lg:block">
                    <h1 className="break-words text-sm font-bold leading-tight tracking-tight text-slate-900">
                      {title}
                    </h1>
                    <p className="break-words text-[11px] leading-tight text-slate-400">
                      {subtitle}
                    </p>
                  </div>

                  {/* Mobile Section Title */}
                  <div className="min-w-0 flex-1 lg:hidden">
                    <h1 className="break-words text-xs font-bold leading-tight text-slate-900 sm:text-sm">
                      {title.split('&')[0].trim()}
                    </h1>
                  </div>
                </>
              )}
            </div>

            {/* Middle Search Bar */}
            <div className={`flex-1 hidden md:block lg:flex-none lg:w-[clamp(360px,32vw,440px)] lg:max-w-[440px] ${activeTab === 'dispatch' ? 'mx-3 lg:mx-4' : 'mx-2 lg:mx-3'}`}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search anything (trips, driver name, vehicle #, OTP)..."
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 transition outline-none lg:min-h-10 lg:bg-white lg:py-2 lg:pl-10 lg:pr-9 lg:text-sm lg:shadow-sm"
                />
                {globalSearchQuery && (
                  <button
                    onClick={() => setGlobalSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Action Toolbar: Clean, Minimalist Single Hub */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {/* Mobile Search Toggle */}
              <button
                onClick={() => setIsSearchOpenMobile(!isSearchOpenMobile)}
                className="md:hidden rounded-xl p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:p-2 cursor-pointer"
                aria-label="Toggle search"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Connection Status Indicator */}
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/60 text-xs font-semibold text-slate-700 select-none"
                title={`Cloud Status: ${connectionStatusText}`}
              >
                <span className={`w-2 h-2 rounded-full ${isFirebaseConnected ? 'bg-emerald-500' : 'bg-amber-500'} ${isSyncing ? 'animate-ping' : ''}`} />
                <span className="text-[11px] font-bold text-slate-600 min-[768px]:max-[836px]:hidden">
                  {isFirebaseConnected ? 'Cloud Live' : 'Sandbox'}
                </span>
              </div>

              {/* Single Settings Hub Entry */}
              <button
                onClick={() => onOpenSettingsModal('system')}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/90 px-2 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-200/90 hover:text-slate-950 active:scale-[0.98] sm:px-3 cursor-pointer"
                title="System Settings & Security Controls"
              >
                <Settings className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Settings</span>
                {!systemSettings.admin_online && (
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" title="System Cutoff Active" />
                )}
              </button>

              {/* Logout Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/90 px-2 py-1.5 text-xs font-bold text-slate-600 shadow-2xs transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98] sm:px-3 cursor-pointer"
                  title="Log Out of Console"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Expanded Search Bar */}
          {isSearchOpenMobile && (
            <div className="md:hidden py-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search trips, drivers, phone..."
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                {globalSearchQuery && (
                  <button
                    onClick={() => setGlobalSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Tablet Page Switcher Navigation Bar (Visible on Tablet screens sm:flex lg:hidden across all pages) */}
          <div className="hidden sm:flex lg:hidden items-center justify-between pt-2 pb-2.5 border-t border-slate-100 gap-2 overflow-x-auto no-scrollbar select-none min-[768px]:max-[1024px]:overflow-visible">
            <div className="flex items-center gap-1.5 shrink-0 min-[768px]:max-[1024px]:min-w-0 min-[768px]:max-[1024px]:flex-1">
              {tabletNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap min-h-[38px] min-[768px]:max-[1024px]:min-w-0 min-[768px]:max-[1024px]:flex-1 min-[768px]:max-[1024px]:justify-center min-[768px]:max-[1024px]:gap-1.5 min-[768px]:max-[1024px]:px-2 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90'
                    }`}
                    title={`Switch to ${item.label}`}
                  >
                    <span className={isActive ? 'text-white' : 'text-slate-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-black leading-none ${
                          isActive ? 'bg-white/25 text-white' : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Dispatch Shortcut for Tablet */}
            <button
              onClick={onOpenNewTripModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-xs transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] min-[768px]:max-[1024px]:px-3"
              title="Create & Dispatch New Ride"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>+ Quick Ride</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentAdmin={currentAdmin}
        systemSettings={systemSettings}
        isFirebaseConnected={isFirebaseConnected}
        isSyncing={isSyncing}
        connectionStatusText={connectionStatusText}
        openTripCount={openTripCount}
        onlineDriverCount={onlineDriverCount}
        onOpenNewTripModal={onOpenNewTripModal}
        onOpenNewDriverModal={onOpenNewDriverModal}
        onOpenSettingsModal={onOpenSettingsModal}
        onOpenAdminPermissionsModal={onOpenAdminPermissionsModal}
        onToggleKillswitch={onToggleKillswitch}
        onLogout={onLogout}
      />
    </>
  );
};
