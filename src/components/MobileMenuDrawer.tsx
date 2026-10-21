import React from 'react';
import { AdminTab, SystemControlSettings, AdminUser } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  systemSettings: SystemControlSettings;
  isFirebaseConnected: boolean;
  isSyncing: boolean;
  connectionStatusText: string;
  currentAdmin: AdminUser;
  onOpenNewTripModal: () => void;
  onOpenSettingsModal?: (tab?: 'system' | 'security' | 'environment') => void;
  onOpenNewDriverModal: () => void;
  onOpenAdminPermissionsModal?: () => void;
  onToggleKillswitch: (online: boolean) => void;
  openTripCount: number;
  onlineDriverCount: number;
  onLogout?: () => void;
}

export const MobileMenuDrawer: React.FC<MobileMenuDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  systemSettings,
  onOpenNewDriverModal,
  onToggleKillswitch,
  onLogout,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!isOpen) return null;

  const isCutoffActive = !systemSettings.admin_online;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 animate-in fade-in duration-150">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white animate-in slide-in-from-right duration-200">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Fleet Menu</h2>
            <div className="mt-1 flex items-center gap-2 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Console Active</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section aria-labelledby="driver-sync-heading" className="border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 id="driver-sync-heading" className="text-sm font-semibold text-slate-950">
                  {isCutoffActive ? 'Sync Cutoff ACTIVE' : 'Driver Sync Online'}
                </h3>
                <p className={`mt-1 text-xs font-medium ${isCutoffActive ? 'text-red-700' : 'text-emerald-700'}`}>
                  {isCutoffActive ? 'Disconnected' : 'Connected'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggleKillswitch(isCutoffActive)}
                className={`min-h-10 shrink-0 border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${
                  isCutoffActive
                    ? 'border-orange-300 text-orange-700 hover:bg-orange-50'
                    : 'border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                {isCutoffActive ? 'Resume' : 'Cutoff'}
              </button>
            </div>
          </section>

          <section aria-labelledby="operations-heading" className="pt-5">
            <h3 id="operations-heading" className="mb-3 text-sm font-semibold text-slate-950">
              Operations
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewDriverModal();
                }}
                className="min-h-[52px] w-full border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-900 transition-colors hover:border-orange-300 hover:bg-orange-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
              >
                Add Fleet Driver &amp; Car
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('trips');
                  onClose();
                }}
                className={`min-h-[52px] w-full border px-4 text-left text-sm font-medium text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1 ${
                  activeTab === 'trips'
                    ? 'border-orange-300 bg-orange-50/40'
                    : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40'
                }`}
              >
                Trip History &amp; Ledger
              </button>
            </div>
          </section>

          {!window.location.search.includes('page=privacy') &&
            !window.location.search.includes('track=') &&
            !isInstalled &&
            isInstallable && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  install();
                }}
                className="mt-5 min-h-12 w-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
              >
                Install Mobile App (PWA)
              </button>
            )}

          {onLogout && (
            <section className="mt-8 border-t border-slate-200 pt-5" aria-label="Account actions">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="min-h-12 w-full border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
              >
                Log Out
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
