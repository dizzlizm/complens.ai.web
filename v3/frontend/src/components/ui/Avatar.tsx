import { type ReactNode } from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  icon?: ReactNode;
  size?: AvatarSize;
  className?: string;
}

const sizes: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-xs' },
  sm: { container: 'w-8 h-8', text: 'text-sm' },
  md: { container: 'w-10 h-10', text: 'text-base' },
  lg: { container: 'w-12 h-12', text: 'text-lg' },
  xl: { container: 'w-16 h-16', text: 'text-xl' },
};

export function Avatar({
  src,
  alt = '',
  fallback,
  icon,
  size = 'md',
  className = '',
}: AvatarProps) {
  const sizeStyles = sizes[size];

  // Get initials from fallback text
  const getInitials = (text: string) => {
    return text
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeStyles.container} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`
        ${sizeStyles.container}
        rounded-full bg-brand-100 text-brand-600
        flex items-center justify-center font-semibold
        ${sizeStyles.text}
        ${className}
      `}
    >
      {icon || (fallback ? getInitials(fallback) : '?')}
    </div>
  );
}

// Platform avatars for connected accounts
type Platform = 'google' | 'microsoft' | 'facebook' | 'github' | 'slack' | 'dropbox' | 'twitter';

interface PlatformAvatarProps {
  platform: Platform;
  size?: AvatarSize;
}

const platformStyles: Record<Platform, { bg: string; text: string; letter: string }> = {
  google: { bg: 'bg-red-100', text: 'text-red-600', letter: 'G' },
  microsoft: { bg: 'bg-blue-100', text: 'text-blue-600', letter: 'M' },
  facebook: { bg: 'bg-blue-100', text: 'text-blue-700', letter: 'f' },
  github: { bg: 'bg-gray-800', text: 'text-white', letter: 'G' },
  slack: { bg: 'bg-purple-100', text: 'text-purple-600', letter: 'S' },
  dropbox: { bg: 'bg-blue-100', text: 'text-blue-500', letter: 'D' },
  twitter: { bg: 'bg-sky-100', text: 'text-sky-500', letter: 'X' },
};

export function PlatformAvatar({ platform, size = 'md' }: PlatformAvatarProps) {
  const style = platformStyles[platform] || platformStyles.google;
  const sizeStyles = sizes[size];

  return (
    <div
      className={`
        ${sizeStyles.container}
        rounded-full ${style.bg} ${style.text}
        flex items-center justify-center font-bold
        ${sizeStyles.text}
      `}
    >
      {style.letter}
    </div>
  );
}
