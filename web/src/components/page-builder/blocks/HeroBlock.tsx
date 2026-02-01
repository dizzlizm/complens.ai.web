import { HeroConfig } from '../types';

interface HeroBlockProps {
  config: HeroConfig;
  isEditing?: boolean;
  onConfigChange?: (config: HeroConfig) => void;
}

export default function HeroBlock({ config, isEditing, onConfigChange }: HeroBlockProps) {
  const {
    headline = 'Welcome to Your Page',
    subheadline = 'Add a compelling description here',
    buttonText = 'Get Started',
    backgroundType = 'gradient',
    backgroundColor = '#6366f1',
    backgroundImage = '',
    gradientFrom = '#6366f1',
    gradientTo = '#8b5cf6',
    textAlign = 'center',
    showButton = true,
  } = config;

  const getBackgroundStyle = () => {
    switch (backgroundType) {
      case 'image':
        return {
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      case 'gradient':
        return {
          background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        };
      default:
        return { backgroundColor };
    }
  };

  const alignmentClass = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  }[textAlign];

  const handleInlineEdit = (field: keyof HeroConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  return (
    <div
      className={`relative min-h-[400px] flex flex-col justify-center px-8 py-16 ${alignmentClass}`}
      style={getBackgroundStyle()}
    >
      {/* Overlay for images */}
      {backgroundType === 'image' && backgroundImage && (
        <div className="absolute inset-0 bg-black/40" />
      )}

      <div className={`relative z-10 max-w-3xl ${textAlign === 'center' ? 'mx-auto' : ''}`}>
        {isEditing ? (
          <input
            type="text"
            value={headline}
            onChange={(e) => handleInlineEdit('headline', e.target.value)}
            className="w-full text-4xl md:text-5xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/50 rounded px-2 py-1 placeholder-white/50"
            placeholder="Your headline here..."
          />
        ) : (
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {headline}
          </h1>
        )}

        {isEditing ? (
          <textarea
            value={subheadline}
            onChange={(e) => handleInlineEdit('subheadline', e.target.value)}
            className="w-full text-xl text-white/90 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/50 rounded px-2 py-1 resize-none placeholder-white/50 mt-4"
            placeholder="Your subheadline here..."
            rows={2}
          />
        ) : (
          <p className="text-xl text-white/90 mb-8">
            {subheadline}
          </p>
        )}

        {showButton && (
          <button
            className="inline-flex items-center px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors mt-4"
            onClick={(e) => {
              if (!isEditing) {
                e.preventDefault();
              }
            }}
          >
            {isEditing ? (
              <input
                type="text"
                value={buttonText}
                onChange={(e) => handleInlineEdit('buttonText', e.target.value)}
                className="bg-transparent border-none focus:outline-none text-center"
                placeholder="Button text..."
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              buttonText
            )}
          </button>
        )}
      </div>
    </div>
  );
}
