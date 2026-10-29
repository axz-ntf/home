import type { NoticeInformation } from './notice-information';

// A complex can have several notices; never treat a notice-wide address as its address.
export function matchingCatalogInformation(source: string, sourceUrl: string | null | undefined, information: NoticeInformation | null) {
  if (source.endsWith('complexes') || !sourceUrl || information?.sourceUrl !== sourceUrl) return null;
  return information;
}
export function catalogDisplayAddress(address: string, information: NoticeInformation | null) {
  const extracted = information?.fields.address?.trim();
  return { value: extracted || address || '', fromNotice: Boolean(extracted) };
}
