// Country code to flag emoji mapping — case-insensitive
const RAW_FLAGS: Record<string, string> = {
  'BR': '🇧🇷', 'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'SE': '🇸🇪', 'FI': '🇫🇮', 'NO': '🇳🇴',
  'DK': '🇩🇰', 'NL': '🇳🇱', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'PT': '🇵🇹', 'PL': '🇵🇱',
  'CA': '🇨🇦', 'AU': '🇦🇺', 'JP': '🇯🇵', 'MX': '🇲🇽', 'AR': '🇦🇷', 'CL': '🇨🇱', 'CO': '🇨🇴',
  'AT': '🇦🇹', 'CH': '🇨🇭', 'BE': '🇧🇪', 'CZ': '🇨🇿', 'GR': '🇬🇷', 'HU': '🇭🇺', 'IE': '🇮🇪',
  'RU': '🇷🇺', 'UA': '🇺🇦', 'IN': '🇮🇳', 'CN': '🇨🇳', 'KR': '🇰🇷', 'IL': '🇮🇱', 'TR': '🇹🇷',
  'ZA': '🇿🇦', 'NZ': '🇳🇿', 'IS': '🇮🇸', 'EE': '🇪🇪', 'LT': '🇱🇹', 'LV': '🇱🇻', 'HR': '🇭🇷',
  'RS': '🇷🇸', 'RO': '🇷🇴', 'BG': '🇧🇬', 'SK': '🇸🇰', 'SI': '🇸🇮', 'LU': '🇱🇺', 'TW': '🇹🇼',
  'PH': '🇵🇭', 'TH': '🇹🇭', 'ID': '🇮🇩', 'MY': '🇲🇾', 'SG': '🇸🇬', 'VN': '🇻🇳', 'PE': '🇵🇪',
  'VE': '🇻🇪', 'UY': '🇺🇾', 'PY': '🇵🇾', 'EC': '🇪🇨', 'CR': '🇨🇷', 'PA': '🇵🇦', 'CU': '🇨🇺',
  'USA': '🇺🇸', 'UK': '🇬🇧',
  'Brazil': '🇧🇷', 'Germany': '🇩🇪', 'Sweden': '🇸🇪',
  'Finland': '🇫🇮', 'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Netherlands': '🇳🇱', 'France': '🇫🇷',
  'Italy': '🇮🇹', 'Spain': '🇪🇸', 'Portugal': '🇵🇹', 'Poland': '🇵🇱', 'Canada': '🇨🇦',
  'Australia': '🇦🇺', 'Japan': '🇯🇵', 'Mexico': '🇲🇽', 'Argentina': '🇦🇷', 'Chile': '🇨🇱',
  'Colombia': '🇨🇴', 'Austria': '🇦🇹', 'Switzerland': '🇨🇭', 'Belgium': '🇧🇪',
  'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿', 'Greece': '🇬🇷', 'Hungary': '🇭🇺', 'Ireland': '🇮🇪',
  'Russia': '🇷🇺', 'Ukraine': '🇺🇦', 'India': '🇮🇳', 'China': '🇨🇳', 'South Korea': '🇰🇷',
  'Israel': '🇮🇱', 'Turkey': '🇹🇷', 'Türkiye': '🇹🇷', 'South Africa': '🇿🇦', 'New Zealand': '🇳🇿',
  'Iceland': '🇮🇸', 'Estonia': '🇪🇪', 'Lithuania': '🇱🇹', 'Latvia': '🇱🇻', 'Croatia': '🇭🇷',
  'Serbia': '🇷🇸', 'Romania': '🇷🇴', 'Bulgaria': '🇧🇬', 'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮',
  'Luxembourg': '🇱🇺', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧',
  'The Netherlands': '🇳🇱', 'Taiwan': '🇹🇼', 'Philippines': '🇵🇭', 'Thailand': '🇹🇭',
  'Indonesia': '🇮🇩', 'Malaysia': '🇲🇾', 'Singapore': '🇸🇬', 'Vietnam': '🇻🇳',
  'Peru': '🇵🇪', 'Venezuela': '🇻🇪', 'Uruguay': '🇺🇾', 'Paraguay': '🇵🇾', 'Ecuador': '🇪🇨',
  'Costa Rica': '🇨🇷', 'Panama': '🇵🇦', 'Cuba': '🇨🇺',
};

// Build a case-insensitive lookup map
const COUNTRY_FLAGS = new Map<string, string>();
for (const [key, value] of Object.entries(RAW_FLAGS)) {
  COUNTRY_FLAGS.set(key.toLowerCase(), value);
}

export function countryFlag(country: string | null | undefined): string {
  if (!country) return '';
  const normalized = country.trim().toLowerCase();
  return COUNTRY_FLAGS.get(normalized) || '🏳️';
}

export function artistWithFlag(artist: string, country: string | null | undefined): string {
  const flag = countryFlag(country);
  return flag ? `${flag} ${artist}` : artist;
}
