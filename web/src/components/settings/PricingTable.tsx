import { Check, Loader2, Sparkles, Zap } from 'lucide-react';

interface PricingTier {
  name: string;
  planKey: string; // maps to backend plan name
  price: string;
  priceId: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  icon: 'free' | 'pro' | 'business';
}

const tiers: PricingTier[] = [
  {
    name: 'Starter',
    planKey: 'free',
    price: '$0',
    priceId: '',
    description: 'Try it out — no credit card needed',
    features: [
      '100 contacts',
      '1 landing page',
      '3 workflows',
      '100 runs/month',
      '1 team member',
      'AI page builder',
      'AI chat widget',
    ],
    icon: 'free',
  },
  {
    name: 'Pro',
    planKey: 'pro',
    price: '$97',
    priceId: 'pro',
    description: 'Everything you need to grow',
    features: [
      '10,000 contacts',
      '25 landing pages',
      '50 workflows',
      '10,000 runs/month',
      '5 team members',
      'Custom domains',
      'Knowledge base',
      'AI workflow generation',
      'Priority support',
    ],
    highlighted: true,
    icon: 'pro',
  },
  {
    name: 'Business',
    planKey: 'business',
    price: '$297',
    priceId: 'business',
    description: 'For agencies & scaling teams',
    features: [
      'Unlimited contacts',
      'Unlimited pages',
      'Unlimited workflows',
      'Unlimited runs',
      'Unlimited team members',
      'Custom domains',
      'Knowledge base',
      'White-glove onboarding',
      'Dedicated support',
    ],
    icon: 'business',
  },
];

interface PricingTableProps {
  currentPlan: string;
  onSelectPlan: (priceId: string) => void;
  isLoading?: boolean;
  loadingPlan?: string;
}

function PlanIcon({ type }: { type: 'free' | 'pro' | 'business' }) {
  if (type === 'free') {
    return (
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
        <Zap className="w-5 h-5 text-gray-500" />
      </div>
    );
  }
  if (type === 'pro') {
    return (
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    </div>
  );
}

const planOrder: Record<string, number> = { free: 0, pro: 1, business: 2 };

export default function PricingTable({ currentPlan, onSelectPlan, isLoading, loadingPlan }: PricingTableProps) {
  const currentPlanOrder = planOrder[currentPlan] ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {tiers.map((tier) => {
        const tierOrder = planOrder[tier.planKey] ?? 0;
        const isCurrent = tier.planKey === currentPlan;
        const isUpgrade = !isCurrent && tierOrder > currentPlanOrder;
        const isDowngrade = !isCurrent && tierOrder < currentPlanOrder;

        return (
          <div
            key={tier.name}
            className={`relative rounded-2xl border-2 p-6 transition-all ${
              tier.highlighted
                ? 'border-primary-500 shadow-xl shadow-primary-500/10 scale-[1.02]'
                : isCurrent
                  ? 'border-primary-300 bg-primary-50/50'
                  : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                  Most Popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <PlanIcon type={tier.icon} />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-medium text-primary-600">Current plan</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-500">{tier.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
              {tier.price !== '$0' && <span className="text-gray-500 ml-1">/month</span>}
            </div>

            <ul className="space-y-3 mb-6">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {isCurrent ? (
              <div className="w-full py-2.5 px-4 rounded-xl text-sm font-medium bg-primary-100 text-primary-700 text-center">
                Your Current Plan
              </div>
            ) : isUpgrade ? (
              <button
                onClick={() => onSelectPlan(tier.priceId)}
                disabled={isLoading}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                  tier.highlighted
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-lg shadow-primary-500/25'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === tier.priceId ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  `Upgrade to ${tier.name}`
                )}
              </button>
            ) : isDowngrade ? (
              <div className="w-full py-2.5 px-4 rounded-xl text-sm font-medium bg-gray-50 text-gray-400 text-center">
                Included in your plan
              </div>
            ) : (
              <div className="w-full py-2.5 px-4 rounded-xl text-sm font-medium bg-gray-50 text-gray-400 text-center">
                Free Forever
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
