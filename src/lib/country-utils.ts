const COUNTRY_CODE_ALIASES: Record<string, string> = {
  br: 'BR', us: 'US', usa: 'US', 'united states': 'US',
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB',
  de: 'DE', germany: 'DE', deutschland: 'DE',
  se: 'SE', sweden: 'SE', sverige: 'SE',
  fi: 'FI', finland: 'FI', suomi: 'FI',
  no: 'NO', norway: 'NO', norge: 'NO',
  dk: 'DK', denmark: 'DK', danmark: 'DK',
  nl: 'NL', netherlands: 'NL', 'the netherlands': 'NL',
  fr: 'FR', france: 'FR',
  it: 'IT', italy: 'IT', italia: 'IT',
  es: 'ES', spain: 'ES', 'españa': 'ES', espana: 'ES',
  pt: 'PT', portugal: 'PT',
  pl: 'PL', poland: 'PL', polska: 'PL',
  ca: 'CA', canada: 'CA',
  au: 'AU', australia: 'AU',
  jp: 'JP', japan: 'JP',
  mx: 'MX', mexico: 'MX', 'méxico': 'MX',
  ar: 'AR', argentina: 'AR',
  cl: 'CL', chile: 'CL',
  co: 'CO', colombia: 'CO',
  at: 'AT', austria: 'AT', 'österreich': 'AT', osterreich: 'AT',
  ch: 'CH', switzerland: 'CH', schweiz: 'CH', suisse: 'CH',
  be: 'BE', belgium: 'BE', belgique: 'BE',
  cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', 'česko': 'CZ', cesko: 'CZ',
  gr: 'GR', greece: 'GR',
  hu: 'HU', hungary: 'HU', 'magyarország': 'HU', magyarorszag: 'HU',
  ie: 'IE', ireland: 'IE',
  ru: 'RU', russia: 'RU',
  ua: 'UA', ukraine: 'UA',
  in: 'IN', india: 'IN',
  cn: 'CN', china: 'CN',
  kr: 'KR', 'south korea': 'KR',
  il: 'IL', israel: 'IL',
  tr: 'TR', turkey: 'TR', 'türkiye': 'TR', turkiye: 'TR',
  za: 'ZA', 'south africa': 'ZA',
  nz: 'NZ', 'new zealand': 'NZ',
  is: 'IS', iceland: 'IS', 'ísland': 'IS', island: 'IS',
  ee: 'EE', estonia: 'EE',
  lt: 'LT', lithuania: 'LT',
  lv: 'LV', latvia: 'LV',
  hr: 'HR', croatia: 'HR', hrvatska: 'HR',
  rs: 'RS', serbia: 'RS', srbija: 'RS',
  ro: 'RO', romania: 'RO', 'românia': 'RO',
  bg: 'BG', bulgaria: 'BG', 'българия': 'BG',
  sk: 'SK', slovakia: 'SK', slovensko: 'SK',
  si: 'SI', slovenia: 'SI', slovenija: 'SI',
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
  brasil: 'BR', brazil: 'BR',
};

export function normalizeCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CODE_ALIASES[country.trim().toLowerCase()] || null;
}

export function countryFlag(country: string | null | undefined): string {
  const code = normalizeCountryCode(country);
  if (!code) return '';
  return String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)));
}

export function artistWithFlag(artist: string, country: string | null | undefined): string {
  const code = normalizeCountryCode(country);
  return code ? `${code} ${artist}` : artist;
}
