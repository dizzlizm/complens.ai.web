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
              Describe Your Page (or paste your content)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste a resume, business description, product info, or describe what you want. The more detail you provide, the better the result!

Example: 'Steve Ross - Staff Systems Architect with 8+ years experience in cloud infrastructure, AI systems, and team leadership. Currently at TheRealReal building AI agent pipelines...'"
              rows={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
            />
            <p className="mt-2 text-xs text-gray-500">
              Tip: Paste a full resume, bio, or business description for best results!
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
              <span className="text-sm text-gray-700">Include contact form</span>
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

  // Generate unique IDs
  const genId = () => Math.random().toString(36).substring(2, 10);

  // Style-based colors
  const styleColors: Record<string, { primary: string; gradient: [string, string] }> = {
    professional: { primary: '#4f46e5', gradient: ['#1e1b4b', '#312e81'] },
    bold: { primary: '#dc2626', gradient: ['#0f0f0f', '#1f1f1f'] },
    minimal: { primary: '#171717', gradient: ['#fafafa', '#f5f5f5'] },
    playful: { primary: '#ec4899', gradient: ['#831843', '#701a75'] },
  };
  const colors = styleColors[style] || styleColors.professional;
  const isLightStyle = style === 'minimal';

  // Detect content type
  const contentType = detectContentType(description, desc);

  // Extract key information based on content type
  const extracted = extractContent(description, contentType);

  // 1. HERO BLOCK
  blocks.push({
    id: genId(),
    type: 'hero',
    order: blocks.length,
    width: 4,
    config: {
      headline: extracted.headline,
      subheadline: extracted.subheadline,
      buttonText: extracted.cta,
      buttonLink: '#contact',
      backgroundType: 'gradient',
      gradientFrom: colors.gradient[0],
      gradientTo: colors.gradient[1],
      textAlign: 'center',
      showButton: true,
    },
  });

  // 2. FEATURES/SKILLS/SERVICES BLOCK
  if (extracted.features.length > 0) {
    blocks.push({
      id: genId(),
      type: 'features',
      order: blocks.length,
      width: 4,
      config: {
        title: extracted.featuresTitle,
        subtitle: extracted.featuresSubtitle,
        columns: Math.min(extracted.features.length, 3) as 2 | 3 | 4,
        items: extracted.features.slice(0, 6),
      },
    });
  }

  // 3. STATS BLOCK (for professional/resume content)
  if (extracted.stats.length > 0) {
    blocks.push({
      id: genId(),
      type: 'stats',
      order: blocks.length,
      width: 4,
      config: {
        title: '',
        items: extracted.stats,
      },
    });
  }

  // 4. EXPERIENCE/TESTIMONIALS BLOCK
  if (extracted.experiences.length > 0 && contentType === 'resume') {
    // For resume, show as text block with experience
    blocks.push({
      id: genId(),
      type: 'text',
      order: blocks.length,
      width: 4,
      config: {
        content: formatExperience(extracted.experiences),
        alignment: 'left',
      },
    });
  } else if (contentType !== 'resume' && contentType !== 'coming-soon') {
    // For other types, show testimonials
    blocks.push({
      id: genId(),
      type: 'testimonials',
      order: blocks.length,
      width: 4,
      config: {
        title: 'What People Say',
        items: [
          { quote: `Working with ${extracted.name || 'them'} was an excellent experience. Professional, responsive, and delivered outstanding results.`, author: 'Sarah Johnson', company: 'Tech Innovations', avatar: '' },
          { quote: 'Exceeded our expectations in every way. Highly recommend!', author: 'Michael Chen', company: 'Growth Partners', avatar: '' },
        ],
      },
    });
  }

  // 5. PRICING BLOCK (if applicable)
  if (extracted.pricing.length > 0) {
    blocks.push({
      id: genId(),
      type: 'pricing',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Pricing',
        subtitle: 'Choose the right plan for you',
        items: extracted.pricing,
      },
    });
  }

  // 6. FAQ BLOCK (for SaaS/service pages)
  if (contentType === 'saas' || contentType === 'service') {
    blocks.push({
      id: genId(),
      type: 'faq',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Frequently Asked Questions',
        items: generateContextualFAQ(extracted.name, contentType, extracted),
      },
    });
  }

  // 7. FORM + CHAT (side by side if both)
  if (includeForm && includeChat) {
    blocks.push({
      id: genId(),
      type: 'form',
      order: blocks.length,
      width: 2,
      config: {
        formId: '',
        title: contentType === 'resume' ? 'Get in Touch' : contentType === 'coming-soon' ? 'Get Early Access' : 'Contact Me',
        description: contentType === 'resume'
          ? `Interested in working together? Let's connect.`
          : contentType === 'coming-soon'
            ? 'Be the first to know when we launch.'
            : `Have questions? I'd love to hear from you.`,
      },
    });
    blocks.push({
      id: genId(),
      type: 'chat',
      order: blocks.length,
      width: 2,
      config: {
        title: 'Quick Questions?',
        subtitle: 'Chat with AI for instant answers',
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
        title: contentType === 'resume' ? 'Let\'s Connect' : 'Get Started',
        description: contentType === 'resume'
          ? 'Reach out for opportunities, collaborations, or just to say hello.'
          : 'Fill out the form and I\'ll get back to you shortly.',
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
        subtitle: 'Get instant answers',
        placeholder: 'Type your question...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  }

  // 8. FINAL CTA
  blocks.push({
    id: genId(),
    type: 'cta',
    order: blocks.length,
    width: 4,
    config: {
      headline: extracted.ctaHeadline,
      description: extracted.ctaDescription,
      buttonText: extracted.cta,
      buttonLink: '#contact',
      backgroundColor: colors.primary,
      textColor: isLightStyle ? 'dark' : 'light',
    },
  });

  return blocks;
}

// Detect what type of content we're dealing with
function detectContentType(_original: string, lower: string): string {
  // Resume indicators
  const resumeIndicators = [
    'professional experience', 'work experience', 'employment', 'resume',
    'curriculum vitae', 'cv', 'professional summary', 'career',
    'years of experience', 'staff engineer', 'senior engineer', 'manager',
    'director', 'architect', 'developer', 'designer',
    '@', 'email', 'phone', 'linkedin'
  ];
  const resumeScore = resumeIndicators.filter(i => lower.includes(i)).length;
  if (resumeScore >= 3 || (lower.includes('experience') && lower.includes('|'))) {
    return 'resume';
  }

  // Other content types
  if (lower.includes('coming soon') || lower.includes('launching') || lower.includes('waitlist')) return 'coming-soon';
  if (lower.includes('portfolio') || lower.includes('my work') || lower.includes('projects')) return 'portfolio';
  if (lower.includes('saas') || lower.includes('software') || lower.includes('app') || lower.includes('platform')) return 'saas';
  if (lower.includes('service') || lower.includes('agency') || lower.includes('consulting')) return 'service';
  if (lower.includes('product') || lower.includes('shop') || lower.includes('buy')) return 'product';
  if (lower.includes('pricing') || lower.includes('plans')) return 'pricing';

  return 'general';
}

interface ExtractedContent {
  name: string;
  headline: string;
  subheadline: string;
  cta: string;
  ctaHeadline: string;
  ctaDescription: string;
  featuresTitle: string;
  featuresSubtitle: string;
  features: Array<{ icon: string; title: string; description: string }>;
  stats: Array<{ value: string; label: string }>;
  experiences: Array<{ title: string; company: string; description: string }>;
  pricing: Array<{ name: string; price: string; period: string; features: string[]; highlighted: boolean; buttonText: string; buttonLink: string }>;
}

function extractContent(description: string, contentType: string): ExtractedContent {
  const lines = description.split('\n').filter(l => l.trim());
  const lower = description.toLowerCase();

  // Extract name (first capitalized word sequence or first line)
  let name = '';
  const nameMatch = description.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m);
  if (nameMatch) {
    name = nameMatch[1];
  } else if (lines[0] && lines[0].length < 50) {
    name = lines[0].replace(/[|•\-–]/g, '').trim().split(/\s{2,}/)[0];
  }

  // Extract title/role
  let title = '';
  const titlePatterns = [
    /(?:staff|senior|lead|principal|chief|head|director|manager|vp|cto|ceo|cfo|coo)\s+[\w\s]+(?:engineer|architect|developer|designer|analyst|scientist|manager|director)/i,
    /[\w\s]+(?:engineer|architect|developer|designer|analyst|scientist|consultant|specialist)/i,
  ];
  for (const pattern of titlePatterns) {
    const match = description.match(pattern);
    if (match) {
      title = match[0].trim();
      break;
    }
  }

  // Extract years of experience
  let yearsExp = '';
  const yearsMatch = description.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i);
  if (yearsMatch) {
    yearsExp = yearsMatch[1] + '+';
  }

  // Extract key skills/technologies
  const techKeywords = [
    'AWS', 'Azure', 'GCP', 'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js',
    'Docker', 'Kubernetes', 'AI', 'ML', 'Machine Learning', 'Cloud', 'DevOps',
    'Infrastructure', 'Security', 'Data', 'Analytics', 'API', 'Microservices',
    'Serverless', 'Lambda', 'DynamoDB', 'PostgreSQL', 'MongoDB', 'Redis',
    'CI/CD', 'Terraform', 'CloudFormation', 'SAM', 'FastAPI', 'Django', 'Flask'
  ];
  const foundTech = techKeywords.filter(t => lower.includes(t.toLowerCase()));

  // Extract achievements/metrics
  const achievements: string[] = [];
  const achievementPatterns = [
    /achieved\s+\$?[\d,]+[KkMm]?\+?\s*(?:annual\s+)?(?:savings|revenue|growth)/gi,
    /reduced\s+[\w\s]+by\s+\d+%/gi,
    /improved\s+[\w\s]+by\s+\d+%/gi,
    /\d+%\s+(?:reduction|improvement|growth|increase)/gi,
    /\$[\d,]+[KkMm]?\+?\s*(?:savings|revenue)/gi,
  ];
  for (const pattern of achievementPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      achievements.push(...matches.slice(0, 2));
    }
  }

  // Extract experience entries
  const experiences: Array<{ title: string; company: string; description: string }> = [];
  const expPattern = /([A-Z][\w\s,]+)\n([A-Z][\w\s]+)\s*\|\s*(\w+\s+\d{4})/g;
  let expMatch;
  while ((expMatch = expPattern.exec(description)) !== null) {
    experiences.push({
      title: expMatch[1].trim(),
      company: expMatch[2].trim(),
      description: '',
    });
  }

  // Generate content based on type
  if (contentType === 'resume') {
    return {
      name,
      headline: name || 'Professional Portfolio',
      subheadline: title
        ? `${title}${yearsExp ? ` with ${yearsExp} years of experience` : ''}`
        : 'Driving innovation and delivering results',
      cta: 'Get in Touch',
      ctaHeadline: `Let's Work Together`,
      ctaDescription: 'Open to new opportunities and collaborations.',
      featuresTitle: 'Core Expertise',
      featuresSubtitle: 'Key skills and specializations',
      features: generateSkillFeatures(foundTech, lower),
      stats: generateResumeStats(yearsExp, achievements, lower),
      experiences,
      pricing: [],
    };
  }

  if (contentType === 'coming-soon') {
    return {
      name: name || 'Something Amazing',
      headline: `${name || 'Something Amazing'} is Coming`,
      subheadline: 'We\'re working on something special. Be the first to know when we launch.',
      cta: 'Notify Me',
      ctaHeadline: 'Don\'t Miss Out',
      ctaDescription: 'Join our waitlist for exclusive early access.',
      featuresTitle: 'What to Expect',
      featuresSubtitle: 'Here\'s a sneak peek',
      features: [
        { icon: 'zap', title: 'Lightning Fast', description: 'Built for speed and performance.' },
        { icon: 'shield', title: 'Secure by Design', description: 'Your data\'s safety is our priority.' },
        { icon: 'star', title: 'Beautiful Experience', description: 'Crafted with attention to every detail.' },
      ],
      stats: [],
      experiences: [],
      pricing: [],
    };
  }

  // Default/general extraction
  return {
    name: name || extractProductName(description),
    headline: generateSmartHeadline(description, name, contentType),
    subheadline: generateSmartSubheadline(description, contentType),
    cta: generateSmartCTA(lower, contentType),
    ctaHeadline: `Ready to Get Started?`,
    ctaDescription: `Take the next step and see what ${name || 'we'} can do for you.`,
    featuresTitle: contentType === 'service' ? 'Our Services' : 'Key Features',
    featuresSubtitle: contentType === 'service' ? 'How we can help' : 'Everything you need',
    features: extractSmartFeatures(description, lower, contentType),
    stats: [],
    experiences: [],
    pricing: extractPricingTiers(description),
  };
}

function generateSkillFeatures(tech: string[], lower: string): Array<{ icon: string; title: string; description: string }> {
  const features: Array<{ icon: string; title: string; description: string }> = [];

  // Map tech to feature categories
  if (tech.some(t => ['AWS', 'Azure', 'GCP', 'Cloud'].includes(t)) || lower.includes('cloud')) {
    features.push({ icon: 'cloud', title: 'Cloud Architecture', description: 'Designing and managing scalable cloud infrastructure across AWS, Azure, and GCP.' });
  }
  if (tech.some(t => ['AI', 'ML', 'Machine Learning'].includes(t)) || lower.includes('ai') || lower.includes('machine learning')) {
    features.push({ icon: 'zap', title: 'AI & Automation', description: 'Building intelligent systems that automate workflows and drive efficiency.' });
  }
  if (tech.some(t => ['Docker', 'Kubernetes', 'DevOps', 'CI/CD'].includes(t)) || lower.includes('devops')) {
    features.push({ icon: 'git-branch', title: 'DevOps & Infrastructure', description: 'Implementing CI/CD pipelines and container orchestration at scale.' });
  }
  if (lower.includes('team') || lower.includes('lead') || lower.includes('manage') || lower.includes('mentor')) {
    features.push({ icon: 'users', title: 'Technical Leadership', description: 'Leading and mentoring engineering teams to deliver exceptional results.' });
  }
  if (lower.includes('security') || lower.includes('secure') || lower.includes('zero-trust')) {
    features.push({ icon: 'shield', title: 'Security', description: 'Implementing enterprise-grade security and compliance measures.' });
  }
  if (lower.includes('cost') || lower.includes('optimization') || lower.includes('savings')) {
    features.push({ icon: 'target', title: 'Cost Optimization', description: 'Driving significant savings through strategic resource optimization.' });
  }

  // Fill with defaults if needed
  const defaults = [
    { icon: 'star', title: 'Problem Solving', description: 'Tackling complex challenges with innovative solutions.' },
    { icon: 'rocket', title: 'Fast Execution', description: 'Delivering results quickly without compromising quality.' },
    { icon: 'heart', title: 'Collaboration', description: 'Building strong relationships across teams and stakeholders.' },
  ];

  while (features.length < 3 && defaults.length > 0) {
    const def = defaults.shift()!;
    if (!features.some(f => f.icon === def.icon)) {
      features.push(def);
    }
  }

  return features.slice(0, 3);
}

function generateResumeStats(yearsExp: string, _achievements: string[], lower: string): Array<{ value: string; label: string }> {
  const stats: Array<{ value: string; label: string }> = [];

  if (yearsExp) {
    stats.push({ value: yearsExp, label: 'Years Experience' });
  }

  // Look for specific numbers
  const savingsMatch = lower.match(/\$(\d+)[kK]\+?/);
  if (savingsMatch) {
    stats.push({ value: `$${savingsMatch[1]}K+`, label: 'Cost Savings' });
  }

  const percentMatch = lower.match(/(\d+)%/);
  if (percentMatch && !stats.some(s => s.value.includes('%'))) {
    stats.push({ value: `${percentMatch[1]}%`, label: 'Improvement' });
  }

  // Server/infrastructure count
  const serverMatch = lower.match(/(\d+)\+?\s*servers?/);
  if (serverMatch) {
    stats.push({ value: `${serverMatch[1]}+`, label: 'Servers Managed' });
  }

  // Team size
  const teamMatch = lower.match(/(\d+)[-\s]?person\s+team/);
  if (teamMatch) {
    stats.push({ value: teamMatch[1], label: 'Team Size' });
  }

  return stats.slice(0, 4);
}

function extractProductName(description: string): string {
  const forMatch = description.match(/(?:for|called|named|introducing)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/);
  if (forMatch) return forMatch[1];

  const capsMatch = description.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/);
  if (capsMatch) return capsMatch[1];

  return '';
}

function generateSmartHeadline(desc: string, name: string, contentType: string): string {
  const firstLine = desc.split('\n')[0].trim();
  if (firstLine.length > 5 && firstLine.length < 60) {
    return firstLine;
  }

  if (name) {
    if (contentType === 'saas') return `${name}: Work Smarter, Not Harder`;
    if (contentType === 'service') return `${name}: Results That Speak`;
    return name;
  }

  return 'Transform How You Work';
}

function generateSmartSubheadline(desc: string, contentType: string): string {
  const sentences = desc.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences[1] && sentences[1].length < 150) {
    return sentences[1].trim();
  }

  if (contentType === 'saas') return 'The all-in-one platform that helps teams do more with less.';
  if (contentType === 'service') return 'We deliver results that matter, on time and on budget.';
  return 'Powerful features designed to help you succeed.';
}

function generateSmartCTA(lower: string, contentType: string): string {
  if (lower.includes('trial')) return 'Start Free Trial';
  if (lower.includes('demo')) return 'Request Demo';
  if (lower.includes('book') || lower.includes('call')) return 'Book a Call';
  if (contentType === 'service') return 'Get a Quote';
  return 'Get Started';
}

function extractSmartFeatures(_desc: string, lower: string, _contentType: string): Array<{ icon: string; title: string; description: string }> {
  const features: Array<{ icon: string; title: string; description: string }> = [];

  const featureMap: Record<string, { icon: string; title: string; description: string }> = {
    'ai': { icon: 'zap', title: 'AI-Powered', description: 'Leverage cutting-edge AI to automate and enhance your workflow.' },
    'fast': { icon: 'rocket', title: 'Lightning Fast', description: 'Optimized for speed so you can focus on what matters.' },
    'secure': { icon: 'shield', title: 'Enterprise Security', description: 'Bank-level encryption keeps your data safe.' },
    'team': { icon: 'users', title: 'Team Collaboration', description: 'Work together seamlessly with your entire team.' },
    'analytic': { icon: 'target', title: 'Rich Analytics', description: 'Actionable insights from comprehensive data.' },
    'integrat': { icon: 'globe', title: 'Easy Integrations', description: 'Connect with tools you already use.' },
    'automat': { icon: 'zap', title: 'Automation', description: 'Automate repetitive tasks and save time.' },
    'support': { icon: 'heart', title: '24/7 Support', description: 'Our team is always here to help.' },
  };

  for (const [keyword, feature] of Object.entries(featureMap)) {
    if (lower.includes(keyword) && features.length < 3) {
      features.push(feature);
    }
  }

  const defaults = [
    { icon: 'zap', title: 'Powerful', description: 'Everything you need in one place.' },
    { icon: 'shield', title: 'Reliable', description: 'Dependable performance you can trust.' },
    { icon: 'heart', title: 'Loved', description: 'Trusted by thousands of happy customers.' },
  ];

  while (features.length < 3) {
    features.push(defaults[features.length]);
  }

  return features;
}

function extractPricingTiers(desc: string): Array<{ name: string; price: string; period: string; features: string[]; highlighted: boolean; buttonText: string; buttonLink: string }> {
  const priceMatches = desc.match(/\$\d+(?:\/mo)?/gi);
  if (!priceMatches || priceMatches.length < 2) return [];

  return [
    { name: 'Starter', price: 'Free', period: '', features: ['Core features', 'Community support'], highlighted: false, buttonText: 'Get Started', buttonLink: '#' },
    { name: 'Pro', price: priceMatches[0].replace(/\/mo/i, ''), period: '/month', features: ['Everything in Starter', 'Priority support', 'Advanced features'], highlighted: true, buttonText: 'Start Trial', buttonLink: '#' },
    { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'Dedicated support', 'Custom integrations'], highlighted: false, buttonText: 'Contact Us', buttonLink: '#' },
  ];
}

function generateContextualFAQ(name: string, contentType: string, _extracted: ExtractedContent): Array<{ question: string; answer: string }> {
  const productName = name || 'our solution';

  if (contentType === 'saas') {
    return [
      { question: `How does ${productName} work?`, answer: 'Sign up for free, complete a quick setup, and you\'re ready to go. Our intuitive interface makes it easy to get started in minutes.' },
      { question: 'Is there a free trial?', answer: 'Yes! We offer a 14-day free trial with full access to all features. No credit card required.' },
      { question: 'Can I cancel anytime?', answer: 'Absolutely. No long-term contracts or cancellation fees. Cancel anytime.' },
    ];
  }

  return [
    { question: 'How do I get started?', answer: 'Reach out through our contact form or chat. We\'ll schedule a call to understand your needs.' },
    { question: 'What is your turnaround time?', answer: 'Most projects complete within 2-4 weeks, depending on scope.' },
  ];
}

function formatExperience(experiences: Array<{ title: string; company: string; description: string }>): string {
  if (experiences.length === 0) return '';

  let text = '## Professional Experience\n\n';
  for (const exp of experiences.slice(0, 3)) {
    text += `**${exp.title}**\n${exp.company}\n\n`;
  }
  return text;
}
