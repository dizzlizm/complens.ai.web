import { Check, Loader2 } from 'lucide-react';

interface PricingTier {
  name: string;
  price: string;
  priceId: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    priceId: '',
    description: 'Get started with the basics',
    features: [
      '100 contacts',
      '1 landing page',
      '3 workflows',
      '100 runs/month',
      '1 team member',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    priceId: 'pro',
    description: 'For growing businesses',
    features: [
      '5,000 contacts',
      '10 landing pages',
      '25 workflows',
      '5,000 runs/month',
      '5 team members',
      'Custom domains',
      'Knowledge base',
    ],
    highlighted: true,
  },
  {
    name: 'Business',
    price: '$99',
    priceId: 'business',
    description: 'For scaling teams',
    features: [
      'Unlimited contacts',
      'Unlimited pages',
      'Unlimited workflows',
      'Unlimited runs',
      'Unlimited team members',
      'Custom domains',
      'Knowledge base',
      'Priority support',
    ],
  },
];

interface PricingTableProps {
  currentPlan: string;
  onSelectPlan: (priceId: string) => void;
  isLoading?: boolean;
  loadingPlan?: string;
}

export default function PricingTable({ currentPlan, onSelectPlan, isLoading, loadingPlan }: PricingTableProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {tiers.map((tier) => {
        const isCurrent = tier.name.toLowerCase() === currentPlan;
        const isUpgrade = !isCurrent && tier.priceId;

        return (
          <div
            key={tier.name}
            className={`relative rounded-xl border-2 p-6 ${
              tier.highlighted
                ? 'border-primary-500 shadow-lg'
                : 'border-gray-200'
            }`}
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
              <div className="mt-4">
                <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                {tier.price !== '$0' && <span className="text-gray-500">/month</span>}
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {isCurrent ? (
              <button
                disabled
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed"
              >
                Current Plan
              </button>
            ) : isUpgrade ? (
              <button
                onClick={() => onSelectPlan(tier.priceId)}
                disabled={isLoading}
                className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                  tier.highlighted
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-50`}
              >
                {loadingPlan === tier.priceId ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Upgrade'
                )}
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-gray-50 text-gray-400 cursor-not-allowed"
              >
                Free Plan
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
