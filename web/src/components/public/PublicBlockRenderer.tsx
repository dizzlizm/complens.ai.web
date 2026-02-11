/**
 * Public Block Renderer - renders page blocks for public viewing
 * Supports 12-column grid layout with row/colSpan positioning
 */

import { useState } from 'react';
import DOMPurify from 'dompurify';
import PublicForm from './PublicForm';
import ChatWidget from './ChatWidget';
import type { PageBlock, ColSpan, HeroConfig, FeaturesConfig, CtaConfig, FormConfig, TestimonialsConfig, FaqConfig, TextConfig, ImageConfig, StatsConfig, DividerConfig, PricingConfig, VideoConfig, ChatConfig as ChatBlockConfig } from '../page-builder/types';
import { groupBlocksIntoRows, type LayoutRow } from '../page-builder/types';

type PageLayout = 'full-bleed' | 'contained';

interface PublicBlockRendererProps {
  blocks: PageBlock[];
  primaryColor: string;
  workspaceId: string;
  pageId: string;
  layout?: PageLayout;
}

// Block types that render as full-bleed sections (ignore grid layout)
const FULL_BLEED_TYPES = ['hero', 'cta', 'stats'];

// Convert colSpan to Tailwind grid class (responsive: full on mobile, grid on sm+)
function getColSpanClass(colSpan: ColSpan | undefined): string {
  const span = colSpan ?? 12;
  switch (span) {
    case 4:
      return 'col-span-12 sm:col-span-4';
    case 6:
      return 'col-span-12 sm:col-span-6';
    case 8:
      return 'col-span-12 sm:col-span-8';
    case 12:
    default:
      return 'col-span-12';
  }
}

export default function PublicBlockRenderer({ blocks, primaryColor, workspaceId, pageId, layout = 'full-bleed' }: PublicBlockRendererProps) {
  // Group blocks into rows for layout
  const rows = groupBlocksIntoRows(blocks);
  const isContained = layout === 'contained';

  return (
    <div className={`public-blocks ${isContained ? 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8' : ''}`}>
      {rows.map((row) => (
        <PublicRow
          key={row.rowIndex}
          row={row}
          primaryColor={primaryColor}
          workspaceId={workspaceId}
          pageId={pageId}
          contained={isContained}
        />
      ))}
    </div>
  );
}

interface PublicRowProps {
  row: LayoutRow;
  primaryColor: string;
  workspaceId: string;
  pageId: string;
  contained?: boolean;
}

function PublicRow({ row, primaryColor, workspaceId, pageId, contained = false }: PublicRowProps) {
  // Check if this row has a single full-bleed block
  const isSingleFullBleed = !contained &&
    row.slots.length === 1 &&
    FULL_BLEED_TYPES.includes(row.slots[0].type as string) &&
    (row.slots[0].colSpan === 12 || !row.slots[0].colSpan);

  // Single full-bleed block renders without grid wrapper (only in full-bleed layout)
  if (isSingleFullBleed) {
    const block = row.slots[0];
    return (
      <PublicBlock
        block={block}
        primaryColor={primaryColor}
        workspaceId={workspaceId}
        pageId={pageId}
        isFullBleed
      />
    );
  }

  // Contained layout or multi-block rows: render in grid
  // In contained mode, skip the max-w wrapper since the parent already constrains
  const gridClass = contained
    ? 'grid grid-cols-12 gap-4 sm:gap-6 py-4'
    : 'grid grid-cols-12 gap-4 sm:gap-6 max-w-7xl mx-auto px-4 py-8';

  return (
    <div className={gridClass}>
      {row.slots.map((block) => (
        <div
          key={block.id}
          className={getColSpanClass(block.colSpan)}
        >
          <PublicBlock
            block={block}
            primaryColor={primaryColor}
            workspaceId={workspaceId}
            pageId={pageId}
            isFullBleed={false}
          />
        </div>
      ))}
    </div>
  );
}

interface PublicBlockProps {
  block: PageBlock;
  primaryColor: string;
  workspaceId: string;
  pageId: string;
  isFullBleed?: boolean;
}

function PublicBlock({ block, primaryColor, workspaceId, pageId, isFullBleed = false }: PublicBlockProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = block.config as any;

  switch (block.type) {
    case 'hero':
      return <HeroBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'features':
      return <FeaturesBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'cta':
      return <CtaBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'form':
      return <FormBlockPublic config={config} workspaceId={workspaceId} pageId={pageId} primaryColor={primaryColor} isFullBleed={isFullBleed} />;
    case 'testimonials':
      return <TestimonialsBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'faq':
      return <FaqBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'text':
      return <TextBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'image':
      return <ImageBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'stats':
      return <StatsBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'divider':
      return <DividerBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'pricing':
      return <PricingBlockPublic config={config} primaryColor={primaryColor} isFullBleed={isFullBleed} />;
    case 'video':
      return <VideoBlockPublic config={config} isFullBleed={isFullBleed} />;
    case 'chat':
      return <ChatBlockPublic config={config} workspaceId={workspaceId} pageId={pageId} isFullBleed={isFullBleed} />;
    default:
      return null;
  }
}

// Hero Block
function HeroBlockPublic({ config, isFullBleed = true }: { config: HeroConfig; isFullBleed?: boolean }) {
  const getBackground = () => {
    if (config.backgroundType === 'image' && config.backgroundImage) {
      return `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${config.backgroundImage}) center/cover`;
    }
    if (config.backgroundType === 'gradient') {
      return `linear-gradient(135deg, ${config.gradientFrom || '#6366f1'}, ${config.gradientTo || '#8b5cf6'})`;
    }
    return config.backgroundColor || '#6366f1';
  };

  // Full-bleed hero (single block row)
  if (isFullBleed) {
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

  // Grid-contained hero (compact version)
  return (
    <div
      className="rounded-lg py-12 px-6 flex items-center justify-center"
      style={{ background: getBackground() }}
    >
      <div className={`text-${config.textAlign || 'center'}`}>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
          {config.headline}
        </h2>
        {config.subheadline && (
          <p className="text-lg text-white/90 mb-6">
            {config.subheadline}
          </p>
        )}
        {config.showButton && config.buttonText && (
          <a
            href={config.buttonLink || '#'}
            className="inline-block px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors text-sm"
          >
            {config.buttonText}
          </a>
        )}
      </div>
    </div>
  );
}

// Features Block
function FeaturesBlockPublic({ config, isFullBleed = true }: { config: FeaturesConfig; isFullBleed?: boolean }) {
  // For grid items, show fewer columns based on space
  const gridCols = isFullBleed ? {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  }[config.columns || 3] : 'grid-cols-1'; // Single column when in grid

  // Full-bleed version (section with max-width)
  if (isFullBleed) {
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

  // Grid-contained version (compact, no section wrapper)
  return (
    <div className="py-6 bg-white rounded-lg">
      {(config.title || config.subtitle) && (
        <div className="text-center mb-6">
          {config.title && <h3 className="text-xl font-bold text-gray-900 mb-2">{config.title}</h3>}
          {config.subtitle && <p className="text-gray-600">{config.subtitle}</p>}
        </div>
      )}
      <div className={`grid ${gridCols} gap-4`}>
        {config.items?.map((item, i) => (
          <div key={i} className="text-center p-4">
            {item.icon && (
              <div className="w-10 h-10 mx-auto mb-3 bg-primary-100 rounded-lg flex items-center justify-center">
                <FeatureIcon icon={item.icon} />
              </div>
            )}
            <h4 className="text-base font-semibold text-gray-900 mb-1">{item.title}</h4>
            <p className="text-sm text-gray-600">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
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
    sparkles: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    mail: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    globe: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    users: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    'trending-up': (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    clock: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    layers: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    target: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={2} /><circle cx="12" cy="12" r="6" strokeWidth={2} /><circle cx="12" cy="12" r="2" strokeWidth={2} />
      </svg>
    ),
    palette: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    rocket: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 003.46-8.62 2.25 2.25 0 00-2.18-2.18 14.98 14.98 0 00-8.62 3.46m5.34 7.34L7.66 9.63m7.93 4.74C14.39 15.57 13 17.5 13 17.5l-3-3s1.93-1.39 3.13-2.59M4.5 14.5c-.83.83-1.5 3-1.5 3s2.17-.67 3-1.5a1.5 1.5 0 00-1.5-1.5z" />
      </svg>
    ),
    'message-circle': (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    'bar-chart': (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V10M6 20V4m12 16v-8" />
      </svg>
    ),
    lock: (
      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  };

  return icons[icon] || icons.check;
}

// CTA Block
function CtaBlockPublic({ config, isFullBleed = true }: { config: CtaConfig; isFullBleed?: boolean }) {
  const textColorClass = config.textColor === 'dark' ? 'text-gray-900' : 'text-white';

  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div
      className="py-8 px-6 rounded-lg text-center"
      style={{ backgroundColor: config.backgroundColor || '#6366f1' }}
    >
      <h3 className={`text-xl md:text-2xl font-bold mb-3 ${textColorClass}`}>
        {config.headline}
      </h3>
      {config.description && (
        <p className={`mb-6 ${config.textColor === 'dark' ? 'text-gray-600' : 'text-white/90'}`}>
          {config.description}
        </p>
      )}
      {config.buttonText && (
        <a
          href={config.buttonLink || '#'}
          className={`inline-block px-6 py-3 font-semibold rounded-lg transition-colors text-sm ${
            config.textColor === 'dark'
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-white text-gray-900 hover:bg-gray-100'
          }`}
        >
          {config.buttonText}
        </a>
      )}
    </div>
  );
}

// Form Block
function FormBlockPublic({ config, workspaceId, pageId, primaryColor, isFullBleed = true }: { config: FormConfig; workspaceId: string; pageId: string; primaryColor: string; isFullBleed?: boolean }) {
  if (!config.formId) {
    // Hide the block entirely if no form is linked
    return null;
  }

  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-6 bg-gray-50 rounded-lg">
      {(config.title || config.description) && (
        <div className="text-center mb-4 px-4">
          {config.title && <h3 className="text-lg font-bold text-gray-900 mb-1">{config.title}</h3>}
          {config.description && <p className="text-sm text-gray-600">{config.description}</p>}
        </div>
      )}
      <div className="bg-white rounded-lg shadow p-4 mx-2">
        <PublicForm
          formId={config.formId}
          workspaceId={workspaceId}
          pageId={pageId}
          primaryColor={primaryColor}
        />
      </div>
    </div>
  );
}

// Testimonials Block
function TestimonialsBlockPublic({ config, isFullBleed = true }: { config: TestimonialsConfig; isFullBleed?: boolean }) {
  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-6 bg-gray-50 rounded-lg">
      {config.title && (
        <h3 className="text-xl font-bold text-gray-900 text-center mb-6">{config.title}</h3>
      )}
      <div className="space-y-4 px-4">
        {config.items?.map((item, i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-600 italic mb-3">"{item.quote}"</p>
            <div className="flex items-center">
              {item.avatar ? (
                <img src={item.avatar} alt={item.author} className="w-8 h-8 rounded-full mr-2" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center mr-2">
                  <span className="text-primary-600 font-semibold text-sm">{item.author?.[0]}</span>
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900 text-sm">{item.author}</p>
                {item.company && <p className="text-xs text-gray-500">{item.company}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// FAQ Block
function FaqBlockPublic({ config, isFullBleed = true }: { config: FaqConfig; isFullBleed?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-6 bg-white rounded-lg">
      {config.title && (
        <h3 className="text-xl font-bold text-gray-900 text-center mb-6">{config.title}</h3>
      )}
      <div className="space-y-2 px-2">
        {config.items?.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded-lg">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <span className="font-medium text-gray-900 text-sm">{item.question}</span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openIndex === i && (
              <div className="px-3 pb-3 text-sm text-gray-600">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Text Block
// SECURITY: Sanitize HTML content with DOMPurify to prevent XSS attacks

// DOMPurify config for text content - more restrictive than page content
const TEXT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'p', 'span', 'a', 'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'br', 'hr'
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'href', 'target', 'rel', 'style'
  ],
  ALLOW_DATA_ATTR: false,
};

function TextBlockPublic({ config, isFullBleed = true }: { config: TextConfig; isFullBleed?: boolean }) {
  // SECURITY: Sanitize content to prevent XSS
  const sanitizedContent = DOMPurify.sanitize(config.content || '', TEXT_SANITIZE_CONFIG);

  // Full-bleed version
  if (isFullBleed) {
    return (
      <section className="py-12 px-4 bg-white">
        <div className={`max-w-3xl mx-auto prose prose-lg text-${config.alignment || 'left'}`}>
          <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
        </div>
      </section>
    );
  }

  // Grid-contained version
  return (
    <div className={`py-6 bg-white rounded-lg prose prose-sm text-${config.alignment || 'left'}`}>
      <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
    </div>
  );
}

// Image Block
function ImageBlockPublic({ config, isFullBleed = true }: { config: ImageConfig; isFullBleed?: boolean }) {
  if (!config.url) return null;

  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-4 bg-white rounded-lg">
      <figure>
        <img
          src={config.url}
          alt={config.alt || ''}
          className="w-full rounded-lg shadow"
        />
        {config.caption && (
          <figcaption className="mt-2 text-center text-gray-500 text-xs">
            {config.caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}

// Stats Block
function StatsBlockPublic({ config, isFullBleed = true }: { config: StatsConfig; isFullBleed?: boolean }) {
  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-8 px-4 bg-primary-600 rounded-lg">
      {config.title && (
        <h3 className="text-xl font-bold text-white text-center mb-6">{config.title}</h3>
      )}
      <div className="grid grid-cols-2 gap-4">
        {config.items?.map((item, i) => (
          <div key={i} className="text-center">
            <p className="text-2xl font-bold text-white mb-1">{item.value}</p>
            <p className="text-sm text-white/80">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Divider Block
function DividerBlockPublic({ config, isFullBleed = true }: { config: DividerConfig; isFullBleed?: boolean }) {
  const heightClass = isFullBleed ? {
    small: 'py-4',
    medium: 'py-8',
    large: 'py-12',
  }[config.height || 'medium'] : {
    small: 'py-2',
    medium: 'py-4',
    large: 'py-6',
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
    <div className={`${heightClass} ${isFullBleed ? 'px-4' : ''}`}>
      <hr className={`${isFullBleed ? 'max-w-4xl mx-auto' : ''} border-gray-200`} />
    </div>
  );
}

// Pricing Block
function PricingBlockPublic({ config, primaryColor, isFullBleed = true }: { config: PricingConfig; primaryColor: string; isFullBleed?: boolean }) {
  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version (simplified single-column pricing)
  return (
    <div className="py-6 bg-gray-50 rounded-lg">
      {(config.title || config.subtitle) && (
        <div className="text-center mb-6 px-4">
          {config.title && <h3 className="text-xl font-bold text-gray-900 mb-2">{config.title}</h3>}
          {config.subtitle && <p className="text-sm text-gray-600">{config.subtitle}</p>}
        </div>
      )}
      <div className="space-y-4 px-4">
        {config.items?.map((tier, i) => (
          <div
            key={i}
            className={`bg-white rounded-lg shadow p-4 ${tier.highlighted ? 'ring-2 ring-primary-600' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-gray-900">{tier.name}</h4>
              <div>
                <span className="text-2xl font-bold text-gray-900">{tier.price}</span>
                <span className="text-gray-500 text-sm">{tier.period}</span>
              </div>
            </div>
            <ul className="space-y-1 mb-4">
              {tier.features?.slice(0, 3).map((feature, j) => (
                <li key={j} className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href={tier.buttonLink || '#'}
              className={`block w-full py-2 text-center rounded-lg font-semibold text-sm transition-colors ${
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
  );
}

// Video Block
function VideoBlockPublic({ config, isFullBleed = true }: { config: VideoConfig; isFullBleed?: boolean }) {
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

  // Full-bleed version
  if (isFullBleed) {
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

  // Grid-contained version
  return (
    <div className="py-4 bg-white rounded-lg">
      {config.title && (
        <h3 className="text-lg font-bold text-gray-900 text-center mb-4">{config.title}</h3>
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
  );
}

// Chat Block - renders inline or shows floating placeholder
function ChatBlockPublic({ config, workspaceId, pageId, isFullBleed = true }: { config: ChatBlockConfig; workspaceId: string; pageId: string; isFullBleed?: boolean }) {
  const isInline = config.position === 'inline';

  // If inline mode, render actual chat widget embedded in the page
  if (isInline) {
    if (isFullBleed) {
      return (
        <section className="py-16 px-4 bg-gray-50">
          <ChatWidget
            pageId={pageId}
            workspaceId={workspaceId}
            config={{
              enabled: true,
              position: 'inline',
              initial_message: `Hi! ${config.subtitle || 'How can I help you today?'}`,
              ai_persona: null,
              business_context: {},
            }}
            primaryColor={config.primaryColor || '#6366f1'}
            mode="inline"
            title={config.title}
            subtitle={config.subtitle}
          />
        </section>
      );
    }

    // Grid-contained inline chat
    return (
      <div className="py-6 bg-gray-50 rounded-lg">
        <ChatWidget
          pageId={pageId}
          workspaceId={workspaceId}
          config={{
            enabled: true,
            position: 'inline',
            initial_message: `Hi! ${config.subtitle || 'How can I help you today?'}`,
            ai_persona: null,
            business_context: {},
          }}
          primaryColor={config.primaryColor || '#6366f1'}
          mode="inline"
          title={config.title}
          subtitle={config.subtitle}
        />
      </div>
    );
  }

  // Floating mode - show placeholder (actual floating widget is rendered by PublicPage)
  if (isFullBleed) {
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

  // Grid-contained floating placeholder
  return (
    <div className="py-6 bg-gray-50 rounded-lg">
      {(config.title || config.subtitle) && (
        <div className="text-center mb-4 px-4">
          {config.title && <h3 className="text-lg font-bold text-gray-900 mb-1">{config.title}</h3>}
          {config.subtitle && <p className="text-sm text-gray-600">{config.subtitle}</p>}
        </div>
      )}
      <div className="bg-white rounded-lg shadow p-6 text-center mx-2">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: config.primaryColor || '#6366f1' }}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600">
          {config.placeholder || 'Click the chat button to start'}
        </p>
      </div>
    </div>
  );
}
