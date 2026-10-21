import React from 'react';
import {
  TrendingUp,
  Navigation,
  Users,
  History,
  LayoutDashboard,
} from 'lucide-react';
import { AdminTab, SystemControlSettings } from '../types';

interface MobileBottomNavProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  onOpenMenuDrawer: () => void;
  openTripCount: number;
  onlineDriverCount: number;
  systemSettings: SystemControlSettings;
  isMenuDrawerOpen: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  openTripCount,
  onlineDriverCount,
  isMenuDrawerOpen,
}) => {
  const navItems = [
    {
      id: 'dispatch' as AdminTab,
      label: 'Dispatch',
      icon: <LayoutDashboard className="w-4 h-4" />,
      badge: openTripCount > 0 ? (openTripCount > 99 ? '99+' : openTripCount.toString()) : undefined,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
    {
      id: 'radar' as AdminTab,
      label: 'Radar',
      icon: <Navigation className="w-4 h-4" />,
      badge: onlineDriverCount > 0 ? onlineDriverCount.toString() : undefined,
      badgeColor: 'bg-emerald-500 text-white font-bold',
    },
    {
      id: 'drivers' as AdminTab,
      label: 'Drivers',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'trips' as AdminTab,
      label: 'Ledger',
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'analytics' as AdminTab,
      label: 'Stats',
      icon: <TrendingUp className="w-4 h-4" />,
    },
  ];

  return (
    <nav
      id="mobile-bottom-nav"
      aria-label="Mobile Bottom Navigation"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] px-2 py-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex w-full items-center justify-around mx-auto">
        {navItems.map((item) => {
          const isActive = !isMenuDrawerOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
              }}
              className={`relative flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-slate-950'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {/* Active icon pill (Image 1 style) */}
              <div
                className={`relative flex items-center justify-center transition-all ${
                  isActive
                    ? 'w-10 h-7 rounded-full bg-slate-950 text-white shadow-xs'
                    : 'w-7 h-7 text-slate-500'
                }`}
              >
                {item.icon}
                {item.badge && (
                  <span
                    className={`absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] flex items-center justify-center shadow-xs ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 tracking-tight leading-none ${
                  isActive ? 'font-black text-slate-900' : 'font-semibold text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

      </div>
    </nav>
  );
};
