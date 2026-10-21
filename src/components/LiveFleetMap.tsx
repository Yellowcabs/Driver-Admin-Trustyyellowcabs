import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { FirestoreDriver, FirestoreTrip } from '../types';
import { escapeHtml } from '../utils/html';
import {
  Car,
  MapPin,
  Radio,
  Phone,
  ShieldCheck,
  Smartphone,
  Navigation,
  RefreshCw,
  Eye,
  Filter,
  Layers,
  BatteryCharging,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Compass,
  Zap,
  Globe,
  CircleDot,
  Send,
  Sparkles,
  CarFront,
  X,
} from 'lucide-react';
import {
  loadGoogleMaps,
  getGoogleMapsApiKey,
  saveGoogleMapsApiKey,
  fetchPlaceSuggestions,
  getPlaceCoordinates,
  PlaceSuggestion,
} from '../services/googleMapsService';
import { getCarIconDataUrl } from '../utils/carIcon';

interface LiveFleetMapProps {
  drivers: FirestoreDriver[];
  trips: FirestoreTrip[];
  onSelectDriver?: (driver: FirestoreDriver) => void;
  onOpenAssignModal?: (trip: FirestoreTrip) => void;
}

// Custom Dark/Dispatch map style for Google Maps
const DISPATCH_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#064e3b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#34d399' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#f59e0b' }, { lightness: -20 }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#78350f' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#fef3c7' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#27272a' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0c4a6e' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
];

export const LiveFleetMap: React.FC<LiveFleetMapProps> = ({
  drivers,
  trips,
  onSelectDriver,
  onOpenAssignModal,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Engine state
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet'>('google');
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(Boolean(getGoogleMapsApiKey()));
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState<boolean>(false);

  // Google Maps instances ref
  const googleMapRef = useRef<any>(null);
  const googleMapContainerRef = useRef<HTMLElement | null>(null);
  const googleMarkersRef = useRef<{ [key: string]: any }>({});
  const markerAnimationsRef = useRef<{ [key: string]: number }>({});
  const googleTripMarkersRef = useRef<any[]>([]);
  const googlePolylinesRef = useRef<any[]>([]);
  const googleRadiusCircleRef = useRef<any>(null);
  const googleTrafficLayerRef = useRef<any>(null);
  const activeInfoWindowRef = useRef<any>(null);

  // Leaflet instances ref (fallback)
  const leafletMapRef = useRef<any>(null);
  const leafletMarkersRef = useRef<{ [key: string]: any }>({});
  const leafletTripMarkersRef = useRef<any[]>([]);

  // UI state - all checkboxes unselected/blank by default
  const [selectedDriver, setSelectedDriver] = useState<FirestoreDriver | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>('');
  const [onlyOnline, setOnlyOnline] = useState<boolean>(false);
  const [showTripRoutes, setShowTripRoutes] = useState<boolean>(false);
  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [mapTheme, setMapTheme] = useState<'standard' | 'satellite' | 'hybrid' | 'dark'>('standard');
  const [showRadiusGeofence, setShowRadiusGeofence] = useState<boolean>(false);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [mobileViewMode, setMobileViewMode] = useState<'map' | 'roster'>('map');
  const [showLayersModal, setShowLayersModal] = useState<boolean>(false);
  const [showLegendMobile, setShowLegendMobile] = useState<boolean>(false);

  // Quick location jump search state
  const [searchLocationQuery, setSearchLocationQuery] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState<boolean>(false);

  const activeTrips = useMemo(
    () => trips.filter(
      (t) => t.status === 'OPEN' || t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS'
    ),
    [trips]
  );

  // Filtered drivers for map & sidebar (optimized for 2000+ drivers)
  const filteredDrivers = useMemo(() => {
    return drivers.filter((drv) => {
      if (onlyOnline && !drv.is_online) return false;
      if (selectedCategory !== 'ALL') {
        const drvCat = (drv.vehicle_category || '').trim().toUpperCase();
        const selCat = selectedCategory.trim().toUpperCase();
        if (drvCat !== selCat) return false;
      }
      if (driverSearchQuery.trim()) {
        const q = driverSearchQuery.trim().toLowerCase();
        const matchName = drv.driver_name.toLowerCase().includes(q);
        const matchId = drv.driver_id.toLowerCase().includes(q);
        const matchPlate = drv.vehicle_number.toLowerCase().includes(q);
        const matchPhone = (drv.mobile_number || '').includes(q);
        if (!matchName && !matchId && !matchPlate && !matchPhone) return false;
      }
      return true;
    });
  }, [drivers, onlyOnline, selectedCategory, driverSearchQuery]);

  // Render on map: show up to 500 closest/matching to prevent map canvas frame drops when 2000+ drivers loaded
  const visibleDrivers = useMemo(() => filteredDrivers.slice(0, 500), [filteredDrivers]);

  // Listen for API key updates
  useEffect(() => {
    const handleKeyChange = (e: any) => {
      const key = e.detail?.key || getGoogleMapsApiKey();
      setHasApiKey(Boolean(key));
      initMap();
    };

    window.addEventListener('google-maps-key-changed', handleKeyChange);
    return () => {
      window.removeEventListener('google-maps-key-changed', handleKeyChange);
    };
  }, []);

  // Helper to construct car icon SVG for Google Maps & Leaflet Markers (3D White Car only)
  const getCarIconUrl = (color: string, isOnline: boolean, vehicleCategory: string) => {
    return getCarIconDataUrl({
      isOnline,
      statusColor: color,
      category: vehicleCategory,
      showStatusBadge: false,
    });
  };

  // Helper for Pickup and Drop Pins
  const getTripPinUrl = (type: 'pickup' | 'drop') => {
    const isPickup = type === 'pickup';
    const color = isPickup ? '#10B981' : '#EF4444';
    const letter = isPickup ? 'P' : 'D';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.3"/>
          </filter>
        </defs>
        <path d="M16 0 C7.163 0 0 7.163 0 16 C0 26 16 40 16 40 C16 40 32 26 32 16 C32 7.163 24.837 0 16 0 Z" fill="${color}" stroke="#FFFFFF" stroke-width="2" filter="url(#shadow)"/>
        <circle cx="16" cy="15" r="8" fill="#FFFFFF"/>
        <text x="16" y="19" font-size="11" font-family="sans-serif" font-weight="900" fill="${color}" text-anchor="middle">${letter}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const cleanupMap = useCallback(() => {
    Object.values(markerAnimationsRef.current).forEach((frameId) => cancelAnimationFrame(frameId));
    markerAnimationsRef.current = {};
    Object.values(googleMarkersRef.current).forEach((marker) => marker?.setMap?.(null));
    googleMarkersRef.current = {};
    googleTripMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
    googleTripMarkersRef.current = [];
    googlePolylinesRef.current.forEach((polyline) => polyline?.setMap?.(null));
    googlePolylinesRef.current = [];
    googleRadiusCircleRef.current?.setMap?.(null);
    googleRadiusCircleRef.current = null;
    googleTrafficLayerRef.current?.setMap?.(null);
    googleTrafficLayerRef.current = null;
    activeInfoWindowRef.current?.close?.();
    activeInfoWindowRef.current = null;
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }
    googleMapRef.current = null;
    googleMapContainerRef.current = null;
    if (mapContainerRef.current) {
      mapContainerRef.current.replaceChildren();
    }
    setIsEngineReady(false);
  }, []);

  // Main Map Initializer
  const initMap = useCallback(async () => {
    const container = mapContainerRef.current;
    if (!container) return;
    if (typeof window === 'undefined') return;

    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    const existingGoogleContainer = googleMapContainerRef.current;
    if (googleMapRef.current && existingGoogleContainer !== container) {
      cleanupMap();
    }

    setIsMapLoading(true);
    setMapError(null);

    // Try Google Maps first
    let g: any = null;
    try {
      g = await loadGoogleMaps();
    } catch (loadError) {
      console.warn('Google Maps loading failed:', loadError);
    }

    if (g && g.maps && typeof g.maps.Map === 'function' && mapContainerRef.current) {
      try {
        setMapEngine('google');

        // Clear existing leaflet map if any
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }

        if (!googleMapRef.current) {
          const defaultCenter = { lat: 11.0168, lng: 76.9558 };
          const map = new g.maps.Map(container, {
            center: defaultCenter,
            zoom: 12,
            mapTypeId:
              mapTheme === 'satellite'
                ? 'satellite'
                : mapTheme === 'hybrid'
                ? 'hybrid'
                : 'roadmap',
            styles: mapTheme === 'dark' ? DISPATCH_DARK_MAP_STYLE : undefined,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            zoomControlOptions: {
              position: g.maps.ControlPosition?.RIGHT_BOTTOM || 9,
            },
          });

          // Initialize Traffic Layer
          if (g.maps.TrafficLayer) {
            const trafficLayer = new g.maps.TrafficLayer();
            googleTrafficLayerRef.current = trafficLayer;
            if (showTraffic) {
              trafficLayer.setMap(map);
            }
          }

          googleMapRef.current = map;
          googleMapContainerRef.current = container;
          setIsEngineReady(true);
          setMapError(null);
        }
        setIsMapLoading(false);
        return;
      } catch (mapErr) {
        console.warn('Google Maps initialization failed, falling back to Leaflet:', mapErr);
      }
    }

    // Fallback to Leaflet if Google Maps not available
    try {
      setMapEngine('leaflet');
      const L = (await import('leaflet')).default;

      if (!leafletMapRef.current && mapContainerRef.current) {
        const defaultCenter = [11.0168, 76.9558] as [number, number];
        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: 12,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        leafletMapRef.current = map;
        setIsEngineReady(true);
        setMapError(null);
      }
    } catch (err) {
      console.warn('Map initialization notice:', err);
      setIsEngineReady(false);
      setMapError('The map could not be loaded. Check the map connection and try again.');
    } finally {
      setIsMapLoading(false);
    }
  }, [cleanupMap, mapTheme, showTraffic]);

  // Initialize only while the radar map is the visible view; settings/roster views
  // can temporarily remove the map container from the DOM.
  useEffect(() => {
    if (showLayersModal || mobileViewMode !== 'map') return;
    void initMap();
  }, [initMap, mobileViewMode, showLayersModal]);

  useEffect(() => cleanupMap, [cleanupMap]);

  // Recalculate map size after tab switches and responsive layout changes.
  useEffect(() => {
    if (showLayersModal || mobileViewMode !== 'map' || !mapContainerRef.current) return;

    const container = mapContainerRef.current;
    const resizeMap = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      if (!googleMapRef.current && !leafletMapRef.current && !isMapLoading) {
        void initMap();
        return;
      }
      if (googleMapRef.current && (window as any).google?.maps) {
        (window as any).google.maps.event.trigger(googleMapRef.current, 'resize');
      }
      if (leafletMapRef.current) leafletMapRef.current.invalidateSize();
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeMap) : null;
    observer?.observe(container);
    const frame = requestAnimationFrame(resizeMap);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [initMap, isEngineReady, isMapLoading, mobileViewMode, showLayersModal]);

  // Apply Map Theme and Traffic to Google Maps
  useEffect(() => {
    if (mapEngine === 'google' && googleMapRef.current && (window as any).google?.maps) {
      const map = googleMapRef.current;

      if (mapTheme === 'satellite') {
        map.setMapTypeId('satellite');
        map.setOptions({ styles: null });
      } else if (mapTheme === 'hybrid') {
        map.setMapTypeId('hybrid');
        map.setOptions({ styles: null });
      } else if (mapTheme === 'dark') {
        map.setMapTypeId('roadmap');
        map.setOptions({ styles: DISPATCH_DARK_MAP_STYLE });
      } else {
        map.setMapTypeId('roadmap');
        map.setOptions({ styles: null });
      }

      if (googleTrafficLayerRef.current) {
        if (showTraffic) {
          googleTrafficLayerRef.current.setMap(map);
        } else {
          googleTrafficLayerRef.current.setMap(null);
        }
      }
    }
  }, [mapTheme, showTraffic, mapEngine]);

  // Update Google Maps Markers and Overlays
  useEffect(() => {
    if (mapEngine !== 'google' || !googleMapRef.current || !(window as any).google?.maps) return;

    const g = (window as any).google;
    const map = googleMapRef.current;

    // 1. Remove markers only for drivers who no longer exist or have null coordinates
    const currentDriverIds = new Set(
      visibleDrivers.filter((d) => d.latitude !== null && d.longitude !== null).map((d) => d.driver_id)
    );

    Object.keys(googleMarkersRef.current).forEach((driverId) => {
      if (!currentDriverIds.has(driverId)) {
        if (markerAnimationsRef.current[driverId]) {
          cancelAnimationFrame(markerAnimationsRef.current[driverId]);
          delete markerAnimationsRef.current[driverId];
        }
        const m = googleMarkersRef.current[driverId];
        if (m && m.setMap) m.setMap(null);
        delete googleMarkersRef.current[driverId];
      }
    });

    // 2. Clear trip markers & polylines
    googleTripMarkersRef.current.forEach((m) => m && m.setMap && m.setMap(null));
    googleTripMarkersRef.current = [];

    googlePolylinesRef.current.forEach((p) => p && p.setMap && p.setMap(null));
    googlePolylinesRef.current = [];

    // 3. Clear or Update Radius Circle
    if (googleRadiusCircleRef.current) {
      googleRadiusCircleRef.current.setMap(null);
      googleRadiusCircleRef.current = null;
    }

    if (showRadiusGeofence && selectedDriver && selectedDriver.latitude && selectedDriver.longitude) {
      const circle = new g.maps.Circle({
        strokeColor: '#F59E0B',
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: '#F59E0B',
        fillOpacity: 0.12,
        map: map,
        center: { lat: selectedDriver.latitude, lng: selectedDriver.longitude },
        radius: radiusKm * 1000, // Convert km to meters
      });
      googleRadiusCircleRef.current = circle;
    }

    // 4. Add or Smoothly Update Driver Markers without dropping or jumping
    visibleDrivers.forEach((drv) => {
      if (drv.latitude === null || drv.longitude === null) return;

      const isBusy = Boolean(drv.current_trip_id);
      const markerColor = !drv.is_online
        ? '#64748B' // slate offline
        : isBusy
        ? '#9333EA' // purple in-trip
        : '#10B981'; // emerald online free

      const iconUrl = getCarIconUrl(markerColor, drv.is_online, drv.vehicle_category);
      const title = `${drv.driver_name} (${drv.vehicle_category})`;

      // InfoWindow Content
      const infoContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 170px; padding: 8px 10px; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 13px; display: block;">${escapeHtml(drv.driver_name)}</strong>

            </div>
            <span style="background: #FEF3C7; color: #92400E; font-size: 10px; font-weight: 800; padding: 3px 6px; border-radius: 6px;">
              ${escapeHtml(drv.vehicle_category)}
            </span>
          </div>
          <div style="margin-top: 6px; font-size: 11px; color: ${drv.is_online ? '#059669' : '#64748b'}; font-weight: 700;">
            ${drv.is_online ? 'Online' : 'Offline'}
          </div>
        </div>
      `;

      const existingMarker = googleMarkersRef.current[drv.driver_id];

      if (existingMarker) {
        // Stop any accidental DROP or BOUNCE animation
        if (existingMarker.getAnimation && existingMarker.getAnimation()) {
          existingMarker.setAnimation(null);
        }

        // Smoothly interpolate position if moved, avoiding sudden snap or jump
        const curPos = existingMarker.getPosition();
        if (curPos) {
          const startLat = curPos.lat();
          const startLng = curPos.lng();
          const targetLat = drv.latitude;
          const targetLng = drv.longitude;
          const delta = Math.hypot(targetLat - startLat, targetLng - startLng);

          if (delta > 0.000005 && delta < 0.05) {
            if (markerAnimationsRef.current[drv.driver_id]) {
              cancelAnimationFrame(markerAnimationsRef.current[drv.driver_id]);
            }
            const startTime = performance.now();
            const duration = 30000; // 30 seconds smooth linear glide

            const step = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const ease = progress; // Linear progression
              existingMarker.setPosition({
                lat: startLat + (targetLat - startLat) * ease,
                lng: startLng + (targetLng - startLng) * ease,
              });
              if (progress < 1) {
                markerAnimationsRef.current[drv.driver_id] = requestAnimationFrame(step);
              } else {
                delete markerAnimationsRef.current[drv.driver_id];
              }
            };
            markerAnimationsRef.current[drv.driver_id] = requestAnimationFrame(step);
          } else if (delta >= 0.05) {
            existingMarker.setPosition({ lat: targetLat, lng: targetLng });
          }
        } else {
          existingMarker.setPosition({ lat: drv.latitude, lng: drv.longitude });
        }

        // Update icon and title
        existingMarker.setIcon({
          url: iconUrl,
          scaledSize: new g.maps.Size(56, 40),
          anchor: new g.maps.Point(28, 20),
        });
        existingMarker.setTitle(title);

        // Update click listener with latest info
        if (g.maps.event && g.maps.event.clearInstanceListeners) {
          g.maps.event.clearInstanceListeners(existingMarker);
        }
        existingMarker.addListener('click', () => {
          if (activeInfoWindowRef.current) {
            activeInfoWindowRef.current.close();
          }
          const infoWindow = new g.maps.InfoWindow({
            content: infoContent,
            maxWidth: 280,
          });
          infoWindow.open(map, existingMarker);
          activeInfoWindowRef.current = infoWindow;
          setSelectedDriver(drv);
          if (onSelectDriver) onSelectDriver(drv);
        });
      } else {
        // Create new marker without DROP or BOUNCE animation so it never jumps
        const marker = new g.maps.Marker({
          position: { lat: drv.latitude, lng: drv.longitude },
          map: map,
          title: title,
          icon: {
            url: iconUrl,
            scaledSize: new g.maps.Size(56, 40),
            anchor: new g.maps.Point(28, 20),
          },
          // CRITICAL: Intentionally no animation to prevent jumping
        });

        marker.addListener('click', () => {
          if (activeInfoWindowRef.current) {
            activeInfoWindowRef.current.close();
          }
          const infoWindow = new g.maps.InfoWindow({
            content: infoContent,
            maxWidth: 280,
          });
          infoWindow.open(map, marker);
          activeInfoWindowRef.current = infoWindow;
          setSelectedDriver(drv);
          if (onSelectDriver) onSelectDriver(drv);
        });

        googleMarkersRef.current[drv.driver_id] = marker;
      }
    });

    // 5. Add Active Trip Routes & Markers
    if (showTripRoutes) {
      activeTrips.forEach((trip) => {
        if (trip.pickup_lat && trip.pickup_lng) {
          const pickupMarker = new g.maps.Marker({
            position: { lat: trip.pickup_lat, lng: trip.pickup_lng },
            map: map,
            title: `Pickup: ${trip.customer_name}`,
            icon: {
              url: getTripPinUrl('pickup'),
              scaledSize: new g.maps.Size(32, 40),
              anchor: new g.maps.Point(16, 40),
            },
          });

          const pInfo = `
            <div style="font-family: system-ui, sans-serif; font-size: 11px; padding: 2px;">
              <div style="font-weight: bold; color: #059669; margin-bottom: 2px;">● Pickup Location</div>
              <strong>${escapeHtml(trip.customer_name)}</strong> (${escapeHtml(
                (trip as FirestoreTrip & { passenger_phone?: string }).passenger_phone || 'No phone'
              )})<br/>
              <span style="color: #475569;">${escapeHtml(trip.pickup_location)}</span><br/>
              <span style="color: #f59e0b; font-weight: bold;">Trip: ${escapeHtml(trip.trip_id)} | Fare: ₹${Number(trip.estimated_fare || (trip as FirestoreTrip & { fare_amount?: number }).fare_amount || 0)}</span>
            </div>
          `;
          pickupMarker.addListener('click', () => {
            if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
            const win = new g.maps.InfoWindow({ content: pInfo });
            win.open(map, pickupMarker);
            activeInfoWindowRef.current = win;
          });

          googleTripMarkersRef.current.push(pickupMarker);
        }

        if (trip.drop_lat && trip.drop_lng) {
          const dropMarker = new g.maps.Marker({
            position: { lat: trip.drop_lat, lng: trip.drop_lng },
            map: map,
            title: `Destination: ${trip.drop_location}`,
            icon: {
              url: getTripPinUrl('drop'),
              scaledSize: new g.maps.Size(32, 40),
              anchor: new g.maps.Point(16, 40),
            },
          });

          const dInfo = `
            <div style="font-family: system-ui, sans-serif; font-size: 11px; padding: 2px;">
              <div style="font-weight: bold; color: #ef4444; margin-bottom: 2px;">● Destination</div>
              <span style="color: #475569;">${escapeHtml(trip.drop_location)}</span>
            </div>
          `;
          dropMarker.addListener('click', () => {
            if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
            const win = new g.maps.InfoWindow({ content: dInfo });
            win.open(map, dropMarker);
            activeInfoWindowRef.current = win;
          });

          googleTripMarkersRef.current.push(dropMarker);
        }

        // Connect pickup and drop with a sleek polyline
        if (trip.pickup_lat && trip.pickup_lng && trip.drop_lat && trip.drop_lng) {
          const line = new g.maps.Polyline({
            path: [
              { lat: trip.pickup_lat, lng: trip.pickup_lng },
              { lat: trip.drop_lat, lng: trip.drop_lng },
            ],
            geodesic: true,
            strokeColor: '#3B82F6',
            strokeOpacity: 0.75,
            strokeWeight: 3.5,
            map: map,
          });
          googlePolylinesRef.current.push(line);
        }
      });
    }
  }, [
    mapEngine,
    visibleDrivers,
    showTripRoutes,
    activeTrips,
    selectedDriver,
    showRadiusGeofence,
    radiusKm,
    onSelectDriver,
  ]);

  // Fallback: Update Leaflet Markers when running on Leaflet
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current) return;

    import('leaflet').then((LModule) => {
      const L = LModule.default;
      const map = leafletMapRef.current;
      if (!map) return;

      // 1. Remove markers for drivers no longer visible
      const currentDriverIds = new Set(
        visibleDrivers.filter((d) => d.latitude !== null && d.longitude !== null).map((d) => d.driver_id)
      );

      Object.keys(leafletMarkersRef.current).forEach((driverId) => {
        if (!currentDriverIds.has(driverId)) {
          const m = leafletMarkersRef.current[driverId];
          if (m && m.remove) m.remove();
          delete leafletMarkersRef.current[driverId];
        }
      });

      leafletTripMarkersRef.current.forEach((m) => m && m.remove && m.remove());
      leafletTripMarkersRef.current = [];

      visibleDrivers.forEach((drv) => {
        if (drv.latitude === null || drv.longitude === null) return;

        const isBusy = Boolean(drv.current_trip_id);
        const markerColor = !drv.is_online ? '#64748B' : isBusy ? '#9333EA' : '#10B981';
        const iconUrl = getCarIconUrl(markerColor, drv.is_online, drv.vehicle_category);

        const customIcon = L.divIcon({
          className: 'custom-driver-pin',
          html: `
            <div style="
              width: 56px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              cursor: pointer;
              filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
            ">
              <img src="${iconUrl}" style="width: 56px; height: 40px; object-fit: contain; pointer-events: none;" alt="Cab" />
            </div>
          `,
          iconSize: [56, 40],
          iconAnchor: [28, 20],
        });

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; min-width: 170px; padding: 8px 10px; color: #0F172A; border: 1px solid #E2E8F0; border-radius: 10px; background: #FFFFFF;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <strong style="font-size: 13px; line-height: 1.3;">${escapeHtml(drv.driver_name)}</strong>
              <span style="font-size: 10px; color: #475569; font-weight: 700;">${escapeHtml(drv.vehicle_category)}</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: ${drv.is_online ? '#059669' : '#64748B'}; font-weight: 700;">
              ${drv.is_online ? 'Online' : 'Offline'}
            </div>
          </div>
        `;

        const existingMarker = leafletMarkersRef.current[drv.driver_id];
        if (existingMarker) {
          existingMarker.setIcon(customIcon);
          existingMarker.setPopupContent(popupContent);
          
          const curPos = existingMarker.getLatLng();
          if (curPos) {
            const startLat = curPos.lat;
            const startLng = curPos.lng;
            const targetLat = drv.latitude;
            const targetLng = drv.longitude;
            const delta = Math.hypot(targetLat - startLat, targetLng - startLng);

            if (delta > 0.000005 && delta < 0.05) {
              if (markerAnimationsRef.current[drv.driver_id]) {
                cancelAnimationFrame(markerAnimationsRef.current[drv.driver_id]);
              }
              const startTime = performance.now();
              const duration = 30000;
              const step = (now: number) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress; // Linear
                existingMarker.setLatLng([
                  startLat + (targetLat - startLat) * ease,
                  startLng + (targetLng - startLng) * ease,
                ]);
                if (progress < 1) {
                  markerAnimationsRef.current[drv.driver_id] = requestAnimationFrame(step);
                } else {
                  delete markerAnimationsRef.current[drv.driver_id];
                }
              };
              markerAnimationsRef.current[drv.driver_id] = requestAnimationFrame(step);
            } else if (delta >= 0.05) {
              existingMarker.setLatLng([targetLat, targetLng]);
            }
          } else {
            existingMarker.setLatLng([drv.latitude, drv.longitude]);
          }
        } else {
          const marker = L.marker([drv.latitude, drv.longitude], { icon: customIcon }).addTo(map);
          marker.bindPopup(popupContent);
          marker.on('click', () => {
            setSelectedDriver(drv);
            if (onSelectDriver) onSelectDriver(drv);
          });
          leafletMarkersRef.current[drv.driver_id] = marker;
        }
      });
    });
  }, [mapEngine, visibleDrivers, onSelectDriver]);

  // Recenter / Focus on selected driver
  const recenterOnDriver = (drv: FirestoreDriver) => {
    setSelectedDriver(drv);
    setMobileViewMode('map');
    if (!drv.latitude || !drv.longitude) return;

    setTimeout(() => {
      if (mapEngine === 'google' && googleMapRef.current && (window as any).google?.maps) {
        const g = (window as any).google;
        g.maps.event.trigger(googleMapRef.current, 'resize');
        googleMapRef.current.panTo({ lat: drv.latitude, lng: drv.longitude });
        googleMapRef.current.setZoom(15);
        const marker = googleMarkersRef.current[drv.driver_id];
        if (marker && g.maps.event) {
          g.maps.event.trigger(marker, 'click');
        }
      } else if (mapEngine === 'leaflet' && leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
        leafletMapRef.current.flyTo([drv.latitude, drv.longitude], 14, { duration: 1.2 });
        const marker = leafletMarkersRef.current[drv.driver_id];
        if (marker) marker.openPopup();
      }
    }, 100);
  };

  const handleSwitchMobileView = (mode: 'map' | 'roster') => {
    setMobileViewMode(mode);
    if (mode === 'map') {
      setTimeout(() => {
        if (googleMapRef.current && (window as any).google?.maps) {
          (window as any).google.maps.event.trigger(googleMapRef.current, 'resize');
        }
        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize();
        }
      }, 100);
    }
  };

  // Center on All Fleet Vehicles
  const centerOnAllFleet = () => {
    const validDrivers = visibleDrivers.filter((d) => d.latitude && d.longitude);
    if (validDrivers.length === 0) return;

    if (mapEngine === 'google' && googleMapRef.current && (window as any).google?.maps) {
      const g = (window as any).google;
      if (g.maps.LatLngBounds) {
        const bounds = new g.maps.LatLngBounds();
        validDrivers.forEach((d) => bounds.extend({ lat: d.latitude!, lng: d.longitude! }));
        googleMapRef.current.fitBounds(bounds);
      }
    } else if (mapEngine === 'leaflet' && leafletMapRef.current) {
      const coords = validDrivers.map((d) => [d.latitude as number, d.longitude as number]);
      leafletMapRef.current.fitBounds(coords, { padding: [50, 50] });
    }
  };

  // Handle Location Search Input
  const handleLocationSearch = async (val: string) => {
    setSearchLocationQuery(val);
    if (val.trim().length >= 2) {
      setIsSearchingLocation(true);
      const res = await fetchPlaceSuggestions(val);
      setSearchSuggestions(res);
      setIsSearchingLocation(false);
    } else {
      setSearchSuggestions([]);
    }
  };

  const handleSelectSearchedPlace = async (sugg: PlaceSuggestion) => {
    setSearchLocationQuery(sugg.mainText);
    setSearchSuggestions([]);
    const coords = await getPlaceCoordinates(sugg.placeId);
    if (coords && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
      googleMapRef.current.setZoom(14);
    }
  };

  const toggleFullScreenMode = () => {
    setIsFullScreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        if (googleMapRef.current && (window as any).google?.maps) {
          (window as any).google.maps.event.trigger(googleMapRef.current, 'resize');
        }
        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize();
        }
      }, 150);
      return next;
    });
  };

  if (showLayersModal) {
    return (
      <div className="min-h-[calc(100vh-7rem)] bg-slate-50 px-3 py-4 pb-24 sm:px-6 sm:py-6 min-[768px]:max-[1024px]:pb-6 lg:px-8">
        <div className="mx-auto max-w-3xl lg:max-w-4xl">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">Map Settings</h1>
            <button
              type="button"
              onClick={() => setShowLayersModal(false)}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Back to Radar
            </button>
          </header>

          <main className="mt-5 space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-slate-950">Map Style</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { id: 'standard', label: 'Standard' },
                  { id: 'satellite', label: 'Satellite' },
                  { id: 'dark', label: 'Night' },
                ].map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setMapTheme(style.id as 'standard' | 'satellite' | 'dark')}
                    className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                      mapTheme === style.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-950">Map Overlays</h2>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {mapEngine === 'google' && (
                  <button
                    type="button"
                    onClick={() => setShowTraffic(!showTraffic)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 bg-white px-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">Live Traffic</span>
                    <span className={`text-xs font-semibold ${showTraffic ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {showTraffic ? 'On' : 'Off'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTripRoutes(!showTripRoutes)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 bg-white px-3 text-left transition hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">Trip Pickups &amp; Lines</span>
                  <span className={`text-xs font-semibold ${showTripRoutes ? 'text-amber-700' : 'text-slate-500'}`}>
                    {showTripRoutes ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            </section>

            <section className="border-t border-slate-200 pt-5">
              <div className="flex min-h-14 items-center justify-between gap-3 border-y border-slate-200 bg-white px-3">
                <h2 className="text-sm font-medium text-slate-800">Geofence Display</h2>
                <button
                  type="button"
                  onClick={() => setShowRadiusGeofence(!showRadiusGeofence)}
                  className={`text-xs font-semibold ${showRadiusGeofence ? 'text-indigo-700' : 'text-slate-500'}`}
                >
                  {showRadiusGeofence ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              {showRadiusGeofence && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {[5, 10, 15, 25, 50].map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setRadiusKm(km)}
                      className={`min-h-10 rounded-lg border text-xs font-semibold transition ${
                        radiusKm === km
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={centerOnAllFleet}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Fit All Fleet
              </button>
            </section>

            <footer className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowLayersModal(false)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 sm:min-w-32"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  centerOnAllFleet();
                  setShowLayersModal(false);
                }}
                className="min-h-11 rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 sm:min-w-40"
              >
                Apply Changes
              </button>
            </footer>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 min-[768px]:max-[1024px]:space-y-3 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-950 p-2 sm:p-4 flex flex-col w-screen h-screen overflow-hidden'
          : 'relative pb-[max(5rem,calc(5rem_+_env(safe-area-inset-bottom)))] min-[768px]:max-[1024px]:pb-0 lg:pb-0'
      }`}
    >
      {/* Mobile Top View Switcher & Quick Filters (Mobile Only) */}
      <div className="lg:hidden space-y-2.5">
        {/* Segmented View Switcher: Live Map vs Fleet Roster */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSwitchMobileView('map')}
            className={`flex-1 rounded-lg text-xs font-semibold transition cursor-pointer min-h-11 ${
              mobileViewMode === 'map'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <span>Live Radar Map</span>
          </button>
          <button
            onClick={() => handleSwitchMobileView('roster')}
            className={`flex-1 rounded-lg text-xs font-semibold transition cursor-pointer min-h-11 ${
              mobileViewMode === 'roster'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <span>Fleet Roster ({filteredDrivers.length})</span>
          </button>
        </div>

        {/* Swipeable Horizontal Quick Filter Pills */}
        <div className="grid grid-cols-2 gap-2 py-0.5 text-xs sm:grid-cols-4">
          {/* Online Only Pill */}
          <button
            onClick={() => setOnlyOnline(!onlyOnline)}
            className={`w-full rounded-lg px-3 py-2 font-semibold transition min-h-11 border ${
              onlyOnline
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>Online ({drivers.filter((d) => d.is_online).length})</span>
          </button>

          {/* Vehicle Category Dropdown */}
          <div className="min-w-0 w-full">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-800 font-semibold rounded-lg px-3 py-2 text-xs min-h-11 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Categories</option>
              <option value="MINI">MINI</option>
              <option value="SEDAN">SEDAN</option>
              <option value="SUV">SUV</option>
              <option value="SUV+">SUV+</option>
              <option value="INNOVA">INNOVA</option>
              <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
            </select>
          </div>

          {/* Trip Routes Pill */}
          <button
            onClick={() => setShowTripRoutes(!showTripRoutes)}
            className={`w-full rounded-lg px-3 py-2 font-semibold transition min-h-11 border ${
              showTripRoutes
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>Trips ({activeTrips.length})</span>
          </button>

          {/* Layers & Controls Modal Trigger */}
          <button
            onClick={() => setShowLayersModal(true)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800 transition hover:bg-slate-50 min-h-11"
          >
            <span>Map Layers</span>
          </button>
        </div>
      </div>

      {/* Desktop Top Controls Header (Desktop Only) */}
      <div
        className={`hidden lg:flex p-3 rounded-2xl border shadow-xs flex-wrap items-center justify-between gap-3 ${
          isFullScreen
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Left Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Vehicle Category Filter */}
          <div className="flex items-center gap-1">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-amber-500 ${
                isFullScreen
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              } border`}
            >
              <option value="ALL">All Categories ({drivers.length})</option>
              <option value="MINI">MINI</option>
              <option value="SEDAN">SEDAN</option>
              <option value="SUV">SUV</option>
              <option value="SUV+">SUV+</option>
              <option value="INNOVA">INNOVA</option>
              <option value="INNOVA CRYSTA">INNOVA CRYSTA</option>
              {Array.from(
                new Set(
                  drivers
                    .map((d) => (d.vehicle_category || '').trim().toUpperCase())
                    .filter((cat) => cat && !['MINI', 'SEDAN', 'SUV', 'SUV+', 'INNOVA', 'INNOVA CRYSTA'].includes(cat))
                )
              ).map((cat) => (
                <option key={cat} value={cat}>
                  {cat} (Custom)
                </option>
              ))}
            </select>
          </div>

          {/* Online Only Filter */}
          <label
            className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-2.5 py-1.5 rounded-lg border transition ${
              isFullScreen
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <input
              type="checkbox"
              checked={onlyOnline}
              onChange={(e) => setOnlyOnline(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            <span>Online ({drivers.filter((d) => d.is_online).length})</span>
          </label>

          {/* Trip Pickups Overlay Toggle */}
          <label
            className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-2.5 py-1.5 rounded-lg border transition ${
              isFullScreen
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <input
              type="checkbox"
              checked={showTripRoutes}
              onChange={(e) => setShowTripRoutes(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            <span>Trip Routes ({activeTrips.length})</span>
          </label>

          {/* Traffic Layer Toggle (Google Maps only) */}
          {mapEngine === 'google' && (
            <button
              onClick={() => setShowTraffic(!showTraffic)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition border ${
                showTraffic
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : isFullScreen
                  ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${showTraffic ? 'text-amber-300' : 'text-slate-400'}`} />
              <span>Live Traffic</span>
            </button>
          )}

          {/* Dispatch Geofence Toggle */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
              isFullScreen
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <label className="flex items-center gap-1 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={showRadiusGeofence}
                onChange={(e) => setShowRadiusGeofence(e.target.checked)}
                className="rounded text-amber-500"
              />
              <span>Radius:</span>
            </label>
            {showRadiusGeofence && (
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
              >
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
                <option value={15}>15 km</option>
                <option value={25}>25 km</option>
                <option value={50}>50 km</option>
              </select>
            )}
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Full Screen Option Toggle Button */}
          <button
            onClick={toggleFullScreenMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
              isFullScreen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-2 ring-amber-400/40'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Radar Map'}
          >
            {isFullScreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Full Screen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Screen Map</span>
              </>
            )}
          </button>

          {/* Toggle Sidebar in Fullscreen */}
          {isFullScreen && (
            <button
              onClick={() => {
                setShowSidebar(!showSidebar);
                setTimeout(() => {
                  if (googleMapRef.current && (window as any).google?.maps) {
                    (window as any).google.maps.event.trigger(googleMapRef.current, 'resize');
                  }
                }, 100);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg transition"
            >
              <Filter className="w-3.5 h-3.5 text-amber-400" />
              <span>{showSidebar ? 'Hide Fleet Roster' : 'Show Fleet Roster'}</span>
            </button>
          )}

          {/* Map Style Selector (Google Maps) */}
          {mapEngine === 'google' && (
            <div
              className={`flex items-center p-0.5 rounded-lg border text-xs font-bold ${
                isFullScreen ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={() => setMapTheme('standard')}
                className={`px-2 py-1 rounded-md transition ${
                  mapTheme === 'standard'
                    ? isFullScreen
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-slate-900 shadow-xs'
                    : isFullScreen
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600'
                }`}
              >
                Map
              </button>
              <button
                onClick={() => setMapTheme('satellite')}
                className={`px-2 py-1 rounded-md transition ${
                  mapTheme === 'satellite'
                    ? isFullScreen
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-slate-900 shadow-xs'
                    : isFullScreen
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600'
                }`}
              >
                Satellite
              </button>
              <button
                onClick={() => setMapTheme('dark')}
                className={`px-2 py-1 rounded-md transition ${
                  mapTheme === 'dark'
                    ? 'bg-slate-900 text-amber-400 shadow-xs'
                    : isFullScreen
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600'
                }`}
              >
                Night
              </button>
            </div>
          )}

          {/* Fit All Fleet Button */}
          <button
            onClick={centerOnAllFleet}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
              isFullScreen
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Fit All</span>
          </button>
        </div>
      </div>

      {/* Main Map + Sidebar Grid (Mobile-Responsive Single-Mode or Desktop Multi-Column) */}
      <div
        className={`grid gap-3 lg:gap-4 ${
          isFullScreen
            ? showSidebar
              ? 'grid-cols-1 lg:grid-cols-4 flex-1 min-h-0'
              : 'grid-cols-1 flex-1 min-h-0'
            : 'grid-cols-1 lg:grid-cols-4 min-h-0 lg:h-[calc(100dvh-12rem)] lg:min-h-[620px] lg:max-h-[900px]'
        }`}
      >
        {/* Main Map Stage: Visible on mobile when mode === 'map', and always visible on desktop */}
        <div
          className={`${
            isFullScreen && !showSidebar ? 'lg:col-span-1' : 'lg:col-span-3'
          } rounded-2xl border border-slate-200 shadow-xs overflow-hidden relative bg-slate-100 flex flex-col ${
            mobileViewMode === 'map'
              ? 'flex h-[calc(100dvh_-_18rem_-_env(safe-area-inset-bottom))] min-h-0'
              : 'hidden'
          } min-[768px]:max-[1024px]:h-[calc(100dvh-16rem)] min-[768px]:max-[1024px]:min-h-[500px] lg:flex lg:h-full`}
        >
          {/* Floating Map Action Buttons (Fit All, Layers, Full Screen) */}
          <div className="absolute left-3 right-3 top-[4.25rem] z-20 flex items-center justify-end gap-1.5 sm:left-auto sm:top-3">
            {/* Quick Fit All on Mobile/Desktop */}
            <button
              onClick={centerOnAllFleet}
              className="min-h-10 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] font-semibold text-slate-900 shadow-md backdrop-blur-xs transition hover:bg-white cursor-pointer"
              title="Fit All Fleet on Map"
            >
              <span>Fit All</span>
            </button>

            {/* Quick Layers Button on Map */}
            <button
              onClick={() => setShowLayersModal(true)}
              className="min-h-10 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] font-semibold text-slate-900 shadow-md backdrop-blur-xs transition hover:bg-white cursor-pointer"
              title="Map Layers & Themes"
            >
              <span>Layers</span>
            </button>

            {/* Full Screen Button */}
            <button
              onClick={toggleFullScreenMode}
              className="min-h-10 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] font-semibold text-slate-900 shadow-md backdrop-blur-xs transition hover:bg-white cursor-pointer"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Radar'}
            >
              {isFullScreen ? (
                <span>Exit</span>
              ) : (
                <span>Full</span>
              )}
            </button>
          </div>

          {/* Quick Location Search Bar Overlay */}
          <div className="absolute left-3 right-3 top-3 z-20 sm:right-[170px] sm:max-w-md">
            <div className="relative">
              <div className="relative flex items-center bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-md px-2.5 py-1.5">
                <input
                  type="text"
                  placeholder="Jump to place..."
                  value={searchLocationQuery}
                  onChange={(e) => handleLocationSearch(e.target.value)}
                  className="w-full text-xs font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
                />
                {isSearchingLocation && (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-30 max-h-56 overflow-y-auto">
                  {searchSuggestions.map((sugg) => (
                    <button
                      key={sugg.placeId}
                      onClick={() => handleSelectSearchedPlace(sugg)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b border-slate-100 last:border-none flex items-start gap-2 transition"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{sugg.mainText}</p>
                        <p className="break-words text-[10px] leading-snug text-slate-500">{sugg.secondaryText}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Map Canvas Container */}
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {(isMapLoading || mapError) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/95 p-6 text-center">
              {mapError ? (
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-slate-900">Map unavailable</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{mapError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      cleanupMap();
                      setMapError(null);
                      void initMap();
                    }}
                    className="mt-4 min-h-10 rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
                  >
                    Retry Map
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-600">Loading map…</p>
              )}
            </div>
          )}

          {/* Collapsible Radar Legend (Bottom-Left) */}
          <div className="absolute bottom-3 left-3 z-20">
            {showLegendMobile ? (
              <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-lg text-xs space-y-2 max-w-xs animate-in fade-in duration-100">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Active Radar Pins ({visibleDrivers.length})</span>
                  </span>
                  <button
                    onClick={() => setShowLegendMobile(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shrink-0" />
                    <span className="text-slate-700 font-medium">Online Free</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 border border-white shrink-0" />
                    <span className="text-slate-700 font-medium">In-Trip</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-white shrink-0" />
                    <span className="text-slate-700 font-medium">Offline</span>
                  </div>
                  {showTripRoutes && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shrink-0" />
                      <span className="text-slate-700 font-medium">Active Trip</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowLegendMobile(true)}
                className="bg-white/90 hover:bg-white backdrop-blur-md text-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-md text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span>{visibleDrivers.length} Pins</span>
              </button>
            )}
          </div>

          {/* Floating Mobile Selected Driver Action Card */}
          {selectedDriver && (
            <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-96 z-30 rounded-xl border border-slate-200 bg-white p-3 shadow-lg animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="break-words text-sm font-extrabold text-slate-900">
                      {selectedDriver.driver_name}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      &middot; {selectedDriver.vehicle_category}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-[11px] font-mono text-slate-600">
                    {selectedDriver.vehicle_number} &middot; ID {selectedDriver.driver_id}
                  </div>
                  <div className={`mt-1 text-[11px] font-bold ${selectedDriver.is_online ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {selectedDriver.is_online ? 'Online' : 'Offline'}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDriver(null)}
                  className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                  title="Dismiss card"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <a
                  href={`tel:${selectedDriver.mobile_number}`}
                  className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <span>Call Driver</span>
                </a>

                <button
                  onClick={() => recenterOnDriver(selectedDriver)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <span>Focus Map</span>
                </button>

                {onOpenAssignModal && activeTrips.length > 0 && selectedDriver.is_online && !selectedDriver.current_trip_id && (
                  <button
                    onClick={() => {
                      const firstOpenTrip = activeTrips.find((t) => t.status === 'OPEN');
                      if (firstOpenTrip) onOpenAssignModal(firstOpenTrip);
                    }}
                    className="col-span-2 flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400 cursor-pointer"
                  >
                    <span>Assign Open Trip</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Driver Radar Roster: Visible on mobile when mode === 'roster', and always visible on desktop */}
        <div
          className={`bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex flex-col ${
            mobileViewMode === 'roster' ? 'flex h-[calc(100vh-230px)] min-h-[480px]' : 'hidden'
          } lg:flex lg:h-full overflow-hidden lg:col-span-1`}
        >
          {/* Header */}
          <div className="mb-3 border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold tracking-tight text-slate-950">
              Fleet Roster ({filteredDrivers.length})
            </h3>
          </div>

          {/* Quick Search Driver by ID, Name, Plate or Phone */}
          <div className="mb-2 relative">
            <input
              type="text"
              placeholder="Search driver, ID or vehicle"
              value={driverSearchQuery}
              onChange={(e) => setDriverSearchQuery(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {driverSearchQuery && (
              <button
                type="button"
                onClick={() => setDriverSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Drivers Scroll List */}
          <div className="flex-1 space-y-0 overflow-y-auto pr-1">
            {visibleDrivers.map((drv) => {
              const isSelected = selectedDriver?.driver_id === drv.driver_id;
              const hasTrip = Boolean(drv.current_trip_id);

              return (
                <div
                  key={drv.driver_id}
                  onClick={() => {
                    setSelectedDriver(drv);
                    if (onSelectDriver) onSelectDriver(drv);
                  }}
                  className={`border-b px-1 py-3 text-xs cursor-pointer transition last:border-b-0 ${
                    isSelected
                      ? 'bg-amber-50 text-slate-950'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block break-words text-sm font-semibold text-slate-950">
                          {drv.driver_name}
                        </strong>
                        <p className="mt-1 break-words text-[11px] font-medium text-slate-500">
                          {drv.vehicle_category || 'STD'} · {drv.vehicle_number}
                        </p>
                      </div>
                      <span className={`shrink-0 pt-0.5 text-[10px] font-semibold ${drv.is_online ? (hasTrip ? 'text-purple-700' : 'text-emerald-700') : 'text-slate-500'}`}>
                        {drv.is_online ? (hasTrip ? 'In Trip' : 'Online') : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Row */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${drv.mobile_number}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Call Driver
                    </a>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        recenterOnDriver(drv);
                      }}
                      className="min-h-10 rounded-lg border border-amber-500 bg-white px-2 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 cursor-pointer"
                      title="Focus on Radar Map"
                    >
                      Focus Map
                    </button>
                  </div>
                </div>
              );
            })}

            {visibleDrivers.length === 0 && (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <p className="text-xs font-semibold">No fleet vehicles match this filter</p>
                <button
                  onClick={() => {
                    setOnlyOnline(false);
                    setSelectedCategory('ALL');
                    setDriverSearchQuery('');
                  }}
                  className="text-xs text-amber-600 font-bold hover:underline"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>

          {/* Selected Driver Desktop Detail Box */}
          {selectedDriver && (
            <div className="hidden lg:block mt-3 border-t border-slate-200 pt-3 text-xs">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <strong className="break-words font-semibold text-slate-900">
                      {selectedDriver.driver_name}
                      </strong>
                      <span className="text-[10px] font-semibold text-slate-500">
                        &middot; {selectedDriver.vehicle_category}
                      </span>
                    </div>
                    <div className="mt-0.5 break-words text-[10px] text-slate-500">
                      {selectedDriver.vehicle_number} &middot; ID {selectedDriver.driver_id}
                    </div>
                    <div className={`mt-1 font-semibold ${selectedDriver.is_online ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {selectedDriver.is_online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  <button
                    onClick={() => recenterOnDriver(selectedDriver)}
                    className="min-h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    Focus Map
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <a
                    href={`tel:${selectedDriver.mobile_number}`}
                    className="flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-2 py-2 font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Call Driver
                  </a>
                  {onOpenAssignModal && activeTrips.length > 0 && selectedDriver.is_online && !selectedDriver.current_trip_id && (
                    <button
                      onClick={() => {
                        const firstOpenTrip = activeTrips.find((t) => t.status === 'OPEN');
                        if (firstOpenTrip) onOpenAssignModal(firstOpenTrip);
                      }}
                      className="col-span-2 flex min-h-10 items-center justify-center rounded-lg bg-amber-500 px-2 py-2 font-bold text-slate-950 transition hover:bg-amber-400 cursor-pointer"
                    >
                      Assign Open Trip
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
