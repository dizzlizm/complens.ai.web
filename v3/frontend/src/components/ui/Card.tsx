import { type ReactNode, type HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outline' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

const variants = {
  default: 'bg-white shadow-sm',
  elevated: 'bg-white shadow-md',
  outline: 'bg-white border border-gray-200',
  ghost: 'bg-gray-50',
};

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`
        rounded-2xl
        ${variants[variant]}
        ${paddings[padding]}
        ${interactive ? 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardDivider() {
  return <div className="border-t border-gray-100 my-4 -mx-4" />;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 pt-4 mt-4 border-t border-gray-100 ${className}`}>
      {children}
    </div>
  );
}
