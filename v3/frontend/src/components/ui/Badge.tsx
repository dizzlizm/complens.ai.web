import { type ReactNode } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, Info, Shield, Zap } from 'lucide-react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  dot?: boolean;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  primary: 'bg-brand-100 text-brand-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

const sizes: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  primary: 'bg-brand-500',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${variants[variant]}
        ${sizes[size]}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {icon && <span className="flex-shrink-0 w-3.5 h-3.5">{icon}</span>}
      {children}
    </span>
  );
}

// Pre-built risk badges
type RiskLevel = 'high' | 'medium' | 'low' | 'none';

interface RiskBadgeProps {
  level: RiskLevel;
  showIcon?: boolean;
}

const riskConfig: Record<RiskLevel, { variant: BadgeVariant; label: string; icon: ReactNode }> = {
  high: { variant: 'danger', label: 'High Risk', icon: <AlertTriangle className="w-3 h-3" /> },
  medium: { variant: 'warning', label: 'Medium', icon: <AlertCircle className="w-3 h-3" /> },
  low: { variant: 'success', label: 'Low Risk', icon: <CheckCircle className="w-3 h-3" /> },
  none: { variant: 'default', label: 'Unknown', icon: <Info className="w-3 h-3" /> },
};

export function RiskBadge({ level, showIcon = true }: RiskBadgeProps) {
  const config = riskConfig[level];
  return (
    <Badge variant={config.variant} icon={showIcon ? config.icon : undefined}>
      {config.label}
    </Badge>
  );
}

// Status badges
type StatusType = 'connected' | 'scanning' | 'error' | 'pending';

interface StatusBadgeProps {
  status: StatusType;
}

const statusConfig: Record<StatusType, { variant: BadgeVariant; label: string }> = {
  connected: { variant: 'success', label: 'Connected' },
  scanning: { variant: 'primary', label: 'Scanning' },
  error: { variant: 'danger', label: 'Error' },
  pending: { variant: 'default', label: 'Pending' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}
