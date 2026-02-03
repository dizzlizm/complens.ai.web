import React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  PageBlock,
  getBlockTypeInfo,
  HeroConfig,
  FeaturesConfig,
  CtaConfig,
  FormConfig,
  TestimonialsConfig,
  FaqConfig,
  PricingConfig,
  TextConfig,
  ImageConfig,
  VideoConfig,
  StatsConfig,
  DividerConfig,
  ChatConfig,
  FeatureItem,
  TestimonialItem,
  FaqItem,
  PricingTier,
  StatItem,
} from './types';
import BlockAIToolbar from './BlockAIToolbar';

interface BlockConfigPanelProps {
  block: PageBlock;
  onConfigChange: (config: Record<string, unknown>) => void;
  onWidthChange?: (width: 1 | 2 | 3 | 4) => void;
  onClose: () => void;
  forms?: Array<{ id: string; name: string }>;
  pageContext?: {
    headline?: string;
    subheadline?: string;
    other_blocks?: string[];
  };
}

// Blocks that support image generation
const IMAGE_BLOCKS: Record<string, string> = {
  hero: 'backgroundImage',
  image: 'url',
};

export default function BlockConfigPanel({
  block,
  onConfigChange,
  onWidthChange,
  onClose,
  forms = [],
  pageContext,
}: BlockConfigPanelProps) {
  const typeInfo = getBlockTypeInfo(block.type);
  const supportsImage = block.type in IMAGE_BLOCKS;
  const imageField = IMAGE_BLOCKS[block.type];

  const updateConfig = (updates: Record<string, unknown>) => {
    onConfigChange({ ...block.config, ...updates });
  };

  const renderConfigFields = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = block.config as any;
    switch (block.type) {
      case 'hero':
        return <HeroConfigFields config={config as HeroConfig} onChange={updateConfig} />;
      case 'features':
        return <FeaturesConfigFields config={config as FeaturesConfig} onChange={updateConfig} />;
      case 'cta':
        return <CtaConfigFields config={config as CtaConfig} onChange={updateConfig} />;
      case 'form':
        return <FormConfigFields config={config as FormConfig} onChange={updateConfig} forms={forms} />;
      case 'testimonials':
        return <TestimonialsConfigFields config={config as TestimonialsConfig} onChange={updateConfig} />;
      case 'faq':
        return <FaqConfigFields config={config as FaqConfig} onChange={updateConfig} />;
      case 'pricing':
        return <PricingConfigFields config={config as PricingConfig} onChange={updateConfig} />;
      case 'text':
        return <TextConfigFields config={config as TextConfig} onChange={updateConfig} />;
      case 'image':
        return <ImageConfigFields config={config as ImageConfig} onChange={updateConfig} />;
      case 'video':
        return <VideoConfigFields config={config as VideoConfig} onChange={updateConfig} />;
      case 'stats':
        return <StatsConfigFields config={config as StatsConfig} onChange={updateConfig} />;
      case 'divider':
        return <DividerConfigFields config={config as DividerConfig} onChange={updateConfig} />;
      case 'chat':
        return <ChatConfigFields config={config as ChatConfig} onChange={updateConfig} />;
      default:
        return <p className="text-gray-500">No configuration available for this block type.</p>;
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="font-medium text-gray-900">{typeInfo?.label || block.type}</h3>
          <p className="text-xs text-gray-500">Block Settings</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* AI Tools */}
      <div className="p-4 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">AI Tools</label>
        <BlockAIToolbar
          blockType={block.type}
          config={block.config}
          onConfigChange={onConfigChange}
          pageContext={pageContext}
          supportsImage={supportsImage}
          imageField={imageField}
        />
        <p className="text-xs text-gray-400 mt-2">
          Use AI to improve content or generate images
        </p>
      </div>

      {/* Width Selector */}
      {onWidthChange && (
        <div className="p-4 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">Block Width</label>
          <div className="grid grid-cols-4 gap-1">
            {([1, 2, 3, 4] as const).map((w) => (
              <button
                key={w}
                onClick={() => onWidthChange(w)}
                className={`py-2 text-xs font-medium rounded transition-colors ${
                  (block.width || 4) === w
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {w === 4 ? 'Full' : w === 3 ? '3/4' : w === 2 ? 'Half' : '1/4'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Blocks fill {block.width || 4} of 4 columns
          </p>
        </div>
      )}

      {/* Config Fields */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderConfigFields()}
      </div>
    </div>
  );
}

// Field Components - exported for reuse in BlockSettingsModal
export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm"
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm resize-none ${className}`}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#6366f1'}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded cursor-pointer border-0"
      />
      <input
        type="text"
        value={value || '#6366f1'}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm font-mono"
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function BackgroundImageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [prompt, setPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      // Use Unsplash as fallback - can be replaced with real AI generation API
      const searchTerm = encodeURIComponent(prompt);
      const url = `https://source.unsplash.com/1920x1080/?${searchTerm}`;
      onChange(url);
    } finally {
      setIsGenerating(false);
      setPrompt('');
    }
  };

  return (
    <div className="space-y-3">
      {/* AI Generation */}
      <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs font-medium text-purple-900">AI Background</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., abstract gradient, city skyline..."
            className="flex-1 px-2 py-1.5 text-xs border border-purple-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-300"
            onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-2 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {isGenerating ? '...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Manual URL */}
      <FieldGroup label="Or enter URL">
        <TextInput value={value} onChange={onChange} placeholder="https://..." />
      </FieldGroup>

      {/* Preview */}
      {value && (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
          <img src={value} alt="Background preview" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}

// Block-specific config forms - exported for reuse in BlockSettingsModal

export function HeroConfigFields({
  config,
  onChange,
}: {
  config: HeroConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Headline">
        <TextInput value={config.headline} onChange={(v) => onChange({ headline: v })} placeholder="Main headline..." />
      </FieldGroup>

      <FieldGroup label="Subheadline">
        <TextArea value={config.subheadline} onChange={(v) => onChange({ subheadline: v })} placeholder="Supporting text..." />
      </FieldGroup>

      <FieldGroup label="Text Alignment">
        <SelectInput
          value={config.textAlign}
          onChange={(v) => onChange({ textAlign: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </FieldGroup>

      <FieldGroup label="Background Type">
        <SelectInput
          value={config.backgroundType}
          onChange={(v) => onChange({ backgroundType: v })}
          options={[
            { value: 'gradient', label: 'Gradient' },
            { value: 'color', label: 'Solid Color' },
            { value: 'image', label: 'Image' },
          ]}
        />
      </FieldGroup>

      {config.backgroundType === 'color' && (
        <FieldGroup label="Background Color">
          <ColorInput value={config.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        </FieldGroup>
      )}

      {config.backgroundType === 'gradient' && (
        <>
          <FieldGroup label="Gradient Start">
            <ColorInput value={config.gradientFrom} onChange={(v) => onChange({ gradientFrom: v })} />
          </FieldGroup>
          <FieldGroup label="Gradient End">
            <ColorInput value={config.gradientTo} onChange={(v) => onChange({ gradientTo: v })} />
          </FieldGroup>
        </>
      )}

      {config.backgroundType === 'image' && (
        <BackgroundImageField
          value={config.backgroundImage}
          onChange={(v) => onChange({ backgroundImage: v })}
        />
      )}

      <div className="pt-4 border-t border-gray-200">
        <Toggle checked={config.showButton !== false} onChange={(v) => onChange({ showButton: v })} label="Show Button" />
      </div>

      {config.showButton !== false && (
        <>
          <FieldGroup label="Button Text">
            <TextInput value={config.buttonText} onChange={(v) => onChange({ buttonText: v })} placeholder="Get Started" />
          </FieldGroup>
          <FieldGroup label="Button Link">
            <TextInput value={config.buttonLink} onChange={(v) => onChange({ buttonLink: v })} placeholder="#" />
          </FieldGroup>
        </>
      )}
    </div>
  );
}

export function FeaturesConfigFields({
  config,
  onChange,
}: {
  config: FeaturesConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = config.items || [];

  const addItem = () => {
    onChange({
      items: [...items, { icon: 'zap', title: 'New Feature', description: 'Feature description' }],
    });
  };

  const updateItem = (index: number, updates: Partial<FeatureItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  const iconOptions = [
    { value: 'zap', label: 'Zap' },
    { value: 'shield', label: 'Shield' },
    { value: 'heart', label: 'Heart' },
    { value: 'star', label: 'Star' },
    { value: 'rocket', label: 'Rocket' },
    { value: 'target', label: 'Target' },
    { value: 'users', label: 'Users' },
    { value: 'globe', label: 'Globe' },
    { value: 'lock', label: 'Lock' },
    { value: 'clock', label: 'Clock' },
    { value: 'check', label: 'Check' },
    { value: 'award', label: 'Award' },
  ];

  return (
    <div className="space-y-4">
      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Features" />
      </FieldGroup>

      <FieldGroup label="Subtitle">
        <TextInput value={config.subtitle} onChange={(v) => onChange({ subtitle: v })} placeholder="Everything you need..." />
      </FieldGroup>

      <FieldGroup label="Columns">
        <SelectInput
          value={String(config.columns || 3)}
          onChange={(v) => onChange({ columns: parseInt(v) })}
          options={[
            { value: '2', label: '2 Columns' },
            { value: '3', label: '3 Columns' },
            { value: '4', label: '4 Columns' },
          ]}
        />
      </FieldGroup>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Features</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Feature {index + 1}</span>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <SelectInput
                  value={item.icon}
                  onChange={(v) => updateItem(index, { icon: v })}
                  options={iconOptions}
                />
                <TextInput
                  value={item.title}
                  onChange={(v) => updateItem(index, { title: v })}
                  placeholder="Feature title..."
                />
                <TextArea
                  value={item.description}
                  onChange={(v) => updateItem(index, { description: v })}
                  placeholder="Description..."
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CtaConfigFields({
  config,
  onChange,
}: {
  config: CtaConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Headline">
        <TextInput value={config.headline} onChange={(v) => onChange({ headline: v })} placeholder="Ready to get started?" />
      </FieldGroup>

      <FieldGroup label="Description">
        <TextArea value={config.description} onChange={(v) => onChange({ description: v })} placeholder="Supporting text..." />
      </FieldGroup>

      <FieldGroup label="Button Text">
        <TextInput value={config.buttonText} onChange={(v) => onChange({ buttonText: v })} placeholder="Start Now" />
      </FieldGroup>

      <FieldGroup label="Button Link">
        <TextInput value={config.buttonLink} onChange={(v) => onChange({ buttonLink: v })} placeholder="#" />
      </FieldGroup>

      <FieldGroup label="Background Color">
        <ColorInput value={config.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
      </FieldGroup>

      <FieldGroup label="Text Color">
        <SelectInput
          value={config.textColor}
          onChange={(v) => onChange({ textColor: v })}
          options={[
            { value: 'light', label: 'Light (white)' },
            { value: 'dark', label: 'Dark (black)' },
          ]}
        />
      </FieldGroup>
    </div>
  );
}

export function FormConfigFields({
  config,
  onChange,
  forms,
}: {
  config: FormConfig;
  onChange: (updates: Record<string, unknown>) => void;
  forms: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Select Form">
        <SelectInput
          value={config.formId}
          onChange={(v) => onChange({ formId: v })}
          options={[
            { value: '', label: 'Select a form...' },
            ...forms.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
      </FieldGroup>

      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Get in Touch" />
      </FieldGroup>

      <FieldGroup label="Description">
        <TextArea value={config.description} onChange={(v) => onChange({ description: v })} placeholder="Fill out the form..." />
      </FieldGroup>

      {forms.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          No forms available. Create a form in the Forms tab first.
        </p>
      )}
    </div>
  );
}

export function TestimonialsConfigFields({
  config,
  onChange,
}: {
  config: TestimonialsConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = config.items || [];

  const addItem = () => {
    onChange({
      items: [...items, { quote: 'Great product!', author: 'Customer Name', company: 'Company', avatar: '' }],
    });
  };

  const updateItem = (index: number, updates: Partial<TestimonialItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="What Our Customers Say" />
      </FieldGroup>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Testimonials</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Testimonial {index + 1}</span>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <TextArea
                  value={item.quote}
                  onChange={(v) => updateItem(index, { quote: v })}
                  placeholder="Quote..."
                  rows={2}
                />
                <TextInput
                  value={item.author}
                  onChange={(v) => updateItem(index, { author: v })}
                  placeholder="Author name..."
                />
                <TextInput
                  value={item.company}
                  onChange={(v) => updateItem(index, { company: v })}
                  placeholder="Company..."
                />
                <TextInput
                  value={item.avatar}
                  onChange={(v) => updateItem(index, { avatar: v })}
                  placeholder="Avatar URL (optional)..."
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FaqConfigFields({
  config,
  onChange,
}: {
  config: FaqConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = config.items || [];

  const addItem = () => {
    onChange({
      items: [...items, { question: 'New question?', answer: 'Answer here...' }],
    });
  };

  const updateItem = (index: number, updates: Partial<FaqItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Frequently Asked Questions" />
      </FieldGroup>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Questions</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Q{index + 1}</span>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <TextInput
                  value={item.question}
                  onChange={(v) => updateItem(index, { question: v })}
                  placeholder="Question..."
                />
                <TextArea
                  value={item.answer}
                  onChange={(v) => updateItem(index, { answer: v })}
                  placeholder="Answer..."
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PricingConfigFields({
  config,
  onChange,
}: {
  config: PricingConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = config.items || [];

  const addItem = () => {
    onChange({
      items: [
        ...items,
        {
          name: 'New Plan',
          price: '$0',
          period: '/month',
          features: ['Feature 1'],
          highlighted: false,
          buttonText: 'Get Started',
          buttonLink: '#',
        },
      ],
    });
  };

  const updateItem = (index: number, updates: Partial<PricingTier>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Simple Pricing" />
      </FieldGroup>

      <FieldGroup label="Subtitle">
        <TextInput value={config.subtitle} onChange={(v) => onChange({ subtitle: v })} placeholder="Choose your plan..." />
      </FieldGroup>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Plans</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">{item.name}</span>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <TextInput
                  value={item.name}
                  onChange={(v) => updateItem(index, { name: v })}
                  placeholder="Plan name..."
                />
                <div className="flex gap-2">
                  <TextInput
                    value={item.price}
                    onChange={(v) => updateItem(index, { price: v })}
                    placeholder="$29"
                  />
                  <TextInput
                    value={item.period}
                    onChange={(v) => updateItem(index, { period: v })}
                    placeholder="/month"
                  />
                </div>
                <TextArea
                  value={item.features.join('\n')}
                  onChange={(v) => updateItem(index, { features: v.split('\n').filter(Boolean) })}
                  placeholder="Features (one per line)..."
                  rows={3}
                />
                <Toggle
                  checked={item.highlighted}
                  onChange={(v) => updateItem(index, { highlighted: v })}
                  label="Highlight this plan"
                />
                <TextInput
                  value={item.buttonText}
                  onChange={(v) => updateItem(index, { buttonText: v })}
                  placeholder="Button text..."
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TextConfigFields({
  config,
  onChange,
}: {
  config: TextConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Content">
        <TextArea value={config.content} onChange={(v) => onChange({ content: v })} placeholder="Your text content..." rows={8} />
      </FieldGroup>

      <FieldGroup label="Text Alignment">
        <SelectInput
          value={config.alignment}
          onChange={(v) => onChange({ alignment: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </FieldGroup>
    </div>
  );
}

export function ImageConfigFields({
  config,
  onChange,
  onGenerateImage,
}: {
  config: ImageConfig;
  onChange: (updates: Record<string, unknown>) => void;
  onGenerateImage?: (prompt: string) => Promise<string>;
}) {
  const [prompt, setPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      if (onGenerateImage) {
        const url = await onGenerateImage(prompt);
        onChange({ url, alt: prompt });
      } else {
        // Fallback to Unsplash for demo
        const searchTerm = encodeURIComponent(prompt);
        const url = `https://source.unsplash.com/1200x800/?${searchTerm}`;
        onChange({ url, alt: prompt });
      }
    } catch (err) {
      console.error('Image generation failed:', err);
    } finally {
      setIsGenerating(false);
      setPrompt('');
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Image Generation */}
      <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm font-medium text-purple-900">AI Image</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image..."
            className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
            onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </>
            ) : (
              'Generate'
            )}
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-2 bg-white text-gray-500">or enter URL</span>
        </div>
      </div>

      <FieldGroup label="Image URL">
        <TextInput value={config.url} onChange={(v) => onChange({ url: v })} placeholder="https://..." />
      </FieldGroup>

      <FieldGroup label="Alt Text">
        <TextInput value={config.alt} onChange={(v) => onChange({ alt: v })} placeholder="Image description..." />
      </FieldGroup>

      <FieldGroup label="Caption">
        <TextInput value={config.caption} onChange={(v) => onChange({ caption: v })} placeholder="Optional caption..." />
      </FieldGroup>

      <FieldGroup label="Width">
        <SelectInput
          value={config.width}
          onChange={(v) => onChange({ width: v })}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
            { value: 'full', label: 'Full Width' },
          ]}
        />
      </FieldGroup>
    </div>
  );
}

export function VideoConfigFields({
  config,
  onChange,
}: {
  config: VideoConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Video URL">
        <TextInput value={config.url} onChange={(v) => onChange({ url: v })} placeholder="YouTube or Vimeo URL..." />
      </FieldGroup>

      <FieldGroup label="Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Video title (optional)..." />
      </FieldGroup>

      <Toggle checked={config.autoplay} onChange={(v) => onChange({ autoplay: v })} label="Autoplay (muted)" />
    </div>
  );
}

export function StatsConfigFields({
  config,
  onChange,
}: {
  config: StatsConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = config.items || [];

  const addItem = () => {
    onChange({
      items: [...items, { value: '100+', label: 'New Stat' }],
    });
  };

  const updateItem = (index: number, updates: Partial<StatItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="Section Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Optional title..." />
      </FieldGroup>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Stats</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Stat {index + 1}</span>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <TextInput
                  value={item.value}
                  onChange={(v) => updateItem(index, { value: v })}
                  placeholder="100+"
                />
                <TextInput
                  value={item.label}
                  onChange={(v) => updateItem(index, { label: v })}
                  placeholder="Label..."
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DividerConfigFields({
  config,
  onChange,
}: {
  config: DividerConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Style">
        <SelectInput
          value={config.style}
          onChange={(v) => onChange({ style: v })}
          options={[
            { value: 'line', label: 'Line' },
            { value: 'dots', label: 'Dots' },
            { value: 'space', label: 'Space Only' },
          ]}
        />
      </FieldGroup>

      <FieldGroup label="Height">
        <SelectInput
          value={config.height}
          onChange={(v) => onChange({ height: v })}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
        />
      </FieldGroup>
    </div>
  );
}

export function ChatConfigFields({
  config,
  onChange,
}: {
  config: ChatConfig;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Chat Title">
        <TextInput value={config.title} onChange={(v) => onChange({ title: v })} placeholder="Chat with us" />
      </FieldGroup>

      <FieldGroup label="Subtitle">
        <TextInput value={config.subtitle} onChange={(v) => onChange({ subtitle: v })} placeholder="Ask us anything!" />
      </FieldGroup>

      <FieldGroup label="Input Placeholder">
        <TextInput value={config.placeholder} onChange={(v) => onChange({ placeholder: v })} placeholder="Type your message..." />
      </FieldGroup>

      <FieldGroup label="Style">
        <SelectInput
          value={config.position}
          onChange={(v) => onChange({ position: v })}
          options={[
            { value: 'inline', label: 'Inline (embedded in page)' },
            { value: 'floating', label: 'Floating (corner widget)' },
          ]}
        />
      </FieldGroup>

      <FieldGroup label="Primary Color">
        <ColorInput value={config.primaryColor} onChange={(v) => onChange({ primaryColor: v })} />
      </FieldGroup>
    </div>
  );
}
