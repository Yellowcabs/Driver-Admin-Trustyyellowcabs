import React, { useState } from 'react';
import { FirestoreDriver, VehicleCategory } from '../../types';

interface NewDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (driver: Partial<FirestoreDriver>) => Promise<FirestoreDriver>;
}

const VEHICLE_CATEGORIES = [
  'MINI',
  'SEDAN',
  'SUV',
  'SUV+',
  'INNOVA',
  'INNOVA CRYSTA',
  'CUSTOM',
] as const;

/** Calculates a date string for exactly one year from today (YYYY-MM-DD). */
function getOneYearFromToday(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export const NewDriverModal: React.FC<NewDriverModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [categorySelection, setCategorySelection] = useState<string>('MINI');
  const [customCategory, setCustomCategory] = useState('');
  const [expiryDate, setExpiryDate] = useState<string>(() => getOneYearFromToday());
  const [fcmToken, setFcmToken] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const inputClassName =
    'min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';
  const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-800';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (categorySelection === 'CUSTOM' && !customCategory.trim()) {
      setErrorMessage('Please enter a custom vehicle category name.');
      return;
    }

    const finalCategory = (
      categorySelection === 'CUSTOM'
        ? customCategory.trim().toUpperCase()
        : categorySelection
    ) as VehicleCategory;

    setIsSubmitting(true);
    try {
      await onSubmit({
        driver_id: driverId.trim(), // If blank, hook generates a unique ID
        driver_name: driverName.trim(),
        mobile_number: mobileNumber.trim(),
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        vehicle_category: finalCategory,
        expiry_date: expiryDate.trim() || getOneYearFromToday(),
        photo_url: photoUrl.trim(),
        status: 'ACTIVE',
        is_online: false, // Offline until driver logs in from their mobile device
        device_id: '',    // Device ID strictly blank empty until mobile device app binds
        fcm_token: fcmToken.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error registering driver');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] w-full bg-slate-50 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-4xl min-[768px]:max-[1024px]:max-w-2xl lg:max-w-5xl">
        <header className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
          <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">Add Fleet Driver</h1>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            Back
          </button>
        </header>

        {errorMessage && (
          <div className="mb-6 flex items-center justify-between gap-4 border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="shrink-0 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="driver-photo-url" className={labelClassName}>Driver Photo URL</label>
            <input
              id="driver-photo-url"
              type="url"
              placeholder="Enter image URL (optional)"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="driver-id" className={labelClassName}>Driver ID</label>
              <input
                id="driver-id"
                type="text"
                placeholder="Auto-generated if blank"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className={`${inputClassName} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="vehicle-category" className={labelClassName}>Vehicle Category</label>
              <select
                id="vehicle-category"
                value={categorySelection}
                onChange={(e) => setCategorySelection(e.target.value)}
                className={`${inputClassName} cursor-pointer`}
              >
                {VEHICLE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category === 'CUSTOM' ? 'Custom Type (Type your own)' : category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categorySelection === 'CUSTOM' && (
            <div>
              <label htmlFor="custom-category" className={labelClassName}>Custom Vehicle Category Name</label>
              <input
                id="custom-category"
                type="text"
                placeholder="e.g. TEMPO TRAVELLER, AUTO, EV SEDAN"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className={`${inputClassName} uppercase`}
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="driver-name" className={labelClassName}>Driver Name</label>
            <input
              id="driver-name"
              type="text"
              placeholder="Enter driver name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className={inputClassName}
              required
            />
          </div>

          <div>
            <label htmlFor="mobile-number" className={labelClassName}>Mobile Number</label>
            <input
              id="mobile-number"
              type="text"
              placeholder="Enter 10-digit mobile number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              className={`${inputClassName} font-mono`}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="vehicle-number" className={labelClassName}>Vehicle Number</label>
              <input
                id="vehicle-number"
                type="text"
                placeholder="e.g. TN 66 AV 6589"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className={`${inputClassName} font-mono uppercase`}
                required
              />
            </div>

            <div>
              <label htmlFor="license-expiry-date" className={labelClassName}>License Expiry Date</label>
              <input
                id="license-expiry-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={inputClassName}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="fcm-token" className={labelClassName}>FCM Token (Optional)</label>
            <input
              id="fcm-token"
              type="text"
              value={fcmToken}
              onChange={(e) => setFcmToken(e.target.value)}
              placeholder="Leave blank if unavailable"
              className={`${inputClassName} font-mono`}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[46px] rounded-lg bg-orange-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Registering...' : 'Register Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
