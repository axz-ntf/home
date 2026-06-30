type IconProps = { size?: number };

export const ChevronIcon = ({
  size = 10,
  dir = "down",
}: IconProps & { dir?: "down" | "up" | "left" | "right" }) => {
  const r = { down: 0, up: 180, left: 90, right: -90 }[dir];
  return (
    <svg className="chevron" width={size} height={size} viewBox="0 0 10 10" style={{ transform: `rotate(${r}deg)` }}>
      <path d="M 2 3.5 L 5 6.5 L 8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const PinIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M 7 1 C 4.5 1 2.5 3 2.5 5.5 C 2.5 8.5 7 13 7 13 C 7 13 11.5 8.5 11.5 5.5 C 11.5 3 9.5 1 7 1 Z" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="7" cy="5.5" r="1.5" fill="currentColor" />
  </svg>
);

export const HeartIcon = ({ size = 18, filled = false }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"}>
    <path d="M 10 17 C 10 17 3 12 3 7.5 C 3 5 5 3 7.5 3 C 8.8 3 10 4 10 4 C 10 4 11.2 3 12.5 3 C 15 3 17 5 17 7.5 C 17 12 10 17 10 17 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

// Daum 디자인 시스템에서 export 한 실제 아이콘(SVG). fill/stroke 를 currentColor 로 바꿔
// 부모 색(active/hover) 을 상속하고, width/height=1em 으로 react-icons 처럼 스케일.

// 햄버거(Handle) — 채움 3선
export const HandleIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 16C20.5523 16 21 16.4477 21 17C21 17.5523 20.5523 18 20 18H4C3.44772 18 3 17.5523 3 17C3 16.4477 3.44772 16 4 16H20Z" />
    <path d="M20 11C20.5523 11 21 11.4477 21 12C21 12.5523 20.5523 13 20 13H4C3.44772 13 3 12.5523 3 12C3 11.4477 3.44772 11 4 11H20Z" />
    <path d="M20 6C20.5523 6 21 6.44772 21 7C21 7.55228 20.5523 8 20 8H4C3.44772 8 3 7.55228 3 7C3 6.44772 3.44772 6 4 6H20Z" />
  </svg>
);

// 홈(Home) — 채움(evenodd)
export const NewsHomeIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M8.97852 1.70359C10.765 0.348919 13.2351 0.348688 15.0215 1.70359L21.2861 6.45554C22.3657 7.27475 22.9999 8.55248 23 9.90769V18.6665C23 21.0594 21.0599 22.9991 18.667 22.9995H5.33301C2.93992 22.9993 0.999023 21.0596 0.999023 18.6665V9.90769C0.999165 8.55241 1.6342 7.27475 2.71387 6.45554L8.97852 1.70359ZM13.8135 3.29734C12.7416 2.48423 11.2585 2.48446 10.1865 3.29734L3.92285 8.04929C3.34166 8.49037 3.00014 9.17808 3 9.90769V18.6665C3 19.955 4.04449 20.9993 5.33301 20.9995H7.66602V15.3335C7.66619 14.0451 8.71062 13.0006 9.99902 13.0005H13.999C15.2876 13.0005 16.3328 14.045 16.333 15.3335V20.9995H18.667C19.9553 20.9991 21 19.9549 21 18.6665V9.90769C20.9999 9.17815 20.6582 8.49037 20.0771 8.04929L13.8135 3.29734ZM9.99902 15.0005C9.81519 15.0006 9.66619 15.1496 9.66602 15.3335V20.9995H14.333V15.3335C14.3328 15.1495 14.183 15.0005 13.999 15.0005H9.99902Z" />
  </svg>
);

// 가이드(Guide) — 펼친 책, 라인
export const GuideBookIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 16.5001C23 12.5001 15 12.0001 8.75 14.0001V45.5001C15 43.5001 23 44.0001 30 48.0001" />
    <path d="M30 16.5001C37 12.5001 45 12.0001 51.25 14.0001V45.5001C45 43.5001 37 44.0001 30 48.0001" />
    <path d="M30 16.5V48" />
  </svg>
);

// 저장(Bookmark) — 라인
export const SaveBookmarkIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 11.5C15 9.25 16.75 7.5 19 7.5H41C43.25 7.5 45 9.25 45 11.5V51L30 40.5L15 51V11.5Z" />
  </svg>
);

// AI(Sparkles) — 채움
export const SparklesIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.7473 6.4854C12.966 5.65129 14.1643 5.65129 14.383 6.4854L15.3762 10.2725C15.5845 11.0667 16.2116 11.6867 17.0149 11.8926L20.8459 12.8751C21.6897 13.0913 21.6897 14.276 20.8459 14.4922L17.0149 15.4737C16.2116 15.6796 15.5845 16.2997 15.3762 17.0938L14.383 20.8819C14.1641 21.7156 12.9663 21.7155 12.7473 20.8819L11.7541 17.0938C11.5458 16.2997 10.9178 15.6796 10.1145 15.4737L6.28342 14.4922C5.43994 14.2759 5.44002 13.0915 6.28342 12.8751L10.1145 11.8926C10.9179 11.6867 11.5459 11.0667 11.7541 10.2725L12.7473 6.4854Z" />
    <path d="M5.15257 1.78228C5.27756 1.30565 5.96215 1.30565 6.08714 1.78228L6.60667 3.76275C6.71171 4.16317 7.02777 4.47632 7.43284 4.58013L9.43675 5.09283C9.91842 5.21655 9.91828 5.89277 9.43675 6.01665L7.43284 6.53033C7.02775 6.63414 6.71168 6.94724 6.60667 7.34771L6.08714 9.32818C5.96215 9.80481 5.27756 9.80481 5.15257 9.32818L4.63303 7.34771C4.52804 6.94734 4.21182 6.63422 3.80686 6.53033L1.80296 6.01665C1.32093 5.89302 1.32085 5.21638 1.80296 5.09283L3.80686 4.58013C4.21183 4.47625 4.52804 4.16313 4.63303 3.76275L5.15257 1.78228Z" />
  </svg>
);

export const ShareIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M 10 3 V 13 M 10 3 L 6 7 M 10 3 L 14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 4 12 V 16 H 16 V 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CloseIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M 3 3 L 11 11 M 11 3 L 3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const MapIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M 1 3 L 5 1.5 L 9 3 L 13 1.5 V 11 L 9 12.5 L 5 11 L 1 12.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M 5 1.5 V 11 M 9 3 V 12.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export const ListIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M 2 3 H 12 M 2 7 H 12 M 2 11 H 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LocateIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" />
    <path d="M 7 1 V 3 M 7 11 V 13 M 1 7 H 3 M 11 7 H 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const SearchIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M 9 9 L 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const TrainIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <rect x="3" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M 3 7 H 11" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="8.5" r=".6" fill="currentColor" />
    <circle cx="9" cy="8.5" r=".6" fill="currentColor" />
    <path d="M 4 12 L 2 13.5 M 10 12 L 12 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const CalendarIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <rect x="2" y="3" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <path d="M 2 5.5 H 12" stroke="currentColor" strokeWidth="1.2" />
    <path d="M 4.5 2 V 4 M 9.5 2 V 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
