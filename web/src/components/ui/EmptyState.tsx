import { LucideIcon, HelpCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  helpText?: string;
  helpLink?: {
    label: string;
    href: string;
  };
  tip?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  helpText,
  helpLink,
  tip,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-6">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 max-w-md mx-auto mb-6">{description}</p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
        {action && (
          action.href ? (
            <Link to={action.href} className="btn btn-primary">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn btn-primary">
              {action.label}
            </button>
          )
        )}
        {secondaryAction && (
          secondaryAction.href ? (
            <Link to={secondaryAction.href} className="btn btn-secondary">
              {secondaryAction.label}
            </Link>
          ) : (
            <button onClick={secondaryAction.onClick} className="btn btn-secondary">
              {secondaryAction.label}
            </button>
          )
        )}
      </div>

      {/* Tip box */}
      {tip && (
        <div className="inline-flex items-start gap-2 bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-sm text-left max-w-md mx-auto mb-4">
          <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{tip}</span>
        </div>
      )}

      {/* Help link */}
      {(helpText || helpLink) && (
        <div className="text-sm text-gray-500">
          {helpText}
          {helpLink && (
            <a
              href={helpLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 ml-1"
            >
              {helpLink.label}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
