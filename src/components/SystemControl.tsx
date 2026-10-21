import React, { useState, useEffect } from 'react';
import { SystemControlSettings, SystemEventLog, AdminUser } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  Radio,
  Send,
  AlertTriangle,
  Terminal,
  RefreshCw,
  CheckCircle2,
  Cpu,
  UserCheck,
  KeyRound,
  Sparkles,
} from 'lucide-react';

interface SystemControlProps {
  systemSettings: SystemControlSettings;
  logs: SystemEventLog[];
  onToggleKillswitch: (online: boolean) => Promise<void>;
  onUpdateBroadcastNotice: (notice: string) => Promise<void>;
  currentAdmin?: AdminUser;
  onOpenAdminPermissionsModal?: () => void;
  onOpenSettingsModal?: (tab?: 'system' | 'security' | 'environment') => void;
}

export const SystemControl: React.FC<SystemControlProps> = ({
  systemSettings,
  logs,
  onToggleKillswitch,
  onUpdateBroadcastNotice,
  currentAdmin,
  onOpenAdminPermissionsModal,
  onOpenSettingsModal,
}) => {
  const [broadcastInput, setBroadcastInput] = useState(systemSettings.broadcast_notice || '');
  const [isSavingBroadcast, setIsSavingBroadcast] = useState(false);
  const [isTogglingKillswitch, setIsTogglingKillswitch] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('ALL');

  useEffect(() => {
    setBroadcastInput(systemSettings.broadcast_notice || '');
  }, [systemSettings.broadcast_notice]);

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBroadcast(true);
    await onUpdateBroadcastNotice(broadcastInput);
    setIsSavingBroadcast(false);
  };

  const handleKillswitchClick = async () => {
    setIsTogglingKillswitch(true);
    try {
      await onToggleKillswitch(!systemSettings.admin_online);
    } finally {
      setIsTogglingKillswitch(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter !== 'ALL' && l.level !== logFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 min-[768px]:max-[1024px]:space-y-4 lg:space-y-5">
      {/* Top Banner & Cutoff Warning */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          systemSettings.admin_online
            ? 'bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-white border-emerald-200'
            : 'bg-gradient-to-r from-rose-600/15 via-rose-500/10 to-white border-rose-300 ring-2 ring-rose-500/30'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                systemSettings.admin_online
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-rose-600 text-white shadow-md animate-pulse'
              }`}
            >
              {systemSettings.admin_online ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  {systemSettings.admin_online
                    ? 'Backend Fleet Sync: ONLINE'
                    : 'MASTER EMERGENCY BACKEND CUTOFF ACTIVATED'}
                </h3>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                    systemSettings.admin_online
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800 animate-bounce'
                  }`}
                >
                  {systemSettings.status}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                {systemSettings.admin_online
                  ? 'All Android driver mobile apps are streaming live GPS telemetry and accepting incoming trip dispatches from this console in real time.'
                  : 'Backend synchronization is disabled. The Android Driver App detects the cutoff status, halts driver database pushes, and displays an offline contingency notice.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={handleKillswitchClick}
              disabled={isTogglingKillswitch}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                systemSettings.admin_online
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isTogglingKillswitch ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>
                {isTogglingKillswitch
                  ? systemSettings.admin_online
                    ? 'Engaging Cutoff...'
                    : 'Resuming Fleet Sync...'
                  : systemSettings.admin_online
                  ? 'Trigger Cutoff (Stop Fleet Sync)'
                  : 'Resume Live Fleet Sync'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Firestore Rule Advisory Notice */}
      {systemSettings.rule_permission_notice && (
        <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 shadow-2xs text-xs text-amber-900 space-y-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-extrabold text-sm text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Firestore Rule Advisory: Dispatch Control Setup</span>
            </div>
            {onOpenSettingsModal && (
              <button
                type="button"
                onClick={() => onOpenSettingsModal('security')}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg cursor-pointer shrink-0 transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Open Security Rules</span>
              </button>
            )}
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {systemSettings.rule_permission_notice}
          </p>
          <div className="pt-1 text-[11px] text-amber-700 font-medium">
            <strong>Why this happens:</strong> The remote Firestore security rules currently restrict writes to{' '}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-amber-900">/system_settings/dispatch_control</code>.
            To allow direct write access to this single settings document, open <strong>Settings &rarr; Geo Fence & Security Rules</strong>, copy the updated rules, and publish them in your Firebase Console.
          </div>
        </div>
      )}

      {/* Geo Fence & Security Quick Settings Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-sm text-slate-900">
                Geo Fence & Security Rules Settings
              </h4>
              <span className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                CONFIGURED
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
              Manage radial dispatch geofencing, driver hardware device locks, customer OTP ride enforcement, and production Firestore security rules.
            </p>
          </div>
        </div>

        {onOpenSettingsModal && (
          <button
            type="button"
            onClick={() => onOpenSettingsModal('security')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer flex items-center gap-2 shrink-0 shadow-xs"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Open Geo Fence & Security Settings</span>
          </button>
        )}
      </div>

      {/* Admin Panel Identity & Privileges Card */}
      {currentAdmin && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{currentAdmin.name}</span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400/30">
                    {currentAdmin.role}
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-400/30">
                    ALL PERMISSIONS ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-0.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>{currentAdmin.email}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenAdminPermissionsModal && (
                <button
                  onClick={onOpenAdminPermissionsModal}
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Manage Permissions & Admins</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-4 pt-3 border-t border-slate-800 text-[11px]">
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Master Cutoff</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Dispatch Rides</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Manage Drivers</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Change Rates</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Rules Deploy</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-slate-200">Audit Logs</span>
            </div>
          </div>
        </div>
      )}

      {/* Fleet Broadcast Message */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-500" /> Fleet-Wide Broadcast Notice
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">collection: system_settings</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            This message appears as an alert banner inside every driver&apos;s mobile app across the entire fleet.
          </p>

          <form onSubmit={handleBroadcastSubmit} className="mt-4 space-y-3">
            <textarea
              value={broadcastInput}
              onChange={(e) => setBroadcastInput(e.target.value)}
              placeholder="e.g. Surge pricing in effect across North Sector. Please stay online."
              rows={3}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Last updated: {new Date(systemSettings.updated_at).toLocaleTimeString()}
              </span>
              <button
                type="submit"
                disabled={isSavingBroadcast}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSavingBroadcast ? 'Publishing...' : 'Publish Broadcast'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
          <span className="text-[10px] font-bold text-amber-800 uppercase">Live Preview on Driver App</span>
          <p className="text-xs font-semibold text-slate-900 mt-1">
            &quot;{systemSettings.broadcast_notice || 'No active broadcast.'}&quot;
          </p>
        </div>
      </div>

      {/* Real-Time Event Audit Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-700" />
            <h4 className="font-extrabold text-sm text-slate-900">Live System Event Log ({logs.length})</h4>
          </div>

          <div className="flex items-center gap-1.5">
            {['ALL', 'SUCCESS', 'INFO', 'WARNING', 'ALERT'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  logFilter === lvl
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {filteredLogs.map((log) => {
            const getLogBadge = () => {
              switch (log.level) {
                case 'ALERT':
                  return 'bg-rose-100 text-rose-800 border-rose-200';
                case 'WARNING':
                  return 'bg-amber-100 text-amber-800 border-amber-200';
                case 'SUCCESS':
                  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                default:
                  return 'bg-sky-100 text-sky-800 border-sky-200';
              }
            };

            return (
              <div
                key={log.id}
                className="flex items-start justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs hover:bg-slate-100/80 transition"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${getLogBadge()}`}
                  >
                    {log.level}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900">{log.title}</span>
                    <p className="text-slate-600 text-[11px] mt-0.5">{log.message}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="block text-[9px] font-semibold text-slate-500 uppercase">{log.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
