import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './IconTile.module.css';

export type IconTileTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
export type IconTileSize = 'sm' | 'md';

export interface IconTileProps {
  /** A lucide icon component. It is decorative: the text beside the tile names what it stands for. */
  icon: LucideIcon;
  /** sm is a 24px box with a 14px icon; md is 36px with 18px. */
  size?: IconTileSize;
  /** accent is the default. Status tones are for places where the state itself matters. */
  tone?: IconTileTone;
  className?: string;
}

const ICON_PX: Record<IconTileSize, number> = { sm: 14, md: 18 };

/** A lucide icon in a rounded square, tinted with the accent (or a status token) at 15%. */
export function IconTile({ icon: Icon, size = 'md', tone = 'accent', className }: IconTileProps) {
  return (
    <span
      className={[styles.tile, styles[size], styles[tone], className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <Icon width={ICON_PX[size]} height={ICON_PX[size]} strokeWidth={1.75} />
    </span>
  );
}

export interface SectionTitleProps {
  icon: LucideIcon;
  title: ReactNode;
  /** Optional trailing content at the right edge, such as a count or a small action. */
  trailing?: ReactNode;
  tone?: IconTileTone;
  /** Heading level. Screens use h2, cards inside a screen use h3. */
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
}

/** A screen or card heading: a small IconTile, the title, and an optional trailing slot. */
export function SectionTitle({
  icon,
  title,
  trailing,
  tone = 'accent',
  as: Heading = 'h2',
  id,
  className,
}: SectionTitleProps) {
  return (
    <div className={[styles.title, className].filter(Boolean).join(' ')}>
      <IconTile icon={icon} size="sm" tone={tone} />
      <Heading id={id} className={styles.heading}>
        {title}
      </Heading>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  );
}

export default IconTile;
