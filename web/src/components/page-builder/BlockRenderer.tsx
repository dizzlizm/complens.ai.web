/**
 * BlockRenderer - Renders the actual content for a block based on its type
 * Used by both PageBuilderCanvas and LayoutSlot for consistent rendering
 */

import { PageBlock, DividerConfig } from './types';

// Block components
import HeroBlock from './blocks/HeroBlock';
import FeaturesBlock from './blocks/FeaturesBlock';
import CtaBlock from './blocks/CtaBlock';
import FormBlock from './blocks/FormBlock';
import TestimonialsBlock from './blocks/TestimonialsBlock';
import FaqBlock from './blocks/FaqBlock';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import StatsBlock from './blocks/StatsBlock';
import DividerBlock from './blocks/DividerBlock';
import PricingBlock from './blocks/PricingBlock';
import VideoBlock from './blocks/VideoBlock';
import ChatBlock from './blocks/ChatBlock';
import GalleryBlock from './blocks/GalleryBlock';
import SliderBlock from './blocks/SliderBlock';
import LogoCloudBlock from './blocks/LogoCloudBlock';

// Form data interface
interface FormInfo {
  id: string;
  name: string;
  fields?: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
}

interface BlockRendererProps {
  block: PageBlock;
  isEditing?: boolean;
  onConfigChange?: (config: Record<string, unknown>) => void;
  forms?: FormInfo[];
  compact?: boolean; // For rendering in smaller spaces (like layout slots)
  workspaceId?: string;
}

export default function BlockRenderer({
  block,
  isEditing = false,
  onConfigChange,
  forms = [],
  compact = false,
  workspaceId,
}: BlockRendererProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any = {
    config: block.config,
    isEditing,
    onConfigChange,
    workspaceId,
  };

  let content: React.ReactNode;

  switch (block.type) {
    case 'hero':
      content = <HeroBlock {...props} />;
      break;
    case 'features':
      content = <FeaturesBlock {...props} />;
      break;
    case 'cta':
      content = <CtaBlock {...props} />;
      break;
    case 'form':
      content = <FormBlock {...props} forms={forms} />;
      break;
    case 'testimonials':
      content = <TestimonialsBlock {...props} />;
      break;
    case 'faq':
      content = <FaqBlock {...props} />;
      break;
    case 'text':
      content = <TextBlock {...props} />;
      break;
    case 'image':
      content = <ImageBlock {...props} />;
      break;
    case 'stats':
      content = <StatsBlock {...props} />;
      break;
    case 'divider':
      content = <DividerBlock config={block.config as unknown as DividerConfig} />;
      break;
    case 'pricing':
      content = <PricingBlock {...props} />;
      break;
    case 'video':
      content = <VideoBlock {...props} />;
      break;
    case 'chat':
      content = <ChatBlock {...props} />;
      break;
    case 'gallery':
      content = <GalleryBlock {...props} />;
      break;
    case 'slider':
      content = <SliderBlock {...props} />;
      break;
    case 'logo-cloud':
      content = <LogoCloudBlock {...props} />;
      break;
    case 'placeholder':
      content = null;
      break;
    default:
      content = (
        <div className="p-8 bg-gray-100 text-gray-500 text-center">
          Unknown block type: {block.type}
        </div>
      );
  }

  if (compact) {
    return (
      <div className="transform scale-[0.6] origin-top-left w-[166.67%]">
        {content}
      </div>
    );
  }

  return <>{content}</>;
}

/**
 * Check if a block has meaningful content to render
 */
export function blockHasContent(block: PageBlock): boolean {
  if (block.type === 'placeholder') return false;

  const config = block.config as Record<string, unknown>;

  // Check for common content indicators
  const hasHeadline = !!config.headline;
  const hasTitle = !!config.title;
  const hasContent = !!config.content;
  const hasItems = Array.isArray(config.items) && config.items.length > 0;
  const hasUrl = !!config.url;
  const hasSlides = Array.isArray(config.slides) && config.slides.length > 0;
  const hasImages = Array.isArray(config.images) && config.images.length > 0;
  const hasLogos = Array.isArray(config.logos) && config.logos.length > 0;
  const hasFormId = !!config.formId; // Form blocks with selected form

  return hasHeadline || hasTitle || hasContent || hasItems || hasUrl || hasSlides || hasImages || hasLogos || hasFormId;
}
