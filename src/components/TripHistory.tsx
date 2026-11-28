import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { FirestoreTrip, FirestoreDriver, TripStatus } from '../types';
import { formatPhoneNumberForWhatsApp } from '../services/otpMessaging';
import {
  Download,
  MapPin,
  User,
  Car,
  CheckCircle2,
  KeyRound,
  Trash2,
  Zap,
  Eye,
  TrendingUp,
  Printer,
  RotateCcw,
  CalendarRange,
  ArrowRight,
  Check,
  FileSpreadsheet,
  BadgePercent,
  Receipt,
  X,
  Send,
  AlertCircle,
  Loader2,
  ChevronDown,
  ShieldCheck,
  MoreVertical,
  Share2,
} from 'lucide-react';

interface TripHistoryProps {
  trips: FirestoreTrip[];
  drivers?: FirestoreDriver[];
  onDeleteTrip: (tripDocId: string) => Promise<void>;
  globalSearchQuery: string;
  onOpenTrackingModal?: (trip: FirestoreTrip) => void;
  onOpenEditTrip?: (trip: FirestoreTrip) => void;
  onSetDriverOfficeDue?: (
    driverId: string,
    amount: number,
    note?: string,
    officeUpiId?: string
  ) => Promise<void>;
  onClearDriverOfficeDue?: (driverId: string) => Promise<void>;
  onClearLocalTripStorage?: (clearLocalViewOnly?: boolean) => void;
  isFirebaseConnected?: boolean;
}

const getTripFare = (trip: FirestoreTrip): number =>
  trip.status === 'COMPLETED' ? trip.final_fare ?? 0 : trip.final_fare ?? trip.estimated_fare ?? 0;

const getTripDistance = (trip: FirestoreTrip): number | null =>
  trip.distance_km !== undefined && trip.distance_km !== null ? trip.distance_km : null;

const getLocationText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';

  const location = value as Record<string, unknown>;
  for (const key of ['formatted_address', 'address', 'name', 'description', 'text', 'location']) {
    const text = getLocationText(location[key]);
    if (text) return text;
  }
  return '';
};

const getTripPickupLocation = (trip: FirestoreTrip): string =>
  trip.status === 'COMPLETED'
    ? getLocationText(trip.actual_start_location) || trip.pickup_location
    : trip.pickup_location;

const getTripDropLocation = (trip: FirestoreTrip): string =>
  trip.status === 'COMPLETED'
    ? getLocationText(trip.actual_end_location) || trip.drop_location
    : trip.drop_location;

type FareBreakdownItem = { label: string; amount: number | string; detail: string };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const parseFareBreakdown = (value: unknown): FareBreakdownItem[] => {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : [];
    return items.filter(isRecord).map((item: Record<string, unknown>): FareBreakdownItem => ({
      label: typeof item.label === 'string' && item.label.trim() ? item.label : 'Adjustment',
      detail: typeof item.detail === 'string' ? item.detail : '',
      amount: typeof item.amount === 'number' || typeof item.amount === 'string' ? item.amount : '',
    }));
  } catch {
    return [];
  }
};
const formatIST = (value: number | null | undefined): string => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};
const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const formatAmount = (value: unknown): string => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : '—';
};
const getValidWhatsAppPhone = (phone?: string): string => {
  let normalized = formatPhoneNumberForWhatsApp(phone).replace(/\D/g, '');
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  while (normalized.startsWith('9191') && normalized.length > 12) normalized = normalized.slice(2);
  if (normalized.length === 10) normalized = `91${normalized}`;
  return /^91[6-9]\d{9}$/.test(normalized) ? normalized : '';
};

type LoadedImage = { data: string; width: number; height: number; format: 'JPEG' | 'PNG' };

const googleDriveFileId = (url: string): string | null => {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i) || url.match(/[?&]id=([^&#]+)/i);
  return match?.[1] || null;
};

const imageCandidates = (url: string): string[] => {
  const id = googleDriveFileId(url);
  if (!id) return [url];
  return [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640`,
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w640`,
  ];
};

const loadImageData = async (url?: string): Promise<LoadedImage | null> => {
  if (!url) return null;
  const failures: string[] = [];
  for (const candidate of imageCandidates(url)) {
    try {
      const response = await fetch(candidate, { mode: 'cors' });
      if (!response.ok) {
        failures.push(`${candidate} returned HTTP ${response.status}`);
        continue;
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        failures.push(`${candidate} returned ${blob.type || 'non-image data'}`);
        continue;
      }
      const source = URL.createObjectURL(blob);
      const loaded = await new Promise<LoadedImage | null>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const maxSize = 640;
          const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) { resolve(null); return; }
          try {
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve({ data: canvas.toDataURL('image/jpeg', 0.78), width: canvas.width, height: canvas.height, format: 'JPEG' });
          } catch (error) {
            failures.push(`${candidate} could not be rasterized: ${error instanceof Error ? error.message : String(error)}`);
            resolve(null);
          }
        };
        image.onerror = () => { failures.push(`${candidate} image decode failed`); resolve(null); };
        image.src = source;
      });
      URL.revokeObjectURL(source);
      if (loaded) return loaded;
    } catch (error) {
      failures.push(`${candidate} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.error(`Trip receipt image could not be loaded from ${url}.`, failures.join(' | ') || 'No image URL was provided.');
  return null;
};

const trimLogoWhitespace = async (image: LoadedImage): Promise<LoadedImage> => {
  const source = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = image.data;
  });
  if (!source) return image;
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return image;
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    const index = (y * canvas.width + x) * 4;
    if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  if (right < left || bottom < top) return image;
  const cropped = document.createElement('canvas'); cropped.width = right - left + 1; cropped.height = bottom - top + 1;
  cropped.getContext('2d')?.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return { data: cropped.toDataURL('image/jpeg', 0.9), width: cropped.width, height: cropped.height, format: 'JPEG' };
};

const loadReceiptFont = async (pdf: jsPDF): Promise<boolean> => {
  try {
    const response = await fetch('/fonts/NotoSansTamil.ttf');
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    const base64 = btoa(binary);
    pdf.addFileToVFS('NotoSansTamil.ttf', base64);
    pdf.addFont('NotoSansTamil.ttf', 'NotoSansTamil', 'normal');
    pdf.addFont('NotoSansTamil.ttf', 'NotoSansTamil', 'bold');
    pdf.setFont('NotoSansTamil', 'normal');
    return true;
  } catch {
    return false;
  }
};

const createLegacyTripReceiptPdf = async (trip: FirestoreTrip, driver: FirestoreDriver | null, items: FareBreakdownItem[]): Promise<jsPDF> => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const hasUnicodeFont = await loadReceiptFont(pdf);
  const font = hasUnicodeFont ? 'NotoSansTamil' : 'helvetica';
  const margin = 16;
  const width = 210;
  const right = width - margin;
  const text = (value: unknown) => String(value ?? '—');
  const setFont = (style: 'normal' | 'bold' = 'normal') => pdf.setFont(font, style);
  const rounded = (x: number, y: number, w: number, h: number, fill: [number, number, number]) => { pdf.setFillColor(...fill); pdf.roundedRect(x, y, w, h, 3, 3, 'F'); };
  const divider = (y: number) => { pdf.setDrawColor(226, 232, 240); pdf.line(margin, y, right, y); };
  const writeWrapped = (value: unknown, x: number, y: number, maxWidth: number, size = 8, color: [number, number, number] = [51, 65, 85]) => {
    pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(pdf.splitTextToSize(text(value), maxWidth), x, y, { lineHeightFactor: 1.25 });
  };
  const labelValue = (label: string, value: unknown, x: number, y: number, maxWidth: number) => {
    setFont('bold'); pdf.setFontSize(7.5); pdf.setTextColor(100, 116, 139); pdf.text(label.toUpperCase(), x, y);
    setFont(); writeWrapped(value, x, y + 5, maxWidth, 9, [15, 23, 42]);
  };

  const logo = await loadImageData('/Trusty cabs logo.jpg');
  pdf.setFillColor(247, 183, 0); pdf.rect(0, 0, width, 5, 'F');
  if (logo) { try { pdf.addImage(logo.data, logo.format, margin, 12, 32, 20); } catch { /* logo is optional */ } }
  setFont('bold'); pdf.setFontSize(15); pdf.setTextColor(15, 23, 42); pdf.text('TRUSTY YELLOW CABS', right, 16, { align: 'right' });
  setFont(); pdf.setFontSize(7.5); pdf.setTextColor(71, 85, 105); pdf.text(['Coimbatore, Tamil Nadu – 641007', '+91 422-3596446', 'trustyyellowcabs@gmail.com', 'www.trustyyellowcabs.in'], right, 21, { align: 'right', lineHeightFactor: 1.35 });
  setFont('bold'); pdf.setFontSize(20); pdf.setTextColor(15, 23, 42); pdf.text('INVOICE', right, 48, { align: 'right' });
  setFont(); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139); pdf.text(`Invoice No: ${text(trip.trip_id)}`, right, 54, { align: 'right' });
  divider(61);

  rounded(margin, 68, 86, 36, [248, 250, 252]); rounded(108, 68, 86, 36, [248, 250, 252]);
  setFont('bold'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42); pdf.text('PASSENGER DETAILS', margin + 6, 76); pdf.text('TRIP TIMINGS', 114, 76);
  labelValue('Name', trip.customer_name, margin + 6, 83, 72); labelValue('Mobile', trip.customer_phone, margin + 6, 94, 72);
  labelValue('Date', formatIST(trip.created_at), 114, 83, 72); labelValue('Start / End', `${formatIST(trip.started_at)} / ${formatIST(trip.completed_at)}`, 114, 94, 72);

  setFont('bold'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42); pdf.text('JOURNEY DETAILS', margin, 116);
  pdf.setFillColor(22, 163, 74); pdf.circle(margin + 2, 126, 2, 'F'); pdf.setFillColor(220, 38, 38); pdf.circle(margin + 2, 145, 2, 'F');
  pdf.setDrawColor(203, 213, 225); pdf.setLineDashPattern([1, 1], 0); pdf.line(margin + 2, 128, margin + 2, 143); pdf.setLineDashPattern([], 0);
  labelValue('Pickup', getTripPickupLocation(trip), margin + 9, 124, 169); labelValue('Drop', getTripDropLocation(trip), margin + 9, 143, 169);

  rounded(margin, 157, 178, 25, [248, 250, 252]);
  labelValue('Vehicle Details', `${trip.vehicle_category || '—'}  |  ${trip.vehicle_number || '—'}`, margin + 6, 166, 80);
  labelValue('Total Distance', trip.distance_km == null ? '—' : `${trip.distance_km.toFixed(2)} km`, 112, 166, 58);
  labelValue('Duration', formatDuration(trip.duration_seconds), margin + 6, 177, 80);
  const isPackageTrip = trip.trip_type === 'PACKAGE' || trip.is_package;
  if (isPackageTrip) { setFont(); pdf.setFontSize(7.5); pdf.setTextColor(100, 116, 139); pdf.text(`Package: ${text(trip.package_name)}  |  Included: ${trip.included_km ?? '—'} km / ${trip.included_minutes ?? '—'} min`, 112, 178); }

  setFont('bold'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42); pdf.text('CHARGES BREAKDOWN', margin, 196); divider(200);
  let y = 207;
  items.forEach((item) => {
    setFont('bold'); pdf.setFontSize(8.5); pdf.setTextColor(51, 65, 85); pdf.text(text(item.label || 'Adjustment'), margin, y);
    if (item.detail) { setFont(); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); pdf.text(pdf.splitTextToSize(item.detail, 125), margin + 2, y + 4, { lineHeightFactor: 1.15 }); }
    setFont('bold'); pdf.setFontSize(8.5); pdf.setTextColor(51, 65, 85); pdf.text(formatAmount(item.amount), right, y, { align: 'right' });
    y += item.detail ? 10 : 7;
  });
  if (!items.length) { setFont(); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139); pdf.text('No saved fare breakdown available.', margin, y); y += 8; }
  divider(Math.min(y + 1, 248));
  rounded(110, 254, 84, 25, [248, 250, 252]); setFont(); pdf.setFontSize(8); pdf.setTextColor(71, 85, 105); pdf.text('Grand Total', 116, 263); pdf.text('Balance Payable', 116, 273);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(22, 101, 52); pdf.text(formatAmount(trip.final_fare), right - 6, 264, { align: 'right' }); pdf.setFontSize(10); pdf.text(formatAmount(trip.final_fare), right - 6, 274, { align: 'right' });
  setFont('bold'); pdf.setFontSize(8); pdf.setTextColor(15, 23, 42); pdf.text('TERMS & CONDITIONS', margin, 258); setFont(); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); pdf.text(['This receipt reflects the saved completed-trip fare.', 'Please retain this invoice for your records.'], margin, 265, { lineHeightFactor: 1.5 });
  setFont(); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139); pdf.text('Thank you for choosing Trusty Yellow Cabs.', margin, 288);

  pdf.addPage(); pdf.setFillColor(247, 183, 0); pdf.rect(0, 0, width, 5, 'F');
  setFont('bold'); pdf.setFontSize(17); pdf.setTextColor(15, 23, 42); pdf.text('TRUSTY YELLOW CABS', margin, 24); setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text('Trusted & Verified Service', margin, 31); pdf.setFontSize(8); pdf.text('Driver Profile – Passenger Safety Board', margin, 38);
  const photo = await loadImageData(driver?.photo_url);
  const photoX = margin; const photoY = 52; const photoBox = 53;
  rounded(photoX, photoY, photoBox, photoBox, [248, 250, 252]);
  if (photo) {
    try {
      const scale = Math.min((photoBox - 6) / photo.width, (photoBox - 6) / photo.height);
      const imageWidth = photo.width * scale; const imageHeight = photo.height * scale;
      pdf.addImage(photo.data, photo.format, photoX + (photoBox - imageWidth) / 2, photoY + (photoBox - imageHeight) / 2, imageWidth, imageHeight);
    } catch { /* failed image embedding is omitted safely */ }
  }
  setFont('bold'); pdf.setFontSize(16); pdf.setTextColor(15, 23, 42); pdf.text(driver?.driver_name || trip.driver_name || 'Unassigned', 82, 68); setFont(); pdf.setFontSize(10); pdf.setTextColor(71, 85, 105); pdf.text(`Vehicle Category: ${trip.vehicle_category || driver?.vehicle_category || '—'}`, 82, 78); pdf.text(`Registration Number: ${trip.vehicle_number || driver?.vehicle_number || '—'}`, 82, 87); pdf.text(`Driver ID: ${trip.driver_id || driver?.driver_id || '—'}`, 82, 96);
  rounded(margin, 123, 178, 69, [248, 250, 252]); setFont('bold'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42); pdf.text('OFFICIAL COMPANY INFORMATION', margin + 8, 135); setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text(['Trusty Yellow Cabs', 'Coimbatore, Tamil Nadu – 641007', '+91 422-3596446', 'trustyyellowcabs@gmail.com', 'www.trustyyellowcabs.in'], margin + 8, 146, { lineHeightFactor: 1.7 });
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(22, 101, 52); pdf.text('Your safety is our priority.', margin, 226); setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text(['Every Trusty Yellow Cabs driver is verified for your comfort and safety.', 'Thank you for travelling with us.'], margin, 237, { lineHeightFactor: 1.7 });
  setFont(); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184); pdf.text('Trusty Yellow Cabs  |  Trusted & Verified Service', margin, 280); pdf.text('Thank you for choosing Trusty Yellow Cabs.', margin, 288);
  return pdf;
};

const createTripReceiptPdf = async (trip: FirestoreTrip, driver: FirestoreDriver | null, items: FareBreakdownItem[]): Promise<jsPDF> => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const hasUnicodeFont = await loadReceiptFont(pdf);
  const font = hasUnicodeFont ? 'NotoSansTamil' : 'helvetica';
  const margin = 12;
  const right = 198;
  const setFont = (style: 'normal' | 'bold' = 'normal') => pdf.setFont(font, style);
  const divider = (y: number) => { pdf.setDrawColor(226, 232, 240); pdf.line(margin, y, right, y); };
  const box = (x: number, y: number, w: number, h: number, fill: [number, number, number], border = false) => { pdf.setFillColor(...fill); pdf.setDrawColor(203, 213, 225); pdf.roundedRect(x, y, w, h, 3, 3, border ? 'FD' : 'F'); };
  const value = (input: unknown) => String(input ?? 'N/A');
  const wrapped = (input: unknown, x: number, y: number, maxWidth: number, size = 8) => { pdf.setFontSize(size); pdf.text(pdf.splitTextToSize(value(input), maxWidth), x, y, { lineHeightFactor: 1.2 }); };
  const label = (name: string, input: unknown, x: number, y: number, maxWidth: number) => { setFont('bold'); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text(name.toUpperCase(), x, y); setFont(); pdf.setTextColor(15, 23, 42); wrapped(input, x, y + 6, maxWidth, 10.5); };

  const logo = await loadImageData('/Trusty cabs logo.jpg');
  if (logo) { try { const trimmedLogo = await trimLogoWhitespace(logo); const logoScale = Math.min(28 / trimmedLogo.width, 28 / trimmedLogo.height); const logoWidth = trimmedLogo.width * logoScale; const logoHeight = trimmedLogo.height * logoScale; pdf.addImage(trimmedLogo.data, trimmedLogo.format, margin, 14, logoWidth, logoHeight); } catch { /* optional logo */ } }
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(17, 24, 39); pdf.text('TRUSTY YELLOW CAB', right, 16, { align: 'right' });
  setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text(['COIMBATORE, TAMILNADU - 641007', '+91 422-3596446', 'trustyyellowcabs@gmail.com', 'www.trustyyellowcabs.in'], right, 21, { align: 'right', lineHeightFactor: 1.25 });
  setFont('bold'); pdf.setFontSize(28); pdf.setTextColor(17, 24, 39); pdf.text('INVOICE', margin, 53); setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text(`Invoice No: ${value(trip.trip_id)}`, margin, 60); pdf.text(`Date: ${formatIST(trip.created_at)}`, right, 48, { align: 'right' }); divider(69);

  setFont('bold'); pdf.setFontSize(9); pdf.setTextColor(17, 24, 39); pdf.text('PASSENGER DETAILS', margin, 76); pdf.text('TRIP TIMINGS', right, 76, { align: 'right' }); setFont('bold'); pdf.setFontSize(12); pdf.text('Valued Customer', margin, 84); setFont(); pdf.setFontSize(10.5); pdf.text(`Mobile: ${value(trip.customer_phone)}`, margin, 91); pdf.text(`Start: ${formatIST(trip.started_at)}`, right, 84, { align: 'right' }); pdf.text(`End: ${formatIST(trip.completed_at)}`, right, 91, { align: 'right' }); divider(96);

  setFont('bold'); pdf.setFontSize(9); pdf.text('TRIP ROUTE ADDRESSES', margin, 105); pdf.setFillColor(5, 150, 105); pdf.circle(margin + 4, 112, 1.5, 'F'); pdf.setFillColor(220, 38, 38); pdf.circle(margin + 4, 128, 1.5, 'F'); pdf.setDrawColor(71, 85, 105); pdf.setLineDashPattern([0.8, 1.1], 0); pdf.line(margin + 4, 114, margin + 4, 126); pdf.setLineDashPattern([], 0); label('Pickup Point', getTripPickupLocation(trip), margin + 11, 110, 171); label('Dropoff Point', getTripDropLocation(trip), margin + 11, 126, 171); divider(146);

  box(margin, 151, 186, 25, [246, 247, 249]); setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(17, 24, 39); pdf.text('VEHICLE DETAILS', margin + 6, 159); pdf.setFontSize(9); pdf.text('TOTAL DISTANCE', right - 6, 159, { align: 'right' }); setFont(); pdf.setFontSize(10.5); pdf.text(`Vehicle: ${value(trip.vehicle_category)}`, margin + 6, 166); pdf.text(`Reg No: ${value(trip.vehicle_number)}`, margin + 6, 171); pdf.setFontSize(19); pdf.setFont(font, 'bold'); pdf.text(trip.distance_km == null ? 'N/A' : `${trip.distance_km.toFixed(2)} KM`, right - 6, 166, { align: 'right' }); setFont(); pdf.setFontSize(10.5); pdf.text(`Duration: ${formatDuration(trip.duration_seconds)}`, right - 6, 171, { align: 'right' });
  const isPackageTrip = trip.trip_type === 'PACKAGE' || trip.is_package;
  if (isPackageTrip) { setFont(); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139); pdf.text(`Package: ${value(trip.package_name)} | ${trip.included_km ?? 'N/A'} km / ${trip.included_minutes ?? 'N/A'} min`, right - 6, 174, { align: 'right' }); }

  setFont('bold'); pdf.setFontSize(9); pdf.setTextColor(17, 24, 39); pdf.text('CHARGES BREAKDOWN', margin, 188); divider(192); let y = 200; items.forEach((item) => { setFont(); pdf.setFontSize(11); pdf.setTextColor(17, 24, 39); pdf.text(pdf.splitTextToSize(item.detail ? `${item.label} (${item.detail})` : item.label, 150), margin, y, { lineHeightFactor: 1.1 }); setFont('bold'); pdf.setFontSize(11); pdf.text(formatAmount(item.amount), right, y, { align: 'right' }); y += 7; }); if (!items.length) { setFont(); pdf.setFontSize(11); pdf.text('No saved fare breakdown available.', margin, y); }
  setFont('bold'); pdf.setFontSize(8); pdf.setTextColor(17, 24, 39); pdf.text('Terms & Conditions', margin, 226); setFont(); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139); pdf.text(['The fare is based on travel distance and waiting time. Toll, parking and', 'permit charges may apply. Terms apply.', 'Fare includes additional charges for pickup or drop outside city limits.'], margin, 232, { lineHeightFactor: 1.5 });
  box(110, 218, 88, 34, [246, 247, 249], true); setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(17, 24, 39); pdf.text('GRAND TOTAL', 116, 231); setFont('bold'); pdf.setFontSize(17); pdf.text(formatAmount(trip.final_fare), 192, 231, { align: 'right' }); pdf.setDrawColor(226, 232, 240); pdf.line(116, 235, 192, 235); setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(37, 99, 235); pdf.text('Balance Payable', 116, 246); pdf.setFontSize(17); pdf.text(formatAmount(trip.final_fare), 192, 246, { align: 'right' }); divider(266); setFont('bold'); pdf.setFontSize(9); pdf.setTextColor(17, 24, 39); pdf.text('THANK YOU FOR TRAVELLING WITH US', 105, 274, { align: 'center' }); setFont(); pdf.setFontSize(9); pdf.setTextColor(71, 85, 105); pdf.text('This is a computer-generated invoice. No physical signature is required.', 105, 281, { align: 'center' });

  pdf.addPage(); setFont('bold'); pdf.setFontSize(15); pdf.setTextColor(17, 24, 39); pdf.text('Trusty Yellow Cabs Trusted & Verified Service', 11.5, 16); setFont(); pdf.setFontSize(10.5); pdf.text('Driver Profile - Passenger Safety Board', 11.5, 22.5); pdf.setDrawColor(209, 213, 219); pdf.line(11.5, 34.5, 198.5, 34.5); setFont('bold'); pdf.setFontSize(8.5); pdf.text('DRIVER PROFILE', 11.5, 44);
  const photo = await loadImageData(driver?.photo_url); const photoX = 11.5; const photoY = 55; const photoWidth = 50; const photoHeight = 58; box(photoX, photoY, photoWidth, photoHeight, [255, 255, 255], true); if (photo) { try { const scale = Math.min((photoWidth - 2) / photo.width, (photoHeight - 2) / photo.height); const imageWidth = photo.width * scale; const imageHeight = photo.height * scale; pdf.addImage(photo.data, photo.format, photoX + (photoWidth - imageWidth) / 2, photoY + (photoHeight - imageHeight) / 2, imageWidth, imageHeight); } catch { /* failed image omitted */ } }
  const profileX = 69; setFont('bold'); pdf.setFontSize(8.5); pdf.setTextColor(17, 24, 39); pdf.text('DRIVER NAME:', profileX, 60); setFont('bold'); pdf.setFontSize(11.5); pdf.text(driver?.driver_name || trip.driver_name || 'Unassigned', profileX, 66); setFont('bold'); pdf.setFontSize(8.5); pdf.text('VEHICLE MODEL & CATEGORY:', profileX, 77); setFont('bold'); pdf.setFontSize(11.5); pdf.text(value(trip.vehicle_category || driver?.vehicle_category), profileX, 83); setFont('bold'); pdf.setFontSize(8.5); pdf.text('VEHICLE REGISTRATION NO:', profileX, 93); setFont('bold'); pdf.setFontSize(11.5); pdf.text(value(trip.vehicle_number || driver?.vehicle_number), profileX, 99);
  pdf.setDrawColor(209, 213, 219); pdf.line(11.5, 117, 198.5, 117); setFont('bold'); pdf.setFontSize(8.5); pdf.setTextColor(17, 24, 39); pdf.text('TRUSTY YELLOW CAB • OFFICIAL DETAILS', 11.5, 128); box(11.5, 137, 187, 66, [241, 242, 244], true); setFont('bold'); pdf.setFontSize(8.5); pdf.setTextColor(17, 24, 39); pdf.text('OFFICIAL TRANSPORT OPERATOR:', 19.5, 148); setFont('bold'); pdf.setFontSize(11); pdf.text('TRUSTY YELLOW CAB SERVICE (COIMBATORE)', 19.5, 154); setFont('bold'); pdf.setFontSize(8.5); pdf.text('REGISTERED ADDRESS:', 19.5, 164); setFont(); pdf.setFontSize(10.5); pdf.text('COIMBATORE, TAMILNADU, INDIA - 641007', 19.5, 170); setFont('bold'); pdf.setFontSize(8.5); pdf.text('CONTACT CHANNELS:', 19.5, 180); setFont(); pdf.setFontSize(10.5); pdf.text('Phone: +91 422-3596446  |  Email: trustyyellowcabs@gmail.com', 19.5, 186); pdf.text('Support website: www.trustyyellowcabs.in', 19.5, 192);
  pdf.setDrawColor(209, 213, 219); pdf.line(11.5, 265, 198.5, 265); setFont('bold'); pdf.setFontSize(9.5); pdf.setTextColor(17, 24, 39); pdf.text('TRUSTY YELLOW CAB - WE CARE FOR YOUR SAFETY', 105, 273, { align: 'center' }); setFont(); pdf.setFontSize(8); pdf.setTextColor(71, 85, 105); pdf.text('Page 2 of 2 • Computer-generated verification of the driver’s identity and registration.', 105, 279, { align: 'center' }); return pdf;
};

type DateFilterPreset = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

const TRIPS_PER_PAGE = 25;
const LOCAL_STORAGE_KEY = 'trusty_cab_trips_local_v1';

const PAYMENT_NOTE_PRESETS = [
  'Trip CC (Convenience Charge)',
  'Driver Registration Fee',
  'Driver Renewal Fee',
  'Office Weekly Dispatch Fee',
  'CUSTOM',
];

export const TripHistory: React.FC<TripHistoryProps> = ({
  trips,
  drivers = [],
  onDeleteTrip,
  globalSearchQuery,
  onOpenTrackingModal,
  onOpenEditTrip,
  onSetDriverOfficeDue,
  onClearDriverOfficeDue,
  onClearLocalTripStorage,
  isFirebaseConnected = false,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [tripToDelete, setTripToDelete] = useState<FirestoreTrip | null>(null);
  const [openTripMenuId, setOpenTripMenuId] = useState<string | null>(null);
  const [expandedCompletedTripId, setExpandedCompletedTripId] = useState<string | null>(null);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ tripId: string; type: 'success' | 'error'; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Clear Local Storage states (Only removes browser cache - ZERO backend deletions)
  const [isClearStorageModalOpen, setIsClearStorageModalOpen] = useState<boolean>(false);
  const [storageCleanNotification, setStorageCleanNotification] = useState<string | null>(null);

  // Driver Office Due Management state (links trip to its assigned driver only)
  const [feeTrip, setFeeTrip] = useState<FirestoreTrip | null>(null);
  const [feeStep, setFeeStep] = useState<1 | 2 | 3>(1);
  const [feeAmount, setFeeAmount] = useState<string>('');
  const [feeNotePreset, setFeeNotePreset] = useState<string>('Trip CC (Convenience Charge)');
  const [customFeeNote, setCustomFeeNote] = useState<string>('');
  // Office UPI ID is blank always by default; populated only if user chooses default ID
  const [feeOfficeUpi, setFeeOfficeUpi] = useState<string>('');
  const [isSavingFee, setIsSavingFee] = useState<boolean>(false);
  const [feeFeedback, setFeeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Date Filtering State: Day, Week, Month, Custom Date Range
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState<string>('');
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState<string>('');
  
  // Grid-only view and pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [localStorageCount, setLocalStorageCount] = useState<number>(0);

  const handleConfirmClearLocalStorage = (clearViewToo: boolean) => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('trusty_cab_trips_local_v1');
    } catch (err) {
      console.warn('Could not remove trips from localStorage', err);
    }
    setLocalStorageCount(0);
    onClearLocalTripStorage?.(clearViewToo);
    setIsClearStorageModalOpen(false);

    if (clearViewToo) {
      setStorageCleanNotification(
        'Local storage cache cleared & ledger screen reset! (Backend Firestore database records remain 100% untouched)'
      );
    } else {
      setStorageCleanNotification(
        'Trip history successfully removed from browser local storage! (Backend Firestore database records remain 100% untouched)'
      );
    }
    setTimeout(() => {
      setStorageCleanNotification(null);
    }, 6000);
  };

  // Quick stats across full ledger
  const completedTrips = useMemo(() => trips.filter((t) => t.status === 'COMPLETED'), [trips]);
  const inProgressTrips = useMemo(
    () => trips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED'),
    [trips]
  );
  const cancelledTrips = useMemo(() => trips.filter((t) => t.status === 'CANCELLED'), [trips]);
  
  const totalRevenue = useMemo(() => {
    return completedTrips.reduce(
      (sum, t) => sum + getTripFare(t),
      0
    );
  }, [completedTrips]);

  const avgFare = completedTrips.length > 0 ? Math.round(totalRevenue / completedTrips.length) : 0;

  // Date Filter Predicate
  const matchesDateFilter = (trip: FirestoreTrip): boolean => {
    if (dateFilter === 'ALL') return true;

    const tripTime = trip.completed_at || trip.created_at || 0;
    if (!tripTime) return true;

    const tripDate = new Date(tripTime);
    const now = new Date();

    if (dateFilter === 'TODAY') {
      return (
        tripDate.getDate() === now.getDate() &&
        tripDate.getMonth() === now.getMonth() &&
        tripDate.getFullYear() === now.getFullYear()
      );
    }

    if (dateFilter === 'WEEK') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setHours(0, 0, 0, 0);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return tripTime >= sevenDaysAgo.getTime();
    }

    if (dateFilter === 'MONTH') {
      return (
        tripDate.getMonth() === now.getMonth() &&
        tripDate.getFullYear() === now.getFullYear()
      );
    }

    if (dateFilter === 'CUSTOM') {
      if (!appliedCustomStartDate || !appliedCustomEndDate) return true;

      if (appliedCustomStartDate) {
        const start = new Date(appliedCustomStartDate);
        start.setHours(0, 0, 0, 0);
        if (tripTime < start.getTime()) return false;
      }
      if (appliedCustomEndDate) {
        const end = new Date(appliedCustomEndDate);
        end.setHours(23, 59, 59, 999);
        if (tripTime > end.getTime()) return false;
      }
      return true;
    }

    return true;
  };

  // Filtered trips memoized
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      // 1. Status Filter
      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;

      // 2. Date Filter
      if (!matchesDateFilter(t)) return false;

      // 3. Search Query
      const q = (searchQuery || globalSearchQuery).trim().toLowerCase();
      if (q) {
        const matchId = t.trip_id.toLowerCase().includes(q);
        const matchCustomer =
          t.customer_name.toLowerCase().includes(q) || t.customer_phone.includes(q);
        const matchDriver =
          (t.driver_name || '').toLowerCase().includes(q) ||
          (t.driver_id || '').toLowerCase().includes(q);
        const matchVehicle = (t.vehicle_number || '').toLowerCase().includes(q);
        const matchPickup =
          getTripPickupLocation(t).toLowerCase().includes(q) || getTripDropLocation(t).toLowerCase().includes(q);
        if (!matchId && !matchCustomer && !matchDriver && !matchVehicle && !matchPickup) {
          return false;
        }
      }
      return true;
    });
  }, [
    trips,
    selectedStatus,
    dateFilter,
    appliedCustomStartDate,
    appliedCustomEndDate,
    searchQuery,
    globalSearchQuery,
  ]);

  const customDateError = useMemo(() => {
    if (dateFilter !== 'CUSTOM' || (!customStartDate && !customEndDate)) return null;
    if (!customStartDate || !customEndDate) return 'Select both dates to apply the custom range.';

    const start = new Date(`${customStartDate}T00:00:00`);
    const end = new Date(`${customEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return 'Choose a valid date range.';
    }
    return null;
  }, [dateFilter, customStartDate, customEndDate]);

  const isCustomDateReady =
    dateFilter !== 'CUSTOM' ||
    (Boolean(customStartDate) && Boolean(customEndDate) && !customDateError);
  const visibleFilteredTrips = isCustomDateReady ? filteredTrips : [];

  // Pagination calculation
  const totalPages = Math.ceil(visibleFilteredTrips.length / TRIPS_PER_PAGE) || 1;
  const paginatedTrips = useMemo(() => {
    const page = Math.min(currentPage, totalPages);
    return visibleFilteredTrips.slice((page - 1) * TRIPS_PER_PAGE, page * TRIPS_PER_PAGE);
  }, [visibleFilteredTrips, currentPage, totalPages]);

  // Reset page on filters change
  const handleDatePresetChange = (preset: DateFilterPreset) => {
    setDateFilter(preset);
    if (preset !== 'CUSTOM') {
      setAppliedCustomStartDate('');
      setAppliedCustomEndDate('');
    } else if (!customDateError && customStartDate && customEndDate) {
      setAppliedCustomStartDate(customStartDate);
      setAppliedCustomEndDate(customEndDate);
    } else {
      setCustomStartDate('');
      setCustomEndDate('');
      setAppliedCustomStartDate('');
      setAppliedCustomEndDate('');
    }
    setCurrentPage(1);
  };

  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    const nextStart = field === 'start' ? value : customStartDate;
    const nextEnd = field === 'end' ? value : customEndDate;
    setCustomStartDate(nextStart);
    setCustomEndDate(nextEnd);
    setCurrentPage(1);

    const start = new Date(`${nextStart}T00:00:00`);
    const end = new Date(`${nextEnd}T00:00:00`);
    if (nextStart && nextEnd && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      setAppliedCustomStartDate(nextStart);
      setAppliedCustomEndDate(nextEnd);
    }
  };

  const clearCustomDateRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setAppliedCustomStartDate('');
    setAppliedCustomEndDate('');
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (st: string) => {
    setSelectedStatus(st);
    setCurrentPage(1);
  };

  // Find driver associated with this specific trip record
  const getDriverForTrip = (t: FirestoreTrip): FirestoreDriver | null => {
    if (!drivers || drivers.length === 0) return null;
    const cleanDriverId = (t.driver_id || '').trim().toUpperCase();
    const cleanVeh = (t.vehicle_number || '').trim().toUpperCase().replace(/\s+/g, '');
    return (
      drivers.find(
        (d) =>
          (cleanDriverId && (d.driver_id.trim().toUpperCase() === cleanDriverId || d.doc_id === t.driver_id)) ||
          (cleanVeh && d.vehicle_number.trim().toUpperCase().replace(/\s+/g, '') === cleanVeh)
      ) || null
    );
  };

  const getReceiptDriver = (t: FirestoreTrip): FirestoreDriver | null => {
    const cleanDriverId = (t.driver_id || '').trim().toUpperCase();
    if (!cleanDriverId) return null;
    return drivers.find((d) => d.driver_id.trim().toUpperCase() === cleanDriverId || d.doc_id === t.driver_id) || null;
  };

  const prepareReceiptFile = async (t: FirestoreTrip): Promise<{ blob: Blob; file: File; filename: string }> => {
    const pdf = await createTripReceiptPdf(t, getReceiptDriver(t), parseFareBreakdown(t.finalized_fare_breakdown));
    const blob = pdf.output('blob');
    const filename = `trip_receipt_${(t.trip_id || 'trip').replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
    return { blob, file: new File([blob], filename, { type: 'application/pdf' }), filename };
  };

  const downloadReceiptFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadReceipt = async (t: FirestoreTrip) => {
    if (t.status !== 'COMPLETED') return;
    const tripKey = t.doc_id || t.trip_id;
    setSharingTripId(tripKey);
    setShareFeedback(null);
    try {
      const { blob, filename } = await prepareReceiptFile(t);
      downloadReceiptFile(blob, filename);
      setShareFeedback({ tripId: tripKey, type: 'success', message: 'PDF downloaded successfully.' });
    } catch (error) {
      console.error('Failed to download trip receipt:', error);
      setShareFeedback({ tripId: tripKey, type: 'error', message: 'Could not generate the receipt PDF.' });
    } finally {
      setSharingTripId(null);
    }
  };

  const handleShareReceipt = async (t: FirestoreTrip) => {
    if (t.status !== 'COMPLETED') return;
    const tripKey = t.doc_id || t.trip_id;
    const whatsappWindow = window.open('', '_blank');
    setSharingTripId(tripKey);
    setShareFeedback(null);
    try {
      const { blob, file, filename } = await prepareReceiptFile(t);
      const phone = getValidWhatsAppPhone(t.customer_phone);
      const message = `Hello ${t.customer_name || 'Customer'}, your Trusty Yellow Cabs receipt for trip ${t.trip_id} is ready.`;
      const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: `Trip receipt ${t.trip_id}`, text: message, files: [file] });
          whatsappWindow?.close();
          setShareFeedback({ tripId: tripKey, type: 'success', message: 'PDF ready to share.' });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') { whatsappWindow?.close(); return; }
        }
      }

      downloadReceiptFile(blob, filename);
      if (whatsappUrl) {
        if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
        else window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        setShareFeedback({ tripId: tripKey, type: 'success', message: 'PDF downloaded. WhatsApp opened for manual attachment.' });
      } else {
        whatsappWindow?.close();
        setShareFeedback({ tripId: tripKey, type: 'error', message: 'PDF downloaded. Customer mobile number is unavailable.' });
      }
    } catch (error) {
      whatsappWindow?.close();
      console.error('Failed to create trip receipt:', error);
      setShareFeedback({ tripId: tripKey, type: 'error', message: 'Could not generate the receipt PDF.' });
    } finally {
      setSharingTripId(null);
    }
  };

  const handleOpenDriverFeeModal = (t: FirestoreTrip) => {
    setFeeTrip(t);
    setFeeStep(1);
    setFeeFeedback(null);
    const drv = getDriverForTrip(t);
    if (drv) {
      setFeeAmount('');
      // Office UPI ID is set blank always by default; user can choose default ID if desired
      setFeeOfficeUpi('');
      if (drv.payment_note) {
        if (PAYMENT_NOTE_PRESETS.includes(drv.payment_note)) {
          setFeeNotePreset(drv.payment_note);
          setCustomFeeNote('');
        } else {
          setFeeNotePreset('CUSTOM');
          setCustomFeeNote(drv.payment_note);
        }
      } else {
        setFeeNotePreset('Trip CC (Convenience Charge)');
        setCustomFeeNote('');
      }
    } else {
      setFeeAmount('');
      setFeeOfficeUpi('');
      setFeeNotePreset('Trip CC (Convenience Charge)');
      setCustomFeeNote('');
    }
  };

  const handleSaveDriverFee = async () => {
    if (!feeTrip || !onSetDriverOfficeDue) return;
    const drv = getDriverForTrip(feeTrip);
    const targetDriverId = drv?.driver_id || feeTrip.driver_id;
    if (!targetDriverId) {
      setFeeFeedback({ type: 'error', message: 'No driver ID found for this trip record.' });
      return;
    }

    const numAmount = Math.max(0, Number(feeAmount) || 0);
    const note = feeNotePreset === 'CUSTOM' ? (customFeeNote.trim() || 'Trip CC (Convenience Charge)') : feeNotePreset;

    setIsSavingFee(true);
    setFeeFeedback(null);
    try {
      await onSetDriverOfficeDue(targetDriverId, numAmount, note, feeOfficeUpi);
      setFeeFeedback({
        type: 'success',
        message: numAmount > 0 
          ? `Updated driver ${drv?.driver_name || targetDriverId}: ₹${numAmount} due ("${note}")`
          : `Driver dues cleared to ₹0 (Verified)`,
      });
      setTimeout(() => {
        setFeeTrip(null);
        setFeeFeedback(null);
        setFeeStep(1);
      }, 1300);
    } catch (err: any) {
      setFeeFeedback({ type: 'error', message: err?.message || 'Failed to update office fee.' });
    } finally {
      setIsSavingFee(false);
    }
  };

  const handleClearDriverFee = async () => {
    if (!feeTrip || !onClearDriverOfficeDue) return;
    const drv = getDriverForTrip(feeTrip);
    const targetDriverId = drv?.driver_id || feeTrip.driver_id;
    if (!targetDriverId) {
      setFeeFeedback({ type: 'error', message: 'No driver ID found for this trip record.' });
      return;
    }

    setIsSavingFee(true);
    setFeeFeedback(null);
    try {
      await onClearDriverOfficeDue(targetDriverId);
      setFeeFeedback({
        type: 'success',
        message: `Driver ${drv?.driver_name || targetDriverId} dues marked CLEARED & VERIFIED (₹0).`,
      });
      setTimeout(() => {
        setFeeTrip(null);
        setFeeFeedback(null);
        setFeeStep(1);
      }, 1300);
    } catch (err: any) {
      setFeeFeedback({ type: 'error', message: err?.message || 'Failed to clear office fee.' });
    } finally {
      setIsSavingFee(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const csvCell = (value: unknown): string => {
      let text = String(value ?? '');
      // Spreadsheet applications evaluate these prefixes as formulas. Prefixing
      // with an apostrophe forces imported customer data to remain plain text.
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = [
      'Trip ID',
      'Status',
      'Date & Time',
      'Customer Name',
      'Customer Phone',
      'Pickup Location',
      'Dropoff Location',
      'Driver Name',
      'Driver ID',
      'Vehicle Number',
      'Vehicle Category',
      'Estimated Fare (INR)',
      'Final Fare (INR)',
      'Distance (KM)',
      'OTP',
      'Completed At',
    ];

    const rows = filteredTrips.map((t) => [
      t.trip_id.replace(/^TRIP-?/, ''),
      t.status,
      new Date(t.created_at).toLocaleString(),
      t.customer_name,
      t.customer_phone,
      getTripPickupLocation(t),
      getTripDropLocation(t),
      t.driver_name || 'Unassigned',
      t.driver_id || '',
      t.vehicle_number || '',
      t.vehicle_category || '',
      t.estimated_fare || 0,
      getTripFare(t),
      getTripDistance(t) ?? '',
      t.otp || '',
      t.completed_at ? new Date(t.completed_at).toLocaleString() : 'N/A',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const downloadUrl = URL.createObjectURL(
      new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.setAttribute('href', downloadUrl);
    const dateLabel =
      dateFilter === 'TODAY'
        ? 'Today'
        : dateFilter === 'WEEK'
        ? 'ThisWeek'
        : dateFilter === 'MONTH'
        ? 'ThisMonth'
        : 'Ledger';
    link.setAttribute(
      'download',
      `TrustyYellowCab_Trips_${dateLabel}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const getStatusBadge = (status: string) => {
    const label = status === 'IN_PROGRESS' ? 'ON RIDE' : status.replace('_', ' ');
    const color =
      status === 'COMPLETED'
        ? 'text-emerald-700'
        : status === 'CANCELLED'
          ? 'text-rose-700'
          : status === 'OPEN'
            ? 'text-amber-800'
            : status === 'ACCEPTED'
              ? 'text-sky-700'
              : 'text-purple-700';

    return <span className={`text-[10px] font-semibold tracking-wide ${color}`}>{label}</span>;
  };

  return (
    <div className="min-w-0 space-y-3 pb-20 sm:space-y-4 sm:pb-0 min-[768px]:max-[1024px]:space-y-4 lg:space-y-5">
      {/* Toast Notification when Local Storage is Cleaned */}
      {storageCleanNotification && (
        <div className="bg-emerald-50 border border-emerald-200/90 text-emerald-950 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-xs transition animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{storageCleanNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setStorageCleanNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact Trip History header */}
      <div className="hidden flex-col gap-3 border-b border-slate-200 pb-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">Trip History</h2>

        {/* Quick Actions */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {/* Clear Local Storage Button (Only affects browser local cache, NOT backend) */}
          <button
            type="button"
            onClick={() => setIsClearStorageModalOpen(true)}
            className="min-h-10 flex-1 rounded-xl border border-rose-200/90 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 sm:flex-none"
            title="Clean local browser storage for trips (Backend database remains untouched)"
          >
            <span>Clean</span>
          </button>

          <button
            onClick={exportToCSV}
            className="min-h-10 flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 sm:flex-none"
            title="Export filtered records to CSV"
          >
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid w-full min-w-0 grid-cols-2 gap-2.5 sm:gap-3 min-[768px]:max-[1024px]:grid-cols-4 lg:grid-cols-4">
        {/* Total Ledger Fares */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Revenue
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              ₹{totalRevenue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Completed Rides */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Completed
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {completedTrips.length}
            </span>
          </div>
        </div>

        {/* Active Journeys */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              On Ride
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {inProgressTrips.length}
            </span>
          </div>
        </div>

        {/* Average Ticket Size */}
        <div className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-28 sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
              Average Fare
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-950 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              ₹{avgFare}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Filter Toolbar: Date Wise Search (Day, Week, Month, Custom) + Status Tabs */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        {/* ===================== MOBILE DEDICATED LAYOUT (< sm) ===================== */}
        <div className="sm:hidden space-y-3">
          {/* Mobile view controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-bold text-slate-900">Trips</span>
              {isCustomDateReady && (
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  ({visibleFilteredTrips.length})
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Clear Local Storage & Export CSV Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsClearStorageModalOpen(true)}
                  className="min-h-9 rounded-lg border border-rose-200/90 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                  title="Clear Local Storage (Backend safe)"
                >
                  <span>Clean</span>
                </button>

                <button
                  type="button"
                  onClick={exportToCSV}
                  className="min-h-9 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800"
                  title="Export filtered records to CSV"
                >
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Full-width Touch-friendly Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search trip, customer, phone or vehicle"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px] transition-all font-medium"
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

          {/* Date Filter Segmented Carousel */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Date Range</span>
              </span>
              {dateFilter !== 'TODAY' && (
                <button
                  type="button"
                  onClick={() => handleDatePresetChange('TODAY')}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
                >
                  Reset Date
                </button>
              )}
            </div>

            <div className="flex flex-nowrap gap-1 py-0.5">
              {[
                { id: 'TODAY', label: 'Today' },
                { id: 'WEEK', label: 'This Week' },
                { id: 'MONTH', label: 'This Month' },
                { id: 'CUSTOM', label: 'Custom' },
              ].map((preset) => {
                const isActive = dateFilter === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleDatePresetChange(preset.id as DateFilterPreset)}
                    className={`min-h-9 min-w-0 flex-1 rounded-lg px-1.5 py-1 text-[10px] font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                      isActive
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Range Picker Card (Visible if CUSTOM is selected) */}
          {dateFilter === 'CUSTOM' && (
            <div className="p-3 bg-amber-50/60 border border-amber-200/90 rounded-xl space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[38px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[38px]"
                  />
                </div>
              </div>

              {customDateError && (
                <p className="text-[11px] font-medium text-amber-800">{customDateError}</p>
              )}

              {(customStartDate || customEndDate) && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={clearCustomDateRange}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer transition active:scale-95"
                  >
                    Clear Dates
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Filter Carousel with Count Badges */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Trip Status</span>
              </span>
              {selectedStatus !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('ALL')}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
                >
                  Reset Status
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 py-0.5">
              {[
                { key: 'ALL', label: 'All Trips', dot: '' },
                { key: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-500' },
                { key: 'IN_PROGRESS', label: 'On Ride', dot: 'bg-purple-500' },
                { key: 'ACCEPTED', label: 'Accepted', dot: 'bg-sky-500' },
                { key: 'OPEN', label: 'Open', dot: 'bg-amber-500' },
                { key: 'CANCELLED', label: 'Cancelled', dot: 'bg-slate-400' },
              ].map((st) => {
                const count =
                  st.key === 'ALL'
                    ? trips.length
                    : trips.filter((t) => t.status === st.key).length;
                const isActive = selectedStatus === st.key;
                return (
                  <button
                    key={st.key}
                    onClick={() => handleStatusFilterChange(st.key)}
                    className={`flex min-h-9 w-full items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                      isActive
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="text-[11px] font-medium tabular-nums whitespace-nowrap">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset All Filters Bar (When active) */}
          {(selectedStatus !== 'ALL' || dateFilter !== 'TODAY' || searchQuery || customStartDate || customEndDate) && (
            <button
              onClick={() => {
                setSelectedStatus('ALL');
                setDateFilter('TODAY');
                setAppliedCustomStartDate('');
                setAppliedCustomEndDate('');
                setSearchQuery('');
                setCustomStartDate('');
                setCustomEndDate('');
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold text-amber-950 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 cursor-pointer transition shadow-2xs"
              title="Reset All Filters to Default"
            >
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* ===================== DESKTOP / TABLET LAYOUT (sm+) ===================== */}
        <div className="hidden sm:block space-y-4">
          {/* Date Filter Selection Row */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1 mr-1">
                <span>Date Filter:</span>
              </span>

              {(
                [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: 'This Week' },
                  { id: 'MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleDatePresetChange(preset.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    dateFilter === preset.id
                      ? 'border border-amber-400 bg-amber-400 text-slate-950'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* If Custom Date Range is selected, show date inputs */}
            {dateFilter === 'CUSTOM' && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full lg:w-auto pt-1 lg:pt-0">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                  <span className="text-slate-500 font-medium">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                  <span className="text-slate-500 font-medium">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                {customDateError && (
                  <p className="w-full text-[11px] font-medium text-amber-800">{customDateError}</p>
                )}

                {(customStartDate || customEndDate) && (
                  <button
                    onClick={clearCustomDateRange}
                    className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Status Filter Tabs & Search Bar Row */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Status Tabs with count badges */}
            <div className="flex flex-wrap items-center gap-2 pb-1 md:pb-0">
              {[
                { key: 'ALL', label: 'All Trips' },
                { key: 'COMPLETED', label: 'Completed' },
                { key: 'IN_PROGRESS', label: 'On Ride' },
                { key: 'ACCEPTED', label: 'Accepted' },
                { key: 'OPEN', label: 'Open' },
                { key: 'CANCELLED', label: 'Cancelled' },
              ].map((st) => {
                const count =
                  st.key === 'ALL'
                    ? trips.length
                    : trips.filter((t) => t.status === st.key).length;
                return (
                  <button
                    key={st.key}
                    onClick={() => handleStatusFilterChange(st.key)}
                    className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      selectedStatus === st.key
                        ? 'border border-amber-400 bg-amber-400 text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="text-[11px] font-semibold tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Box & Reset on Desktop */}
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Search trip, customer, phone or vehicle"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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

              {(selectedStatus !== 'ALL' || dateFilter !== 'TODAY' || searchQuery || customStartDate || customEndDate) && (
                <button
                  onClick={() => {
                    setSelectedStatus('ALL');
                    setDateFilter('TODAY');
                    setAppliedCustomStartDate('');
                    setAppliedCustomEndDate('');
                    setSearchQuery('');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-95 shrink-0"
                  title="Reset All Active Filters"
                >
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Trip Records Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {visibleFilteredTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center sm:py-10">
            <h4 className="text-sm font-black text-slate-900">No matching trips found</h4>
            <button
              onClick={() => {
                setSelectedStatus('ALL');
                setDateFilter('TODAY');
                setAppliedCustomStartDate('');
                setAppliedCustomEndDate('');
                setSearchQuery('');
                setCustomStartDate('');
                setCustomEndDate('');
                setCurrentPage(1);
              }}
              className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : true ? (
          /* Cards Grid View (Responsive & Touch-Friendly) */
          <div className="grid grid-cols-1 gap-4 bg-slate-50/50 p-2 sm:p-3 md:grid-cols-2">
            {paginatedTrips.map((t) => {
              const driverForTrip = getDriverForTrip(t);
              const createdAt = new Date(t.created_at);
              const tripKey = t.doc_id || t.trip_id;
              const isCompleted = t.status === 'COMPLETED';
              const fareBreakdown = parseFareBreakdown(t.finalized_fare_breakdown);
              const isPackageTrip = t.trip_type === 'PACKAGE' || t.is_package;

              return (
                <article
                  key={t.doc_id || t.trip_id}
                  className="relative flex min-h-[390px] min-w-0 flex-col rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition-shadow hover:shadow-[0_12px_30px_rgba(15,23,42,0.11)] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-[15px] font-bold text-slate-950">
                        #{t.trip_id.replace(/^TRIP-?/, '')} · {t.vehicle_category || 'Mini'}
                      </h3>
                      <p className="mt-1 text-[13px] text-slate-500">
                        {createdAt.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        · {createdAt.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">{getStatusBadge(t.status)}</div>
                  </div>

                  <div className="mt-4 min-w-0 border-t border-slate-100 pt-3">
                    <p className="break-words text-[14px] font-semibold text-slate-950">{t.customer_name}</p>
                    <a
                      href={`tel:${t.customer_phone}`}
                      className="mt-0.5 inline-block text-[13px] text-slate-700 hover:underline"
                    >
                      {t.customer_phone}
                    </a>
                  </div>

                  <dl className="mt-4 space-y-3 text-[13px]">
                    <div className="flex items-start gap-3">
                      <dt className="w-16 shrink-0 pt-0.5 font-medium text-slate-600">Pickup</dt>
                      <dd className="min-w-0 break-words leading-relaxed text-slate-800">
                        {getTripPickupLocation(t)}
                      </dd>
                    </div>
                    <div className="flex items-start gap-3">
                      <dt className="w-16 shrink-0 pt-0.5 font-medium text-slate-600">Drop</dt>
                      <dd className="min-w-0 break-words leading-relaxed text-slate-800">
                        {getTripDropLocation(t)}
                      </dd>
                    </div>
                  </dl>

                  <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-3 text-[13px]">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 font-medium text-slate-600">Fare</dt>
                      <dd className="text-right text-base font-bold text-emerald-700 tabular-nums">
                        ₹{getTripFare(t)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 font-medium text-slate-600">Distance</dt>
                      <dd className="text-right text-slate-800 tabular-nums">
                        {getTripDistance(t) !== null ? `${getTripDistance(t)!.toFixed(2)} km` : '—'}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 font-medium text-slate-600">Driver</dt>
                      <dd className="min-w-0 break-words text-right text-slate-800">
                        {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                        {(t.vehicle_number || driverForTrip?.vehicle_number) && (
                          <span className="ml-1 text-slate-500">
                            · {t.vehicle_number || driverForTrip?.vehicle_number}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {isCompleted && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => setExpandedCompletedTripId(expandedCompletedTripId === tripKey ? null : tripKey)} className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-bold text-slate-800 transition hover:bg-slate-100">
                        {expandedCompletedTripId === tripKey ? 'Hide Details' : 'View Details'}
                      </button>
                      {expandedCompletedTripId === tripKey && (
                        <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[13px] text-slate-800" aria-label="Completed trip receipt details">
                          <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                            <div><span className="font-medium text-slate-500">Trip ID</span><p className="font-semibold">{t.trip_id}</p></div>
                            <div><span className="font-medium text-slate-500">Customer</span><p className="font-semibold">{t.customer_name || '—'}</p></div>
                            <div><span className="font-medium text-slate-500">Driver / ID</span><p className="font-semibold">{t.driver_name || '—'}{t.driver_id ? ` / ${t.driver_id}` : ''}</p></div>
                            <div><span className="font-medium text-slate-500">Vehicle</span><p className="font-semibold">{t.vehicle_number || '—'} · {t.vehicle_category || '—'}</p></div>
                            <div><span className="font-medium text-slate-500">Date</span><p>{formatIST(t.created_at)}</p></div>
                            <div><span className="font-medium text-slate-500">Start / End</span><p>{formatIST(t.started_at)} / {formatIST(t.completed_at)}</p></div>
                            <div className="sm:col-span-2"><span className="font-medium text-slate-500">Pickup</span><p className="break-words">{getTripPickupLocation(t) || '—'}</p></div>
                            <div className="sm:col-span-2"><span className="font-medium text-slate-500">Drop</span><p className="break-words">{getTripDropLocation(t) || '—'}</p></div>
                            <div><span className="font-medium text-slate-500">Distance</span><p>{getTripDistance(t) === null ? '—' : `${getTripDistance(t)!.toFixed(2)} km`}</p></div>
                            <div><span className="font-medium text-slate-500">Duration</span><p>{formatDuration(t.duration_seconds)}</p></div>
                          </div>
                          <div className="mt-3 border-t border-slate-200 pt-3">
                            <h4 className="font-bold text-slate-900">Fare Breakdown</h4>
                            {isPackageTrip && <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3"><div><span className="text-slate-500">Package</span><p className="font-medium">{t.package_name || '—'}</p></div><div><span className="text-slate-500">Included KM</span><p className="font-medium">{t.included_km ?? '—'}</p></div><div><span className="text-slate-500">Included Minutes</span><p className="font-medium">{t.included_minutes ?? '—'}</p></div></div>}
                            {fareBreakdown.length > 0 ? <div className="mt-2 space-y-2">{fareBreakdown.map((item, index) => <div key={`${item.label || 'item'}-${index}`} className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0"><div className="min-w-0"><p className="font-medium text-slate-800">{item.label || 'Adjustment'}</p>{item.detail && <p className="break-words text-[12px] text-slate-500">{item.detail}</p>}</div><span className="shrink-0 font-semibold tabular-nums">{formatAmount(item.amount)}</span></div>)}</div> : <p className="mt-2 text-[12px] text-slate-500">No saved fare breakdown available.</p>}
                            <div className="mt-3 flex items-center justify-between border-t border-slate-300 pt-3 text-[15px] font-bold"><span>Total Payable</span><span className="text-emerald-700">{formatAmount(t.final_fare)}</span></div>
                          </div>
                        </section>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(t)}
                          disabled={sharingTripId === tripKey}
                          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {sharingTripId === tripKey ? 'Preparing PDF...' : 'Download PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareReceipt(t)}
                          disabled={sharingTripId === tripKey}
                          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-bold text-slate-800 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          {sharingTripId === tripKey ? 'Preparing PDF...' : 'Share PDF'}
                        </button>
                      </div>
                      {shareFeedback?.tripId === tripKey && (
                        <p className={`mt-1 text-[11px] ${shareFeedback.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {shareFeedback.message}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="relative mt-auto grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-slate-100 pt-4">
                    {(t.driver_id || driverForTrip) && onSetDriverOfficeDue && (
                      <button
                        type="button"
                        onClick={() => handleOpenDriverFeeModal(t)}
                        className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[13px] font-bold text-slate-900 transition hover:bg-slate-50"
                      >
                        Edit Office Fee
                      </button>
                    )}
                    {onOpenEditTrip && (
                      <button
                        type="button"
                        onClick={() => onOpenEditTrip(t)}
                        className="min-h-10 rounded-xl bg-slate-900 px-2 py-2 text-[13px] font-bold text-white transition hover:bg-slate-700"
                      >
                        Edit Trip
                      </button>
                    )}
                    <button type="button" onClick={() => setOpenTripMenuId(openTripMenuId === (t.doc_id || t.trip_id) ? null : (t.doc_id || t.trip_id))} className="min-h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-50" aria-label={`More actions for trip ${t.trip_id}`}><MoreVertical className="mx-auto h-4 w-4" /></button>
                    {openTripMenuId === (t.doc_id || t.trip_id) && <div className="absolute bottom-14 right-0 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" onClick={() => { setTripToDelete(t); setOpenTripMenuId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-700 hover:bg-rose-50">Delete Record</button></div>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <>
          {/* Desktop table view */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/90 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Trip ID</th>
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Journey Route</th>
                  <th className="py-3.5 px-4">Driver &amp; Cab</th>
                  <th className="py-3.5 px-4">Fare (INR)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTrips.map((t) => (
                  <tr key={t.doc_id || t.trip_id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-black text-slate-900">
                        #{t.trip_id.replace(/^TRIP-?/, '')}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {t.vehicle_category || 'Mini'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {new Date(t.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(t.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{t.customer_name}</div>
                      <a href={`tel:${t.customer_phone}`} className="text-[10px] text-amber-800 font-mono hover:underline">
                        {t.customer_phone}
                      </a>
                    </td>

                    <td className="max-w-xs px-4 py-3.5">
                      <div className="space-y-2">
                        <div>
                          <span className="block text-[10px] font-medium text-slate-500">Pickup</span>
                          <span className="mt-0.5 block break-words leading-relaxed text-slate-800">{getTripPickupLocation(t)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-medium text-slate-500">Drop</span>
                          <span className="mt-0.5 block break-words leading-relaxed text-slate-600">{getTripDropLocation(t)}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {(() => {
                        const driverForTrip = getDriverForTrip(t);
                        return (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              <span>{t.vehicle_number || driverForTrip?.vehicle_number || t.driver_id || 'No Cab'}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-black text-slate-950 text-sm font-mono">
                        ₹{getTripFare(t)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {getTripDistance(t) !== null ? `${getTripDistance(t)} km` : 'Fixed'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">{getStatusBadge(t.status)}</td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {(t.driver_id || getDriverForTrip(t)) && onSetDriverOfficeDue && (
                          <button
                            type="button"
                            onClick={() => handleOpenDriverFeeModal(t)}
                            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            title={`Edit Office Fee for driver who completed this trip (${t.driver_name || t.driver_id})`}
                          >
                            <span>Edit Office Fee</span>
                          </button>
                        )}

                        {onOpenEditTrip && (
                          <button
                            type="button"
                            onClick={() => onOpenEditTrip(t)}
                            className="min-h-9 rounded-lg bg-amber-400 px-2.5 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-amber-300"
                          >
                            Edit Trip
                          </button>
                        )}

                        {onOpenTrackingModal && (
                          <button
                            onClick={() => onOpenTrackingModal(t)}
                            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            title="Open Live Tracking & Route"
                          >
                            <span>Track</span>
                          </button>
                        )}

                        <button
                          onClick={() => setTripToDelete(t)}
                          className="min-h-9 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                          title="Delete Trip"
                        >
                          Delete Record
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Compact mobile list view */}
          <div className="divide-y divide-slate-200 bg-white md:hidden">
            {paginatedTrips.map((t) => {
              const driverForTrip = getDriverForTrip(t);
              const fare = getTripFare(t);
              const createdAt = new Date(t.created_at);

              return (
                <section key={t.doc_id || t.trip_id} className="px-3 py-4 sm:px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold text-slate-950">
                        #{t.trip_id.replace(/^TRIP-?/, '')} · {t.vehicle_category || 'Mini'}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {createdAt.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        · {createdAt.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">{getStatusBadge(t.status)}</div>
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-950">{t.customer_name}</p>
                    <a href={`tel:${t.customer_phone}`} className="mt-0.5 inline-block text-xs font-mono text-amber-800 hover:underline">
                      {t.customer_phone}
                    </a>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs">
                    <div>
                      <dt className="font-medium text-slate-500">Pickup</dt>
                      <dd className="mt-0.5 min-w-0 break-words leading-relaxed text-slate-800">{getTripPickupLocation(t)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Drop</dt>
                      <dd className="mt-0.5 min-w-0 break-words leading-relaxed text-slate-800">{getTripDropLocation(t)}</dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <dt className="text-slate-500">Fare</dt>
                      <dd className="font-semibold text-slate-950">₹{fare}</dd>
                    </div>
                    {(t.driver_name || driverForTrip || t.vehicle_number || t.driver_id) && (
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pt-1">
                        <dt className="text-slate-500">Driver</dt>
                        <dd className="min-w-0 break-words text-right text-slate-800">
                          {t.driver_name || driverForTrip?.driver_name || 'Unassigned'}
                          {(t.vehicle_number || driverForTrip?.vehicle_number) && (
                            <span className="ml-1 font-mono text-slate-500">
                              · {t.vehicle_number || driverForTrip?.vehicle_number}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 min-[360px]:grid-cols-3">
                    {(t.driver_id || driverForTrip) && onSetDriverOfficeDue && (
                      <button
                        type="button"
                        onClick={() => handleOpenDriverFeeModal(t)}
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit Office Fee
                      </button>
                    )}
                    {onOpenEditTrip && (
                      <button
                        type="button"
                        onClick={() => onOpenEditTrip(t)}
                        className="min-h-10 rounded-lg bg-amber-400 px-2 py-2 text-xs font-medium text-slate-950 transition hover:bg-amber-300"
                      >
                        Edit Trip
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTripToDelete(t)}
                      className="min-h-10 rounded-lg border border-rose-300 bg-white px-2 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Delete Record
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          </>
        )}

        {/* Pagination Toolbar */}
        {visibleFilteredTrips.length > TRIPS_PER_PAGE && (
          <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{(currentPage - 1) * TRIPS_PER_PAGE + 1}</strong> to{' '}
              <strong className="text-slate-800">
                {Math.min(currentPage * TRIPS_PER_PAGE, visibleFilteredTrips.length).toLocaleString()}
              </strong>{' '}
              of <strong className="text-slate-800">{visibleFilteredTrips.length.toLocaleString()}</strong> trips
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition flex items-center gap-1 font-semibold"
              >
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                <span className="font-bold text-slate-900 bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg">
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
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Trip Confirmation Modal */}
      {tripToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Trip Record</h3>
                <p className="text-xs text-slate-500">Permanently remove from trip history &amp; ledger</p>
              </div>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Trip #{tripToDelete.trip_id.replace(/^TRIP-?/, '')}</span>
                <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {tripToDelete.status}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                Customer: <strong>{tripToDelete.customer_name}</strong> ({tripToDelete.customer_phone})
              </div>
              <div className="mt-1 break-words text-xs text-slate-500">
                Route: {getTripPickupLocation(tripToDelete)} → {getTripDropLocation(tripToDelete)}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this trip record? This operation will remove it from both local storage and cloud database.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTripToDelete(null)}
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
                    const idToDelete = tripToDelete.doc_id || tripToDelete.trip_id;
                    await onDeleteTrip(idToDelete);
                    setTripToDelete(null);
                  } catch (err) {
                    console.error('Failed to delete trip:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Record'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Office Fee Modal (Only for driver who took this trip) */}
      {feeTrip && (() => {
        const drv = getDriverForTrip(feeTrip);
        const targetDriverId = drv?.driver_id || feeTrip.driver_id || 'UNKNOWN';
        const targetDriverName = drv?.driver_name || feeTrip.driver_name || targetDriverId;
        const currentAmount = drv?.payment_amount || 0;
        const currentStatus = drv?.payment_status || 'CLEARED';

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
            <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-6 min-[768px]:max-[1024px]:max-w-2xl min-[768px]:max-[1024px]:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
              {/* Header */}
              <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-950">Trip Office Fee</h3>
                  <p className="mt-0.5 break-words text-xs text-slate-500">
                    Trip #{feeTrip.trip_id.replace(/^TRIP-?/, '')} · {targetDriverName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFeeTrip(null);
                    setFeeFeedback(null);
                    setFeeStep(1);
                  }}
                  className="min-h-10 self-end whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:self-auto"
                  aria-label="Back to Trips"
                >
                  Back to Trips
                </button>
              </div>

              {/* Compact Trip Summary */}
              <div className="mt-4 grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 text-xs">
                <div className="min-w-0">
                  <span className="block text-slate-500">Fare</span>
                  <span className="mt-0.5 block font-semibold text-slate-900 tabular-nums">
                    ₹{getTripFare(feeTrip)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Status</span>
                  <span className="mt-0.5 block break-words font-semibold capitalize text-slate-900">
                    {feeTrip.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Vehicle</span>
                  <span className="mt-0.5 block break-words font-mono font-semibold text-slate-900">
                    {feeTrip.vehicle_number || drv?.vehicle_number || 'N/A'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-slate-500">Office Due</span>
                  <span className={`mt-0.5 block break-words font-semibold ${
                    currentStatus === 'DUE' && currentAmount > 0
                      ? 'text-amber-800'
                      : 'text-emerald-700'
                  }`}>
                    {currentStatus === 'DUE' && currentAmount > 0
                      ? `₹${currentAmount} Due`
                      : 'Cleared'}
                  </span>
                </div>

              </div>

              {/* Step-by-Step Progress Navigation */}
              <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFeeStep(1)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 1
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Amount</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeeStep(2)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 2
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Purpose</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeeStep(3)}
                  className={`flex min-h-10 items-center justify-center rounded-lg border px-2 text-xs font-bold transition cursor-pointer ${
                    feeStep === 3
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>Confirm</span>
                </button>
              </div>

              {/* Feedback Alert */}
              {feeFeedback && (
                <div
                  className={`mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 ${
                    feeFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  <span className="font-semibold">{feeFeedback.message}</span>
                </div>
              )}

              {/* Step Body */}
               <div className="mt-4 flex-1 space-y-3.5 overflow-visible pr-0.5 text-xs">
                {/* STEP 1: AMOUNT */}
                {feeStep === 1 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Office Fee Amount (₹)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          required
                          autoFocus
                          value={feeAmount}
                          onChange={(e) => setFeeAmount(e.target.value)}
                          placeholder="Enter amount"
                           className="w-full rounded-lg border border-slate-300 px-3 py-3 text-xl font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        />
                      </div>
                    </div>

                    {/* Instant Clear Due Option */}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setFeeAmount('0')}
                        className={`w-full min-h-11 rounded-lg px-3 text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                          feeAmount === '0'
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
                {feeStep === 2 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Payment Reason / Note
                      </label>
                      <div className="space-y-1.5">
                        {PAYMENT_NOTE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setFeeNotePreset(preset)}
                            className={`w-full min-h-11 rounded-lg border px-3 text-left font-bold text-xs transition cursor-pointer flex items-center justify-between ${
                              feeNotePreset === preset
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
                        Custom Note or Details (Optional)
                      </label>
                      <input
                        type="text"
                        value={customFeeNote}
                        onChange={(e) => {
                          setCustomFeeNote(e.target.value);
                          if (feeNotePreset !== 'CUSTOM') {
                            setFeeNotePreset('CUSTOM');
                          }
                        }}
                        placeholder={`e.g. Convenience charge for Trip #${feeTrip.trip_id}`}
                        className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: CONFIRMATION & OFFICE UPI */}
                {feeStep === 3 && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Summary Card */}
                    <div className="space-y-2 border-y border-slate-200 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600 font-medium">Office Fee Amount:</span>
                        <span className="shrink-0 text-base font-black text-amber-950">
                          ₹{feeAmount || 0}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-600 font-medium">Payment Purpose:</span>
                        <span className="max-w-[60%] break-words text-right font-bold text-slate-900">
                          {feeNotePreset === 'CUSTOM' ? (customFeeNote.trim() || 'Trip CC (Convenience Charge)') : feeNotePreset}
                        </span>
                      </div>
                    </div>

                    {/* Office UPI ID */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-700 font-bold text-xs">
                          Office UPI ID
                        </label>
                        {feeOfficeUpi ? (
                          <button
                            type="button"
                            onClick={() => setFeeOfficeUpi('')}
                            className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                          >
                            Set Blank
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFeeOfficeUpi('123mdcreation@okaxis')}
                            className="text-[11px] text-amber-800 hover:text-amber-900 font-bold bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg transition cursor-pointer"
                          >
                            Choose Default ID
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={feeOfficeUpi}
                        onChange={(e) => setFeeOfficeUpi(e.target.value)}
                        placeholder="Enter UPI ID (optional)"
                        className="w-full min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                        {feeOfficeUpi.trim() ? (
                          <span className="text-emerald-700 font-semibold">
                            {feeOfficeUpi.trim() === '123mdcreation@okaxis'
                              ? 'Default ID: 123mdcreation@okaxis'
                              : `Custom: ${feeOfficeUpi.trim()}`}
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
              </div>

              {/* Step Navigation & Actions Footer */}
              <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
                <div className="flex items-center gap-1.5">
                  {feeStep > 1 ? (
                    <button
                      type="button"
                      onClick={() => setFeeStep((prev) => (prev - 1) as 1 | 2)}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFeeTrip(null);
                        setFeeFeedback(null);
                        setFeeStep(1);
                      }}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}

                  {/* Optional Quick Clear Button if currently has dues */}
                  {currentAmount > 0 && (
                    <button
                      type="button"
                      disabled={isSavingFee}
                      onClick={handleClearDriverFee}
                      className="hidden"
                      title="Clear dues immediately to ₹0"
                    >
                      <span>Clear Dues</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {feeStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setFeeStep((prev) => (prev + 1) as 2 | 3)}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSavingFee}
                      onClick={handleSaveDriverFee}
                      className="min-h-11 rounded-lg bg-amber-500 px-4 text-slate-950 font-black text-xs transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingFee ? (
                        <>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <span>
                            Save Office Fee
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ===================== CLEAR LOCAL STORAGE MODAL ===================== */}
      {isClearStorageModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Clear Local Storage History
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Browser storage cleanup only
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClearStorageModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Reassurance Callout: NOT Backend */}
            <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Backend Database Protected (Zero Cloud Deletions)</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed pl-6">
                This action strictly removes trip records cached in your web browser's Local Storage. <strong>No trips or ledger history will be deleted from your Firestore database or remote servers.</strong>
              </p>
            </div>

            {/* Storage Details */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Storage Key:</span>
                <span className="font-mono font-bold text-slate-800">trusty_cab_trips_local_v1</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Current Cached Trips:</span>
                <span className="font-bold text-slate-900 tabular-nums">{localStorageCount} records</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Cloud Sync Status:</span>
                <span className="font-bold text-slate-900">
                  {isFirebaseConnected ? 'Connected (Firestore active)' : 'Standalone / Local cache'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmClearLocalStorage(false)}
                className="w-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clean Local Storage Cache Only</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmClearLocalStorage(true)}
                className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Clean Storage &amp; Reset Screen View</span>
              </button>

              <button
                type="button"
                onClick={() => setIsClearStorageModalOpen(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-bold transition cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
