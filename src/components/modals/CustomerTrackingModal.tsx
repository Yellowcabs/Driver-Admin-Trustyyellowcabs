import React, { useState } from 'react';
import { FirestoreTrip, FirestoreDriver } from '../../types';

interface CustomerTrackingModalProps {
  isOpen: boolean;
  trip: FirestoreTrip | null;
  assignedDriver?: FirestoreDriver | null;
  onClose: () => void;
  onGenerateLink: (tripDocId: string) => Promise<{ token: string; link: string }>;
  onDisableLink: (tripDocId: string) => Promise<void>;
  onPreviewCustomerView?: (token: string, selectedTrip?: FirestoreTrip) => void;
}

export const CustomerTrackingModal: React.FC<CustomerTrackingModalProps> = ({
  isOpen,
  trip,
  assignedDriver,
  onClose,
  onGenerateLink,
  onDisableLink,
  onPreviewCustomerView,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [localToken, setLocalToken] = useState<string>(trip?.tracking_token || (trip ? `TRK-${trip.trip_id}` : ''));
  const [localEnabled, setLocalEnabled] = useState<boolean>(Boolean(trip?.tracking_enabled ?? true));

  React.useEffect(() => {
    if (trip) {
      setLocalToken(trip.tracking_token || `TRK-${trip.trip_id}`);
      setLocalEnabled(Boolean(trip.tracking_enabled ?? true));
      setShowRevokeConfirm(false);
    }
  }, [trip?.tracking_token, trip?.tracking_enabled, trip?.trip_id]);

  if (!isOpen || !trip) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://track.trustyyellowcab.com';
  const token = localToken || trip.tracking_token || `TRK-${trip.trip_id}`;
  const isTripFinished = trip.status === 'COMPLETED' || trip.status === 'CANCELLED';
  const isTrackingActive = Boolean((localEnabled ?? trip.tracking_enabled ?? true) && token && !isTripFinished);

  const liveLink = token ? `${origin}/?track=${token}` : '';

  const driverName = trip.driver_name || assignedDriver?.driver_name || 'Driver Allocation Pending';
  const vehicleNumber = trip.vehicle_number || assignedDriver?.vehicle_number || 'Assigning Vehicle';

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      const res = await onGenerateLink(trip.doc_id || trip.trip_id);
      if (res && res.token) {
        setLocalToken(res.token);
        setLocalEnabled(true);
      }
    } catch (err) {
      console.error('Failed to generate tracking link:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDisable = async () => {
    try {
      setIsDisabling(true);
      await onDisableLink(trip.doc_id || trip.trip_id);
      setLocalEnabled(false);
      setShowRevokeConfirm(false);
    } catch (err) {
      console.error('Failed to disable tracking link:', err);
    } finally {
      setIsDisabling(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Pre-formatted customer message for WhatsApp / SMS / Email
  const shareMessage = `Hello Customer,\n\nYour cab has been booked.\n\nTrip ID: ${trip.trip_id}\n\nTrack Your Cab:\n${liveLink}\n\nThank you for choosing our taxi service.`;

  const cleanPhone = (trip.customer_phone || '').replace(/[^0-9+]/g, '');

  const openWhatsApp = () => {
    const encoded = encodeURIComponent(shareMessage);
    const targetPhone = cleanPhone.startsWith('+')
      ? cleanPhone.replace('+', '')
      : cleanPhone.length === 10
      ? `91${cleanPhone}`
      : cleanPhone;
    const url = targetPhone
      ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const openSms = () => {
    const encoded = encodeURIComponent(shareMessage);
    window.open(`sms:${cleanPhone}?body=${encoded}`, '_self');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 text-slate-900">
      <div className="mx-auto min-h-[100dvh] w-full max-w-3xl min-[768px]:max-[1024px]:max-w-2xl lg:max-w-4xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Share Tracking Link</h1>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Trip #{trip.trip_id} · {trip.status}
              </p>
              <p className="hidden text-xs text-slate-500 font-medium">
                Trip #{trip.trip_id} • {trip.customer_name || 'Customer'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 shrink-0 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
            Back to Dispatch
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
          {/* Trip Summary Card */}
          <div className="space-y-2 border-b border-slate-200 pb-3 text-sm">
            <div className="hidden flex items-center justify-between pb-2 border-b border-slate-200/80">
              <span className="font-bold text-slate-900">Trip Overview</span>
              <span
                className={`px-2 py-1 rounded-md border font-bold text-[10px] ${
                  trip.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : trip.status === 'IN_PROGRESS'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : trip.status === 'ACCEPTED'
                    ? 'bg-orange-50 text-orange-800 border-orange-200'
                    : trip.status === 'CANCELLED'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {trip.status}
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-[11px]">
              <div className="flex items-start justify-between gap-4 py-2 first:pt-0">
                <span className="text-slate-500">Driver</span>
                <strong className="text-slate-900 text-right break-words">{driverName}</strong>
              </div>
              {trip.vehicle_number || assignedDriver?.vehicle_number ? (
                <div className="flex items-start justify-between gap-4 py-2">
                  <span className="text-slate-500">Vehicle</span>
                  <strong className="text-slate-900 font-mono text-right break-words">{vehicleNumber}</strong>
                </div>
              ) : null}
              <div className="flex flex-col gap-1 py-2">
                <span className="text-slate-500">Pickup</span>
                <span className="text-slate-900 font-medium break-words">{trip.pickup_location || 'Not provided'}</span>
              </div>
              {trip.drop_location ? (
                <div className="flex flex-col gap-1 py-2">
                  <span className="text-slate-500">Drop</span>
                  <span className="text-slate-900 font-medium break-words">{trip.drop_location}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Core Feature Status */}
          {!isTrackingActive ? (
            /* STATE 1: Link Not Generated Yet */
            <div className="border-t border-slate-200 pt-4 space-y-3">
              {isTripFinished ? (
                <div className="text-xs text-slate-600 font-medium">
                  This trip is already {trip.status.toLowerCase()}. Tracking links cannot be generated for completed or cancelled trips.
                </div>
              ) : (
                <div className="pt-1">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="w-full min-h-[46px] px-4 bg-[#FF9800] hover:bg-[#e68900] active:bg-[#cc7a00] text-white font-bold rounded-lg transition cursor-pointer text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Generating Secure Token...' : 'Generate Customer Tracking Link'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* STATE 2: Link is Active */
            <div className="border-t border-slate-200 pt-4 space-y-5">
              {/* Active Status Banner */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                      Tracking Link Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Secure Token & URL Box */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-900">
                  Customer Tracking Link
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    readOnly
                    value={liveLink}
                    aria-label="Tracking Link"
                    className="w-full min-w-0 bg-white border border-slate-300 rounded-lg px-3 py-3 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-orange-400 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(liveLink)}
                    className="w-full min-h-[46px] bg-[#FF9800] hover:bg-[#e68900] active:bg-[#cc7a00] text-white font-bold px-4 py-2 rounded-lg transition cursor-pointer"
                  >
                    {copiedLink ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>

              </div>

              {/* Share with Customer */}
              <div className="space-y-2 pt-1">
                <label className="block text-sm font-bold text-slate-900">
                  Share with Customer
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* WhatsApp */}
                  <button
                    onClick={openWhatsApp}
                    className="min-h-[46px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition cursor-pointer"
                  >
                    WhatsApp
                  </button>

                  {/* SMS */}
                  <button
                    onClick={openSms}
                    className="min-h-[46px] px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm transition cursor-pointer"
                  >
                    SMS
                  </button>
                </div>
              </div>

              {/* Preview Customer View */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  onClick={() => {
                    if (onPreviewCustomerView) {
                      onPreviewCustomerView(token, {
                        ...trip,
                        tracking_token: token,
                        tracking_enabled: true,
                      });
                      onClose();
                    } else {
                      window.open(liveLink, '_blank');
                    }
                  }}
                  className="min-h-[46px] px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm transition cursor-pointer border border-slate-300"
                >
                  Preview Customer View
                </button>

                {/* Revoke / Disable Button */}
                {!showRevokeConfirm ? (
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="min-h-[46px] px-3 rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold text-sm transition cursor-pointer border border-rose-300"
                  >
                    Disable Link
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleDisable}
                      disabled={isDisabling}
                      className="min-h-[46px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isDisabling ? 'Disabling...' : 'Confirm Revoke'}
                    </button>
                    <button
                      onClick={() => setShowRevokeConfirm(false)}
                      className="min-h-[46px] px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security & Firestore Architecture Guarantee */}
          <div className="hidden bg-slate-50 rounded-xl p-3 border border-slate-200 text-[11px] space-y-1.5 text-slate-600">
            <div className="font-bold text-slate-800">Tracking link security</div>
            <ul className="space-y-1 text-slate-500 pl-4 list-disc">
              <li>
                <strong>No Admin Exposure:</strong> Customers cannot modify trip data, access driver records, or view other fleet rides.
              </li>
              <li>
                <strong>Auto-Expiry:</strong> This tracking session deactivates immediately when the trip is marked <strong>COMPLETED</strong> or <strong>CANCELLED</strong>.
              </li>
              <li>
                <strong>Minimal Firestore Reads:</strong> No background tracking documents exist for unrequested trips.
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};
