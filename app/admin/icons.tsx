import { DdsIcon, type DdsIconName, type DdsIconProps } from '@/components/dds-icon';

type AdminIconProps = Omit<DdsIconProps, 'name'>;

function icon(name: DdsIconName, defaultSize = 20) {
  return function AdminIcon({ size = defaultSize, ...props }: AdminIconProps = {}) {
    return <DdsIcon name={name} size={size} {...props} />;
  };
}

// Semantic aliases keep every admin view on the same official DDS artwork.
export const AIcon = {
  Automation: icon('sparkles'),
  Dash: icon('bar-chart'),
  Listing: icon('list'),
  Building: icon('home'),
  Settings: icon('setting'),
  Search: icon('search', 16),
  Edit: icon('edit', 16),
  Chevron: icon('chevron-down', 16),
  ChevronR: icon('chevron-right', 16),
  ChevronL: icon('chevron-left', 16),
  External: icon('arrow-up-right', 16),
  Dots: icon('more-horizontal', 16),
  History: icon('clock'),
};
