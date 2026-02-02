/**
 * Public Block Renderer - renders page blocks for public viewing
 */

import { useState } from 'react';
import PublicForm from './PublicForm';
import type { PageBlock, HeroConfig, FeaturesConfig, CtaConfig, FormConfig, TestimonialsConfig, FaqConfig, TextConfig, ImageConfig, StatsConfig, DividerConfig, PricingConfig, VideoConfig, ChatConfig as ChatBlockConfig } from '../page-builder/types';

interface PublicBlockRendererProps {
  blocks: PageBlock[];
  primaryColor: string;
  workspaceId: string;
  pageId: string;
}

export default function PublicBlockRenderer({ blocks, primaryColor, workspaceId, pageId }: PublicBlockRendererProps) {
  // Sort blocks by order
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <div className="public-blocks">
      {sortedBlocks.map((block) => (
        <PublicBlock
          key={block.id}
          block={block}
          primaryColor={primaryColor}
          workspaceId={workspaceId}
          pageId={pageId}
        />
      ))}
    </div>
  );
}

interface PublicBlockProps {
  block: PageBlock;
  primaryColor: string;
  workspaceId: string;
  pageId: string;
}

function PublicBlock({ block, primaryColor, workspaceId, pageId }: PublicBlockProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = block.config as any;

  switch (block.type) {
    case 'hero':
      return <HeroBlockPublic config={config} />;
    case 'features':
      return <FeaturesBlockPublic config={config} />;
    case 'cta':
      return <CtaBlockPublic config={config} />;
    case 'form':
      return <FormBlockPublic config={config} workspaceId={workspaceId} pageId={pageId} primaryColor={primaryColor} />;
    case 'testimonials':
      return <TestimonialsBlockPublic config={config} />;
    case 'faq':
      return <FaqBlockPublic config={config} />;
    case 'text':
      return <TextBlockPublic config={config} />;
    case 'image':
      return <ImageBlockPublic config={config} />;
    case 'stats':
      return <StatsBlockPublic config={config} />;
    case 'divider':
      return <DividerBlockPublic config={config} />;
    case 'pricing':
      return <PricingBlockPublic config={config} primaryColor={primaryColor} />;
    case 'video':
      return <VideoBlockPublic config={config} />;
    case 'chat':
      return <ChatBlockPublic config={config} workspaceId={workspaceId} pageId={pageId} />;
    default:
      return null;
  }
}

// Hero Block
function HeroBlockPublic({ config }: { config: HeroConfig }) {
  const getBackground = () => {
    if (config.backgroundType === 'image' && config.backgroundImage) {
      return `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${config.backgroundImage}) center/cover`;
    }
    if (config.backgroundType === 'gradient') {
      return `linear-gradient(135deg, ${config.gradientFrom || '#6366f1'}, ${config.gradientTo || '#8b5cf6'})`;
    }
    return config.backgroundColor || '#6366f1';
  };

  return (
    <section
      className="min-h-[80vh] flex items-center justify-center py-20 px-4"
      style={{ background: getBackground() }}
    >
      <div className={`max-w-4xl mx-auto text-${config.textAlign || 'center'}`}>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
          {config.headline}
        </h1>
        {config.subheadline && (
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto">
            {config.subheadline}
          </p>
        )}
        {config.showButton && config.buttonText && (
          <a
            href={config.buttonLink || '#'}
            className="inline-block px-8 py-4 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            {config.buttonText}
          </a>
        )}
      </div>
    </section>
  );
}

// Features Block
function FeaturesBlockPublic({ config }: { config: FeaturesConfig }) {
  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  }[config.columns || 3];

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        {(config.title || config.subtitle) && (
          <div className="text-center mb-12">
            {config.title && <h2 className="text-3xl font-bold text-gray-900 mb-4">{config.title}</h2>}
            {config.subtitle && <p className="text-xl text-gray-600">{config.subtitle}</p>}
          </div>
        )}
        <div className={`grid grid-cols-1 ${gridCols} gap-8`}>
          {config.items?.map((item, i) => (
            <div key={i} className="text-center p-6">
              {item.icon && (
                <div className="w-12 h-12 mx-auto mb-4 bg-primary-100 rounded-lg flex items-center justify-center">
                  <FeatureIcon icon={item.icon} />
                </div>
              )}
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Simple icon renderer for features
function FeatureIcon({ icon }: { icon: string }) {
  // Map common icon names to simple SVG paths
  const icons: Record<string, JSX.Element> = {
    zap: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    shield: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    heart: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    star: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    check: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  };

  return icons[icon] || icons.check;
}

// CTA Block
function CtaBlockPublic({ config }: { config: CtaConfig }) {
  const textColorClass = config.textColor === 'dark' ? 'text-gray-900' : 'text-white';

  return (
    <section
      className="py-16 px-4"
      style={{ backgroundColor: config.backgroundColor || '#6366f1' }}
    >
      <div className="max-w-4xl mx-auto text-center">
        <h2 className={`text-3xl md:text-4xl font-bold mb-4 ${textColorClass}`}>
          {config.headline}
        </h2>
        {config.description && (
          <p className={`text-xl mb-8 ${config.textColor === 'dark' ? 'text-gray-600' : 'text-white/90'}`}>
            {config.description}
          </p>
        )}
        {config.buttonText && (
          <a
            href={config.buttonLink || '#'}
            className={`inline-block px-8 py-4 font-semibold rounded-lg transition-colors ${
              config.textColor === 'dark'
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'bg-white text-gray-900 hover:bg-gray-100'
            }`}
          >
            {config.buttonText}
          </a>
        )}
      </div>
    </section>
  );
}

// Form Block
function FormBlockPublic({ config, workspaceId, pageId, primaryColor }: { config: FormConfig; workspaceId: string; pageId: string; primaryColor: string }) {
  if (!config.formId) {
    return null;
  }

  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-xl mx-auto">
        {(config.title || config.description) && (
          <div className="text-center mb-8">
            {config.title && <h2 className="text-2xl font-bold text-gray-900 mb-2">{config.title}</h2>}
            {config.description && <p className="text-gray-600">{config.description}</p>}
          </div>
        )}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <PublicForm
            formId={config.formId}
            workspaceId={workspaceId}
            pageId={pageId}
            primaryColor={primaryColor}
          />
        </div>
      </div>
    </section>
  );
}

// Testimonials Block
function TestimonialsBlockPublic({ config }: { config: TestimonialsConfig }) {
  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {config.title && (
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">{config.title}</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {config.items?.map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600 italic mb-4">"{item.quote}"</p>
              <div className="flex items-center">
                {item.avatar ? (
                  <img src={item.avatar} alt={item.author} className="w-10 h-10 rounded-full mr-3" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                    <span className="text-primary-600 font-semibold">{item.author?.[0]}</span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{item.author}</p>
                  {item.company && <p className="text-sm text-gray-500">{item.company}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// FAQ Block
function FaqBlockPublic({ config }: { config: FaqConfig }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-3xl mx-auto">
        {config.title && (
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">{config.title}</h2>
        )}
        <div className="space-y-4">
          {config.items?.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <span className="font-medium text-gray-900">{item.question}</span>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openIndex === i && (
                <div className="px-4 pb-4 text-gray-600">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Text Block
function TextBlockPublic({ config }: { config: TextConfig }) {
  return (
    <section className="py-12 px-4 bg-white">
      <div className={`max-w-3xl mx-auto prose prose-lg text-${config.alignment || 'left'}`}>
        <div dangerouslySetInnerHTML={{ __html: config.content || '' }} />
      </div>
    </section>
  );
}

// Image Block
function ImageBlockPublic({ config }: { config: ImageConfig }) {
  if (!config.url) return null;

  const widthClass = {
    full: 'max-w-full',
    large: 'max-w-4xl',
    medium: 'max-w-2xl',
    small: 'max-w-md',
  }[config.width || 'large'];

  return (
    <section className="py-12 px-4 bg-white">
      <figure className={`${widthClass} mx-auto`}>
        <img
          src={config.url}
          alt={config.alt || ''}
          className="w-full rounded-lg shadow-lg"
        />
        {config.caption && (
          <figcaption className="mt-3 text-center text-gray-500 text-sm">
            {config.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}

// Stats Block
function StatsBlockPublic({ config }: { config: StatsConfig }) {
  return (
    <section className="py-16 px-4 bg-primary-600">
      <div className="max-w-6xl mx-auto">
        {config.title && (
          <h2 className="text-3xl font-bold text-white text-center mb-12">{config.title}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {config.items?.map((item, i) => (
            <div key={i} className="text-center">
              <p className="text-4xl md:text-5xl font-bold text-white mb-2">{item.value}</p>
              <p className="text-white/80">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Divider Block
function DividerBlockPublic({ config }: { config: DividerConfig }) {
  const heightClass = {
    small: 'py-4',
    medium: 'py-8',
    large: 'py-12',
  }[config.height || 'medium'];

  if (config.style === 'space') {
    return <div className={heightClass} />;
  }

  if (config.style === 'dots') {
    return (
      <div className={`${heightClass} flex items-center justify-center`}>
        <div className="flex gap-2">
          <span className="w-2 h-2 bg-gray-300 rounded-full" />
          <span className="w-2 h-2 bg-gray-300 rounded-full" />
          <span className="w-2 h-2 bg-gray-300 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${heightClass} px-4`}>
      <hr className="max-w-4xl mx-auto border-gray-200" />
    </div>
  );
}

// Pricing Block
function PricingBlockPublic({ config, primaryColor }: { config: PricingConfig; primaryColor: string }) {
  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {(config.title || config.subtitle) && (
          <div className="text-center mb-12">
            {config.title && <h2 className="text-3xl font-bold text-gray-900 mb-4">{config.title}</h2>}
            {config.subtitle && <p className="text-xl text-gray-600">{config.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {config.items?.map((tier, i) => (
            <div
              key={i}
              className={`bg-white rounded-lg shadow-lg p-8 ${tier.highlighted ? 'ring-2 ring-primary-600 scale-105' : ''}`}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{tier.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                <span className="text-gray-500">{tier.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {tier.features?.map((feature, j) => (
                  <li key={j} className="flex items-center text-gray-600">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={tier.buttonLink || '#'}
                className={`block w-full py-3 text-center rounded-lg font-semibold transition-colors ${
                  tier.highlighted
                    ? 'text-white hover:opacity-90'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
                style={tier.highlighted ? { backgroundColor: primaryColor } : undefined}
              >
                {tier.buttonText || 'Get Started'}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Video Block
function VideoBlockPublic({ config }: { config: VideoConfig }) {
  if (!config.url) return null;

  // Extract video ID from YouTube/Vimeo URLs
  const getEmbedUrl = (url: string) => {
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}${config.autoplay ? '?autoplay=1' : ''}`;
    }
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}${config.autoplay ? '?autoplay=1' : ''}`;
    }
    return url;
  };

  return (
    <section className="py-12 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        {config.title && (
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">{config.title}</h2>
        )}
        <div className="relative pb-[56.25%] h-0">
          <iframe
            src={getEmbedUrl(config.url)}
            className="absolute top-0 left-0 w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}

// Chat Block (inline chat widget placeholder - actual chat uses floating widget)
function ChatBlockPublic({ config }: { config: ChatBlockConfig; workspaceId: string; pageId: string }) {
  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        {(config.title || config.subtitle) && (
          <div className="text-center mb-8">
            {config.title && <h2 className="text-2xl font-bold text-gray-900 mb-2">{config.title}</h2>}
            {config.subtitle && <p className="text-gray-600">{config.subtitle}</p>}
          </div>
        )}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: config.primaryColor || '#6366f1' }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">
            {config.placeholder || 'Click the chat button in the corner to start a conversation'}
          </p>
          <p className="text-sm text-gray-400">
            Chat widget appears in the bottom-right corner
          </p>
        </div>
      </div>
    </section>
  );
}
