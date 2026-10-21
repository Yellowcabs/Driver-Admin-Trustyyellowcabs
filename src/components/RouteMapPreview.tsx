import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  RefreshCw,
  Sparkles,
  Maximize2,
  Minimize2,
  Crosshair,
  ArrowUpDown,
  LocateFixed,
  Layers,
  Info,
} from 'lucide-react';
import {
  loadGoogleMaps,
  calculateDrivingRoute,
  RouteCalcResult,
} from '../services/googleMapsService';

interface RouteMapPreviewProps {
  pickupLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  dropLocation: string;
  dropLat?: number;
  dropLng?: number;
  onCalculatedDistance?: (distanceKm: number, durationMinutes?: number) => void;
  onPickupSelect?: (address: string, lat: number, lng: number) => void;
  onDropSelect?: (address: string, lat: number, lng: number) => void;
  className?: string;
  initialCollapsed?: boolean;
  minimalOverlays?: boolean;
  fillContainer?: boolean;
  cleanAppearance?: boolean;
}

const DEFAULT_CENTER = { lat: 11.0168, lng: 76.9558 }; // Coimbatore Center

export const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  pickupLocation,
  pickupLat,
  pickupLng,
  dropLocation,
  dropLat,
  dropLng,
  onCalculatedDistance,
  onPickupSelect,
  onDropSelect,
  className = '',
  minimalOverlays = false,
  fillContainer = false,
  cleanAppearance = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pinNotification, setPinNotification] = useState<string | null>(null);

  const [routeInfo, setRouteInfo] = useState<RouteCalcResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Map instances
  const googleMapRef = useRef<any>(null);
  const googleDirectionsRendererRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const googlePolylineRef = useRef<any>(null);

  const leafletMapRef = useRef<any>(null);
  const leafletLayerGroupRef = useRef<any>(null);

  const isGoogleMapReady = useRef(false);

  const hasPickup = Boolean(pickupLat !== undefined && pickupLng !== undefined && !isNaN(pickupLat) && !isNaN(pickupLng));
  const hasDrop = Boolean(dropLat !== undefined && dropLng !== undefined && !isNaN(dropLat) && !isNaN(dropLng));
  const hasBoth = hasPickup && hasDrop;

  const fitGoogleMapToRoute = useCallback(() => {
    const map = googleMapRef.current;
    const g = window.google;
    const mapElement = mapContainerRef.current;

    if (!map || !g?.maps || !mapElement || !hasBoth) return;

    const bounds = new g.maps.LatLngBounds();
    bounds.extend({ lat: pickupLat!, lng: pickupLng! });
    bounds.extend({ lat: dropLat!, lng: dropLng! });
    routeInfo?.path?.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));

    const { width, height } = mapElement.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    map.fitBounds(bounds, {
      top: Math.min(76, Math.max(48, height * 0.18)),
      right: Math.min(32, Math.max(20, width * 0.08)),
      bottom: Math.min(44, Math.max(28, height * 0.1)),
      left: Math.min(32, Math.max(20, width * 0.08)),
    });
  }, [hasBoth, pickupLat, pickupLng, dropLat, dropLng, routeInfo]);

  // Recalculate route whenever coordinates change
  useEffect(() => {
    let isCurrent = true;

    if (!hasBoth || pickupLat === undefined || pickupLng === undefined || dropLat === undefined || dropLng === undefined) {
      setRouteInfo(null);
      return;
    }

    async function compute() {
      if (pickupLat === undefined || pickupLng === undefined || dropLat === undefined || dropLng === undefined) return;
      setIsCalculating(true);

      try {
        const result = await calculateDrivingRoute(
          { lat: pickupLat, lng: pickupLng },
          { lat: dropLat, lng: dropLng }
        );

        if (isCurrent) {
          setRouteInfo(result);
          if (onCalculatedDistance && result.distanceKm) {
            const mins = Math.round(result.durationSeconds / 60) || 15;
            onCalculatedDistance(result.distanceKm, mins);
          }
        }
      } catch (err) {
        console.warn('Route calculation error:', err);
      } finally {
        if (isCurrent) setIsCalculating(false);
      }
    }

    compute();

    return () => {
      isCurrent = false;
    };
  }, [hasBoth, pickupLat, pickupLng, dropLat, dropLng]);

  // Initialize Map Engine (Google Maps JS or Leaflet fallback)
  useEffect(() => {
    let isMounted = true;
    let initializationObserver: ResizeObserver | null = null;

    async function initMap() {
      const mapElement = mapContainerRef.current;
      if (!mapElement) return;

      // Google Maps cannot render tiles when it is initialized before the
      // flex-based mobile canvas has a measurable size. Wait for its first
      // real measurement instead of creating a zero-sized map instance.
      const { width, height } = mapElement.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        initializationObserver?.disconnect();
        initializationObserver = new ResizeObserver(() => {
          const nextSize = mapElement.getBoundingClientRect();
          if (nextSize.width > 0 && nextSize.height > 0) {
            initializationObserver?.disconnect();
            initializationObserver = null;
            initMap();
          }
        });
        initializationObserver.observe(mapElement);
        return;
      }

      const g = await loadGoogleMaps();
      if (!isMounted) return;

      if (g && g.maps && typeof g.maps.Map === 'function' && mapContainerRef.current) {
        try {
          if (!googleMapRef.current) {
            const initialCenter = hasPickup
              ? { lat: pickupLat!, lng: pickupLng! }
              : hasDrop
              ? { lat: dropLat!, lng: dropLng! }
              : DEFAULT_CENTER;

            const map = new g.maps.Map(mapContainerRef.current, {
              center: initialCenter,
              zoom: hasBoth ? 12 : 13,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              zoomControl: true,
              styles: [
                {
                  featureType: 'poi.business',
                  stylers: [{ visibility: 'off' }],
                },
                {
                  featureType: 'transit',
                  elementType: 'labels.icon',
                  stylers: [{ visibility: 'on' }],
                },
              ],
            });

            googleMapRef.current = map;
            isGoogleMapReady.current = true;
          }
          return;
        } catch (e) {
          console.warn('Google Maps initialization failed, trying Leaflet:', e);
        }
      }

      // Leaflet OpenStreetMap Fallback
      try {
        const L = (await import('leaflet')).default;
        if (!mapContainerRef.current) return;

        if (!leafletMapRef.current) {
          const initialCenter: [number, number] = hasPickup
            ? [pickupLat!, pickupLng!]
            : hasDrop
            ? [dropLat!, dropLng!]
            : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

          const map = L.map(mapContainerRef.current, {
            center: initialCenter,
            zoom: hasBoth ? 12 : 13,
            zoomControl: true,
            attributionControl: false,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          const layerGroup = L.layerGroup().addTo(map);
          leafletLayerGroupRef.current = layerGroup;

          leafletMapRef.current = map;
        }
      } catch (leafErr) {
        console.warn('Leaflet fallback error:', leafErr);
        if (isMounted) {
          setMapError('Map unavailable. Check the Google Maps API key or network connection.');
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
      initializationObserver?.disconnect();
    };
  }, []);

  // Update Markers and Polyline on Map whenever points or route change
  useEffect(() => {
    // 1. Google Maps update
    if (googleMapRef.current && window.google?.maps) {
      const g = window.google;
      const map = googleMapRef.current;

      // Clear existing markers
      googleMarkersRef.current.forEach((m) => m.setMap(null));
      googleMarkersRef.current = [];

      if (googlePolylineRef.current) {
        googlePolylineRef.current.setMap(null);
        googlePolylineRef.current = null;
      }

      const bounds = new g.maps.LatLngBounds();

      // Add Pickup Marker
      if (hasPickup && pickupLat !== undefined && pickupLng !== undefined) {
        const pPos = new g.maps.LatLng(pickupLat, pickupLng);
        const markerA = new g.maps.Marker({
          position: pPos,
          map,
          title: `Pickup: ${pickupLocation || 'Origin'}`,
          label: {
            text: 'A',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '12px',
          },
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          },
        });
        googleMarkersRef.current.push(markerA);
        bounds.extend(pPos);
      }

      // Add Drop Marker
      if (hasDrop && dropLat !== undefined && dropLng !== undefined) {
        const dPos = new g.maps.LatLng(dropLat, dropLng);
        const markerB = new g.maps.Marker({
          position: dPos,
          map,
          title: `Drop: ${dropLocation || 'Destination'}`,
          label: {
            text: 'B',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '12px',
          },
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: '#EF4444',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          },
        });
        googleMarkersRef.current.push(markerB);
        bounds.extend(dPos);
      }

      // Draw route path
      if (hasBoth) {
        if (routeInfo?.path && routeInfo.path.length > 0) {
          const pathCoords = routeInfo.path.map((pt) => new g.maps.LatLng(pt.lat, pt.lng));
          const polyline = new g.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: '#F59E0B',
            strokeOpacity: 0.95,
            strokeWeight: 5,
            map,
          });
          googlePolylineRef.current = polyline;
          pathCoords.forEach((pt) => bounds.extend(pt));
        } else {
          // Direct fallback line
          const polyline = new g.maps.Polyline({
            path: [
              new g.maps.LatLng(pickupLat!, pickupLng!),
              new g.maps.LatLng(dropLat!, dropLng!),
            ],
            strokeColor: '#F59E0B',
            strokeOpacity: 0.85,
            strokeWeight: 4,
            map,
          });
          googlePolylineRef.current = polyline;
        }

        fitGoogleMapToRoute();
      } else if (hasPickup) {
        map.setCenter({ lat: pickupLat!, lng: pickupLng! });
        map.setZoom(14);
      } else if (hasDrop) {
        map.setCenter({ lat: dropLat!, lng: dropLng! });
        map.setZoom(14);
      }
    }

    // 2. Leaflet update
    if (leafletMapRef.current && leafletLayerGroupRef.current) {
      import('leaflet').then((LModule) => {
        const L = LModule.default;
        const map = leafletMapRef.current;
        const group = leafletLayerGroupRef.current;
        group.clearLayers();

        const latLngList: [number, number][] = [];

        if (hasPickup && pickupLat !== undefined && pickupLng !== undefined) {
          const pIcon = L.divIcon({
            className: 'custom-pin-a',
            html: `<div style="background:#10B981;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:3px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.35)">A</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([pickupLat, pickupLng], { icon: pIcon })
            .bindTooltip(`Pickup: ${pickupLocation || 'Origin'}`, { direction: 'top' })
            .addTo(group);
          latLngList.push([pickupLat, pickupLng]);
        }

        if (hasDrop && dropLat !== undefined && dropLng !== undefined) {
          const dIcon = L.divIcon({
            className: 'custom-pin-b',
            html: `<div style="background:#EF4444;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:3px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.35)">B</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([dropLat, dropLng], { icon: dIcon })
            .bindTooltip(`Drop: ${dropLocation || 'Destination'}`, { direction: 'top' })
            .addTo(group);
          latLngList.push([dropLat, dropLng]);
        }

        if (hasBoth) {
          if (routeInfo?.path && routeInfo.path.length > 0) {
            const pathCoords: [number, number][] = routeInfo.path.map((pt) => [pt.lat, pt.lng]);
            L.polyline(pathCoords, {
              color: '#F59E0B',
              weight: 5,
              opacity: 0.9,
            }).addTo(group);
            map.fitBounds(pathCoords, { padding: [40, 40] });
          } else {
            L.polyline(latLngList, {
              color: '#F59E0B',
              weight: 4,
              opacity: 0.85,
              dashArray: '6, 8',
            }).addTo(group);
            map.fitBounds(latLngList, { padding: [40, 40] });
          }
        } else if (hasPickup) {
          map.setView([pickupLat!, pickupLng!], 14);
        } else if (hasDrop) {
          map.setView([dropLat!, dropLng!], 14);
        }
      });
    }
  }, [hasPickup, hasDrop, hasBoth, pickupLat, pickupLng, dropLat, dropLng, routeInfo, pickupLocation, dropLocation, fitGoogleMapToRoute]);

  // ResizeObserver to prevent grey tiles and distortion
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const resizeMapAndFitRoute = () => {
      requestAnimationFrame(() => {
        if (!mapContainerRef.current) return;

        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize();
        }
        if (googleMapRef.current && window.google?.maps) {
          window.google.maps.event.trigger(googleMapRef.current, 'resize');
          fitGoogleMapToRoute();
        }
      });
    };

    const resizeObserver = new ResizeObserver(resizeMapAndFitRoute);

    resizeObserver.observe(el);
    window.addEventListener('resize', resizeMapAndFitRoute);
    window.visualViewport?.addEventListener('resize', resizeMapAndFitRoute);
    resizeMapAndFitRoute();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeMapAndFitRoute);
      window.visualViewport?.removeEventListener('resize', resizeMapAndFitRoute);
    };
  }, [isExpanded, fitGoogleMapToRoute]);

  // Re-center map button action
  const handleRecenter = () => {
    if (googleMapRef.current && window.google?.maps) {
      if (hasBoth && pickupLat && dropLat) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend({ lat: pickupLat, lng: pickupLng! });
        bounds.extend({ lat: dropLat, lng: dropLng! });
        googleMapRef.current.fitBounds(bounds, 50);
      } else if (hasPickup && pickupLat && pickupLng) {
        googleMapRef.current.setCenter({ lat: pickupLat, lng: pickupLng });
        googleMapRef.current.setZoom(14);
      } else {
        googleMapRef.current.setCenter(DEFAULT_CENTER);
        googleMapRef.current.setZoom(12);
      }
    } else if (leafletMapRef.current) {
      if (hasBoth && pickupLat && dropLat) {
        leafletMapRef.current.fitBounds([
          [pickupLat, pickupLng!],
          [dropLat, dropLng!],
        ], { padding: [40, 40] });
      } else if (hasPickup && pickupLat && pickupLng) {
        leafletMapRef.current.setView([pickupLat, pickupLng], 14);
      } else {
        leafletMapRef.current.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
      }
    }
  };

  // Swap origin and destination
  const handleSwapLocations = () => {
    if (onPickupSelect && onDropSelect && hasBoth && pickupLat && dropLat) {
      const oldPickupAddr = pickupLocation;
      const oldPickupLat = pickupLat;
      const oldPickupLng = pickupLng!;

      const oldDropAddr = dropLocation;
      const oldDropLat = dropLat;
      const oldDropLng = dropLng!;

      onPickupSelect(oldDropAddr, oldDropLat, oldDropLng);
      onDropSelect(oldPickupAddr, oldPickupLat, oldPickupLng);
      setPinNotification('Swapped Pickup and Destination');
      setTimeout(() => setPinNotification(null), 3000);
    }
  };

  return (
    <div className={`${cleanAppearance ? 'relative overflow-hidden rounded-xl bg-slate-100' : 'relative rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm'} transition-all duration-200 ${className}`}>
      {/* Main Map Canvas - Clean, Immersive & Responsive */}
      <div
        className={`${fillContainer ? 'relative flex w-full min-h-0 flex-1 flex-col' : 'relative w-full'} transition-all duration-300 bg-slate-100 h-72 sm:h-84 md:h-96`}
      >
        <div ref={mapContainerRef} className={fillContainer ? 'w-full min-h-0 flex-1' : 'w-full h-full'} />

        {mapError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-100/95 px-4 text-center text-xs font-semibold text-slate-600" role="alert">
            {mapError}
          </div>
        )}

        {!minimalOverlays && (
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter Route"
            className="absolute top-3 left-3 z-20 p-2 rounded-xl bg-white/95 backdrop-blur-md hover:bg-white text-slate-700 shadow-md border border-slate-200 transition cursor-pointer hover:text-amber-600 active:scale-95"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}

        {/* Temporary Notification Toast */}
        {!minimalOverlays && pinNotification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg border border-amber-500/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{pinNotification}</span>
          </div>
        )}

        {/* Floating Route Distance & Time Badge (When both coordinates available) */}
        {hasBoth && (
          <div className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-20 bg-white/95 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg border border-slate-200 flex items-center gap-2 sm:gap-3 text-xs animate-in fade-in zoom-in-95 duration-200 ${cleanAppearance ? '' : 'backdrop-blur-md shadow-md'}`}>
            {isCalculating ? (
              <div className="flex items-center gap-1.5 text-amber-700 font-bold text-[11px] sm:text-xs">
                <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                <span>Calculating...</span>
              </div>
            ) : routeInfo ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <div>
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-slate-400 block leading-tight">Distance</span>
                  <span className="text-xs sm:text-sm font-black font-mono text-slate-900">{routeInfo.distanceKm} km</span>
                </div>
                <div className="w-px h-5 sm:h-6 bg-slate-200" />
                <div>
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-slate-400 block leading-tight">Driving Time</span>
                  <span className="text-xs sm:text-sm font-black font-mono text-amber-600">
                    {!cleanAppearance && <Clock className="mr-1 inline-block h-2.5 w-2.5 text-amber-500 sm:h-3 sm:w-3" />}
                    {routeInfo.durationText}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Map Legend Overlay */}
        {!minimalOverlays && <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 z-20 bg-white/95 backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-slate-200 shadow-md text-[10px] sm:text-[11px] space-y-1 sm:space-y-1.5 max-w-[200px] sm:max-w-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-emerald-500 text-white font-bold text-[9px] sm:text-[10px] flex items-center justify-center shrink-0">
              A
            </span>
            <span className="min-w-0 break-words font-semibold leading-tight text-slate-800">
              {pickupLocation || 'Pickup location not set'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] sm:text-[10px] flex items-center justify-center shrink-0">
              B
            </span>
            <span className="min-w-0 break-words font-semibold leading-tight text-slate-800">
              {dropLocation || 'Drop destination not set'}
            </span>
          </div>
        </div>}

        {/* Swap button if both are available */}
        {!minimalOverlays && hasBoth && (
          <button
            type="button"
            onClick={handleSwapLocations}
            title="Swap Pickup & Destination"
            className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 z-20 bg-white/95 backdrop-blur-md hover:bg-white text-slate-700 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold shadow-md border border-slate-200 flex items-center gap-1.5 transition cursor-pointer hover:text-amber-600 active:scale-95"
          >
            <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
            <span>Swap</span> A ⇄ B
          </button>
        )}
      </div>
    </div>
  );
};
