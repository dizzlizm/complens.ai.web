import { useState } from 'react';
import { Sparkles, X, Wand2, Loader2 } from 'lucide-react';
import { PageBlock } from './types';

interface AIBlockGeneratorProps {
  onGenerate: (blocks: PageBlock[]) => void;
  onClose: () => void;
  isGenerating?: boolean;
}

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Clean, corporate look' },
  { value: 'bold', label: 'Bold', description: 'Vibrant, eye-catching' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant' },
  { value: 'playful', label: 'Playful', description: 'Fun, creative' },
] as const;

const QUICK_PROMPTS = [
  'Landing page for a SaaS product',
  'Portfolio page for a freelancer',
  'Coming soon page with email capture',
  'Product launch announcement',
  'Service pricing page',
  'About us company page',
];

export default function AIBlockGenerator({
  onGenerate,
  onClose,
  isGenerating = false,
}: AIBlockGeneratorProps) {
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<'professional' | 'bold' | 'minimal' | 'playful'>('professional');
  const [includeForm, setIncludeForm] = useState(true);
  const [includeChat, setIncludeChat] = useState(true);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    // Generate blocks from the description
    const blocks = generateBlocksFromDescription(description, style, includeForm, includeChat);
    onGenerate(blocks);
  };

  const handleQuickPrompt = (prompt: string) => {
    setDescription(prompt);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">AI Page Builder</h2>
                <p className="text-white/80 text-sm">Describe your page and let AI build it</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Quick prompts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Start
            </label>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleQuickPrompt(prompt)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    description === prompt
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Description input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Describe Your Page
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Be specific! E.g., 'A landing page for TaskFlow, an AI-powered project management tool. Key features: smart task prioritization, team collaboration, time tracking. Target: startup teams. Include pricing tiers: Free, Pro ($12/mo), Enterprise.'"
              rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
            />
            <p className="mt-2 text-xs text-gray-500">
              Tip: Include your product name, key features, target audience, and any specific sections you want.
            </p>
          </div>

          {/* Style selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visual Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStyle(option.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    style === option.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`font-medium text-sm ${
                    style === option.value ? 'text-indigo-700' : 'text-gray-900'
                  }`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeForm}
                onChange={(e) => setIncludeForm(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Include lead capture form</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeChat}
                onChange={(e) => setIncludeChat(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Include AI chat widget</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              AI will generate blocks based on your description
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!description.trim() || isGenerating}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Generate Page
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Smart block generation from description
function generateBlocksFromDescription(
  description: string,
  style: string,
  includeForm: boolean,
  includeChat: boolean
): PageBlock[] {
  const blocks: PageBlock[] = [];
  const desc = description.toLowerCase();
  const originalDesc = description;

  // Generate a unique ID
  const genId = () => Math.random().toString(36).substring(2, 10);

  // Extract product/company name from description
  const productName = extractProductName(originalDesc);

  // Style-based colors
  const styleColors: Record<string, { primary: string; gradient: [string, string] }> = {
    professional: { primary: '#4f46e5', gradient: ['#4f46e5', '#7c3aed'] },
    bold: { primary: '#dc2626', gradient: ['#dc2626', '#f97316'] },
    minimal: { primary: '#171717', gradient: ['#262626', '#404040'] },
    playful: { primary: '#ec4899', gradient: ['#ec4899', '#8b5cf6'] },
  };

  const colors = styleColors[style] || styleColors.professional;

  // Determine page type from description
  const pageType = detectPageType(desc);

  // 1. HERO BLOCK (always)
  blocks.push({
    id: genId(),
    type: 'hero',
    order: blocks.length,
    width: 4,
    config: {
      headline: generateHeadline(originalDesc, productName, pageType),
      subheadline: generateSubheadline(originalDesc, productName, pageType),
      buttonText: generateCTA(desc, pageType),
      buttonLink: '#contact',
      backgroundType: 'gradient',
      gradientFrom: colors.gradient[0],
      gradientTo: colors.gradient[1],
      textAlign: 'center',
      showButton: true,
    },
  });

  // 2. FEATURES BLOCK (for most page types)
  if (pageType !== 'coming-soon' && pageType !== 'about') {
    const features = extractFeatures(originalDesc, pageType);
    blocks.push({
      id: genId(),
      type: 'features',
      order: blocks.length,
      width: 4,
      config: {
        title: pageType === 'portfolio' ? 'What I Offer' : 'Key Features',
        subtitle: generateFeaturesSubtitle(pageType, productName),
        columns: 3,
        items: features,
      },
    });
  }

  // 3. STATS BLOCK (for credibility)
  if (pageType === 'saas' || pageType === 'service' || pageType === 'product') {
    blocks.push({
      id: genId(),
      type: 'stats',
      order: blocks.length,
      width: 4,
      config: {
        title: '',
        items: generateStats(desc, pageType),
      },
    });
  }

  // 4. PRICING BLOCK (if mentioned or pricing page)
  if (desc.includes('pricing') || desc.includes('price') || desc.includes('plan') ||
      desc.includes('tier') || desc.includes('subscription') || desc.includes('/mo') ||
      desc.includes('free') || pageType === 'pricing') {
    blocks.push({
      id: genId(),
      type: 'pricing',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Simple, Transparent Pricing',
        subtitle: 'Choose the plan that works for you',
        items: extractPricingTiers(originalDesc),
      },
    });
  }

  // 5. TESTIMONIALS BLOCK (if mentioned or for service pages)
  if (desc.includes('testimonial') || desc.includes('review') || desc.includes('client') ||
      pageType === 'service' || pageType === 'portfolio') {
    blocks.push({
      id: genId(),
      type: 'testimonials',
      order: blocks.length,
      width: 4,
      config: {
        title: pageType === 'portfolio' ? 'Client Feedback' : 'What Our Customers Say',
        items: [
          { quote: `Working with ${productName || 'them'} has been an amazing experience. The results exceeded our expectations!`, author: 'Sarah Johnson', company: 'TechCorp', avatar: '' },
          { quote: 'Professional, responsive, and delivers exceptional quality. Highly recommended!', author: 'Michael Chen', company: 'StartupXYZ', avatar: '' },
        ],
      },
    });
  }

  // 6. FAQ BLOCK (if mentioned)
  if (desc.includes('faq') || desc.includes('question') || desc.includes('how does') ||
      desc.includes('what is') || pageType === 'saas') {
    blocks.push({
      id: genId(),
      type: 'faq',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Frequently Asked Questions',
        items: generateFAQ(productName, pageType),
      },
    });
  }

  // 7. ABOUT/TEXT BLOCK (for about pages or if portfolio)
  if (pageType === 'about' || pageType === 'portfolio') {
    blocks.push({
      id: genId(),
      type: 'text',
      order: blocks.length,
      width: 4,
      config: {
        content: generateAboutText(originalDesc, productName, pageType),
        alignment: 'center',
      },
    });
  }

  // 8. FORM + CHAT (side by side or separate)
  if (includeForm && includeChat) {
    blocks.push({
      id: genId(),
      type: 'form',
      order: blocks.length,
      width: 2,
      config: {
        formId: '',
        title: pageType === 'coming-soon' ? 'Get Early Access' : 'Get in Touch',
        description: pageType === 'coming-soon'
          ? 'Be the first to know when we launch.'
          : `Have questions about ${productName || 'our services'}? We'd love to hear from you.`,
      },
    });
    blocks.push({
      id: genId(),
      type: 'chat',
      order: blocks.length,
      width: 2,
      config: {
        title: 'Chat with Us',
        subtitle: 'Get instant answers',
        placeholder: 'Ask anything...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  } else if (includeForm) {
    blocks.push({
      id: genId(),
      type: 'form',
      order: blocks.length,
      width: 4,
      config: {
        formId: '',
        title: pageType === 'coming-soon' ? 'Get Early Access' : 'Get Started Today',
        description: pageType === 'coming-soon'
          ? 'Enter your email to be notified when we launch.'
          : `Ready to experience ${productName || 'what we offer'}? Fill out the form below.`,
      },
    });
  } else if (includeChat) {
    blocks.push({
      id: genId(),
      type: 'chat',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Have Questions?',
        subtitle: `Chat with our AI about ${productName || 'anything'}`,
        placeholder: 'Type your question...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  }

  // 9. FINAL CTA BLOCK
  blocks.push({
    id: genId(),
    type: 'cta',
    order: blocks.length,
    width: 4,
    config: {
      headline: generateFinalCTAHeadline(pageType, productName),
      description: generateFinalCTADescription(pageType, productName),
      buttonText: generateCTA(desc, pageType),
      buttonLink: '#contact',
      backgroundColor: colors.primary,
      textColor: 'light',
    },
  });

  return blocks;
}

// Helper functions for smart content extraction

function extractProductName(description: string): string {
  // Look for patterns like "for X" or "called X" or capitalized words
  const forMatch = description.match(/(?:for|called|named|introducing)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/);
  if (forMatch) return forMatch[1];

  // Look for capitalized product names
  const capsMatch = description.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/);
  if (capsMatch) return capsMatch[1];

  // Look for quoted names
  const quotedMatch = description.match(/["']([^"']+)["']/);
  if (quotedMatch) return quotedMatch[1];

  return '';
}

function detectPageType(desc: string): string {
  if (desc.includes('coming soon') || desc.includes('launch') || desc.includes('waitlist')) return 'coming-soon';
  if (desc.includes('portfolio') || desc.includes('freelanc') || desc.includes('my work')) return 'portfolio';
  if (desc.includes('about') || desc.includes('our story') || desc.includes('who we are')) return 'about';
  if (desc.includes('pricing') || desc.includes('plans')) return 'pricing';
  if (desc.includes('saas') || desc.includes('software') || desc.includes('app') || desc.includes('platform') || desc.includes('tool')) return 'saas';
  if (desc.includes('service') || desc.includes('agency') || desc.includes('consulting')) return 'service';
  if (desc.includes('product') || desc.includes('shop') || desc.includes('buy')) return 'product';
  return 'general';
}

function generateHeadline(desc: string, productName: string, pageType: string): string {
  if (pageType === 'coming-soon') {
    return productName ? `${productName} is Coming Soon` : 'Something Amazing is Coming';
  }
  if (pageType === 'portfolio') {
    return productName || 'Creative Solutions for Your Vision';
  }
  if (pageType === 'about') {
    return productName ? `About ${productName}` : 'Our Story';
  }

  // Try to extract a compelling headline from the description
  const words = desc.split(/[.,!?]/)[0].trim();
  if (words.length > 10 && words.length < 80) {
    // Capitalize first letter of each word for headline
    return words.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  if (productName) {
    const descriptors = ['Transform', 'Elevate', 'Supercharge', 'Simplify', 'Revolutionize'];
    const descriptor = descriptors[Math.floor(Math.random() * descriptors.length)];
    return `${descriptor} Your Workflow with ${productName}`;
  }

  return 'The Smart Solution for Modern Teams';
}

function generateSubheadline(desc: string, productName: string, pageType: string): string {
  if (pageType === 'coming-soon') {
    return 'Be the first to know when we launch. Sign up for early access and exclusive updates.';
  }
  if (pageType === 'portfolio') {
    return 'Bringing ideas to life through thoughtful design and innovative solutions.';
  }

  // Try to extract description from after the first sentence
  const sentences = desc.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 1) {
    const subheadline = sentences[1].trim();
    if (subheadline.length > 20 && subheadline.length < 200) {
      return subheadline.charAt(0).toUpperCase() + subheadline.slice(1);
    }
  }

  return productName
    ? `Discover how ${productName} can help you achieve more with less effort.`
    : 'Powerful features, intuitive design, and results that speak for themselves.';
}

function generateCTA(desc: string, pageType: string): string {
  if (pageType === 'coming-soon') return 'Notify Me';
  if (pageType === 'portfolio') return 'View My Work';
  if (pageType === 'about') return 'Get in Touch';

  if (desc.includes('trial')) return 'Start Free Trial';
  if (desc.includes('demo')) return 'Request Demo';
  if (desc.includes('free')) return 'Get Started Free';
  if (desc.includes('book') || desc.includes('call')) return 'Book a Call';
  if (desc.includes('contact')) return 'Contact Us';
  if (desc.includes('signup') || desc.includes('sign up')) return 'Sign Up Now';

  return 'Get Started';
}

function extractFeatures(desc: string, pageType: string): Array<{ icon: string; title: string; description: string }> {
  const features: Array<{ icon: string; title: string; description: string }> = [];

  // Common feature keywords and their icons
  const featureMap: Record<string, { icon: string; title: string; description: string }> = {
    'ai': { icon: 'zap', title: 'AI-Powered', description: 'Leverage cutting-edge AI to automate and enhance your workflow.' },
    'smart': { icon: 'zap', title: 'Smart Automation', description: 'Intelligent features that adapt to your needs and save time.' },
    'fast': { icon: 'rocket', title: 'Lightning Fast', description: 'Optimized performance for blazing-fast results.' },
    'speed': { icon: 'rocket', title: 'Built for Speed', description: 'Get things done in seconds, not hours.' },
    'secure': { icon: 'shield', title: 'Enterprise Security', description: 'Bank-level encryption keeps your data safe.' },
    'privacy': { icon: 'shield', title: 'Privacy First', description: 'Your data stays yours. Full control over your information.' },
    'team': { icon: 'users', title: 'Team Collaboration', description: 'Work together seamlessly with your entire team.' },
    'collaborat': { icon: 'users', title: 'Real-time Collaboration', description: 'Sync and collaborate with team members instantly.' },
    'analytic': { icon: 'target', title: 'Deep Analytics', description: 'Get actionable insights from comprehensive data.' },
    'track': { icon: 'target', title: 'Smart Tracking', description: 'Monitor progress and metrics in real-time.' },
    'integrat': { icon: 'globe', title: 'Easy Integrations', description: 'Connect with the tools you already use.' },
    'automat': { icon: 'zap', title: 'Automation', description: 'Automate repetitive tasks and focus on what matters.' },
    'custom': { icon: 'star', title: 'Fully Customizable', description: 'Tailor everything to match your workflow.' },
    'support': { icon: 'heart', title: '24/7 Support', description: 'Our team is always here to help you succeed.' },
    'time': { icon: 'clock', title: 'Save Time', description: 'Streamline your process and reclaim your day.' },
    'report': { icon: 'target', title: 'Rich Reports', description: 'Beautiful, actionable reports at your fingertips.' },
  };

  const descLower = desc.toLowerCase();

  // Find mentioned features
  for (const [keyword, feature] of Object.entries(featureMap)) {
    if (descLower.includes(keyword) && features.length < 6) {
      if (!features.some(f => f.icon === feature.icon)) {
        features.push(feature);
      }
    }
  }

  // Fill with defaults based on page type
  const defaults: Record<string, Array<{ icon: string; title: string; description: string }>> = {
    saas: [
      { icon: 'zap', title: 'Powerful Features', description: 'Everything you need in one platform.' },
      { icon: 'shield', title: 'Secure & Reliable', description: 'Enterprise-grade security and 99.9% uptime.' },
      { icon: 'heart', title: 'World-class Support', description: 'Help when you need it, from people who care.' },
    ],
    portfolio: [
      { icon: 'star', title: 'Creative Vision', description: 'Unique designs tailored to your brand.' },
      { icon: 'rocket', title: 'Fast Delivery', description: 'Quality work delivered on schedule.' },
      { icon: 'heart', title: 'Client-Focused', description: 'Your success is my priority.' },
    ],
    service: [
      { icon: 'star', title: 'Expert Team', description: 'Industry veterans dedicated to your success.' },
      { icon: 'target', title: 'Proven Results', description: 'Track record of delivering outcomes.' },
      { icon: 'users', title: 'Personalized Approach', description: 'Solutions tailored to your unique needs.' },
    ],
    general: [
      { icon: 'zap', title: 'Easy to Use', description: 'Intuitive interface anyone can master.' },
      { icon: 'shield', title: 'Reliable', description: 'Dependable performance you can trust.' },
      { icon: 'star', title: 'Top Rated', description: 'Loved by thousands of customers.' },
    ],
  };

  const typeDefaults = defaults[pageType] || defaults.general;

  while (features.length < 3) {
    const def = typeDefaults[features.length];
    if (def && !features.some(f => f.icon === def.icon)) {
      features.push(def);
    } else {
      break;
    }
  }

  return features.slice(0, 3);
}

function generateFeaturesSubtitle(pageType: string, productName: string): string {
  if (pageType === 'portfolio') return 'Services designed to bring your vision to life';
  if (pageType === 'service') return 'Why clients choose us';
  return productName ? `Why ${productName} is the smart choice` : 'Everything you need to succeed';
}

function generateStats(desc: string, _pageType: string): Array<{ value: string; label: string }> {
  const defaults = [
    { value: '10K+', label: 'Happy Customers' },
    { value: '99%', label: 'Satisfaction Rate' },
    { value: '24/7', label: 'Support' },
    { value: '50+', label: 'Countries' },
  ];

  // Check for numbers in description
  const numbers = desc.match(/\d+[KkMm+%]?/g);
  if (numbers && numbers.length >= 2) {
    return [
      { value: numbers[0].toUpperCase(), label: 'Users' },
      { value: numbers[1] || '99%', label: 'Satisfaction' },
      { value: '24/7', label: 'Support' },
      { value: numbers[2] || '50+', label: 'Countries' },
    ];
  }

  return defaults;
}

function extractPricingTiers(desc: string): Array<{
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted: boolean;
  buttonText: string;
  buttonLink: string;
}> {
  // Try to extract pricing from description
  const priceMatches = desc.match(/\$\d+(?:\/mo(?:nth)?)?/gi);
  const tierNames = desc.match(/(?:free|starter|basic|pro|premium|enterprise|business)/gi);

  if (priceMatches && priceMatches.length >= 2) {
    const tiers = [];
    for (let i = 0; i < Math.min(priceMatches.length, 3); i++) {
      const price = priceMatches[i];
      const name = tierNames?.[i] || ['Starter', 'Pro', 'Enterprise'][i];
      tiers.push({
        name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
        price: price.replace(/\/mo(?:nth)?/i, ''),
        period: '/month',
        features: ['Core features', 'Email support', `${i + 1} user${i > 0 ? 's' : ''}`],
        highlighted: i === 1,
        buttonText: 'Get Started',
        buttonLink: '#',
      });
    }
    return tiers;
  }

  // Default pricing tiers
  return [
    { name: 'Starter', price: 'Free', period: '', features: ['Core features', 'Community support', '1 project'], highlighted: false, buttonText: 'Get Started', buttonLink: '#' },
    { name: 'Pro', price: '$19', period: '/month', features: ['Everything in Starter', 'Priority support', 'Unlimited projects', 'Advanced analytics'], highlighted: true, buttonText: 'Start Free Trial', buttonLink: '#' },
    { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee'], highlighted: false, buttonText: 'Contact Sales', buttonLink: '#' },
  ];
}

function generateFAQ(productName: string, pageType: string): Array<{ question: string; answer: string }> {
  const name = productName || 'our product';

  if (pageType === 'saas') {
    return [
      { question: `How does ${name} work?`, answer: `Simply sign up for a free account, and you'll be guided through a quick setup. Our intuitive interface makes it easy to get started in minutes.` },
      { question: 'Is there a free trial?', answer: 'Yes! We offer a 14-day free trial with full access to all features. No credit card required.' },
      { question: 'Can I cancel anytime?', answer: 'Absolutely. There are no long-term contracts or cancellation fees. Cancel anytime with just a few clicks.' },
      { question: 'What kind of support do you offer?', answer: 'We offer email support for all plans, with priority support and dedicated account managers available on higher tiers.' },
    ];
  }

  return [
    { question: 'How do I get started?', answer: 'Simply reach out through our contact form or chat. We\'ll schedule a quick call to understand your needs and create a custom plan.' },
    { question: 'What is your turnaround time?', answer: 'It depends on the project scope, but most projects are completed within 2-4 weeks. We\'ll provide a detailed timeline during our initial consultation.' },
    { question: 'Do you offer revisions?', answer: 'Yes! We include revision rounds in all our packages to ensure you\'re completely satisfied with the final result.' },
  ];
}

function generateAboutText(_desc: string, productName: string, pageType: string): string {
  if (pageType === 'portfolio') {
    return `I'm passionate about creating beautiful, functional designs that help businesses thrive. With years of experience and a keen eye for detail, I bring a unique perspective to every project.\n\nWhether you need a brand identity, website, or marketing materials, I'm here to turn your vision into reality.`;
  }

  if (pageType === 'about') {
    return productName
      ? `${productName} was founded with a simple mission: to make things better for our customers. We believe in the power of innovation, the importance of quality, and the value of putting people first.\n\nToday, we serve thousands of customers worldwide, and we're just getting started.`
      : `We're a team of passionate individuals dedicated to making a difference. Our mission is simple: deliver exceptional value to our customers while building something we're proud of.`;
  }

  return '';
}

function generateFinalCTAHeadline(pageType: string, productName: string): string {
  if (pageType === 'coming-soon') return 'Don\'t Miss Out';
  if (pageType === 'portfolio') return 'Ready to Start Your Project?';
  if (productName) return `Ready to Try ${productName}?`;
  return 'Ready to Get Started?';
}

function generateFinalCTADescription(pageType: string, productName: string): string {
  if (pageType === 'coming-soon') return 'Join our waitlist and be the first to experience what we\'re building.';
  if (pageType === 'portfolio') return 'Let\'s discuss your project and create something amazing together.';
  return `Join thousands of satisfied customers who have already discovered the ${productName || 'difference'}.`;
}
