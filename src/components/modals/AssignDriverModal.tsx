import React, { useMemo, useState } from 'react';
import { FirestoreDriver, FirestoreTrip } from '../../types';

interface AssignDriverModalProps {
  trip: FirestoreTrip | null;
  drivers: FirestoreDriver[];
  trips?: FirestoreTrip[];
  onClose: () => void;
  onAssign: (tripDocId: string, driver: FirestoreDriver) => Promise<void>;
}

export const AssignDriverModal: React.FC<AssignDriverModalProps> = ({
  trip,
  drivers,
  trips = [],
  onClose,
  onAssign,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);

  const busyDriversMap = useMemo(() => {
    const map = new Map<string, FirestoreTrip>();
    if (!trips || !Array.isArray(trips)) return map;
    for (const t of trips) {
      if (
        t.driver_id &&
        (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') &&
        t.trip_id !== trip?.trip_id &&
        t.doc_id !== trip?.doc_id
      ) {
        map.set(t.driver_id, t);
      }
    }
    return map;
  }, [trips, trip]);

  const getOngoingTripForDriver = (driverId: string, currentTripId?: string | null) => {
    if (busyDriversMap.has(driverId)) return busyDriversMap.get(driverId)!;
    if (currentTripId && trips) {
      const match = trips.find(
        (t) =>
          (t.trip_id === currentTripId || t.doc_id === currentTripId) &&
          t.trip_id !== trip?.trip_id &&
          t.doc_id !== trip?.doc_id &&
          (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED')
      );
      if (match) return match;
    }
    return null;
  };

  const filteredDrivers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = drivers.filter((d) => {
      if (d.status !== 'ACTIVE') return false;
      if (filterOnlineOnly && !d.is_online) return false;

      const ongoingTrip = getOngoingTripForDriver(d.driver_id, d.current_trip_id);
      if (filterAvailableOnly && ongoingTrip) return false;
      if (!q) return true;

      return [d.driver_id, d.driver_name, d.vehicle_number, d.vehicle_category, d.mobile_number]
        .some((value) => (value || '').toLowerCase().includes(q));
    });

    return result.sort((a, b) => {
      const aBusy = Boolean(getOngoingTripForDriver(a.driver_id, a.current_trip_id));
      const bBusy = Boolean(getOngoingTripForDriver(b.driver_id, b.current_trip_id));
      if (aBusy && !bBusy) return 1;
      if (!aBusy && bBusy) return -1;
      return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
    });
  }, [drivers, searchQuery, filterOnlineOnly, filterAvailableOnly, busyDriversMap, trips, trip]);

  const availableCount = useMemo(
    () => drivers.filter((d) => d.status === 'ACTIVE' && !getOngoingTripForDriver(d.driver_id, d.current_trip_id)).length,
    [drivers, busyDriversMap, trips, trip]
  );

  const ongoingCount = useMemo(
    () => drivers.filter((d) => d.status === 'ACTIVE' && Boolean(getOngoingTripForDriver(d.driver_id, d.current_trip_id))).length,
    [drivers, busyDriversMap, trips, trip]
  );

  if (!trip) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <div className="min-h-screen w-full">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <h1 className="break-words text-base font-bold leading-tight text-slate-900 sm:text-lg">Assign Driver</h1>
              <p className="mt-0.5 break-words text-xs text-slate-500">Trip #{trip.trip_id}</p>
            </div>
            <button type="button" onClick={onClose} className="min-h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              Back to Dispatch
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pickup</p>
              <p className="mt-1 break-words text-sm font-medium leading-snug text-slate-900">{trip.pickup_location}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Drop</p>
              <p className="mt-1 break-words text-sm font-medium leading-snug text-slate-900">{trip.drop_location}</p>
            </div>
          </section>

          {assignError && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
              <p className="break-words font-semibold">{assignError}</p>
              <button type="button" onClick={() => setAssignError(null)} className="shrink-0 font-semibold text-rose-700 underline underline-offset-2">Dismiss</button>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Search drivers</span>
                <input
                  type="text"
                  placeholder="Search driver, ID, vehicle or phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => setFilterAvailableOnly(!filterAvailableOnly)} className={`min-h-10 rounded-lg border px-3 font-semibold transition ${filterAvailableOnly ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  {filterAvailableOnly ? 'Available only' : 'All availability'}
                </button>
                <button type="button" onClick={() => setFilterOnlineOnly(!filterOnlineOnly)} className={`min-h-10 rounded-lg border px-3 font-semibold transition ${filterOnlineOnly ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  {filterOnlineOnly ? 'Online only' : 'All statuses'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span><strong className="text-emerald-700">{availableCount}</strong> available</span>
              {ongoingCount > 0 && <span className="text-rose-600">{ongoingCount} on ongoing trip</span>}
              {searchQuery && <span>{filteredDrivers.length} matching</span>}
            </div>
          </section>

          <section className="space-y-3">
            {filteredDrivers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">No active drivers matching &quot;{searchQuery}&quot;.</div>
            ) : (
              filteredDrivers.map((drv) => {
                const ongoingTrip = getOngoingTripForDriver(drv.driver_id, drv.current_trip_id);
                const isBusy = Boolean(ongoingTrip);

                return (
                  <article key={drv.driver_id} className={`rounded-xl border bg-white p-4 transition ${isBusy ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200 hover:border-amber-300'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                          <p className="break-words text-sm font-bold leading-tight text-slate-900">{drv.driver_name}</p>
                          <p className="mt-1 break-all text-xs text-slate-500">ID {drv.driver_id}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vehicle</p>
                          <p className="mt-1 break-words text-xs font-semibold text-slate-900">{drv.vehicle_category || 'Not provided'}</p>
                          <p className="break-all text-xs text-slate-600">{drv.vehicle_number || 'Not provided'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                          <p className="mt-1 break-all text-xs font-semibold text-slate-900">{drv.mobile_number || 'Not provided'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                          <p className={`mt-1 break-words text-xs font-semibold ${isBusy ? 'text-rose-600' : drv.is_online ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {isBusy ? 'On ongoing trip' : drv.is_online ? 'Online · Available' : 'Offline · Available'}
                          </p>
                        </div>
                      </div>

                      {isBusy ? (
                        <button type="button" disabled title={`Driver ${drv.driver_name} is currently on ongoing trip #${ongoingTrip?.trip_id} (${ongoingTrip?.status}). Trips cannot be assigned to an ongoing driver.`} className="min-h-10 shrink-0 rounded-lg border border-slate-300 bg-slate-100 px-4 text-xs font-semibold text-slate-400 sm:w-28">
                          On trip
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(assigningDriverId)}
                          onClick={async () => {
                            if (isBusy) {
                              setAssignError(`Driver ${drv.driver_name} is already on an ongoing trip. Cannot assign.`);
                              return;
                            }
                            try {
                              setAssigningDriverId(drv.driver_id);
                              setAssignError(null);
                              await onAssign(trip.doc_id || trip.trip_id, drv);
                              onClose();
                            } catch (err: any) {
                              setAssignError(err?.message || 'Failed to assign driver.');
                            } finally {
                              setAssigningDriverId(null);
                            }
                          }}
                          className="min-h-10 shrink-0 rounded-lg bg-amber-500 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-600 disabled:opacity-50 sm:w-28"
                        >
                          {assigningDriverId === drv.driver_id ? 'Assigning...' : 'Assign'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>
    </div>
  );
};
