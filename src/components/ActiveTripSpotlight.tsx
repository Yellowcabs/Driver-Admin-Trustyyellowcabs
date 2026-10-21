import React, { useState } from 'react';
import {
  FirestoreTrip,
  FirestoreDriver,
  formatTripId,
} from '../types';
import {
  Car,
  MapPin,
  PhoneCall,
  Gauge,
  Clock,
  Radio,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Zap,
  Navigation,
  Edit3,
  Share2,
} from 'lucide-react';
import { DriverAvatar } from './DriverAvatar';

interface ActiveTripSpotlightProps {
  trips: FirestoreTrip[];
  drivers: FirestoreDriver[];
  onOpenEditModal?: (trip: FirestoreTrip) => void;
  onOpenTrackingModal?: (trip: FirestoreTrip) => void;
  onNavigateToRadar?: () => void;
}

export const ActiveTripSpotlight: React.FC<ActiveTripSpotlightProps> = ({
  trips,
  drivers,
  onOpenEditModal,
  onOpenTrackingModal,
  onNavigateToRadar,
}) => {
  // Find trips currently IN_PROGRESS or ACCEPTED
  const activeTrips = trips.filter(
    (t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED'
  );

  const [selectedTripIndex, setSelectedTripIndex] = useState<number>(0);

  if (activeTrips.length === 0) {
    return null;
  }

  const currentTrip = activeTrips[selectedTripIndex] || activeTrips[0];
  const assignedDriver = drivers.find((d) => d.driver_id === currentTrip.driver_id);
  const driverPhone = currentTrip.driver_phone || assignedDriver?.mobile_number;

  return (
    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-4 sm:mb-6">
      {/* Top Banner with Active Trips Tabs */}
      <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-black uppercase tracking-wider text-slate-200">
            Live Active Trip Spotlight ({activeTrips.length} Ongoing)
          </span>
        </div>

        {/* Carousel / Tab selector if multiple active trips */}
        {activeTrips.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {activeTrips.map((t, idx) => (
              <button
                key={t.doc_id || t.trip_id}
                onClick={() => setSelectedTripIndex(idx)}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  selectedTripIndex === idx
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>#{formatTripId(t.trip_id)}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    t.status === 'IN_PROGRESS' ? 'bg-purple-400 animate-pulse' : 'bg-sky-400'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Spotlight Body */}
      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
        {/* Left: Driver & Status Profile */}
        <div className="flex items-center gap-3.5 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
          <DriverAvatar
            photoUrl={assignedDriver?.profile_photo_url}
            name={currentTrip.driver_name || 'Assigned Driver'}
            size="lg"
            showStatusBadge={true}
            isOnline={assignedDriver?.is_online ?? true}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-white text-sm truncate">
                {currentTrip.driver_name || 'Driver En Route'}
              </h4>
              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                  currentTrip.status === 'IN_PROGRESS'
                    ? 'bg-purple-900/80 text-purple-300 border border-purple-700'
                    : 'bg-sky-900/80 text-sky-300 border border-sky-700'
                }`}
              >
                {currentTrip.status === 'IN_PROGRESS' ? 'IN RIDE' : 'ACCEPTED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {currentTrip.vehicle_number || assignedDriver?.vehicle_number || 'Vehicle Assigned'} •{' '}
              <span className="text-amber-400 font-semibold">{currentTrip.vehicle_category}</span>
            </p>

            <div className="flex items-center gap-2 mt-2">
              {driverPhone && (
                <a
                  href={`tel:${driverPhone}`}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 transition shadow-xs"
                >
                  <PhoneCall className="w-3 h-3" />
                  <span>Call Driver</span>
                </a>
              )}
              {currentTrip.customer_phone && (
                <a
                  href={`tel:${currentTrip.customer_phone}`}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                >
                  <PhoneCall className="w-3 h-3 text-slate-400" />
                  <span>Call Rider</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Center: Live Route Journey */}
        <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
          <div className="flex items-start gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 ring-4 ring-emerald-950" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pickup</span>
              <p className="text-xs font-semibold text-slate-200 truncate">{currentTrip.pickup_location}</p>
            </div>
          </div>
          <div className="border-l-2 border-dashed border-slate-700 ml-1 pl-3 my-0.5 flex items-center gap-2 text-[10px] text-slate-400">
            <span>{currentTrip.distance_km ? `${currentTrip.distance_km} km` : 'Active'}</span>
            {currentTrip.otp && (
              <span className="bg-amber-500/20 text-amber-300 font-mono font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                OTP: {currentTrip.otp}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 ring-4 ring-rose-950" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Destination</span>
              <p className="text-xs font-semibold text-slate-200 truncate">{currentTrip.drop_location}</p>
            </div>
          </div>
        </div>

        {/* Right: Metrics & Actions */}
        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between">
          <div className="grid grid-cols-3 gap-2 text-center pb-2 border-b border-slate-700/60">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Fare</p>
              <p className="text-base font-black text-amber-400 mt-0.5">
                ₹{currentTrip.final_fare || currentTrip.estimated_fare || 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Distance</p>
              <p className="text-base font-black text-white mt-0.5">
                {currentTrip.distance_km ? `${currentTrip.distance_km} km` : 'Fixed'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">OTP</p>
              <p className="text-base font-black font-mono text-emerald-400 mt-0.5">
                {currentTrip.otp || 'Active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {onOpenTrackingModal && (
              <button
                onClick={() => onOpenTrackingModal(currentTrip)}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                  currentTrip.tracking_enabled && currentTrip.tracking_token
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-700 hover:bg-amber-500 hover:text-slate-950 text-slate-200'
                }`}
                title={
                  currentTrip.tracking_enabled && currentTrip.tracking_token
                    ? `Live Tracking Active: ${currentTrip.tracking_token}`
                    : 'Generate Customer Tracking Link'
                }
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{currentTrip.tracking_enabled && currentTrip.tracking_token ? 'Share Tracking' : 'Track Link'}</span>
              </button>
            )}
            {onOpenEditModal && (
              <button
                onClick={() => onOpenEditModal(currentTrip)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                title="Edit Trip Details"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Trip</span>
              </button>
            )}
            {onNavigateToRadar && (
              <button
                onClick={onNavigateToRadar}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer shrink-0"
                title="View live GPS track on Radar"
              >
                <Navigation className="w-3.5 h-3.5 text-amber-400" />
                <span>Radar Map</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
