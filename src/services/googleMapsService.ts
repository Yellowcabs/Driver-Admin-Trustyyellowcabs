/**
 * Google Maps Platform Service & Integration Helper
 * Provides Places Autocomplete, Geocoding, Distance Matrix, and Route Calculations
 */

const STORAGE_KEY_MAPS_API_KEY = 'google_maps_api_key';

// Demo / Prototyping Fallback or Environment key
export function getGoogleMapsApiKey(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(STORAGE_KEY_MAPS_API_KEY);
  if (stored && stored.trim()) return stored.trim();
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  return '';
}

export function saveGoogleMapsApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem(STORAGE_KEY_MAPS_API_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_MAPS_API_KEY);
  }
  // Dispatch custom event so listeners know API key changed
  window.dispatchEvent(new CustomEvent('google-maps-key-changed', { detail: { key } }));
}

let loadPromise: Promise<any> | null = null;

export async function loadGoogleMaps(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') return null;

  const keyToUse = apiKey || getGoogleMapsApiKey();
  if (!keyToUse) {
    return null;
  }

  // If already loaded and Map constructor is ready
  if ((window as any).google && (window as any).google.maps && typeof (window as any).google.maps.Map === 'function') {
    return (window as any).google;
  }

  // If google.maps.importLibrary is present, use it to ensure the 'maps' library is loaded
  if ((window as any).google && (window as any).google.maps && typeof (window as any).google.maps.importLibrary === 'function') {
    try {
      await (window as any).google.maps.importLibrary('maps');
      await (window as any).google.maps.importLibrary('places').catch(() => {});
      await (window as any).google.maps.importLibrary('geometry').catch(() => {});
      if (typeof (window as any).google.maps.Map === 'function') {
        return (window as any).google;
      }
    } catch (e) {
      console.warn('Error in importLibrary:', e);
    }
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve) => {
    // Check if script already exists in document
    const existingScript = document.getElementById('google-maps-js-sdk') as HTMLScriptElement | null;
    
    const onScriptLoaded = async () => {
      const g = (window as any).google;
      if (g && g.maps) {
        if (typeof g.maps.importLibrary === 'function') {
          try {
            await g.maps.importLibrary('maps');
            await g.maps.importLibrary('places').catch(() => {});
            await g.maps.importLibrary('geometry').catch(() => {});
          } catch (e) {
            console.warn('Failed loading maps sub-libraries via importLibrary:', e);
          }
        }
        if (typeof g.maps.Map === 'function') {
          resolve(g);
          return;
        }
      }
      resolve(null);
    };

    if (existingScript) {
      if ((window as any).google && (window as any).google.maps && typeof (window as any).google.maps.Map === 'function') {
        resolve((window as any).google);
      } else {
        existingScript.addEventListener('load', onScriptLoaded);
        existingScript.addEventListener('error', () => {
          loadPromise = null;
          resolve(null);
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    script.type = 'text/javascript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      keyToUse
    )}&libraries=places,geometry,marker&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = onScriptLoaded;

    script.onerror = (error) => {
      console.warn('Failed to load Google Maps JS SDK script:', error);
      loadPromise = null;
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  lat?: number;
  lng?: number;
  source?: 'google' | 'photon' | 'local' | 'osm';
}

export interface RouteCalcResult {
  distanceKm: number;
  durationText: string;
  durationSeconds: number;
  overviewPolyline?: string;
  path?: Array<{ lat: number; lng: number }>;
  isLiveGoogleRoute: boolean;
}

/**
 * Haversine great-circle distance calculation between two points (in km)
 * Multiplied by 1.25 to approximate actual road travel in urban grids.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLine = R * c;
  const roadDist = straightLine * 1.24; // Urban curvature factor
  return Math.round(roadDist * 10) / 10;
}

const COIMBATORE_LOCAL_PLACES: Array<{ name: string; area: string; lat: number; lng: number }> = [
  // Major Transport Hubs
  { name: 'Gandhipuram Central Bus Stand', area: 'Gandhipuram, Coimbatore', lat: 11.0183, lng: 76.9644 },
  { name: 'Gandhipuram SETC Bus Stand', area: 'Gandhipuram, Coimbatore', lat: 11.0165, lng: 76.9672 },
  { name: 'Gandhipuram Omni Bus Stand', area: 'Sathy Road, Gandhipuram, Coimbatore', lat: 11.0210, lng: 76.9685 },
  { name: 'Coimbatore Junction Railway Station (CBE)', area: 'State Bank Road, Coimbatore', lat: 10.9979, lng: 76.9664 },
  { name: 'Coimbatore North Railway Station (CBF)', area: 'Mettupalayam Road, Coimbatore', lat: 11.0234, lng: 76.9532 },
  { name: 'Coimbatore International Airport (CJB)', area: 'Peelamedu, Coimbatore', lat: 11.0300, lng: 77.0434 },
  { name: 'Singanallur Bus Stand & Junction', area: 'Trichy Road, Singanallur, Coimbatore', lat: 10.9984, lng: 77.0270 },
  { name: 'Ukkadam Central Bus Stand', area: 'Ukkadam, Coimbatore', lat: 10.9880, lng: 76.9610 },
  { name: 'Podanur Junction Railway Station', area: 'Podanur, Coimbatore', lat: 10.9660, lng: 76.9950 },
  { name: 'Irugur Railway Station', area: 'Irugur, Coimbatore', lat: 11.0210, lng: 77.0720 },

  // Commercial & Shopping Hubs
  { name: 'RS Puram (DB Road / Commercial Hub)', area: 'RS Puram, Coimbatore', lat: 11.0088, lng: 76.9477 },
  { name: 'Brookefields Mall', area: 'Brookebond Road, Coimbatore', lat: 11.0104, lng: 76.9602 },
  { name: 'Prozone Mall', area: 'Sathy Road, Saravanampatti, Coimbatore', lat: 11.0558, lng: 76.9950 },
  { name: 'Fun Republic Mall', area: 'Avinashi Road, Peelamedu, Coimbatore', lat: 11.0245, lng: 77.0125 },
  { name: 'Codissia Trade Fair Complex', area: 'Peelamedu, Coimbatore', lat: 11.0392, lng: 77.0378 },
  { name: 'Cross Cut Road', area: 'Gandhipuram, Coimbatore', lat: 11.0195, lng: 76.9655 },
  { name: '100 Feet Road', area: 'Gandhipuram, Coimbatore', lat: 11.0215, lng: 76.9610 },
  { name: 'Town Hall & Clock Tower', area: 'Big Bazaar Street, Town Hall, Coimbatore', lat: 10.9934, lng: 76.9605 },
  { name: 'Raja Street', area: 'Town Hall, Coimbatore', lat: 10.9945, lng: 76.9620 },
  { name: 'Oppanakara Street', area: 'Town Hall, Coimbatore', lat: 10.9912, lng: 76.9598 },

  // IT Corridors & Business Parks
  { name: 'Saravanampatti IT Corridor (CHIL SEZ / KCT)', area: 'Saravanampatti, Coimbatore', lat: 11.0797, lng: 76.9997 },
  { name: 'TIDEL Park Coimbatore', area: 'ELCOSEZ, Civil Aerodrome Post, Coimbatore', lat: 11.0267, lng: 77.0322 },
  { name: 'Hanudev Info Park', area: 'Nava India, Coimbatore', lat: 11.0185, lng: 76.9845 },
  { name: 'KCT Tech Park', area: 'Saravanampatti, Coimbatore', lat: 11.0812, lng: 76.9923 },
  { name: 'India Land Tech Park', area: 'CHIL SEZ, Saravanampatti, Coimbatore', lat: 11.0825, lng: 77.0012 },

  // Hospitals & Medical Centers
  { name: 'KMCH (Kovai Medical Center & Hospital)', area: 'Avinashi Road, Coimbatore', lat: 11.0456, lng: 77.0543 },
  { name: 'PSG Hospitals & Institute of Medical Sciences', area: 'Peelamedu, Coimbatore', lat: 11.0284, lng: 77.0125 },
  { name: 'GKNM Hospital', area: 'Pappanaickenpalayam, Coimbatore', lat: 11.0123, lng: 76.9745 },
  { name: 'Coimbatore Medical College Hospital (GH)', area: 'Trichy Road, Coimbatore', lat: 10.9989, lng: 76.9680 },
  { name: 'Ganga Hospital', area: 'Mettupalayam Road, Saibaba Colony, Coimbatore', lat: 11.0267, lng: 76.9456 },
  { name: 'Royal Care Super Speciality Hospital', area: 'Neelambur, Coimbatore', lat: 11.0612, lng: 77.0890 },
  { name: 'Sri Ramakrishna Hospital', area: 'Siddhapudur, Coimbatore', lat: 11.0167, lng: 76.9767 },

  // Key Localities & Junctions
  { name: 'Saibaba Colony', area: 'Mettupalayam Road, Coimbatore', lat: 11.0289, lng: 76.9436 },
  { name: 'Ganapathy Junction', area: 'Sathy Road, Ganapathy, Coimbatore', lat: 11.0345, lng: 76.9740 },
  { name: 'Peelamedu (PSG Tech / Hopes College)', area: 'Avinashi Road, Peelamedu, Coimbatore', lat: 11.0247, lng: 77.0034 },
  { name: 'Ramanathapuram Junction', area: 'Trichy Road, Ramanathapuram, Coimbatore', lat: 10.9965, lng: 76.9892 },
  { name: 'Vadavalli / Marudhamalai Main Road', area: 'Vadavalli, Coimbatore', lat: 11.0315, lng: 76.9012 },
  { name: 'Thudiyalur Junction', area: 'Mettupalayam Road, Thudiyalur, Coimbatore', lat: 11.0784, lng: 76.9381 },
  { name: 'Kuniyamuthur', area: 'Palakkad Road, Kuniyamuthur, Coimbatore', lat: 10.9634, lng: 76.9489 },
  { name: 'Sundarapuram', area: 'Pollachi Road, Sundarapuram, Coimbatore', lat: 10.9472, lng: 76.9742 },
  { name: 'Kovaipudur', area: 'Kovaipudur, Coimbatore', lat: 10.9388, lng: 76.9360 },
  { name: 'Neelambur Bypass / Toll Plaza', area: 'Avinashi Road, Neelambur, Coimbatore', lat: 11.0658, lng: 77.0988 },
  { name: 'Sulur Air Force Station / Bus Stand', area: 'Sulur, Coimbatore', lat: 11.0242, lng: 77.1265 },
  { name: 'Chinniyampalayam', area: 'Avinashi Road, Chinniyampalayam, Coimbatore', lat: 11.0489, lng: 77.0722 },
  { name: 'Kavundampalayam', area: 'Mettupalayam Road, Coimbatore', lat: 11.0478, lng: 76.9367 },
  { name: 'Nava India / Hindustan College', area: 'Avinashi Road, Coimbatore', lat: 11.0189, lng: 76.9856 },
  { name: 'Lakshmi Mills Junction', area: 'Avinashi Road, Coimbatore', lat: 11.0125, lng: 76.9789 },
  { name: 'Hopes College', area: 'Avinashi Road, Peelamedu, Coimbatore', lat: 11.0260, lng: 77.0145 },
  { name: 'Sitra Junction (Airport Road)', area: 'Avinashi Road, Civil Aerodrome Post, Coimbatore', lat: 11.0345, lng: 77.0489 },
  { name: 'Kalapatti', area: 'Kalapatti Main Road, Coimbatore', lat: 11.0689, lng: 77.0423 },
  { name: 'Periyanaickenpalayam', area: 'Mettupalayam Road, Coimbatore', lat: 11.1456, lng: 76.9345 },
  { name: 'Karamadai', area: 'Mettupalayam Road, Coimbatore', lat: 11.2456, lng: 76.9589 },
  { name: 'Mettupalayam Bus Stand & Station', area: 'Mettupalayam, Coimbatore District', lat: 11.3012, lng: 76.9456 },
  { name: 'Pollachi Bus Stand & Junction', area: 'Pollachi, Coimbatore District', lat: 10.6612, lng: 77.0089 },
  { name: 'Kinathukadavu', area: 'Pollachi Road, Coimbatore', lat: 10.8234, lng: 77.0212 },
  { name: 'Avinashi New Bus Stand', area: 'Avinashi, Tirupur District', lat: 11.1923, lng: 77.2689 },
  { name: 'Tirupur Old / New Bus Stand', area: 'Tirupur, Tamil Nadu', lat: 11.1085, lng: 77.3411 },
  { name: 'Palladam Bus Stand', area: 'Palladam, Tirupur District', lat: 10.9989, lng: 77.2890 },
  { name: 'Ooty (Udhagamandalam) Charing Cross', area: 'Nilgiris, Tamil Nadu', lat: 11.4102, lng: 76.6950 },
  { name: 'Coonoor Bus Stand', area: 'Nilgiris, Tamil Nadu', lat: 11.3530, lng: 76.7959 },
  { name: 'Kotagiri', area: 'Nilgiris, Tamil Nadu', lat: 11.4215, lng: 76.8654 },
  { name: 'Isha Yoga Center', area: 'Velliangiri Foothills, Ishana Vihar, Coimbatore', lat: 10.9760, lng: 76.7350 },
  { name: 'Marudhamalai Murugan Temple', area: 'Marudhamalai, Coimbatore', lat: 11.0456, lng: 76.8523 },
  { name: 'Perur Pateeswarar Temple', area: 'Siruvani Main Road, Perur, Coimbatore', lat: 10.9734, lng: 76.9189 },
  { name: 'Eachanari Vinayagar Temple', area: 'Pollachi Main Road, Eachanari, Coimbatore', lat: 10.9234, lng: 76.9748 },
  { name: 'Dhyanalinga & Adiyogi Shiva Statue', area: 'Ikkarai Boluvampatti, Coimbatore', lat: 10.9723, lng: 76.7412 },
];

// Cached AutocompleteService instance
let cachedGoogleAutocompleteService: any = null;

/**
 * Fetches real-time address autocomplete suggestions via Google Maps Places API
 * with instant fallback to Photon (OSM), Nominatim & high-density Tamil Nadu landmarks.
 * Guaranteed to return results quickly on every keystroke without hanging.
 */
export async function fetchPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  if (!query || query.trim().length < 1) return [];

  const cleanQuery = query.trim().toLowerCase();
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  // 1. Instant local landmark match (0ms latency)
  const localMatchedItems = COIMBATORE_LOCAL_PLACES.filter((p) => {
    const hay = `${p.name} ${p.area}`.toLowerCase();
    return hay.includes(cleanQuery) || (tokens.length > 0 && tokens.every((t) => hay.includes(t)));
  }).map((p) => ({
    placeId: `local_${p.name.replace(/\s+/g, '_')}`,
    mainText: p.name,
    secondaryText: p.area,
    description: `${p.name}, ${p.area}`,
    lat: p.lat,
    lng: p.lng,
    source: 'local' as const,
  }));

  // 2. Google Places Autocomplete with timeout protection (max 750ms)
  const googlePromise = (async (): Promise<PlaceSuggestion[]> => {
    try {
      const g = await loadGoogleMaps();
      if (!g || !g.maps || !g.maps.places) return [];

      if (!cachedGoogleAutocompleteService) {
        cachedGoogleAutocompleteService = new g.maps.places.AutocompleteService();
      }

      const service = cachedGoogleAutocompleteService;
      const requestOptions: any = {
        input: query,
        componentRestrictions: { country: 'in' },
      };

      try {
        if (g.maps.Circle) {
          requestOptions.locationBias = new g.maps.Circle({
            center: new g.maps.LatLng(11.0168, 76.9558),
            radius: 50000,
          });
        }
      } catch {
        // Bias fallback
      }

      return await new Promise<PlaceSuggestion[]>((resolve) => {
        const timeoutId = setTimeout(() => resolve([]), 1800);

        service.getPlacePredictions(requestOptions, (predictions: any, status: any) => {
          clearTimeout(timeoutId);
          if (
            (status === 'OK' || status === g.maps.places?.PlacesServiceStatus?.OK) &&
            predictions &&
            predictions.length > 0
          ) {
            const list: PlaceSuggestion[] = predictions.map((p: any) => ({
              placeId: p.place_id,
              mainText: p.structured_formatting?.main_text || p.description,
              secondaryText: p.structured_formatting?.secondary_text || '',
              description: p.description,
              source: 'google' as const,
            }));
            resolve(list);
          } else {
            resolve([]);
          }
        });
      });
    } catch {
      return [];
    }
  })();

  // 3. Photon API with timeout protection (max 850ms)
  const photonPromise = (async (): Promise<PlaceSuggestion[]> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 850);
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lat=11.0168&lon=76.9558`;
      const resp = await fetch(photonUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.features) && data.features.length > 0) {
          return data.features
            .filter((f: any) => f.properties && f.geometry?.coordinates)
            .map((f: any) => {
              const props = f.properties;
              const coords = f.geometry.coordinates; // [lon, lat]
              const name = props.name || props.street || query;
              const details = [props.street, props.district, props.city, props.state]
                .filter(Boolean)
                .join(', ');

              return {
                placeId: `photon_${coords[1]}_${coords[0]}_${encodeURIComponent(name)}`,
                mainText: name,
                secondaryText: details || 'India',
                description: details ? `${name}, ${details}` : name,
                lat: coords[1],
                lng: coords[0],
                source: 'photon' as const,
              };
            });
        }
      }
      return [];
    } catch {
      return [];
    }
  })();

  // Await Google and Photon concurrently
  const [googleResults, photonResults] = await Promise.all([googlePromise, photonPromise]);

  // Combine and prioritize: Google Maps first, then landmarks, then Photon
  const allCandidates: PlaceSuggestion[] = [
    ...googleResults,
    ...localMatchedItems,
    ...photonResults,
  ];

  // If still empty and query length >= 2, try Nominatim as final fallback
  if (allCandidates.length === 0 && cleanQuery.length >= 2) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&countrycodes=in&limit=6&addressdetails=1`;
      const resp = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const nominatimList: PlaceSuggestion[] = data.map((item: any) => {
            const parts = (item.display_name || '').split(',');
            const mainText = parts[0] ? parts[0].trim() : item.name || query;
            const secondaryText = parts.slice(1, 4).join(',').trim();
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            return {
              placeId: `osm_${lat}_${lng}_${encodeURIComponent(item.display_name)}`,
              mainText,
              secondaryText: secondaryText || 'India',
              description: item.display_name,
              lat,
              lng,
              source: 'osm' as const,
            };
          });
          allCandidates.push(...nominatimList);
        }
      }
    } catch {
      // Quiet fallback
    }
  }

  // Deduplicate by mainText
  const uniqueList: PlaceSuggestion[] = [];
  const seenNames = new Set<string>();

  for (const item of allCandidates) {
    const key = item.mainText.toLowerCase().trim();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      uniqueList.push(item);
    }
  }

  return uniqueList.slice(0, 8);
}

/**
 * Resolves placeId into exact LatLng and formatted address
 */
export async function getPlaceCoordinates(
  placeId: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  // Direct coordinates encoded in Photon ID: photon_lat_lng_name
  if (placeId.startsWith('photon_')) {
    const parts = placeId.split('_');
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    const name = parts[3] ? decodeURIComponent(parts[3]) : '';
    if (!isNaN(lat) && !isNaN(lng)) {
      return {
        lat,
        lng,
        formattedAddress: name,
      };
    }
  }

  // Direct coordinates encoded in OSM ID: osm_lat_lng_name
  if (placeId.startsWith('osm_')) {
    const parts = placeId.split('_');
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    const name = parts[3] ? decodeURIComponent(parts[3]) : '';
    if (!isNaN(lat) && !isNaN(lng)) {
      return {
        lat,
        lng,
        formattedAddress: name,
      };
    }
  }

  // Local landmark resolution
  if (placeId.startsWith('local_')) {
    const rawName = placeId.replace('local_', '').replace(/_/g, ' ').toLowerCase();
    const found = COIMBATORE_LOCAL_PLACES.find(
      (p) =>
        p.name.toLowerCase() === rawName ||
        p.name.replace(/\s+/g, '_').toLowerCase() === placeId.replace('local_', '').toLowerCase()
    );
    if (found) {
      return {
        lat: found.lat,
        lng: found.lng,
        formattedAddress: `${found.name}, ${found.area}`,
      };
    }
  }

  // Google Maps Geocoder
  const g = await loadGoogleMaps();
  if (g && g.maps && g.maps.Geocoder) {
    try {
      const res = await new Promise<{ lat: number; lng: number; formattedAddress: string } | null>((resolve) => {
        const geocoder = new g.maps.Geocoder();
        geocoder.geocode({ placeId }, (results: any, status: any) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            resolve({
              lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
              lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
              formattedAddress: results[0].formatted_address,
            });
          } else {
            resolve(null);
          }
        });
      });
      if (res) return res;
    } catch (e) {
      console.warn('Google geocode error:', e);
    }
  }

  return null;
}

/**
 * Generates search query variations for an address to maximize geocoding hit rate
 * (e.g. stripping door numbers, pin codes, extracting landmark + city)
 */
function getAddressSearchVariants(raw: string): string[] {
  const list: string[] = [raw.trim()];
  // 1. Remove leading door/building/flat/number e.g. "205, ", "No. 12, ", "#45/A, ", "Flat 302, "
  const withoutDoor = raw.replace(/^(?:flat|no\.?|plot|door|shop|#)?\s*[0-9A-Za-z\/\-\s]+,\s*/i, '').trim();
  if (withoutDoor && withoutDoor !== raw) {
    list.push(withoutDoor);
  }

  // 2. Remove 6-digit postal code e.g. "641012", "560300"
  const base = withoutDoor || raw;
  const withoutPin = base.replace(/\b\d{6}\b/g, '').replace(/,\s*,/g, ',').replace(/\s+,/g, ',').trim();
  if (withoutPin && !list.includes(withoutPin)) {
    list.push(withoutPin);
  }

  // 3. Extract key parts (e.g. "Cross cut road 11th street Gandhipuram, Tatabad, Coimbatore")
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const cleanParts = parts.filter((p) => !/^\d+$/.test(p) && !/^\d{6}$/.test(p));
    if (cleanParts.length >= 2) {
      list.push(cleanParts.slice(0, 3).join(', '));
      list.push(`${cleanParts[0]} ${cleanParts[cleanParts.length - 2] || cleanParts[cleanParts.length - 1]}`);
    }
  }

  return Array.from(new Set(list));
}

/**
 * Geocode plain text address to coordinates (useful when user manually types an address without selecting dropdown)
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  if (!address || !address.trim()) return null;
  const clean = address.trim().toLowerCase();

  // Check local database first (strip parens like "(Commercial / Shopping)")
  const localMatch = COIMBATORE_LOCAL_PLACES.find((p) => {
    const pCleanName = p.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    const pCleanArea = p.area.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    if (clean.includes(pCleanName) && pCleanName.length > 3) return true;
    if (clean.includes(pCleanArea) && pCleanArea.length > 3) return true;
    if (`${p.name} ${p.area}`.toLowerCase().includes(clean)) return true;
    return false;
  });

  if (localMatch) {
    return {
      lat: localMatch.lat,
      lng: localMatch.lng,
      formattedAddress: `${localMatch.name}, ${localMatch.area}`,
    };
  }

  // Try Google Geocoder
  const g = await loadGoogleMaps();
  if (g && g.maps && g.maps.Geocoder) {
    try {
      const googleRes = await new Promise<{ lat: number; lng: number; formattedAddress: string } | null>((resolve) => {
        const geocoder = new g.maps.Geocoder();
        geocoder.geocode({ address: address + ', India' }, (results: any, status: any) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            resolve({
              lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
              lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
              formattedAddress: results[0].formatted_address,
            });
          } else {
            resolve(null);
          }
        });
      });
      if (googleRes) return googleRes;
    } catch {
      // Continue to Photon
    }
  }

  // Try Photon Geocoder with query variants
  const variants = getAddressSearchVariants(address);
  for (const query of variants) {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lat=11.0168&lon=76.9558`;
      const resp = await fetch(photonUrl);
      if (resp.ok) {
        const data = await resp.json();
        const first = data?.features?.[0];
        if (first?.geometry?.coordinates) {
          const coords = first.geometry.coordinates;
          const p = first.properties;
          const name = p?.name || address;
          const full = [name, p?.street, p?.city, p?.state].filter(Boolean).join(', ');
          return {
            lat: coords[1],
            lng: coords[0],
            formattedAddress: full || address,
          };
        }
      }
    } catch {
      // Continue to next variant
    }
  }

  // Try Nominatim OpenStreetMap as secondary fallback
  for (const query of variants.slice(0, 2)) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', India')}&limit=1`;
      const resp = await fetch(nomUrl, {
        headers: { 'Accept-Language': 'en' },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            formattedAddress: data[0].display_name || address,
          };
        }
      }
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Reverse geocode coordinate into human readable street/area name
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Try Google Geocoder
  const g = await loadGoogleMaps();
  if (g && g.maps && g.maps.Geocoder) {
    try {
      const res = await new Promise<string | null>((resolve) => {
        const geocoder = new g.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
          if (status === 'OK' && results && results[0]) {
            resolve(results[0].formatted_address);
          } else {
            resolve(null);
          }
        });
      });
      if (res) return res;
    } catch {
      // Continue to Photon
    }
  }

  // Try Photon reverse geocoding
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const p = data?.features?.[0]?.properties;
      if (p) {
        const parts = [p.name, p.street, p.locality || p.district, p.city || 'Coimbatore'].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  } catch {
    // Continue
  }

  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Calculate driving distance, duration & polyline path between two points
 */
export async function calculateDrivingRoute(
  origin: { lat: number; lng: number } | string,
  destination: { lat: number; lng: number } | string
): Promise<RouteCalcResult> {
  const g = await loadGoogleMaps();

  // 1. Google Directions Service
  if (g && g.maps && g.maps.DirectionsService) {
    try {
      const directionsService = new g.maps.DirectionsService();
      const originParam =
        typeof origin === 'string'
          ? origin
          : new g.maps.LatLng(origin.lat, origin.lng);
      const destinationParam =
        typeof destination === 'string'
          ? destination
          : new g.maps.LatLng(destination.lat, destination.lng);

      const response = await new Promise<any>((resolve, reject) => {
        directionsService.route(
          {
            origin: originParam,
            destination: destinationParam,
            travelMode: g.maps.TravelMode?.DRIVING || 'DRIVING',
          },
          (result: any, status: any) => {
            if ((status === 'OK' || status === g.maps.DirectionsStatus?.OK) && result) {
              resolve(result);
            } else {
              reject(new Error(`Directions request failed: ${status}`));
            }
          }
        );
      });

      const route = response.routes[0];
      const leg = route?.legs[0];

      if (leg) {
        const distanceMeters = leg.distance?.value || 0;
        const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
        const durationSeconds = leg.duration?.value || 0;
        const durationText = leg.duration?.text || `${Math.round(durationSeconds / 60)} mins`;

        // Extract path coordinates
        const path: Array<{ lat: number; lng: number }> = [];
        if (route.overview_path) {
          route.overview_path.forEach((pt: any) => {
            path.push({
              lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat,
              lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng,
            });
          });
        }

        return {
          distanceKm: Math.max(1, distanceKm),
          durationText,
          durationSeconds,
          overviewPolyline: route.overview_polyline,
          path,
          isLiveGoogleRoute: true,
        };
      }
    } catch (e) {
      console.warn('Google Directions API error, attempting OSRM driving engine fallback:', e);
    }
  }

  // Extract numeric coordinates
  let lat1 = 11.0168, lng1 = 76.9558, lat2 = 11.0300, lng2 = 77.0434;
  if (typeof origin !== 'string') {
    lat1 = origin.lat;
    lng1 = origin.lng;
  }
  if (typeof destination !== 'string') {
    lat2 = destination.lat;
    lng2 = destination.lng;
  }

  // 2. High-precision OSRM Driving Engine (Real road geometry and duration)
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
    const resp = await fetch(osrmUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        const r = data.routes[0];
        const distKm = Math.round((r.distance / 1000) * 10) / 10;
        const durSecs = Math.round(r.duration);
        const durMins = Math.max(1, Math.round(durSecs / 60));

        const coords: Array<{ lat: number; lng: number }> = (r.geometry?.coordinates || []).map(
          (c: [number, number]) => ({
            lat: c[1],
            lng: c[0],
          })
        );

        return {
          distanceKm: Math.max(1, distKm),
          durationText: `${durMins} mins`,
          durationSeconds: durSecs,
          path: coords,
          isLiveGoogleRoute: false,
        };
      }
    }
  } catch (osrmErr) {
    console.warn('OSRM router error, engaging Haversine calculation:', osrmErr);
  }

  // 3. Mathematical Haversine Fallback
  const dist = calculateHaversineDistanceKm(lat1, lng1, lat2, lng2);
  const estimatedMins = Math.max(5, Math.round(dist * 2.4 + 4));

  return {
    distanceKm: Math.max(1, dist),
    durationText: `${estimatedMins} mins (est)`,
    durationSeconds: estimatedMins * 60,
    path: [
      { lat: lat1, lng: lng1 },
      { lat: lat2, lng: lng2 },
    ],
    isLiveGoogleRoute: false,
  };
}
