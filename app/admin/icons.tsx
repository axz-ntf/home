// 어드민 전용 인라인 SVG 아이콘. 가벼운 stroke 기반.
export const AIcon = {
  Dash: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="8.5" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Listing: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M 5 5.5 H 11 M 5 8 H 11 M 5 10.5 H 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Building: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M 2 14 V 6 L 8 2 L 14 6 V 14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M 6 14 V 9 H 10 V 14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M 8 1.5 V 3 M 8 13 V 14.5 M 1.5 8 H 3 M 13 8 H 14.5 M 3.3 3.3 L 4.5 4.5 M 11.5 11.5 L 12.7 12.7 M 3.3 12.7 L 4.5 11.5 M 11.5 4.5 L 12.7 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M 9 9 L 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Edit: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M 9 2 L 12 5 L 5 12 L 2 12 L 2 9 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Chevron: () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  ChevronR: () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M 4 2 L 7.5 5.5 L 4 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  ChevronL: () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M 7 2 L 3.5 5.5 L 7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  External: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M 4 2 H 2 V 10 H 10 V 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 6 2 H 10 V 6 M 10 2 L 5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Dots: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="11" cy="7" r="1.2" fill="currentColor"/>
    </svg>
  ),
  History: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M 8 4.5 V 8 L 10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};
