import { Check, CreditCard } from 'lucide-react';
import { PricingConfig, PricingTier } from '../types';

interface PricingBlockProps {
  config: PricingConfig;
  isEditing?: boolean;
  onConfigChange?: (config: PricingConfig) => void;
}

export default function PricingBlock({ config, isEditing, onConfigChange }: PricingBlockProps) {
  const {
    title = 'Simple Pricing',
    subtitle = 'Choose the plan that works for you',
    items = [],
  } = config;

  const handleTitleChange = (newTitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, title: newTitle });
    }
  };

  const handleSubtitleChange = (newSubtitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, subtitle: newSubtitle });
    }
  };

  const handleItemChange = (index: number, field: keyof PricingTier, value: string | boolean | string[]) => {
    if (onConfigChange) {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onConfigChange({ ...config, items: newItems });
    }
  };

  return (
    <div className="py-16 px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {isEditing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full text-3xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-4"
                placeholder="Section title..."
              />
              <input
                type="text"
                value={subtitle}
                onChange={(e) => handleSubtitleChange(e.target.value)}
                className="w-full text-lg text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                placeholder="Section subtitle..."
              />
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{title}</h2>
              <p className="text-lg text-gray-600">{subtitle}</p>
            </>
          )}
        </div>

        {/* Pricing Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-${Math.min(items.length, 3)} gap-8`}>
          {items.map((tier, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-2xl p-8 ${
                tier.highlighted
                  ? 'ring-2 ring-indigo-500 shadow-xl scale-105'
                  : 'border border-gray-200 shadow-sm'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-sm font-medium px-4 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              {/* Plan name */}
              {isEditing ? (
                <input
                  type="text"
                  value={tier.name}
                  onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                  className="w-full text-xl font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-4"
                  placeholder="Plan name..."
                />
              ) : (
                <h3 className="text-xl font-semibold text-gray-900 text-center mb-4">
                  {tier.name}
                </h3>
              )}

              {/* Price */}
              <div className="text-center mb-6">
                {isEditing ? (
                  <div className="flex items-baseline justify-center gap-1">
                    <input
                      type="text"
                      value={tier.price}
                      onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                      className="w-24 text-4xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                      placeholder="$29"
                    />
                    <input
                      type="text"
                      value={tier.period}
                      onChange={(e) => handleItemChange(index, 'period', e.target.value)}
                      className="w-20 text-gray-500 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                      placeholder="/month"
                    />
                  </div>
                ) : (
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                    <span className="text-gray-500">{tier.period}</span>
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => {
                          const newFeatures = [...tier.features];
                          newFeatures[fIndex] = e.target.value;
                          handleItemChange(index, 'features', newFeatures);
                        }}
                        className="flex-1 text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                        placeholder="Feature..."
                      />
                    ) : (
                      <span className="text-gray-600">{feature}</span>
                    )}
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  tier.highlighted
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={tier.buttonText}
                    onChange={(e) => handleItemChange(index, 'buttonText', e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none text-center"
                    placeholder="Button text..."
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  tier.buttonText
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No pricing tiers added yet. Configure this block to add plans.</p>
          </div>
        )}
      </div>
    </div>
  );
}
