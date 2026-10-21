import React, { useState } from 'react';
import { MessageCircle, MessageSquare, Copy, Check, Share2 } from 'lucide-react';
import {
  buildOtpMessage,
  getWhatsAppOtpUrl,
  getSmsOtpUrl,
  copyOtpMessageToClipboard,
} from '../services/otpMessaging';

interface CustomerOtpSenderProps {
  otp: string;
  customerPhone?: string;
  customerName?: string;
  compact?: boolean;
  className?: string;
}

export const CustomerOtpSender: React.FC<CustomerOtpSenderProps> = ({
  otp,
  customerPhone,
  customerName,
  compact = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  if (!otp || !otp.trim()) return null;

  const handleCopy = async () => {
    const success = await copyOtpMessageToClipboard(otp);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const whatsappUrl = getWhatsAppOtpUrl(otp, customerPhone);
  const smsUrl = getSmsOtpUrl(otp, customerPhone);
  const previewText = buildOtpMessage(otp);

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Send OTP via WhatsApp"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-xs cursor-pointer active:scale-95"
        >
          <MessageCircle className="w-3 h-3" />
          <span>WhatsApp</span>
        </a>
        <a
          href={smsUrl}
          title="Send OTP via SMS"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold transition shadow-xs cursor-pointer active:scale-95"
        >
          <MessageSquare className="w-3 h-3" />
          <span>SMS</span>
        </a>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy OTP text"
          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] transition cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-bold text-emerald-950">
          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Send Customer OTP</span>
          {customerPhone ? (
            <span className="font-mono text-[11px] text-emerald-700 font-medium">
              ({customerPhone})
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 font-normal">
              (Enter mobile number above for direct send)
            </span>
          )}
        </div>
        <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 border border-emerald-300">
          OTP: {otp}
        </span>
      </div>

      {/* Action Buttons: WhatsApp and SMS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-3 text-center text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 cursor-pointer sm:min-h-0 sm:py-2"
        >
          <MessageCircle className="w-4 h-4 shrink-0" />
          <span>Send WhatsApp</span>
        </a>

        <a
          href={smsUrl}
          className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-3 text-center text-xs font-bold text-white shadow-xs transition hover:bg-sky-700 active:scale-95 cursor-pointer sm:min-h-0 sm:py-2"
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>Send SMS</span>
        </a>

        <button
          type="button"
          onClick={handleCopy}
          className="col-span-2 inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-100 active:scale-95 cursor-pointer sm:col-span-1 sm:min-h-0 sm:py-2"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copy Message</span>
            </>
          )}
        </button>
      </div>

      {/* Live Message Preview */}
      <div className="mt-1.5 p-2.5 rounded-lg bg-white border border-emerald-200/90 shadow-2xs">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Message Format Preview:
        </div>
        <div className="font-mono text-[11px] text-slate-800 whitespace-pre-line leading-relaxed select-all">
          {previewText}
        </div>
      </div>
    </div>
  );
};
