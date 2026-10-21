import React from 'react';
import {
  Radio,
  Users,
  History,
  ShieldCheck,
  Settings,
  Sliders,
  Zap,
  TrendingUp,
  LayoutDashboard,
  Navigation,
  MapPin,
  Flame,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { AdminTab, FirestoreDriver, FirestoreTrip, AdminUser, SystemSettings } from '../types';

interface SidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  openTripCount: number;
  onlineDriverCount: number;
  currentAdmin: AdminUser;
  systemSettings: SystemSettings;
  isFirebaseConnected: boolean;
  isSyncing: boolean;
  onOpenNewTripModal: () => void;
  onOpenNewDriverModal: () => void;
  onOpenSettingsModal: (tab?: 'system' | 'security' | 'environment') => void;
  onOpenAdminPermissionsModal: () => void;
  onToggleKillswitch: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  openTripCount,
  onlineDriverCount,
  currentAdmin,
  systemSettings,
  isFirebaseConnected,
  isSyncing,
  onOpenNewTripModal,
  onOpenNewDriverModal,
  onOpenSettingsModal,
  onOpenAdminPermissionsModal,
  onToggleKillswitch,
  onLogout,
}) => {
  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'dispatch',
      label: 'Dashboard & Dispatch',
      icon: <LayoutDashboard className="w-4 h-4" />,
      badge: openTripCount > 0 ? `${openTripCount} OPEN` : undefined,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
    {
      id: 'analytics',
      label: 'Fleet Analytics',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'radar',
      label: 'Live Tracking & Radar',
      icon: <Navigation className="w-4 h-4" />,
      badge: onlineDriverCount > 0 ? `${onlineDriverCount} Live` : undefined,
      badgeColor: 'bg-emerald-500 text-white font-bold',
    },
    {
      id: 'drivers',
      label: 'Driver Management',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'trips',
      label: 'Trip Management & Logs',
      icon: <History className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 bg-white text-slate-700 border-r border-slate-200/80 flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none z-30 hidden lg:flex shadow-xs">
      {/* Brand Header */}
      <div>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h1 className="break-words text-base font-bold leading-tight tracking-tight text-slate-900">
              Fleet Console
            </h1>
          </div>

          {/* Quick Dispatch Action Button */}
          <button
            onClick={onOpenNewTripModal}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-2.5 px-3.5 rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>+ Quick Dispatch Ride</span>
          </button>
        </div>

        {/* Navigation Menu Links */}
        <div className="px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Fleet Management
          </div>

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'}`}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 break-words text-left leading-tight">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                      isActive ? 'bg-white/20 text-white font-medium' : (item.badgeColor || 'bg-slate-100 text-slate-600 font-medium')
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Settings button in Sidebar */}
          <div className="pt-2 mt-2 border-t border-slate-100">
            <button
              onClick={() => onOpenSettingsModal('system')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all cursor-pointer group text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-slate-400 group-hover:text-indigo-600">
                  <Settings className="w-4 h-4" />
                </span>
                <span className="truncate">Settings</span>
              </div>
              {!systemSettings.admin_online && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold shrink-0">
                  CUTOFF
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Emergency Killswitch Warning Box in Sidebar */}
        {!systemSettings.admin_online && (
          <div className="mx-3 rounded-xl border border-rose-200 bg-white p-3 text-slate-800 text-xs shadow-xs">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
              <span>Cutoff Active</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={onToggleKillswitch}
                className="min-h-10 rounded-lg bg-rose-600 px-2.5 py-2 text-xs font-bold text-white transition-all hover:bg-rose-700 active:bg-rose-800 cursor-pointer active:scale-95"
                title="Resume synchronization with mobile driver app"
              >
                <span>Resume Sync</span>
              </button>
              <button
                onClick={() => onOpenSettingsModal('system')}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50 active:bg-slate-100 cursor-pointer active:scale-95"
                title="Manage system settings"
              >
                <span>Manage</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom User & Settings Card (Image 2 style) */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-2">
          <div
            onClick={onOpenAdminPermissionsModal}
            className="flex items-center min-w-0 cursor-pointer hover:opacity-80 transition"
            title="Manage Admin Profile & Roles"
          >
            <p className="break-words text-xs font-semibold leading-tight text-slate-900">
              Fleet Console
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onOpenSettingsModal()}
              title="Settings & Emergency Cutoff"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Log Out of Console"
                className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
