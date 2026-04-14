import type { CSSProperties } from 'react';

interface SvgMaskIconProps {
  src: string;
  className?: string;
}

export default function SvgMaskIcon({ src, className = '' }: SvgMaskIconProps) {
  const maskStyle: CSSProperties = {
    '--mv-icon-src': `url("${src}")`,
  };

  return (
    <span aria-hidden="true" className={`app-svg-icon ${className}`.trim()} style={maskStyle} />
  );
}
