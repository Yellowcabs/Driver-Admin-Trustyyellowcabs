import React, { useState } from 'react';
import {
  FirebaseConnectionConfig,
  SystemControlSettings,
  SystemEventLog,
  AdminUser,
} from '../../types';
import {
  X,
  Copy,
  Check,
  Power,
  Settings,
  Shield,
} from 'lucide-react';
import { PRODUCTION_FIRESTORE_RULES } from '../../firebase/rules';

interface FirebaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: FirebaseConnectionConfig;
  onSave?: (config: FirebaseConnectionConfig) => Promise<void>;
  isFirebaseConnected?: boolean;
  initialTab?: 'system' | 'security' | 'environment';
  systemSettings: SystemControlSettings;
  logs?: SystemEventLog[];
  onToggleKillswitch: (online: boolean) => Promise<void>;
  onUpdateBroadcastNotice?: (notice: string) => Promise<void>;
  currentAdmin?: AdminUser;
  onOpenAdminPermissionsModal?: () => void;
}

export const FirebaseSettingsModal: React.FC<FirebaseSettingsModalProps> = ({
  isOpen,
  onClose,
  systemSettings,
  onToggleKillswitch,
}) => {
  const [copied, setCopied] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  if (!isOpen) return null;

  const isCutoffActive = !systemSettings.admin_online;

  const handleToggleCutoff = async () => {
    setIsToggling(true);
    try {
      await onToggleKillswitch(isCutoffActive);
    } finally {
      setIsToggling(false);
    }
  };

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(PRODUCTION_FIRESTORE_RULES);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: Only Cutoff Button and Firebase Rules Copy Button */}
        <div className="py-4 space-y-3">
          {/* 1. Cutoff Button Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Power className={`w-3.5 h-3.5 ${isCutoffActive ? 'text-rose-600' : 'text-emerald-600'}`} />
                <span>Fleet Cutoff</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {isCutoffActive ? 'Sync halted (Cutoff active)' : 'Drivers synced & online'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleCutoff}
              disabled={isToggling}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60 shadow-xs ${
                isCutoffActive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {isToggling ? 'Updating...' : isCutoffActive ? 'Resume Sync' : 'Cutoff'}
              </span>
            </button>
          </div>

          {/* 2. Firebase Rules Copy Button Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>Firebase Rules</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                firestore.rules
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyRules}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Rules</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
