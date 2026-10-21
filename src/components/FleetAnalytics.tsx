import React, { useMemo } from 'react';
import { FirestoreDriver, FirestoreTrip } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';

interface FleetAnalyticsProps {
  drivers: FirestoreDriver[];
  trips: FirestoreTrip[];
  onOpenAssignModal?: (trip: FirestoreTrip) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Sedan: '#f59e0b',
  Mini: '#3b82f6',
  SUV: '#8b5cf6',
  'SUV+': '#ec4899',
  Innova: '#10b981',
  Auto: '#f97316',
};

export const FleetAnalytics: React.FC<FleetAnalyticsProps> = ({ drivers, trips }) => {
  // Pre-index active trip driver IDs in O(Trips) to avoid O(Drivers * Trips) loops with 5000+ drivers
  const { activeDriverIdSet, driverTripStatsMap } = useMemo(() => {
    const activeSet = new Set<string>();
    const statsMap = new Map<string, { count: number; earnings: number }>();

    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      if (!t.driver_id) continue;

      if (t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS') {
        activeSet.add(t.driver_id);
      } else if (t.status === 'COMPLETED') {
        const fare = t.final_fare || t.estimated_fare || 0;
        const current = statsMap.get(t.driver_id);
        if (current) {
          current.count += 1;
          current.earnings += fare;
        } else {
          statsMap.set(t.driver_id, { count: 1, earnings: fare });
        }
      }
    }

    return { activeDriverIdSet: activeSet, driverTripStatsMap: statsMap };
  }, [trips]);

  // Real database calculations directly from Firestore props in single-pass
  const totalDrivers = drivers.length;
  const onlineDrivers = useMemo(
    () => drivers.filter((d) => d.is_online && d.status === 'ACTIVE'),
    [drivers]
  );
  const activeInTripDrivers = useMemo(
    () =>
      drivers.filter(
        (d) =>
          d.is_online &&
          (Boolean(d.current_trip_id) || activeDriverIdSet.has(d.driver_id))
      ),
    [drivers, activeDriverIdSet]
  );
  const freeDrivers = useMemo(() => {
    const busySet = new Set(activeInTripDrivers.map((d) => d.driver_id));
    return onlineDrivers.filter((d) => !busySet.has(d.driver_id));
  }, [onlineDrivers, activeInTripDrivers]);

  const completedTrips = trips.filter((t) => t.status === 'COMPLETED');
  const inProgressTrips = trips.filter((t) => t.status === 'IN_PROGRESS');
  const acceptedTrips = trips.filter((t) => t.status === 'ACCEPTED');
  const openTrips = trips.filter((t) => t.status === 'OPEN');
  const cancelledTrips = trips.filter((t) => t.status === 'CANCELLED');

  const totalRevenue = completedTrips.reduce(
    (sum, t) => sum + (t.final_fare || t.estimated_fare || 0),
    0
  );

  const totalDistanceKm = completedTrips.reduce(
    (sum, t) => sum + (t.distance_km || 0),
    0
  );
  const formattedTotalDistanceKm = Number.isFinite(totalDistanceKm)
    ? totalDistanceKm.toFixed(2)
    : '0.00';

  const averageFare =
    completedTrips.length > 0 ? Math.round(totalRevenue / completedTrips.length) : 0;

  const completionRate =
    completedTrips.length + cancelledTrips.length > 0
      ? Math.round(
          (completedTrips.length / (completedTrips.length + cancelledTrips.length)) * 100
        )
      : 100;

  // Real vehicle category breakdown from drivers
  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    drivers.forEach((d) => {
      const cat = d.vehicle_category || 'Mini';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || '#64748b',
    }));
  }, [drivers]);

  // Real Trip Status Operational Volume (Direct from actual Firestore trips)
  const tripStatusData = useMemo(() => {
    return [
      { status: 'Open Queue', count: openTrips.length, fill: '#f59e0b', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
      { status: 'Accepted', count: acceptedTrips.length, fill: '#0284c7', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' },
      { status: 'On Ride', count: inProgressTrips.length, fill: '#9333ea', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
      { status: 'Completed', count: completedTrips.length, fill: '#10b981', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
      { status: 'Cancelled', count: cancelledTrips.length, fill: '#f43f5e', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500' },
    ];
  }, [openTrips.length, acceptedTrips.length, inProgressTrips.length, completedTrips.length, cancelledTrips.length]);

  // Real Category Revenue Breakdown (Direct from completed & active trips)
  const categoryRevenueData = useMemo(() => {
    const map: Record<string, { trips: number; revenue: number }> = {
      Sedan: { trips: 0, revenue: 0 },
      Mini: { trips: 0, revenue: 0 },
      Innova: { trips: 0, revenue: 0 },
      SUV: { trips: 0, revenue: 0 },
      Auto: { trips: 0, revenue: 0 },
    };

    trips.forEach((t) => {
      const cat = t.vehicle_category || 'Mini';
      if (!map[cat]) map[cat] = { trips: 0, revenue: 0 };
      map[cat].trips += 1;
      if (t.status === 'COMPLETED') {
        map[cat].revenue += t.final_fare || t.estimated_fare || 0;
      }
    });

    return Object.entries(map)
      .filter(([_, d]) => d.trips > 0 || d.revenue > 0)
      .map(([name, d]) => ({
        category: name,
        trips: d.trips,
        revenue: d.revenue,
        color: CATEGORY_COLORS[name] || '#64748b',
      }));
  }, [trips]);

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden pb-24 animate-in fade-in duration-300 min-[768px]:max-[1024px]:space-y-4 min-[768px]:max-[1024px]:pb-8 lg:space-y-5 lg:pb-8">
      {/* 4 Clean KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 min-[768px]:max-[1024px]:grid-cols-4 min-[768px]:max-[1024px]:gap-3 lg:grid-cols-4">
        {/* Total Revenue */}
        <div className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-[120px] sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-[11px]">
              Total Revenue
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-900 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              ₹{totalRevenue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Online Fleet */}
        <div className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-[120px] sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-[11px]">
              Online Fleet
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-emerald-600 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {onlineDrivers.length}
            </span>
          </div>
        </div>

        {/* Completed Rides */}
        <div className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-[120px] sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-[11px]">
              Completed Rides
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-900 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {completedTrips.length}
            </span>
          </div>
        </div>

        {/* Total Distance */}
        <div className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:min-h-[120px] sm:p-4">
          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
            <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-[11px]">
              Total Distance
            </p>
          </div>
          <div className="mt-2 w-full min-w-0 sm:mt-3">
            <span className="block max-w-full whitespace-nowrap text-[clamp(0.875rem,4vw,1.5rem)] font-bold leading-none tracking-tight text-slate-900 tabular-nums min-[768px]:max-[1024px]:text-[clamp(0.875rem,2vw,1.125rem)] lg:text-[clamp(1.125rem,1.7vw,1.875rem)]">
              {formattedTotalDistanceKm} km
            </span>
          </div>
        </div>
      </div>

      {/* Useful Real Data Charts Grid */}
      <div className="grid grid-cols-1 gap-3 min-[900px]:max-[1024px]:grid-cols-3 lg:grid-cols-3">
        {/* Left: Trip Status Operations Breakdown */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 min-[900px]:max-[1024px]:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Ride Status</h3>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              {trips.length} bookings
            </span>
          </div>

          {/* Operational Status Summary */}
          <div className="mt-1 divide-y divide-slate-100">
            {tripStatusData.map((s) => (
              <div
                key={s.status}
                className="flex min-h-10 items-center justify-between gap-4 py-2.5"
              >
                <span className={`min-w-0 text-sm font-medium ${s.color}`}>{s.status}</span>
                <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 h-56 min-w-0 border-t border-slate-100 pt-3 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tripStatusData} margin={{ top: 18, right: 4, left: -8, bottom: 2 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 9, fill: '#475569', fontWeight: 600 }}
                  interval={0}
                  height={34}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    border: 'none',
                  }}
                  wrapperStyle={{ zIndex: 20 }}
                  formatter={(value: number) => [`${value} rides`, 'Total']}
                />
                <Bar
                  dataKey="count"
                  fill="#f59e0b"
                  minPointSize={8}
                  maxBarSize={42}
                  radius={[6, 6, 0, 0]}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fill: '#1e293b', fontSize: '12px', fontWeight: 800 }}
                  />
                  {tripStatusData.map((entry, index) => (
                    <Cell key={`status-cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Vehicle Fleet Category Breakdown */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Vehicle Fleet Mix
              </h3>
              <span className="text-xs text-slate-500 font-medium">{totalDrivers} registered</span>
            </div>

            <div className="h-44 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px',
                      border: 'none',
                    }}
                    formatter={(value: number) => [`${value} cabs`, 'Count']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            {categoryDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-semibold text-slate-700">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900">{item.value} cabs</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue by Vehicle Category (Real Firestore Data) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Revenue by Vehicle Category
            </h3>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 min-[768px]:max-[1024px]:grid-cols-5 min-[768px]:max-[1024px]:gap-2 lg:grid-cols-5">
          {categoryRevenueData.map((item) => (
            <div
              key={item.category}
              className="flex min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">{item.category}</span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
              <div className="mt-3">
                <div className="text-lg font-black text-slate-900 tabular-nums">
                  ₹{item.revenue.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                  {item.trips} total ride{item.trips !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
