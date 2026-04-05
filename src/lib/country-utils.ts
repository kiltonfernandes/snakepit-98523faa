// Country code to flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  'BR': '🇧🇷', 'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'SE': '🇸🇪', 'FI': '🇫🇮', 'NO': '🇳🇴',
  'DK': '🇩🇰', 'NL': '🇳🇱', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'PT': '🇵🇹', 'PL': '🇵🇱',
  'CA': '🇨🇦', 'AU': '🇦🇺', 'JP': '🇯🇵', 'MX': '🇲🇽', 'AR': '🇦🇷', 'CL': '🇨🇱', 'CO': '🇨🇴',
  'AT': '🇦🇹', 'CH': '🇨🇭', 'BE': '🇧🇪', 'CZ': '🇨🇿', 'GR': '🇬🇷', 'HU': '🇭🇺', 'IE': '🇮🇪',
  'RU': '🇷🇺', 'UA': '🇺🇦', 'IN': '🇮🇳', 'CN': '🇨🇳', 'KR': '🇰🇷', 'IL': '🇮🇱', 'TR': '🇹🇷',
  'ZA': '🇿🇦', 'NZ': '🇳🇿', 'IS': '🇮🇸', 'EE': '🇪🇪', 'LT': '🇱🇹', 'LV': '🇱🇻', 'HR': '🇭🇷',
  'RS': '🇷🇸', 'RO': '🇷🇴', 'BG': '🇧🇬', 'SK': '🇸🇰', 'SI': '🇸🇮', 'LU': '🇱🇺',
  'USA': '🇺🇸', 'UK': '🇬🇧', 'Brazil': '🇧🇷', 'Germany': '🇩🇪', 'Sweden': '🇸🇪',
  'Finland': '🇫🇮', 'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Netherlands': '🇳🇱', 'France': '🇫🇷',
  'Italy': '🇮🇹', 'Spain': '🇪🇸', 'Portugal': '🇵🇹', 'Poland': '🇵🇱', 'Canada': '🇨🇦',
  'Australia': '🇦🇺', 'Japan': '🇯🇵', 'Mexico': '🇲🇽', 'Argentina': '🇦🇷', 'Chile': '🇨🇱',
  'Colombia': '🇨🇴', 'Austria': '🇦🇹', 'Switzerland': '🇨🇭', 'Belgium': '🇧🇪',
  'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿', 'Greece': '🇬🇷', 'Hungary': '🇭🇺', 'Ireland': '🇮🇪',
  'Russia': '🇷🇺', 'Ukraine': '🇺🇦', 'India': '🇮🇳', 'China': '🇨🇳', 'South Korea': '🇰🇷',
  'Israel': '🇮🇱', 'Turkey': '🇹🇷', 'South Africa': '🇿🇦', 'New Zealand': '🇳🇿',
  'Iceland': '🇮🇸', 'Estonia': '🇪🇪', 'Lithuania': '🇱🇹', 'Latvia': '🇱🇻', 'Croatia': '🇭🇷',
  'Serbia': '🇷🇸', 'Romania': '🇷🇴', 'Bulgaria': '🇧🇬', 'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮',
  'Luxembourg': '🇱🇺', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧',
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return '';
  return COUNTRY_FLAGS[country] || COUNTRY_FLAGS[country.trim()] || '🏳️';
}

export function artistWithFlag(artist: string, country: string | null | undefined): string {
  const flag = countryFlag(country);
  return flag ? `${flag} ${artist}` : artist;
}
