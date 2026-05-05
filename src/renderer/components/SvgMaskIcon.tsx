import type { CSSProperties } from 'react';

interface SvgMaskIconProps {
  src: string;
  className?: string;
}

interface MaskStyle extends CSSProperties {
  '--mv-icon-src': string;
}

export default function SvgMaskIcon({ src, className = '' }: SvgMaskIconProps) {
  const maskStyle: MaskStyle = {
    '--mv-icon-src': `url("${src}")`,
  };

  return (
    <span aria-hidden="true" className={`app-svg-icon ${className}`.trim()} style={maskStyle} />
  );
}
