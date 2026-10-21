import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { parseBookingText, ParsedBookingData } from '../../services/bookingParser';
import { FirestoreTrip, FirestoreDriver } from '../../types';

interface PasteBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToNewTrip: (data: ParsedBookingData) => void;
  onDirectPostTrip?: (trip: Partial<FirestoreTrip>) => Promise<FirestoreTrip>;
  drivers?: FirestoreDriver[];
}

export const PasteBookingModal: React.FC<PasteBookingModalProps> = ({
  isOpen,
  onClose,
  onApplyToNewTrip,
}) => {
  const [pastedText, setPastedText] = useState('');
  const [parsed, setParsed] = useState<ParsedBookingData | null>(null);
  const [clipboardSupported, setClipboardSupported] = useState(true);

  // Always reset pasted text and parsed state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setPastedText('');
      setParsed(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setPastedText('');
    setParsed(null);
    onClose();
  };

  // Handle ESC key to reset and close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-detect and parse whenever text changes
  useEffect(() => {
    if (pastedText.trim()) {
      const result = parseBookingText(pastedText);
      setParsed(result);
    } else {
      setParsed(null);
    }
  }, [pastedText]);

  // Attempt auto-read from clipboard when requested
  const handleReadClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setPastedText(text);
        }
      } else {
        setClipboardSupported(false);
      }
    } catch {
      // Browser permission prompt denied or unsupported
      setClipboardSupported(false);
    }
  };

  if (!isOpen) return null;

  const handleApply = () => {
    if (!parsed) return;
    const parsedData = parsed;
    setPastedText('');
    setParsed(null);
    onApplyToNewTrip(parsedData);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200 lg:max-w-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <h3 className="text-base font-bold leading-tight text-slate-900 sm:text-lg">
            Paste Booking Message
          </h3>
          <button
            type="button"
            aria-label="Close paste booking modal"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {/* Paste from Clipboard & Clear */}
          <div className="flex flex-wrap items-center gap-2">
              {clipboardSupported && (
                <button
                  type="button"
                  onClick={handleReadClipboard}
                  className="min-h-[44px] rounded-lg border border-[#FF9800] bg-white px-4 text-xs font-bold text-[#FF9800] transition hover:bg-orange-50"
                >
                  <span>Paste from Clipboard</span>
                </button>
              )}
              {pastedText && (
                <button
                  type="button"
                  onClick={() => setPastedText('')}
                  className="min-h-[44px] rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  <span>Clear</span>
                </button>
              )}
          </div>

          {/* Textarea Input without sample button */}
          <div className="relative">
            <textarea
              autoFocus
              rows={6}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste booking details from WhatsApp, SMS, email, or any message..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#FF9800] focus:ring-2 focus:ring-[#FF9800]/20"
            />
          </div>

          {/* Extracted Details Live Card */}
          {parsed && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <span className="text-xs font-extrabold text-slate-900">
                    Detected Trip Details
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {parsed.tripType === 'PACKAGE' ? 'Rental Package' : 'Regular Ride'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                {/* Customer Phone */}
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Phone</span>
                    <span className="font-extrabold text-slate-900">
                      {parsed.customerPhone ? (
                        `+91 ${parsed.customerPhone}`
                      ) : (
                        <span className="text-rose-500 font-medium">Not detected</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Vehicle Category */}
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Vehicle</span>
                    <span className="font-extrabold text-slate-900">
                      {parsed.vehicleCategory}
                    </span>
                  </div>
                </div>

                {/* Pickup */}
                <div className="rounded-lg border border-slate-200 p-2.5 sm:col-span-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Pickup</span>
                    <span className="font-bold text-slate-900 break-words">
                      {parsed.pickupLocation || <span className="text-slate-400 italic">Not detected</span>}
                    </span>
                  </div>
                </div>

                {/* Drop / Package */}
                <div className="rounded-lg border border-slate-200 p-2.5 sm:col-span-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      {parsed.isPackage ? 'Package Details' : 'Destination'}
                    </span>
                    <span className="font-bold text-slate-900 break-words">
                      {parsed.isPackage ? (
                        parsed.packageHours || parsed.packageKms ? (
                          `Package (${parsed.packageHours || '0'}h / ${parsed.packageKms || '0'}km)`
                        ) : (
                          'Rental Package'
                        )
                      ) : (
                        parsed.dropLocation || <span className="text-slate-400 italic">Not detected</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Fare */}
                {parsed.estimatedFare && (
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Estimated Fare</span>
                      <span className="font-extrabold text-slate-900 text-sm">
                        ₹{parsed.estimatedFare}
                      </span>
                    </div>
                  </div>
                )}

                {/* Schedule if any */}
                {(parsed.date || parsed.time) && (
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Schedule</span>
                      <span className="font-bold text-slate-800">
                        {parsed.date} {parsed.time}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: ONLY Review in Form */}
        <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-200 bg-white px-4 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          {/* Standout Primary Action: Review in Form */}
          <button
            type="button"
            disabled={!parsed}
            onClick={handleApply}
            className={`min-h-[44px] flex-1 rounded-lg px-4 text-center text-xs font-bold transition ${
              parsed
                ? 'bg-[#FF9800] text-white hover:bg-[#e68900] active:bg-[#cc7a00]'
                : 'cursor-not-allowed bg-slate-100 text-slate-400'
            }`}
          >
            <span>Review in Form</span>
          </button>
        </div>
      </div>
    </div>
  );
};
