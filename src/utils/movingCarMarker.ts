export interface GpsPosition {
  lat: number;
  lng: number;
}

export const isValidGpsPosition = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
  typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;

export const calculateGpsBearing = (from: GpsPosition, to: GpsPosition): number => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const toDegrees = (value: number) => (value * 180) / Math.PI;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const bearing = toDegrees(Math.atan2(
    Math.sin(deltaLng) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  ));
  return (bearing + 360) % 360;
};

export const shortestAngleDelta = (from: number, to: number): number =>
  ((to - from + 540) % 360) - 180;

export const interpolateBearing = (from: number, to: number, progress: number): number =>
  (from + shortestAngleDelta(from, to) * progress + 360) % 360;

export const getRotatedCarIconDataUrl = (
  carIconDataUrl: string,
  bearing: number,
  width = 60,
  height = 40
): string => {
  const safeBearing = (bearing + 360) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${carIconDataUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" transform="rotate(${safeBearing} ${width / 2} ${height / 2})"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const getGpsTimestamp = (driver: { last_heartbeat?: number; updated_at?: unknown }): number => {
  if (typeof driver.last_heartbeat === 'number' && Number.isFinite(driver.last_heartbeat)) {
    return driver.last_heartbeat;
  }
  const updatedAt = driver.updated_at as { toMillis?: () => number } | number | undefined;
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) return updatedAt;
  if (updatedAt && typeof updatedAt === 'object' && typeof updatedAt.toMillis === 'function') {
    const millis = updatedAt.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
};
