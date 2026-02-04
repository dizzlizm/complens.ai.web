import { Link } from 'react-router-dom';
import { FileText, Users, GitBranch, CheckCircle2, Sparkles } from 'lucide-react';

interface WelcomeCardProps {
  hasPages: boolean;
  hasContacts: boolean;
  hasWorkflows: boolean;
}

const steps = [
  {
    key: 'pages' as const,
    label: 'Create your first landing page',
    description: 'Build a page with AI in minutes',
    icon: FileText,
    href: '/pages',
  },
  {
    key: 'contacts' as const,
    label: 'Add your first contact',
    description: 'Import or manually add contacts',
    icon: Users,
    href: '/contacts',
  },
  {
    key: 'workflows' as const,
    label: 'Set up an automation',
    description: 'Automate follow-ups and notifications',
    icon: GitBranch,
    href: '/workflows/new',
  },
];

export default function WelcomeCard({ hasPages, hasContacts, hasWorkflows }: WelcomeCardProps) {
  const completion: Record<string, boolean> = {
    pages: hasPages,
    contacts: hasContacts,
    workflows: hasWorkflows,
  };

  const completedCount = Object.values(completion).filter(Boolean).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <div className="card border-2 border-primary-100 bg-gradient-to-br from-primary-50/50 to-white">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Welcome to Complens.ai</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Complete these steps to get your marketing automation running.
          </p>
        </div>
        <div className="ml-auto text-sm font-medium text-primary-600">
          {completedCount}/{steps.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
        <div
          className="bg-primary-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          const done = completion[step.key];
          const Icon = step.icon;
          return (
            <Link
              key={step.key}
              to={step.href}
              className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                done
                  ? 'bg-green-50 cursor-default'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {done ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
              {!done && (
                <span className="text-xs font-medium text-primary-600 flex-shrink-0">
                  Get started
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
