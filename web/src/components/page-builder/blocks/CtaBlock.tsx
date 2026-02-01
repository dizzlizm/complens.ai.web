import { CtaConfig } from '../types';

interface CtaBlockProps {
  config: CtaConfig;
  isEditing?: boolean;
  onConfigChange?: (config: CtaConfig) => void;
}

export default function CtaBlock({ config, isEditing, onConfigChange }: CtaBlockProps) {
  const {
    headline = 'Ready to get started?',
    description = 'Join thousands of satisfied customers today.',
    buttonText = 'Start Now',
    backgroundColor = '#6366f1',
    textColor = 'light',
  } = config;

  const textClasses = textColor === 'light' ? 'text-white' : 'text-gray-900';
  const descClasses = textColor === 'light' ? 'text-white/80' : 'text-gray-600';
  const buttonClasses = textColor === 'light'
    ? 'bg-white text-gray-900 hover:bg-gray-100'
    : 'bg-gray-900 text-white hover:bg-gray-800';

  const handleChange = (field: keyof CtaConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  return (
    <div
      className="py-16 px-8"
      style={{ backgroundColor }}
    >
      <div className="max-w-3xl mx-auto text-center">
        {isEditing ? (
          <input
            type="text"
            value={headline}
            onChange={(e) => handleChange('headline', e.target.value)}
            className={`w-full text-3xl font-bold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center mb-4 ${textClasses}`}
            placeholder="Call to action headline..."
          />
        ) : (
          <h2 className={`text-3xl font-bold mb-4 ${textClasses}`}>{headline}</h2>
        )}

        {isEditing ? (
          <textarea
            value={description}
            onChange={(e) => handleChange('description', e.target.value)}
            className={`w-full text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center resize-none mb-8 ${descClasses}`}
            placeholder="Supporting description..."
            rows={2}
          />
        ) : (
          <p className={`text-lg mb-8 ${descClasses}`}>{description}</p>
        )}

        <button
          className={`inline-flex items-center px-8 py-4 font-semibold rounded-lg transition-colors ${buttonClasses}`}
        >
          {isEditing ? (
            <input
              type="text"
              value={buttonText}
              onChange={(e) => handleChange('buttonText', e.target.value)}
              className="bg-transparent border-none focus:outline-none text-center"
              placeholder="Button text..."
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            buttonText
          )}
        </button>
      </div>
    </div>
  );
}
