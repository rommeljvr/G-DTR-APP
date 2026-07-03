import { useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface Props {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP = {
  sm: { wrapper: 'w-7 h-7',   icon: 'w-3.5 h-3.5', text: 'text-[10px]' },
  md: { wrapper: 'w-9 h-9',   icon: 'w-4 h-4',     text: 'text-xs'     },
  lg: { wrapper: 'w-10 h-10', icon: 'w-5 h-5',     text: 'text-sm'     },
  xl: { wrapper: 'w-14 h-14', icon: 'w-6 h-6',     text: 'text-base'   },
};

function initials(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function EmployeeAvatar({ src, name, size = 'md', className = '', onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const s = SIZE_MAP[size];
  const hasImage = !!src && src.startsWith('http') && !imgError;
  const abbr = initials(name);

  const base = `${s.wrapper} rounded-xl shrink-0 overflow-hidden flex items-center justify-center ${onClick ? 'cursor-pointer active:scale-90 transition-transform' : ''} ${className}`;

  if (hasImage) {
    return (
      <div className={base} onClick={onClick}>
        <img
          src={src}
          alt={name ?? 'Employee'}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  if (abbr) {
    return (
      <div
        className={`${base} bg-gradient-to-br from-blue-500/30 to-blue-700/30 border border-blue-400/20`}
        onClick={onClick}
      >
        <span className={`${s.text} font-semibold text-blue-200 select-none`}>{abbr}</span>
      </div>
    );
  }

  return (
    <div
      className={`${base} bg-gradient-to-br from-blue-400 to-blue-600`}
      onClick={onClick}
    >
      <UserIcon className={`${s.icon} text-white`} />
    </div>
  );
}
