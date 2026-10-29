import { DdsIcon } from "./dds-icon";

type IconProps = { size?: number };

// Keep the existing component API while rendering the official DDS icon set.
export const ChevronIcon = ({ size = 16, dir = "down" }: IconProps & { dir?: "down" | "up" | "left" | "right" }) => (
  <DdsIcon name={`chevron-${dir}`} size={size} className="chevron" />
);
export const PinIcon = ({ size = 16 }: IconProps) => <DdsIcon name="location-arrow" size={size} />;
export const HeartIcon = ({ size = 20, filled = false }: IconProps & { filled?: boolean }) => <DdsIcon name={filled ? "like-fill" : "like"} size={size} />;
export const HandleIcon = () => <DdsIcon name="menu" />;
export const NewsHomeIcon = () => <DdsIcon name="home" />;
export const GuideBookIcon = () => <DdsIcon name="contents" />;
export const SaveBookmarkIcon = () => <DdsIcon name="bookmark" />;
export const SparklesIcon = () => <DdsIcon name="sparkles" />;
export const ShareIcon = ({ size = 20 }: IconProps) => <DdsIcon name="share" size={size} />;
export const CloseIcon = ({ size = 20 }: IconProps) => <DdsIcon name="close" size={size} />;
export const MapIcon = ({ size = 16 }: IconProps) => <DdsIcon name="map" size={size} />;
export const ListIcon = ({ size = 16 }: IconProps) => <DdsIcon name="list" size={size} />;
export const LocateIcon = ({ size = 20 }: IconProps) => <DdsIcon name="locate-me" size={size} />;
export const SearchIcon = ({ size = 20 }: IconProps) => <DdsIcon name="search" size={size} />;
export const TrainIcon = ({ size = 16 }: IconProps) => <DdsIcon name="map" size={size} />;
export const CalendarIcon = ({ size = 16 }: IconProps) => <DdsIcon name="calendar" size={size} />;
