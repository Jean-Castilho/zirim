/**
 * Coordenadas de entrega. Todo endereço é do Brasil: valores vazios, não numéricos
 * ou fora do retângulo do país viram null (nunca 0,0 nem um centro padrão).
 */
const BRAZIL_BOUNDS = { minLat: -34, maxLat: 6, minLng: -74, maxLng: -28 };

const toCoordinate = (value) => {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Retorna { lat, lng } quando a posição é válida para o Brasil; caso contrário, null. */
export const toBrazilLocation = (lat, lng) => {
  const latitude = toCoordinate(lat);
  const longitude = toCoordinate(lng);
  if (latitude === null || longitude === null) return null;
  const inside =
    latitude >= BRAZIL_BOUNDS.minLat && latitude <= BRAZIL_BOUNDS.maxLat &&
    longitude >= BRAZIL_BOUNDS.minLng && longitude <= BRAZIL_BOUNDS.maxLng;
  return inside ? { lat: latitude, lng: longitude } : null;
};
