/**
 * Types for the visual page builder
 */

export interface PageBlock {
  id: string;
  type: BlockType | 'placeholder';
  config: Record<string, unknown>;
  order: number;
  width: 1 | 2 | 3 | 4; // Legacy 4-column grid system

  // Layout fields for 12-column visual canvas
  row?: number;           // Which row (0-indexed)
  colSpan?: ColSpan;      // Column span (4, 6, or 12 out of 12)
  colStart?: number;      // Optional explicit start position
}

// 12-column grid system spans
export type ColSpan = 4 | 6 | 8 | 12;

// Helper type for working with rows in the visual canvas
export interface LayoutRow {
  rowIndex: number;
  slots: PageBlock[];    // Sorted by colStart
  totalSpan: number;     // Should equal 12 when full
}

export type BlockType =
  | 'hero'
  | 'features'
  | 'testimonials'
  | 'cta'
  | 'form'
  | 'faq'
  | 'pricing'
  | 'text'
  | 'image'
  | 'video'
  | 'stats'
  | 'divider'
  | 'chat'
  | 'gallery'
  | 'slider'
  | 'logo-cloud';

export type BlockConfig =
  | HeroConfig
  | FeaturesConfig
  | TestimonialsConfig
  | CtaConfig
  | FormConfig
  | FaqConfig
  | PricingConfig
  | TextConfig
  | ImageConfig
  | VideoConfig
  | StatsConfig
  | DividerConfig
  | ChatConfig
  | GalleryConfig
  | SliderConfig
  | LogoCloudConfig;

// Hero Block
export interface HeroConfig {
  headline: string;
  subheadline: string;
  buttonText: string;
  buttonLink: string;
  backgroundType: 'color' | 'image' | 'gradient';
  backgroundColor: string;
  backgroundImage: string;
  gradientFrom: string;
  gradientTo: string;
  textAlign: 'left' | 'center' | 'right';
  showButton: boolean;
}

// Features Block
export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface FeaturesConfig {
  title: string;
  subtitle: string;
  items: FeatureItem[];
  columns: 2 | 3 | 4;
}

// Testimonials Block
export interface TestimonialItem {
  quote: string;
  author: string;
  company: string;
  avatar: string;
}

export interface TestimonialsConfig {
  title: string;
  items: TestimonialItem[];
}

// CTA Block
export interface CtaConfig {
  headline: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  backgroundColor: string;
  textColor: 'light' | 'dark';
}

// Form Block
export interface FormConfig {
  formId: string;
  title: string;
  description: string;
}

// FAQ Block
export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqConfig {
  title: string;
  items: FaqItem[];
}

// Pricing Block
export interface PricingTier {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted: boolean;
  buttonText: string;
  buttonLink: string;
}

export interface PricingConfig {
  title: string;
  subtitle: string;
  items: PricingTier[];
}

// Text Block
export interface TextConfig {
  content: string;
  alignment: 'left' | 'center' | 'right';
}

// Image Block
export interface ImageConfig {
  url: string;
  alt: string;
  caption: string;
  width: 'full' | 'large' | 'medium' | 'small';
}

// Video Block
export interface VideoConfig {
  url: string;
  autoplay: boolean;
  title: string;
}

// Stats Block
export interface StatItem {
  value: string;
  label: string;
}

export interface StatsConfig {
  title: string;
  items: StatItem[];
}

// Divider Block
export interface DividerConfig {
  style: 'line' | 'space' | 'dots';
  height: 'small' | 'medium' | 'large';
}

// Chat Block
export interface ChatConfig {
  title: string;
  subtitle: string;
  placeholder: string;
  position: 'inline' | 'floating';
  primaryColor: string;
}

// Gallery Block
export interface GalleryImage {
  url: string;
  alt: string;
  caption?: string;
}

export interface GalleryConfig {
  title: string;
  images: GalleryImage[];
  columns: 2 | 3 | 4;
  showCaptions: boolean;
  enableLightbox: boolean;
}

// Slider Block
export interface SliderSlide {
  imageUrl: string;
  headline?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
}

export interface SliderConfig {
  slides: SliderSlide[];
  autoplay: boolean;
  autoplayInterval: number;
  showDots: boolean;
  showArrows: boolean;
}

// Logo Cloud Block
export interface LogoItem {
  name: string;
  url: string;
  link?: string;
}

export interface LogoCloudConfig {
  title: string;
  subtitle?: string;
  logos: LogoItem[];
  grayscale: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlockConfig = any;

// Block metadata for toolbar
export interface BlockTypeInfo {
  type: BlockType;
  label: string;
  icon: string;
  description: string;
  defaultConfig: AnyBlockConfig;
  defaultWidth?: 1 | 2 | 3 | 4; // Default grid columns (4 = full width)
}

export const BLOCK_TYPES: BlockTypeInfo[] = [
  {
    type: 'hero',
    label: 'Hero',
    icon: 'layout-template',
    description: 'Full-screen header with headline and CTA',
    defaultConfig: {
      headline: 'Welcome to Your Page',
      subheadline: 'Add a compelling description here',
      buttonText: 'Get Started',
      buttonLink: '#',
      backgroundType: 'gradient',
      backgroundColor: '#6366f1',
      gradientFrom: '#6366f1',
      gradientTo: '#8b5cf6',
      textAlign: 'center',
      showButton: true,
    } as HeroConfig,
  },
  {
    type: 'features',
    label: 'Features',
    icon: 'grid-3x3',
    description: 'Highlight key features in columns',
    defaultConfig: {
      title: 'Features',
      subtitle: 'Everything you need to succeed',
      columns: 3,
      items: [
        { icon: 'zap', title: 'Fast', description: 'Lightning fast performance' },
        { icon: 'shield', title: 'Secure', description: 'Enterprise-grade security' },
        { icon: 'heart', title: 'Reliable', description: '99.9% uptime guaranteed' },
      ],
    } as FeaturesConfig,
  },
  {
    type: 'cta',
    label: 'Call to Action',
    icon: 'mouse-pointer-click',
    description: 'Drive conversions with a strong CTA',
    defaultConfig: {
      headline: 'Ready to get started?',
      description: 'Join thousands of satisfied customers today.',
      buttonText: 'Start Now',
      buttonLink: '#',
      backgroundColor: '#6366f1',
      textColor: 'light',
    } as CtaConfig,
  },
  {
    type: 'form',
    label: 'Form',
    icon: 'file-text',
    description: 'Embed a lead capture form',
    defaultConfig: {
      formId: '',
      title: 'Get in Touch',
      description: 'Fill out the form below and we\'ll get back to you.',
    } as FormConfig,
  },
  {
    type: 'testimonials',
    label: 'Testimonials',
    icon: 'quote',
    description: 'Show customer reviews and quotes',
    defaultConfig: {
      title: 'What Our Customers Say',
      items: [
        { quote: 'This product changed my life!', author: 'Jane Doe', company: 'Acme Inc', avatar: '' },
      ],
    } as TestimonialsConfig,
  },
  {
    type: 'faq',
    label: 'FAQ',
    icon: 'help-circle',
    description: 'Frequently asked questions',
    defaultConfig: {
      title: 'Frequently Asked Questions',
      items: [
        { question: 'How does it work?', answer: 'It\'s simple! Just sign up and get started.' },
      ],
    } as FaqConfig,
  },
  {
    type: 'text',
    label: 'Text',
    icon: 'type',
    description: 'Rich text content section',
    defaultConfig: {
      content: 'Add your content here...',
      alignment: 'left',
    } as TextConfig,
  },
  {
    type: 'image',
    label: 'Image',
    icon: 'image',
    description: 'Single image with caption',
    defaultConfig: {
      url: '',
      alt: '',
      caption: '',
      width: 'large',
    } as ImageConfig,
  },
  {
    type: 'stats',
    label: 'Stats',
    icon: 'bar-chart-2',
    description: 'Highlight key numbers',
    defaultConfig: {
      title: '',
      items: [
        { value: '100+', label: 'Customers' },
        { value: '99%', label: 'Satisfaction' },
        { value: '24/7', label: 'Support' },
      ],
    } as StatsConfig,
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: 'minus',
    description: 'Visual separator',
    defaultConfig: {
      style: 'line',
      height: 'medium',
    } as DividerConfig,
  },
  {
    type: 'pricing',
    label: 'Pricing',
    icon: 'credit-card',
    description: 'Pricing tier comparison',
    defaultConfig: {
      title: 'Simple Pricing',
      subtitle: 'Choose the plan that works for you',
      items: [
        {
          name: 'Basic',
          price: '$9',
          period: '/month',
          features: ['Feature 1', 'Feature 2'],
          highlighted: false,
          buttonText: 'Get Started',
          buttonLink: '#',
        },
        {
          name: 'Pro',
          price: '$29',
          period: '/month',
          features: ['Everything in Basic', 'Feature 3', 'Feature 4'],
          highlighted: true,
          buttonText: 'Get Started',
          buttonLink: '#',
        },
      ],
    } as PricingConfig,
  },
  {
    type: 'video',
    label: 'Video',
    icon: 'play-circle',
    description: 'Embed YouTube or Vimeo video',
    defaultConfig: {
      url: '',
      autoplay: false,
      title: '',
    } as VideoConfig,
  },
  {
    type: 'chat',
    label: 'AI Chat',
    icon: 'message-circle',
    description: 'Embed AI chat widget',
    defaultWidth: 2,
    defaultConfig: {
      title: 'Chat with us',
      subtitle: 'Ask us anything!',
      placeholder: 'Type your message...',
      position: 'inline',
      primaryColor: '#6366f1',
    } as ChatConfig,
  },
  {
    type: 'gallery',
    label: 'Gallery',
    icon: 'images',
    description: 'Multi-image grid with lightbox',
    defaultConfig: {
      title: 'Gallery',
      images: [],
      columns: 3,
      showCaptions: true,
      enableLightbox: true,
    } as GalleryConfig,
  },
  {
    type: 'slider',
    label: 'Slider',
    icon: 'play',
    description: 'Image/content carousel',
    defaultConfig: {
      slides: [],
      autoplay: true,
      autoplayInterval: 5000,
      showDots: true,
      showArrows: true,
    } as SliderConfig,
  },
  {
    type: 'logo-cloud',
    label: 'Logo Cloud',
    icon: 'building-2',
    description: 'Client/partner logos',
    defaultConfig: {
      title: 'Trusted By',
      subtitle: '',
      logos: [],
      grayscale: true,
    } as LogoCloudConfig,
  },
];

export function getBlockTypeInfo(type: BlockType | 'placeholder'): BlockTypeInfo | undefined {
  if (type === 'placeholder') return undefined;
  return BLOCK_TYPES.find(b => b.type === type);
}

export function createBlock(type: BlockType): PageBlock {
  const typeInfo = getBlockTypeInfo(type);
  return {
    id: Math.random().toString(36).substring(2, 10),
    type,
    config: typeInfo?.defaultConfig || {},
    order: 0,
    width: typeInfo?.defaultWidth || 4, // Default to full width
  };
}

// ==================== LAYOUT CANVAS HELPERS ====================

/**
 * Generate a unique ID for blocks/slots
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a placeholder slot for the visual canvas
 */
export function createPlaceholderSlot(
  row: number,
  colSpan: ColSpan = 12,
  colStart: number = 0,
  blockType?: BlockType
): PageBlock {
  return {
    id: generateId(),
    type: blockType || 'placeholder',
    config: {},
    order: 0,
    width: colSpan === 12 ? 4 : colSpan === 6 ? 2 : 1,
    row,
    colSpan,
    colStart,
  };
}

/**
 * Migrate legacy blocks (without row/colSpan) to visual canvas format
 */
export function migrateBlocksToLayout(blocks: PageBlock[]): PageBlock[] {
  return blocks.map((block, index) => ({
    ...block,
    row: block.row ?? index,      // Each block gets its own row
    colSpan: block.colSpan ?? 12, // Default to full width
    colStart: block.colStart ?? 0,
  }));
}

/**
 * Group blocks into rows for the visual canvas
 */
export function groupBlocksIntoRows(blocks: PageBlock[]): LayoutRow[] {
  const rowMap = new Map<number, PageBlock[]>();

  // Ensure blocks have layout fields
  const migratedBlocks = migrateBlocksToLayout(blocks);

  // Group by row
  migratedBlocks.forEach((block) => {
    const rowIndex = block.row ?? 0;
    if (!rowMap.has(rowIndex)) {
      rowMap.set(rowIndex, []);
    }
    rowMap.get(rowIndex)!.push(block);
  });

  // Convert to LayoutRow array, sorted by row index
  const rows: LayoutRow[] = [];
  const sortedRowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);

  sortedRowIndices.forEach((rowIndex) => {
    const slots = rowMap.get(rowIndex)!;
    // Sort slots by colStart
    slots.sort((a, b) => (a.colStart ?? 0) - (b.colStart ?? 0));
    const totalSpan = slots.reduce((sum, slot) => sum + (slot.colSpan ?? 12), 0);
    rows.push({ rowIndex, slots, totalSpan });
  });

  return rows;
}

/**
 * Flatten rows back to blocks array with updated order
 */
export function flattenRowsToBlocks(rows: LayoutRow[]): PageBlock[] {
  const blocks: PageBlock[] = [];
  let order = 0;

  rows.forEach((row, rowIndex) => {
    let colStart = 0;
    row.slots.forEach((slot) => {
      blocks.push({
        ...slot,
        row: rowIndex,
        colStart,
        order: order++,
      });
      colStart += slot.colSpan ?? 12;
    });
  });

  return blocks;
}

/**
 * Convert ColSpan to Tailwind CSS class
 * Uses non-responsive classes for editor (always side-by-side)
 * Mobile stacking is handled by the parent grid on small screens
 */
export function colSpanToClass(colSpan: ColSpan): string {
  switch (colSpan) {
    case 4:
      return 'sm:col-span-4';
    case 6:
      return 'sm:col-span-6';
    case 8:
      return 'sm:col-span-8';
    case 12:
    default:
      return 'sm:col-span-12';
  }
}

/**
 * Get width label for display
 */
export function getWidthLabel(colSpan: ColSpan): string {
  switch (colSpan) {
    case 4:
      return '1/3 Width';
    case 6:
      return 'Half Width';
    case 8:
      return '2/3 Width';
    case 12:
    default:
      return 'Full Width';
  }
}

/**
 * Check if a slot can be split (must have at least half width)
 */
export function canSplitSlot(colSpan: ColSpan): boolean {
  return colSpan >= 8; // Can split 8 or 12 into two equal parts
}

/**
 * Get available widths for a row based on remaining space
 */
export function getAvailableWidths(totalSpanUsed: number): ColSpan[] {
  const remaining = 12 - totalSpanUsed;
  const available: ColSpan[] = [];

  if (remaining >= 12) available.push(12);
  if (remaining >= 8) available.push(8);
  if (remaining >= 6) available.push(6);
  if (remaining >= 4) available.push(4);

  return available;
}
