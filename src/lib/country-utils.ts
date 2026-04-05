const COUNTRY_CODE_ALIASES: Record<string, string> = {
  br: 'BR', us: 'US', usa: 'US', 'united states': 'US',
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB',
  de: 'DE', germany: 'DE',
  se: 'SE', sweden: 'SE',
  fi: 'FI', finland: 'FI',
  no: 'NO', norway: 'NO',
  dk: 'DK', denmark: 'DK',
  nl: 'NL', netherlands: 'NL', 'the netherlands': 'NL',
  fr: 'FR', france: 'FR',
  it: 'IT', italy: 'IT',
  es: 'ES', spain: 'ES',
  pt: 'PT', portugal: 'PT',
  pl: 'PL', poland: 'PL',
  ca: 'CA', canada: 'CA',
  au: 'AU', australia: 'AU',
  jp: 'JP', japan: 'JP',
  mx: 'MX', mexico: 'MX',
  ar: 'AR', argentina: 'AR',
  cl: 'CL', chile: 'CL',
  co: 'CO', colombia: 'CO',
  at: 'AT', austria: 'AT',
  ch: 'CH', switzerland: 'CH',
  be: 'BE', belgium: 'BE',
  cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ',
  gr: 'GR', greece: 'GR',
  hu: 'HU', hungary: 'HU',
  ie: 'IE', ireland: 'IE',
  ru: 'RU', russia: 'RU',
  ua: 'UA', ukraine: 'UA',
  in: 'IN', india: 'IN',
  cn: 'CN', china: 'CN',
  kr: 'KR', 'south korea': 'KR',
  il: 'IL', israel: 'IL',
  tr: 'TR', turkey: 'TR', 'türkiye': 'TR', 'turkiye': 'TR',
  za: 'ZA', 'south africa': 'ZA',
  nz: 'NZ', 'new zealand': 'NZ',
  is: 'IS', iceland: 'IS',
  ee: 'EE', estonia: 'EE',
  lt: 'LT', lithuania: 'LT',
  lv: 'LV', latvia: 'LV',
  hr: 'HR', croatia: 'HR',
  rs: 'RS', serbia: 'RS',
  ro: 'RO', romania: 'RO',
  bg: 'BG', bulgaria: 'BG',
  sk: 'SK', slovakia: 'SK',
  si: 'SI', slovenia: 'SI',
  lu: 'LU', luxembourg: 'LU',
  tw: 'TW', taiwan: 'TW',
  ph: 'PH', philippines: 'PH',
  th: 'TH', thailand: 'TH',
  id: 'ID', indonesia: 'ID',
  my: 'MY', malaysia: 'MY',
  sg: 'SG', singapore: 'SG',
  vn: 'VN', vietnam: 'VN',
  pe: 'PE', peru: 'PE',
  ve: 'VE', venezuela: 'VE',
  uy: 'UY', uruguay: 'UY',
  py: 'PY', paraguay: 'PY',
  ec: 'EC', ecuador: 'EC',
  cr: 'CR', 'costa rica': 'CR',
  pa: 'PA', panama: 'PA',
  cu: 'CU', cuba: 'CU',
};

export function normalizeCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CODE_ALIASES[country.trim().toLowerCase()] || null;
}

export function countryFlag(country: string | null | undefined): string {
  const code = normalizeCountryCode(country);
  if (!code) return '';
  return code;
}

export function artistWithFlag(artist: string, country: string | null | undefined): string {
  const code = normalizeCountryCode(country);
  return code ? `${code} ${artist}` : artist;
}
