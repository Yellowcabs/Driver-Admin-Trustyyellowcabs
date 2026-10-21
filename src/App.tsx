/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useCabData } from './hooks/useCabData';
import { AdminTab, FirestoreTrip, FirestoreDriver } from './types';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DispatchBoard } from './components/DispatchBoard';
import { LoginPage } from './components/auth/LoginPage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { AccountDeletionPage } from './components/AccountDeletionPage';
import { ParsedBookingData } from './services/bookingParser';
import { getStoredFirebaseConfig } from './firebase/config';
import { Loader2 } from 'lucide-react';

// Code-split heavy views & third-party libraries (Leaflet, Recharts) for instant initial load & zero lag
const LiveFleetMap = lazy(() => import('./components/LiveFleetMap').then((m) => ({ default: m.LiveFleetMap })));
const FleetAnalytics = lazy(() => import('./components/FleetAnalytics').then((m) => ({ default: m.FleetAnalytics })));
const DriverManagement = lazy(() => import('./components/DriverManagement').then((m) => ({ default: m.DriverManagement })));
const TripHistory = lazy(() => import('./components/TripHistory').then((m) => ({ default: m.TripHistory })));
const CustomerLiveTracking = lazy(() => import('./components/CustomerLiveTracking').then((m) => ({ default: m.CustomerLiveTracking })));

// Code-split on-demand modals so they are loaded only when opened
const NewTripModal = lazy(() => import('./components/modals/NewTripModal').then((m) => ({ default: m.NewTripModal })));
const NewDriverModal = lazy(() => import('./components/modals/NewDriverModal').then((m) => ({ default: m.NewDriverModal })));
const AssignDriverModal = lazy(() => import('./components/modals/AssignDriverModal').then((m) => ({ default: m.AssignDriverModal })));
const CompleteTripModal = lazy(() => import('./components/modals/CompleteTripModal').then((m) => ({ default: m.CompleteTripModal })));
const FirebaseSettingsModal = lazy(() => import('./components/modals/FirebaseSettingsModal').then((m) => ({ default: m.FirebaseSettingsModal })));
const AdminPermissionsModal = lazy(() => import('./components/modals/AdminPermissionsModal').then((m) => ({ default: m.AdminPermissionsModal })));
const EditTripModal = lazy(() => import('./components/modals/EditTripModal').then((m) => ({ default: m.EditTripModal })));
const CustomerTrackingModal = lazy(() => import('./components/modals/CustomerTrackingModal').then((m) => ({ default: m.CustomerTrackingModal })));
const PasteBookingModal = lazy(() => import('./components/modals/PasteBookingModal').then((m) => ({ default: m.PasteBookingModal })));

function TabLoadingSkeleton() {
  return (
    <div className="w-full min-h-[380px] flex flex-col items-center justify-center p-8 text-slate-400">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
      <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Opening module...</p>
    </div>
  );
}

// Helper to validate tracking token format
function isValidTrackingToken(token: string | null): boolean {
  if (!token) return false;
  const clean = token.trim();
  if (!clean) return false;
  // Ignore numeric timestamps like ?t=1725456789 from Vite/preview cache-busting
  if (/^\d+$/.test(clean)) return false;
  // Legitimate tracking tokens start with TRK, TRIP, or are specific tracking strings (length >= 8)
  return clean.startsWith('TRK') || clean.startsWith('TRIP') || clean.length >= 8;
}

// Helper to extract customer tracking token from URL query, hash, or path
function extractTrackingTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Check URL query params: ?track=TRK... or ?tracking=TRK... or ?t=TRK...
    const searchParams = new URLSearchParams(window.location.search);
    const directTrack = searchParams.get('track') || searchParams.get('tracking');
    if (directTrack && directTrack.trim() && !/^\d+$/.test(directTrack.trim())) {
      return directTrack.trim();
    }
    const tParam = searchParams.get('t');
    if (tParam && isValidTrackingToken(tParam)) {
      return tParam.trim();
    }

    // 2. Check URL hash: e.g. #track=TRK... or #/track/TRK... or #TRK...
    if (window.location.hash) {
      const rawHash = window.location.hash.replace(/^#\/?/, '');
      if (rawHash.startsWith('track=')) {
        const val = rawHash.replace('track=', '').trim();
        if (val && !/^\d+$/.test(val)) return val;
      }
      if (rawHash.startsWith('tracking=')) {
        const val = rawHash.replace('tracking=', '').trim();
        if (val && !/^\d+$/.test(val)) return val;
      }
      const hashParams = new URLSearchParams(rawHash);
      const fromHash = hashParams.get('track') || hashParams.get('tracking');
      if (fromHash && fromHash.trim() && !/^\d+$/.test(fromHash.trim())) {
        return fromHash.trim();
      }
      const hashT = hashParams.get('t');
      if (hashT && isValidTrackingToken(hashT)) {
        return hashT.trim();
      }
      const hashPathMatch = rawHash.match(/^(?:track|tracking)\/([a-zA-Z0-9_-]+)/);
      if (hashPathMatch && hashPathMatch[1] && isValidTrackingToken(hashPathMatch[1])) {
        return hashPathMatch[1].trim();
      }
    }

    // 3. Check pathname: /track/TRK... or /tracking/TRK...
    const pathname = window.location.pathname;
    const pathMatch = pathname.match(/^\/(?:track|tracking)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1] && isValidTrackingToken(pathMatch[1])) {
      return pathMatch[1].trim();
    }
  } catch {
    return null;
  }

  return null;
}

// Helper to check if current URL points to the dedicated Privacy Policy page
function isPrivacyPolicyUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const pathname = window.location.pathname.toLowerCase();
    if (
      pathname === '/privacy' ||
      pathname === '/privacy-policy' ||
      pathname === '/privacypolicy' ||
      pathname.startsWith('/privacy')
    ) {
      return true;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const page = searchParams.get('page')?.toLowerCase();
    if (page === 'privacy' || page === 'privacy-policy' || page === 'privacypolicy') {
      return true;
    }
    if (searchParams.has('privacy') || searchParams.has('privacy-policy')) {
      return true;
    }
    if (window.location.hash) {
      const rawHash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
      if (
        rawHash === 'privacy' ||
        rawHash === 'privacy-policy' ||
        rawHash === 'privacypolicy' ||
        rawHash.startsWith('privacy')
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

// Helper to check if current URL points to the dedicated Account Deletion page
function isAccountDeletionUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const pathname = window.location.pathname.toLowerCase();
    if (
      pathname === '/delete-account' ||
      pathname === '/account-deletion' ||
      pathname === '/deleteaccount' ||
      pathname === '/accountdeletion' ||
      pathname === '/delete-driver-account' ||
      pathname.startsWith('/delete-account') ||
      pathname.startsWith('/account-deletion')
    ) {
      return true;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const page = searchParams.get('page')?.toLowerCase();
    if (
      page === 'delete-account' ||
      page === 'account-deletion' ||
      page === 'deleteaccount' ||
      page === 'accountdeletion'
    ) {
      return true;
    }
    if (searchParams.has('delete-account') || searchParams.has('account-deletion')) {
      return true;
    }
    if (window.location.hash) {
      const rawHash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
      if (
        rawHash === 'delete-account' ||
        rawHash === 'account-deletion' ||
        rawHash === 'deleteaccount' ||
        rawHash === 'accountdeletion' ||
        rawHash.startsWith('delete-account') ||
        rawHash.startsWith('account-deletion')
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function hasLegacyAdminSession(): boolean {
  return (
    localStorage.getItem('fleet_console_auth') === 'true' ||
    sessionStorage.getItem('fleet_console_auth') === 'true'
  );
}

function getEditTripRouteId(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/trips\/([^/]+)\/edit\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Public/authentication router. Keeping this component separate is important:
 * useCabData is mounted only inside the authenticated console, so public legal,
 * login, and customer tracking pages cannot start global admin subscriptions.
 */
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasLegacyAdminSession);
  const [routeVersion, setRouteVersion] = useState(0);

  useEffect(() => {
    const handleLocationChange = () => setRouteVersion((value) => value + 1);
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  void routeVersion;
  if (isPrivacyPolicyUrl()) return <PrivacyPolicyPage />;
  if (isAccountDeletionUrl()) return <AccountDeletionPage />;

  const trackingToken = extractTrackingTokenFromUrl();
  if (trackingToken) {
    return (
      <Suspense fallback={<TabLoadingSkeleton />}>
        <CustomerLiveTracking
          token={trackingToken.trim()}
          firebaseConfig={getStoredFirebaseConfig()}
          isPreview={false}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={(rememberMe) => {
      if (rememberMe) localStorage.setItem('fleet_console_auth', 'true');
      else sessionStorage.setItem('fleet_console_auth', 'true');
      setIsAuthenticated(true);
    }} />;
  }

  return <AdminApplication onSessionEnded={() => setIsAuthenticated(false)} />;
}

function AdminApplication({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dispatch');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isPrivacyRoute, setIsPrivacyRoute] = useState<boolean>(() => isPrivacyPolicyUrl());
  const [isAccountDeletionRoute, setIsAccountDeletionRoute] = useState<boolean>(() => isAccountDeletionUrl());
  const [editTripRouteId, setEditTripRouteId] = useState<string | null>(() => getEditTripRouteId());

  // Authentication State (Configured via VITE_ADMIN_PASSWORD in .env)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return (
      localStorage.getItem('fleet_console_auth') === 'true' ||
      sessionStorage.getItem('fleet_console_auth') === 'true'
    );
  });

  const handleLoginSuccess = (rememberMe: boolean = false) => {
    if (rememberMe) localStorage.setItem('fleet_console_auth', 'true');
    else sessionStorage.setItem('fleet_console_auth', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('fleet_console_auth');
    sessionStorage.removeItem('fleet_console_auth');
    setIsAuthenticated(false);
    onSessionEnded();
  };

  // Modals state
  const [isNewTripModalOpen, setIsNewTripModalOpen] = useState(false);
  const [isPasteBookingModalOpen, setIsPasteBookingModalOpen] = useState(false);
  const [initialBookingData, setInitialBookingData] = useState<ParsedBookingData | null>(null);
  const [isNewDriverModalOpen, setIsNewDriverModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<'system' | 'security' | 'environment'>('system');
  const [isAdminPermissionsModalOpen, setIsAdminPermissionsModalOpen] = useState(false);

  const handleOpenSettings = (tab: 'system' | 'security' | 'environment' = 'system') => {
    setSettingsModalTab(tab);
    setIsSettingsModalOpen(true);
  };
  const [tripToAssign, setTripToAssign] = useState<FirestoreTrip | null>(null);
  const [tripToComplete, setTripToComplete] = useState<FirestoreTrip | null>(null);
  const [tripForTracking, setTripForTracking] = useState<FirestoreTrip | null>(null);
  const [previewTrackingToken, setPreviewTrackingToken] = useState<string | null>(null);
  const [previewTrip, setPreviewTrip] = useState<FirestoreTrip | null>(null);

  // Check URL query string synchronously on initial mount for customer live tracking e.g. /?track=TRKXXXXXXXX
  const [urlTrackingToken, setUrlTrackingToken] = useState<string | null>(() => extractTrackingTokenFromUrl());

  useEffect(() => {
    const handleLocationChange = () => {
      setIsPrivacyRoute(isPrivacyPolicyUrl());
      setIsAccountDeletionRoute(isAccountDeletionUrl());
      setEditTripRouteId(getEditTripRouteId());
      const token = extractTrackingTokenFromUrl();
      if (token) {
        setUrlTrackingToken(token);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Cab data engine hook
  const {
    drivers,
    trips,
    systemSettings,
    rateCards,
    logs,
    adminUsers,
    currentAdmin,
    firebaseConfig,
    isFirebaseConnected,
    isSyncing,
    connectionStatusText,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser,
    switchCurrentAdmin,
    createTrip,
    assignDriverToTrip,
    unassignDriverFromTrip,
    updateTripDetails,
    startTripWithOtp,
    completeTrip,
    cancelTrip,
    deleteTrip,
    clearLocalTripsStorage,
    generateCustomerTrackingLink,
    disableCustomerTrackingLink,
    registerDriver,
    updateDriver,
    toggleDriverStatus,
    resetDriverDeviceBinding,
    deleteDriver,
    cleanDriversTable,
    setDriverOfficeDue,
    clearDriverOfficeDue,
    toggleMasterKillswitch,
    updateBroadcastNotice,
    updateRateCard,
    updateFirebaseConfig,
  } = useCabData();

  const openEditTripPage = (trip: FirestoreTrip) => {
    const tripId = trip.doc_id || trip.trip_id;
    if (!tripId) return;
    window.history.pushState(
      { ...(window.history.state || {}), editTripReturnPath: window.location.pathname + window.location.search },
      '',
      `/trips/${encodeURIComponent(tripId)}/edit`
    );
    setEditTripRouteId(tripId);
  };

  const closeEditTripPage = () => {
    const returnPath = window.history.state?.editTripReturnPath || '/';
    window.history.replaceState({}, '', returnPath);
    setEditTripRouteId(getEditTripRouteId());
  };

  const editTrip = editTripRouteId
    ? trips.find((candidate) => candidate.doc_id === editTripRouteId || candidate.trip_id === editTripRouteId) || null
    : null;

  // Idle prefetching of secondary tabs for instantaneous switching without lag
  useEffect(() => {
    if (!isAuthenticated) return;
    const prefetchTimer = setTimeout(() => {
      // Prefetch heavy tabs quietly in the background while user is viewing dispatch board
      import('./components/LiveFleetMap');
      import('./components/FleetAnalytics');
      import('./components/DriverManagement');
      import('./components/TripHistory');
    }, 1800);
    return () => clearTimeout(prefetchTimer);
  }, [isAuthenticated]);

  // 0. DEDICATED PRIVACY POLICY & ACCOUNT DELETION PAGES (Google Play compliance & public legal documents)
  // Dedicated, isolated document pages with zero admin options, sidebars, or headers
  if (isPrivacyRoute) {
    return <PrivacyPolicyPage />;
  }

  if (isAccountDeletionRoute) {
    return <AccountDeletionPage />;
  }

  // 1. DEDICATED CUSTOMER TRACKING SESSION (Customer clicked SMS/WhatsApp/Live link)
  // STRICT SECURITY ISOLATION:
  // - Customers only see their live tracking or "Your link is expired" page.
  // - Admin panel, dispatch records, drivers database, and settings are NEVER rendered or accessible.
  // - No "Console" or exit buttons are provided to customers.
  if (urlTrackingToken) {
    const cleanToken = urlTrackingToken.trim();
    const matchingTrip = trips.find(
      (t) =>
        t.tracking_token === cleanToken ||
        t.trip_id === cleanToken ||
        t.doc_id === cleanToken ||
        (t.tracking_token && cleanToken.includes(t.tracking_token)) ||
        (t.trip_id && cleanToken.includes(t.trip_id)) ||
        (t.trip_id && cleanToken.replace('TRK-', '').replace('TRIP-', '') === t.trip_id.replace('TRIP-', ''))
    );
    const matchingDriver = matchingTrip
      ? drivers.find(
          (d) =>
            d.driver_id === matchingTrip.driver_id ||
            (matchingTrip.vehicle_number && d.vehicle_number === matchingTrip.vehicle_number)
        )
      : null;

    return (
      <Suspense fallback={<TabLoadingSkeleton />}>
        <CustomerLiveTracking
          token={cleanToken}
          firebaseConfig={firebaseConfig}
          fallbackTrip={matchingTrip}
          fallbackDriver={matchingDriver}
          allTrips={trips}
          isPreview={false}
        />
      </Suspense>
    );
  }

  // 2. DISPATCHER PREVIEW SESSION (Internal Admin Preview from Dispatch Dashboard Modal)
  if (previewTrackingToken || previewTrip) {
    const activeToken = previewTrackingToken || previewTrip?.tracking_token || previewTrip?.trip_id || '';
    const matchingTrip = previewTrip || trips.find(
      (t) =>
        t.tracking_token === activeToken ||
        t.trip_id === activeToken ||
        t.doc_id === activeToken ||
        (t.trip_id && activeToken.includes(t.trip_id))
    );
    const matchingDriver = matchingTrip
      ? drivers.find(
          (d) =>
            d.driver_id === matchingTrip.driver_id ||
            (matchingTrip.vehicle_number && d.vehicle_number === matchingTrip.vehicle_number)
        )
      : null;

    return (
      <div className="relative w-full min-h-screen">
        {/* Floating Dispatcher Close Preview Control */}
        <div className="fixed top-3 right-3 z-50">
          <button
            onClick={() => {
              setPreviewTrackingToken(null);
              setPreviewTrip(null);
            }}
            className="h-9 whitespace-nowrap rounded-lg border border-[#FECACA] bg-white px-3.5 text-[13px] font-medium text-[#DC2626] transition hover:bg-[#FEF2F2] cursor-pointer"
            title="Exit Dispatcher Preview"
          >
            <span>Close Preview</span>
          </button>
        </div>

        <Suspense fallback={<TabLoadingSkeleton />}>
          <CustomerLiveTracking
            token={activeToken}
            firebaseConfig={firebaseConfig}
            fallbackTrip={matchingTrip}
            fallbackDriver={matchingDriver}
            allTrips={trips}
            isPreview={true}
            onExit={() => {
              setPreviewTrackingToken(null);
              setPreviewTrip(null);
            }}
          />
        </Suspense>
      </div>
    );
  }

  // 3. ADMIN AUTHENTICATION GATE (Requires password configured in .env: VITE_ADMIN_PASSWORD)
  if (!isAuthenticated && !urlTrackingToken) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const openTripCount = trips.filter((t) => t.status === 'OPEN').length;
  const onlineDriverCount = drivers.filter((d) => d.is_online && d.status === 'ACTIVE').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans selection:bg-amber-500 selection:text-slate-950 antialiased overflow-x-hidden w-full max-w-full">
      {/* Sleek Dark Left Sidebar on Desktop (Images 1, 4, 6 style) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openTripCount={openTripCount}
        onlineDriverCount={onlineDriverCount}
        currentAdmin={currentAdmin}
        systemSettings={systemSettings}
        isFirebaseConnected={isFirebaseConnected}
        isSyncing={isSyncing}
        onOpenNewTripModal={() => setIsNewTripModalOpen(true)}
        onOpenNewDriverModal={() => setIsNewDriverModalOpen(true)}
        onOpenSettingsModal={(tab) => handleOpenSettings(tab || 'system')}
        onOpenAdminPermissionsModal={() => setIsAdminPermissionsModalOpen(true)}
        onToggleKillswitch={() => toggleMasterKillswitch(!systemSettings.admin_online)}
        onLogout={handleLogout}
      />

      {/* Main Container: Top Navbar + Page Content */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Top Header & Navigation */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          systemSettings={systemSettings}
          isFirebaseConnected={isFirebaseConnected}
          isSyncing={isSyncing}
          connectionStatusText={connectionStatusText}
          currentAdmin={currentAdmin}
          onOpenNewTripModal={() => setIsNewTripModalOpen(true)}
          onOpenSettingsModal={(tab) => handleOpenSettings(tab || 'system')}
          onOpenNewDriverModal={() => setIsNewDriverModalOpen(true)}
          onOpenAdminPermissionsModal={() => setIsAdminPermissionsModalOpen(true)}
          globalSearchQuery={globalSearchQuery}
          setGlobalSearchQuery={setGlobalSearchQuery}
          onToggleKillswitch={toggleMasterKillswitch}
          trips={trips}
          drivers={drivers}
          isMenuDrawerOpen={isMenuDrawerOpen}
          setIsMenuDrawerOpen={setIsMenuDrawerOpen}
          onLogout={handleLogout}
        />

        {/* Main Content Area with safe padding for mobile bottom dock */}
        <main className={`flex-1 w-full mx-auto min-w-0 ${editTripRouteId || isNewDriverModalOpen ? 'max-w-none px-0 py-0 pb-0' : `max-w-7xl px-2.5 sm:px-6 min-[768px]:max-[1024px]:max-w-[960px] min-[768px]:max-[1024px]:px-5 min-[768px]:max-[1024px]:py-5 lg:px-6 xl:px-8 2xl:px-10 py-3.5 sm:py-6 pb-28 sm:pb-8 ${activeTab === 'radar' ? 'lg:max-w-[1760px]' : activeTab === 'dispatch' || activeTab === 'drivers' || activeTab === 'trips' ? 'lg:max-w-[1600px]' : 'lg:max-w-[1440px]'}`}`}>
          {isNewDriverModalOpen ? (
            <Suspense fallback={<TabLoadingSkeleton />}>
              <NewDriverModal
                isOpen
                onClose={() => setIsNewDriverModalOpen(false)}
                onSubmit={registerDriver}
              />
            </Suspense>
          ) : editTripRouteId ? (
            <Suspense fallback={<TabLoadingSkeleton />}>
              {editTrip ? (
                <EditTripModal
                  isOpen
                  presentation="page"
                  trip={editTrip}
                  drivers={drivers}
                  trips={trips}
                  onClose={closeEditTripPage}
                  onSave={updateTripDetails}
                  onUnassignDriver={unassignDriverFromTrip}
                  onCancelTrip={cancelTrip}
                  onOpenTrackingModal={(selectedTrip) => setTripForTracking(selectedTrip)}
                  onGenerateTrackingLink={generateCustomerTrackingLink}
                />
              ) : (
                <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center px-4">
                  <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <h1 className="text-lg font-bold text-slate-900">Edit Trip</h1>
                    <p className="mt-2 text-sm text-slate-500">
                      {trips.length === 0 && isSyncing
                        ? 'Loading trip details...'
                        : 'This trip could not be found.'}
                    </p>
                    <button
                      type="button"
                      onClick={closeEditTripPage}
                      className="mt-5 min-h-[44px] rounded-lg bg-[#FF9800] px-4 py-2 text-sm font-bold text-white hover:bg-[#e68900]"
                    >
                      Back to Trips
                    </button>
                  </div>
                </div>
              )}
            </Suspense>
          ) : (
            <>
          {activeTab === 'dispatch' && (
            <DispatchBoard
              trips={trips}
              drivers={drivers}
              onOpenNewTripModal={() => {
                setInitialBookingData(null);
                setIsNewTripModalOpen(true);
              }}
              onOpenPasteBookingModal={() => setIsPasteBookingModalOpen(true)}
              onOpenAssignModal={(trip) => setTripToAssign(trip)}
              onOpenEditModal={openEditTripPage}
              onOpenCompleteModal={(trip) => setTripToComplete(trip)}
              onOpenTrackingModal={(trip) => setTripForTracking(trip)}
              onStartTripWithOtp={startTripWithOtp}
              onUnassignDriver={unassignDriverFromTrip}
              onCancelTrip={cancelTrip}
              onDeleteTrip={deleteTrip}
              globalSearchQuery={globalSearchQuery}
              onNavigateToRadar={() => setActiveTab('radar')}
              systemSettings={systemSettings}
              onToggleKillswitch={toggleMasterKillswitch}
              onNavigateToRules={() => handleOpenSettings('security')}
              onNavigateToTrips={() => setActiveTab('trips')}
            />
          )}

          <Suspense fallback={<TabLoadingSkeleton />}>
            {activeTab === 'analytics' && (
              <FleetAnalytics
                drivers={drivers}
                trips={trips}
                onOpenAssignModal={(trip) => setTripToAssign(trip)}
              />
            )}

            {activeTab === 'radar' && (
              <LiveFleetMap
                drivers={drivers}
                trips={trips}
                onOpenAssignModal={(trip) => setTripToAssign(trip)}
              />
            )}

            {activeTab === 'drivers' && (
              <DriverManagement
                drivers={drivers}
                onOpenNewDriverModal={() => setIsNewDriverModalOpen(true)}
                onToggleDriverStatus={toggleDriverStatus}
                onResetDeviceBinding={resetDriverDeviceBinding}
                onDeleteDriver={deleteDriver}
                onUpdateDriver={updateDriver}
                onCleanDriversTable={cleanDriversTable}
                onSetDriverOfficeDue={setDriverOfficeDue}
                onClearDriverOfficeDue={clearDriverOfficeDue}
                isFirebaseConnected={isFirebaseConnected}
                globalSearchQuery={globalSearchQuery}
              />
            )}

            {activeTab === 'trips' && (
              <TripHistory
                trips={trips}
                drivers={drivers}
                onDeleteTrip={deleteTrip}
                globalSearchQuery={globalSearchQuery}
                onOpenTrackingModal={(trip) => setTripForTracking(trip)}
                onOpenEditTrip={openEditTripPage}
                onSetDriverOfficeDue={setDriverOfficeDue}
                onClearDriverOfficeDue={clearDriverOfficeDue}
                onClearLocalTripStorage={clearLocalTripsStorage}
                isFirebaseConnected={isFirebaseConnected}
              />
            )}
          </Suspense>
            </>
          )}
        </main>
      </div>

      {/* Native App-Style Mobile Bottom Navigation Dock (Image 3 style) */}
      {!editTripRouteId && !isNewDriverModalOpen && (
        <MobileBottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenMenuDrawer={() => setIsMenuDrawerOpen(true)}
          openTripCount={openTripCount}
          onlineDriverCount={onlineDriverCount}
          systemSettings={systemSettings}
          isMenuDrawerOpen={isMenuDrawerOpen}
        />
      )}

      {/* On-Demand Modals wrapped in Suspense for ultra-lean initial bundle */}
      <Suspense fallback={null}>
        {isNewTripModalOpen && (
          <NewTripModal
            isOpen={isNewTripModalOpen}
            onClose={() => {
              setIsNewTripModalOpen(false);
              setInitialBookingData(null);
            }}
            onSubmit={createTrip}
            drivers={drivers}
            trips={trips}
            initialBookingData={initialBookingData}
          />
        )}

        {/* Paste Copied Booking Modal */}
        {isPasteBookingModalOpen && (
          <PasteBookingModal
            isOpen={isPasteBookingModalOpen}
            onClose={() => setIsPasteBookingModalOpen(false)}
            onApplyToNewTrip={(data) => {
              setInitialBookingData(data);
              setIsNewTripModalOpen(true);
            }}
            onDirectPostTrip={createTrip}
            drivers={drivers}
          />
        )}

        {tripToAssign && (
          <AssignDriverModal
            trip={tripToAssign}
            drivers={drivers}
            trips={trips}
            onClose={() => setTripToAssign(null)}
            onAssign={assignDriverToTrip}
          />
        )}

        {tripForTracking && (
          <CustomerTrackingModal
            isOpen={Boolean(tripForTracking)}
            trip={tripForTracking}
            assignedDriver={drivers.find(
              (d) =>
                d.driver_id === tripForTracking?.driver_id ||
                (tripForTracking?.vehicle_number && d.vehicle_number === tripForTracking.vehicle_number)
            )}
            onClose={() => setTripForTracking(null)}
            onGenerateLink={async (tripDocId) => {
              const res = await generateCustomerTrackingLink(tripDocId);
              setTripForTracking((prev) =>
                prev && (prev.doc_id === tripDocId || prev.trip_id === tripDocId)
                  ? { ...prev, tracking_token: res.token, tracking_enabled: true }
                  : prev
              );
              return res;
            }}
            onDisableLink={async (tripDocId) => {
              await disableCustomerTrackingLink(tripDocId);
              setTripForTracking((prev) =>
                prev && (prev.doc_id === tripDocId || prev.trip_id === tripDocId)
                  ? { ...prev, tracking_enabled: false }
                  : prev
              );
            }}
            onPreviewCustomerView={(token, selectedTrip) => {
              setPreviewTrackingToken(token);
              setPreviewTrip(selectedTrip || tripForTracking);
            }}
          />
        )}

        {tripToComplete && (
          <CompleteTripModal
            trip={tripToComplete}
            onClose={() => setTripToComplete(null)}
            onComplete={completeTrip}
          />
        )}

        {isSettingsModalOpen && (
          <FirebaseSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            config={firebaseConfig}
            onSave={updateFirebaseConfig}
            isFirebaseConnected={isFirebaseConnected}
            initialTab={settingsModalTab}
            systemSettings={systemSettings}
            logs={logs}
            onToggleKillswitch={toggleMasterKillswitch}
            onUpdateBroadcastNotice={updateBroadcastNotice}
            currentAdmin={currentAdmin}
            onOpenAdminPermissionsModal={() => setIsAdminPermissionsModalOpen(true)}
          />
        )}

        {isAdminPermissionsModalOpen && (
          <AdminPermissionsModal
            isOpen={isAdminPermissionsModalOpen}
            onClose={() => setIsAdminPermissionsModalOpen(false)}
            currentAdmin={currentAdmin}
            adminUsers={adminUsers}
            onAddAdmin={addAdminUser}
            onUpdateAdmin={updateAdminUser}
            onDeleteAdmin={deleteAdminUser}
            onSwitchCurrentAdmin={switchCurrentAdmin}
          />
        )}
      </Suspense>
    </div>
  );
}
