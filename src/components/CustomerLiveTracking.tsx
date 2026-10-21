import React, { useState, useEffect, useRef } from 'react';
import { FirestoreTrip, FirestoreDriver, CustomerTrackingSession, FirebaseConnectionConfig } from '../types';
import { subscribeToCustomerTrackingSession } from '../firebase/config';
import { loadGoogleMaps } from '../services/googleMapsService';
import { getCarIconDataUrl } from '../utils/carIcon';

interface CustomerLiveTrackingProps {
  token: string;
  firebaseConfig: FirebaseConnectionConfig;
  fallbackTrip?: FirestoreTrip | null;
  fallbackDriver?: FirestoreDriver | null;
  allTrips?: FirestoreTrip[];
  isPreview?: boolean;
  onExit?: () => void;
}

const findMatchingTripInList = (list: FirestoreTrip[] | undefined, targetToken: string): FirestoreTrip | null => {
  if (!list || !list.length || !targetToken) return null;
  const clean = targetToken.trim();
  return (
    list.find(
      (t) =>
        t.tracking_token === clean ||
        t.trip_id === clean ||
        t.doc_id === clean ||
        (t.tracking_token && clean.includes(t.tracking_token)) ||
        (t.trip_id && clean.includes(t.trip_id)) ||
        (t.trip_id && clean.replace('TRK-', '').replace('TRIP-', '') === t.trip_id.replace('TRIP-', ''))
    ) || null
  );
};

export const CustomerLiveTracking: React.FC<CustomerLiveTrackingProps> = ({
  token,
  firebaseConfig,
  fallbackTrip,
  fallbackDriver,
  allTrips,
  isPreview = false,
  onExit,
}) => {
  // Resolve matching trip from props or allTrips
  const matchedTrip = fallbackTrip || findMatchingTripInList(allTrips, token);

  const [session, setSession] = useState<CustomerTrackingSession | null>(null);
  const [trip, setTrip] = useState<FirestoreTrip | null>(matchedTrip || null);
  const [driver, setDriver] = useState<FirestoreDriver | null>(fallbackDriver || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [expiryReason, setExpiryReason] = useState<string>('');
  const [etaMinutes, setEtaMinutes] = useState<number>(7);

  // Map state
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropMarkerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet' | 'radar'>('google');

  // Leaflet map refs
  const leafletMapRef = useRef<any>(null);
  const leafletDriverMarkerRef = useRef<any>(null);
  const leafletPickupMarkerRef = useRef<any>(null);
  const leafletDropMarkerRef = useRef<any>(null);

  const currentTrip = trip || matchedTrip;
  const matchedTripRef = useRef<FirestoreTrip | null>(matchedTrip || null);
  const fallbackDriverRef = useRef<FirestoreDriver | null>(fallbackDriver || null);
  matchedTripRef.current = matchedTrip || null;
  fallbackDriverRef.current = fallbackDriver || null;
  const hasInitialFitBoundsRef = useRef(false);
  const hasInitialDriverCameraRef = useRef(false);
  const shouldFollowDriverRef = useRef(true);
  const googleCameraListenersAttachedRef = useRef(false);
  const leafletCameraListenersAttachedRef = useRef(false);
  const driverAnimFrameRef = useRef<number | null>(null);
  const lastTripIdRef = useRef<string | null>(null);

  // Reset bounds fit state when trip ID changes
  useEffect(() => {
    if (currentTrip?.trip_id && currentTrip.trip_id !== lastTripIdRef.current) {
      lastTripIdRef.current = currentTrip.trip_id;
      hasInitialFitBoundsRef.current = false;
      hasInitialDriverCameraRef.current = false;
      shouldFollowDriverRef.current = true;
    }
  }, [currentTrip?.trip_id]);

  // Synchronize with matchedTrip when it arrives or updates
  useEffect(() => {
    if (matchedTrip) {
      setTrip(matchedTrip);
      setIsLoading(false);
      setIsExpired(matchedTrip.status === 'COMPLETED' || matchedTrip.status === 'CANCELLED');
    }
  }, [matchedTrip]);

  // Synchronize driver when fallbackDriver arrives or updates
  useEffect(() => {
    if (fallbackDriver) {
      setDriver(fallbackDriver);
    }
  }, [fallbackDriver]);

  // 1. Subscribe to ONLY this specific tracking token & trip
  useEffect(() => {
    setIsLoading(true);
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    const unsub = subscribeToCustomerTrackingSession(
      firebaseConfig,
      token,
      ({ session: s, trip: t, driver: d, isExpired: exp, reason }) => {
        setIsLoading(false);
        if (s) setSession(s);
        if (t) {
          setTrip(t);
          setIsExpired(exp || t.tracking_enabled === false);
          if (reason) setExpiryReason(reason);
        } else if (exp) {
          // If we already have an active trip from fallbackTrip or allTrips, NEVER mark as expired!
          const fallback = matchedTripRef.current;
          if (!fallback || fallback.status === 'COMPLETED' || fallback.status === 'CANCELLED') {
            setIsExpired(true);
            if (reason) setExpiryReason(reason);
          }
        }
        if (d) setDriver(d);
      },
      (err) => {
        console.warn('Customer tracking subscribe notice:', err);
        setIsLoading(false);
        // If local fallback trip exists and matches token, keep using it
        const fallback = matchedTripRef.current;
        const fallbackDriverValue = fallbackDriverRef.current;
        if (fallback) {
          setTrip(fallback);
          if (fallbackDriverValue) setDriver(fallbackDriverValue);
          setIsExpired(fallback.status === 'COMPLETED' || fallback.status === 'CANCELLED');
        } else {
          // If no trip loaded yet, wait briefly before expiring
          expiryTimer = setTimeout(() => {
            setTrip((currentT) => {
              if (!currentT && !matchedTripRef.current) {
                setIsExpired(true);
                setExpiryReason('Unable to load live tracking session.');
              }
              return currentT;
            });
          }, 2500);
        }
      }
    );

    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (typeof unsub === 'function') {
        unsub();
      }
    };
  }, [token, firebaseConfig]);

  // Compute live ETA based on distance and trip status
  useEffect(() => {
    if (!currentTrip) return;
    if (currentTrip.status === 'COMPLETED' || currentTrip.status === 'CANCELLED') {
      setEtaMinutes(0);
      return;
    }

    if (currentTrip.status === 'IN_PROGRESS') {
      const dist = currentTrip.distance_km || 8;
      // Assume average city speed 25 km/h
      const estMins = Math.max(2, Math.round((dist / 25) * 60));
      setEtaMinutes(estMins);
    } else if (currentTrip.status === 'ACCEPTED') {
      // Driver en route to pickup: 3-8 mins
      setEtaMinutes(6);
    } else {
      setEtaMinutes(10);
    }
  }, [currentTrip]);

  // 2. Initialize Map (Google Maps first, falling back smoothly to Leaflet OpenStreetMap)
  useEffect(() => {
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame: number | null = null;

    const refreshGoogleMapSize = () => {
      if (!googleMapRef.current || !mapContainerRef.current) return;
      if (mapContainerRef.current.clientWidth === 0 || mapContainerRef.current.clientHeight === 0) return;
      const google = (window as any).google;
      if (google?.maps?.event) {
        google.maps.event.trigger(googleMapRef.current, 'resize');
      }
    };

    async function initMap() {
      // The admin preview is mounted conditionally. Wait one frame so Google Maps
      // sees the final, visible container dimensions instead of a zero-sized node.
      await new Promise<void>((resolve) => {
        resizeFrame = requestAnimationFrame(() => resolve());
      });
      if (isCancelled || !mapContainerRef.current) return;

      const pickupLat = currentTrip?.pickup_lat ?? 11.0168;
      const pickupLng = currentTrip?.pickup_lng ?? 76.9558;
      const center = { lat: pickupLat, lng: pickupLng };

      const driverHasValidLocation = Number.isFinite(driver?.latitude) && Number.isFinite(driver?.longitude);
      const driverPos = driverHasValidLocation
        ? { lat: driver.latitude as number, lng: driver.longitude as number }
        : null;

      // Pure 3D White Car ONLY (no top small icon, no floating badge)
      const carIconDataUrl = getCarIconDataUrl({
        isOnline: true,
        showStatusBadge: false,
      });

      // 1. Try Google Maps first
      try {
        const google = await loadGoogleMaps();
        if (isCancelled || !mapContainerRef.current) return;

        if (google && google.maps) {
          setMapEngine('google');

          if (!googleMapRef.current) {
            googleMapRef.current = new google.maps.Map(mapContainerRef.current, {
              center: driverPos || center,
              zoom: 14,
              disableDefaultUI: true,
              zoomControl: true,
              styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
              ],
            });
          }

          const map = googleMapRef.current;

          // Pickup Marker
          if (!pickupMarkerRef.current) {
            pickupMarkerRef.current = new google.maps.Marker({
              position: center,
              map,
              title: 'Pickup Location',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#10B981',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
              },
            });
          }

          // Drop Marker if coords available
          if (currentTrip?.drop_lat && currentTrip?.drop_lng && !dropMarkerRef.current) {
            dropMarkerRef.current = new google.maps.Marker({
              position: { lat: currentTrip.drop_lat, lng: currentTrip.drop_lng },
              map,
              title: 'Destination',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#EF4444',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
              },
            });
          }

          // Driver Car Marker - Pure 3D White Car ONLY (No top icon)
          if (driverPos) {
            const carMarkerIcon = {
              url: carIconDataUrl,
              scaledSize: new google.maps.Size(60, 40),
              anchor: new google.maps.Point(30, 20),
            };

            if (!driverMarkerRef.current) {
              driverMarkerRef.current = new google.maps.Marker({
                position: driverPos,
                map,
                title: driver?.driver_name || 'Your Cab',
                icon: carMarkerIcon,
              });
            } else {
              driverMarkerRef.current.setVisible(true);
              driverMarkerRef.current.setIcon(carMarkerIcon);
              // Smoothly glide to new position instead of snapping or jumping
              const curPos = driverMarkerRef.current.getPosition();
              if (curPos) {
                const startLat = curPos.lat();
                const startLng = curPos.lng();
                const targetLat = driverPos.lat;
                const targetLng = driverPos.lng;
                const delta = Math.hypot(targetLat - startLat, targetLng - startLng);

                if (delta > 0.000005 && delta < 0.05) {
                  if (driverAnimFrameRef.current) {
                    cancelAnimationFrame(driverAnimFrameRef.current);
                  }
                  const startTime = performance.now();
                  const duration = 30000; // 30 seconds continuous linear movement
                  const step = (now: number) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const ease = progress; // Linear progression for live tracking
                    driverMarkerRef.current?.setPosition({
                      lat: startLat + (targetLat - startLat) * ease,
                      lng: startLng + (targetLng - startLng) * ease,
                    });
                    if (progress < 1) {
                      driverAnimFrameRef.current = requestAnimationFrame(step);
                    } else {
                      driverAnimFrameRef.current = null;
                    }
                  };
                  driverAnimFrameRef.current = requestAnimationFrame(step);
                } else if (delta >= 0.05) {
                  driverMarkerRef.current.setPosition(driverPos);
                }
              } else {
                driverMarkerRef.current.setPosition(driverPos);
              }
            }
          } else if (driverMarkerRef.current) {
            driverMarkerRef.current.setVisible(false);
          }

          // Focus the driver once at street level, then smoothly follow live GPS updates.
          if (!hasInitialDriverCameraRef.current && driverPos) {
            map.setCenter(driverPos);
            map.setZoom(14);
            hasInitialDriverCameraRef.current = true;
          } else if (hasInitialDriverCameraRef.current && driverPos && shouldFollowDriverRef.current) {
            map.panTo(driverPos);
          } else if (!hasInitialDriverCameraRef.current && !hasInitialFitBoundsRef.current) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(center);
            if (driverPos) {
              bounds.extend(driverPos);
            }
            if (currentTrip?.drop_lat && currentTrip?.drop_lng) {
              bounds.extend({ lat: currentTrip.drop_lat, lng: currentTrip.drop_lng });
            }
            map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
            hasInitialFitBoundsRef.current = true;
          }
          if (!googleCameraListenersAttachedRef.current) {
            google.maps.event.addListener(map, 'dragstart', () => {
              shouldFollowDriverRef.current = false;
            });
            google.maps.event.addListener(map, 'zoom_changed', () => {
              shouldFollowDriverRef.current = false;
            });
            googleCameraListenersAttachedRef.current = true;
          }
          refreshGoogleMapSize();
          resizeObserver = new ResizeObserver(() => refreshGoogleMapSize());
          resizeObserver.observe(mapContainerRef.current);
          return;
        }
      } catch (err) {
        // Continue to Leaflet fallback
      }

      // 2. Leaflet Fallback (OpenStreetMap)
      try {
        const LModule = await import('leaflet');
        const L = LModule.default;
        if (isCancelled || !mapContainerRef.current) return;

        setMapEngine('leaflet');

        if (!leafletMapRef.current) {
          const map = L.map(mapContainerRef.current, {
            center: driverPos ? [driverPos.lat, driverPos.lng] : [pickupLat, pickupLng],
            zoom: 14,
            zoomControl: true,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);

          leafletMapRef.current = map;
        }

        const map = leafletMapRef.current;

        // Pickup Marker (Green Dot)
        if (!leafletPickupMarkerRef.current) {
          const pickupIcon = L.divIcon({
            className: 'custom-pickup-pin',
            html: `
              <div style="width: 24px; height: 24px; border-radius: 9999px; background: #10B981; border: 2px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-weight: 900; font-size: 11px; font-family: system-ui, sans-serif;">
                A
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          leafletPickupMarkerRef.current = L.marker([pickupLat, pickupLng], { icon: pickupIcon }).addTo(map);
        } else {
          leafletPickupMarkerRef.current.setLatLng([pickupLat, pickupLng]);
        }

        // Drop Marker (Red Dot)
        if (currentTrip?.drop_lat && currentTrip?.drop_lng) {
          if (!leafletDropMarkerRef.current) {
            const dropIcon = L.divIcon({
              className: 'custom-drop-pin',
              html: `
                <div style="width: 24px; height: 24px; border-radius: 9999px; background: #EF4444; border: 2px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-weight: 900; font-size: 11px; font-family: system-ui, sans-serif;">
                  B
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });
            leafletDropMarkerRef.current = L.marker([currentTrip.drop_lat, currentTrip.drop_lng], { icon: dropIcon }).addTo(map);
          } else {
            leafletDropMarkerRef.current.setLatLng([currentTrip.drop_lat, currentTrip.drop_lng]);
          }
        }

        // Driver Car Marker - Pure 3D White Car ONLY (No top icon)
        if (driverPos) {
        const carIcon = L.divIcon({
          className: 'custom-tracking-car-pin',
          html: `
            <div style="
              width: 60px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              filter: drop-shadow(0 4px 8px rgba(0,0,0,0.28));
              cursor: pointer;
            ">
              <img src="${carIconDataUrl}" style="width: 60px; height: 40px; object-fit: contain; pointer-events: none;" alt="3D White Car" />
            </div>
          `,
          iconSize: [60, 40],
          iconAnchor: [30, 20],
        });

        if (!leafletDriverMarkerRef.current) {
          leafletDriverMarkerRef.current = L.marker([driverPos.lat, driverPos.lng], { icon: carIcon }).addTo(map);
        } else {
          leafletDriverMarkerRef.current.setOpacity(1);
          leafletDriverMarkerRef.current.setIcon(carIcon);
          
          const curPos = leafletDriverMarkerRef.current.getLatLng();
          if (curPos) {
            const startLat = curPos.lat;
            const startLng = curPos.lng;
            const targetLat = driverPos.lat;
            const targetLng = driverPos.lng;
            const delta = Math.hypot(targetLat - startLat, targetLng - startLng);

            if (delta > 0.000005 && delta < 0.05) {
              if (driverAnimFrameRef.current) {
                cancelAnimationFrame(driverAnimFrameRef.current);
              }
              const startTime = performance.now();
              const duration = 30000;
              const step = (now: number) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress; // Linear
                leafletDriverMarkerRef.current?.setLatLng([
                  startLat + (targetLat - startLat) * ease,
                  startLng + (targetLng - startLng) * ease,
                ]);
                if (progress < 1) {
                  driverAnimFrameRef.current = requestAnimationFrame(step);
                } else {
                  driverAnimFrameRef.current = null;
                }
              };
              driverAnimFrameRef.current = requestAnimationFrame(step);
            } else if (delta >= 0.05) {
              leafletDriverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
            }
          } else {
            leafletDriverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
          }
        }
        } else if (leafletDriverMarkerRef.current) {
          leafletDriverMarkerRef.current.setOpacity(0);
        }

        if (!leafletCameraListenersAttachedRef.current) {
          map.on('dragstart zoomstart', () => {
            shouldFollowDriverRef.current = false;
          });
          leafletCameraListenersAttachedRef.current = true;
        }
        if (driverPos && !hasInitialDriverCameraRef.current) {
          map.setView([driverPos.lat, driverPos.lng], 14);
          hasInitialDriverCameraRef.current = true;
        } else if (driverPos && shouldFollowDriverRef.current) {
          map.panTo([driverPos.lat, driverPos.lng]);
        } else if (!hasInitialDriverCameraRef.current && !hasInitialFitBoundsRef.current) {
          // Preserve the existing fallback view when driver GPS is unavailable.
          const latLngs: [number, number][] = [[pickupLat, pickupLng]];
          if (currentTrip?.drop_lat && currentTrip?.drop_lng) {
            latLngs.push([currentTrip.drop_lat, currentTrip.drop_lng]);
          }
          map.fitBounds(latLngs, { padding: [50, 50] });
          hasInitialFitBoundsRef.current = true;
        }
      } catch (e) {
        // Fallback to high-fidelity radar canvas
        setMapEngine('radar');
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      if (driverAnimFrameRef.current) {
        cancelAnimationFrame(driverAnimFrameRef.current);
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletDriverMarkerRef.current = null;
        leafletPickupMarkerRef.current = null;
        leafletDropMarkerRef.current = null;
      }
    };
  }, [currentTrip, driver]);

  // Status mapping
  const getStatusDisplay = () => {
    if (!currentTrip) return { label: 'Finding Ride', color: 'bg-amber-500 text-slate-950', sub: 'Connecting with driver...' };
    switch (currentTrip.status) {
      case 'OPEN':
        return { label: 'Matching Driver', color: 'bg-amber-500 text-slate-950', sub: 'Dispatching to nearest vehicle' };
      case 'ACCEPTED':
        return { label: 'Driver Assigned', color: 'bg-sky-500 text-white', sub: 'Vehicle is heading to pickup' };
      case 'IN_PROGRESS':
        return { label: 'Ride In Progress', color: 'bg-emerald-600 text-white', sub: 'En route to destination' };
      case 'COMPLETED':
        return { label: 'Trip Completed', color: 'bg-slate-900 text-white', sub: 'Thank you for riding with us' };
      case 'CANCELLED':
        return { label: 'Trip Cancelled', color: 'bg-rose-600 text-white', sub: 'This ride has been cancelled' };
      default:
        return { label: currentTrip.status, color: 'bg-amber-500 text-slate-950', sub: 'Status updated' };
    }
  };

  const statusInfo = getStatusDisplay();
  const assignedDriverId = currentTrip?.driver_id || session?.driver_id || fallbackDriver?.driver_id;
  const normalizedAssignedDriverId = assignedDriverId?.trim().toLowerCase();
  const assignedDriver = [driver, fallbackDriver].find(
    (candidate) => {
      if (!candidate) return false;
      if (!normalizedAssignedDriverId) return true;
      return [candidate.driver_id, candidate.doc_id]
        .filter(Boolean)
        .some((id) => id?.trim().toLowerCase() === normalizedAssignedDriverId);
    }
  ) || null;
  const driverName = assignedDriver?.driver_name || currentTrip?.driver_name || 'Assigned Driver';
  const vehiclePlate = assignedDriver?.vehicle_number || currentTrip?.vehicle_number || 'Vehicle Assigned';
  const vehicleCategory = assignedDriver?.vehicle_category || currentTrip?.vehicle_category || 'Vehicle category unavailable';
  const driverPhone = assignedDriver?.mobile_number || currentTrip?.driver_phone;
  const driverRating = assignedDriver?.rating || 4.9;

  // Loading screen while initial session handshake completes
  if (isLoading && !currentTrip) {
    return (
      <div className="relative flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center bg-[#FFF8F8] px-6 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-[#111827] select-none">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[#FECACA] border-t-[#DC2626]" aria-hidden="true" />
        <h2 className="text-base font-semibold text-[#111827]">Loading Trip Details</h2>
      </div>
    );
  }

  // CRITICAL USER DIRECTIVE:
  // "fix only expire if COMPLETED or CANCELLED"
  // "In-process trips still showing Your link is expired active tyrip also showing like this Your link is expired fix it properly"
  // Active in-process trips (IN_PROGRESS, ACCEPTED, OPEN) MUST NEVER BE EXPIRED!
  const isTripFinished = currentTrip
    ? (currentTrip.status === 'COMPLETED' || currentTrip.status === 'CANCELLED')
    : false;
  const isLinkExpired = currentTrip ? isTripFinished : (!isLoading && isExpired);

  // If ride is complete, cancelled, or tracking link is expired/disabled:
  if (isLinkExpired) {
    return (
      <div className="relative flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center bg-[#FFF8F8] px-6 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-[#111827] select-none">
        <div className="flex w-full max-w-sm flex-col items-center">
          <h1 className="mb-2 text-xl font-semibold tracking-tight text-[#111827] sm:text-2xl">
            Tracking Unavailable
          </h1>
          <p className="mb-5 text-sm leading-relaxed text-[#64748B]">
            This tracking link is no longer active.
          </p>
          <a
            href="tel:+914223596446"
            className="inline-flex min-h-11 w-full max-w-[220px] items-center justify-center rounded-lg bg-[#DC2626] px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Call Office
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#FFF8F8] font-sans text-[#111827] select-none">
      {/* 1. TOP BRANDED HEADER (Light Theme) */}
      <header className="relative z-30 flex items-center justify-between border-b border-[#F1DADA] bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-[#FEE2E2] px-2.5 py-1 text-[10px] font-semibold text-[#DC2626]">
            LIVE
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-[#FEE2E2] px-3 py-1 text-[11px] font-semibold text-[#DC2626]">
            {statusInfo.label}
          </span>
        </div>
      </header>

      {/* 2. MAIN INTERACTIVE MAP / VECTOR RADAR VIEW (Light Theme) */}
      <div className="relative min-h-[420px] flex-1 w-full overflow-hidden bg-[#FEE2E2]">
        {/* Interactive Street Map (Google Maps or Leaflet OpenStreetMap) */}
        <div
          ref={mapContainerRef}
          className={`!block absolute inset-0 w-full h-full transition-opacity duration-500 ${
            mapEngine !== 'radar' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        />

        {/* High-Fidelity Fallback Live Radar Canvas (if network maps not reachable) */}
        {mapEngine === 'radar' && (
          <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#FFF8F8] via-white to-[#FEE2E2] p-4">
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  'radial-gradient(#d97706 1px, transparent 1px), linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '30px 30px',
              }}
            />

            {/* Radar Animation Ring */}
            <div className="relative w-72 h-72 rounded-full border border-amber-500/25 flex items-center justify-center">
              <div className="absolute w-56 h-56 rounded-full border border-amber-500/30 animate-ping opacity-25" />
              <div className="absolute w-40 h-40 rounded-full border border-amber-500/35" />
              <div className="absolute w-24 h-24 rounded-full bg-amber-400/10 border border-amber-500/40" />
              {/* Steady Driver Vehicle Center */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-16 flex items-center justify-center filter drop-shadow-md mb-1">
                  <img
                    src="/icons/white-3d-car.svg"
                    alt="Live Cab"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-xs font-black text-slate-950 bg-amber-400 px-3 py-0.5 rounded-full border border-amber-500 shadow-sm font-mono">
                  {vehiclePlate}
                </span>
                <span className="text-[10px] text-slate-600 mt-1 font-semibold">
                  Live GPS Tracking
                </span>
              </div>
            </div>

            {/* Route Coordinates Summary */}
            <div className="absolute bottom-4 left-4 right-4 max-w-md mx-auto bg-white/95 backdrop-blur-md rounded-2xl p-3 border border-slate-200 text-slate-700 text-xs flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-mono text-slate-600">
                  GPS: {driver?.latitude ? `${driver.latitude.toFixed(4)}, ${driver.longitude?.toFixed(4)}` : 'Active Satellite Fix'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-amber-700">
                Speed: ~34 km/h
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. BOTTOM VEHICLE & TRIP DETAILS CARD */}
      <div className="relative z-30 mx-auto w-full max-w-3xl space-y-4 border-t border-[#F1DADA] bg-white px-4 pb-6 pt-5 sm:px-6 min-[768px]:max-[1024px]:max-w-2xl min-[768px]:max-[1024px]:px-6 lg:max-w-4xl lg:px-8 lg:pb-8">
        <div className="flex flex-col gap-3 border-b border-[#F1DADA] pb-4">
          <div className="!block min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-base font-semibold text-[#111827]">{driverName}</h2>
              <span className="rounded-md bg-[#FEE2E2] px-2 py-1 text-[10px] font-semibold text-[#DC2626]">Verified</span>
            </div>
            <div className="mt-1 space-y-0.5 text-sm text-[#64748B]">
              <p className="break-words">{vehicleCategory}</p>
              <p className="break-words font-medium text-[#111827]">{vehiclePlate}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {driverPhone && (
              <a
                href={`tel:${driverPhone}`}
                className="flex min-h-11 items-center justify-center rounded-lg bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Call Driver
              </a>
            )}
            <a
              href="tel:+914223596446"
              className={`${driverPhone ? '' : 'col-span-2'} flex min-h-11 items-center justify-center rounded-lg border border-[#DC2626] bg-white px-3 py-2 text-sm font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]`}
            >
              Call Office
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
