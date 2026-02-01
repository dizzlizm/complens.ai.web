/**
 * Types for the visual page builder
 */

export interface PageBlock {
  id: string;
  type: BlockType;
  config: Record<string, unknown>;
  order: number;
  width: 1 | 2 | 3 | 4; // Grid columns (4-column grid system)
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
  | 'chat';

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
  | ChatConfig;

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
];

export function getBlockTypeInfo(type: BlockType): BlockTypeInfo | undefined {
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
