// Country names use the spelling returned by the 42 campus API.
const countryCodes: Record<string, string> = {
  "United Arab Emirates": "AE",
  Australia: "AU",
  Jordan: "JO",
  Netherlands: "NL",
  France: "FR",
  Madagascar: "MG",
  Thailand: "TH",
  Spain: "ES",
  Lebanon: "LB",
  Belgium: "BE",
  Brazil: "BR",
  Morocco: "MA",
  Germany: "DE",
  Italy: "IT",
  "Korea, Republic of": "KR",
  Finland: "FI",
  Malaysia: "MY",
  Turkey: "TR",
  Switzerland: "CH",
  Portugal: "PT",
  "United Kingdom": "GB",
  Angola: "AO",
  Luxembourg: "LU",
  "Palestine, State of": "PS",
  "Czech Republic": "CZ",
  Canada: "CA",
  Singapore: "SG",
  Japan: "JP",
  Austria: "AT",
  Poland: "PL",
  Armenia: "AM",
};

export function countryFlag(country?: string) {
  const name = country?.trim();
  const code =
    name && (countryCodes[name] ?? (/^[A-Za-z]{2}$/.test(name) ? name.toUpperCase() : undefined));
  return code
    ? String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
    : "";
}
