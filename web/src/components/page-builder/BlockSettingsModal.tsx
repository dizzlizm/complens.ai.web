import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
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
} from './types';
import BlockAIToolbar from './BlockAIToolbar';
import {
  FieldGroup,
  TextInput,
  TextArea,
  HeroConfigFields,
  FeaturesConfigFields,
  CtaConfigFields,
  FormConfigFields,
  TestimonialsConfigFields,
  FaqConfigFields,
  PricingConfigFields,
  TextConfigFields,
  ImageConfigFields,
  VideoConfigFields,
  StatsConfigFields,
  DividerConfigFields,
  ChatConfigFields,
} from './BlockConfigPanel';

// Icon mapping for block types
import {
  LayoutTemplate,
  Grid3x3,
  MousePointerClick,
  FileText,
  Quote,
  HelpCircle,
  Type,
  Image,
  BarChart2,
  Minus,
  CreditCard,
  PlayCircle,
  MessageCircle,
} from 'lucide-react';

const BLOCK_ICONS: Record<string, React.ElementType> = {
  hero: LayoutTemplate,
  features: Grid3x3,
  cta: MousePointerClick,
  form: FileText,
  testimonials: Quote,
  faq: HelpCircle,
  text: Type,
  image: Image,
  stats: BarChart2,
  divider: Minus,
  pricing: CreditCard,
  video: PlayCircle,
  chat: MessageCircle,
};

// Blocks that support image generation
const IMAGE_BLOCKS: Record<string, string> = {
  hero: 'backgroundImage',
  image: 'url',
};

interface BlockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: PageBlock;
  onConfigChange: (config: Record<string, unknown>) => void;
  forms?: Array<{ id: string; name: string }>;
  workspaceId?: string;
  pageContext?: {
    headline?: string;
    subheadline?: string;
    other_blocks?: string[];
  };
}

type TabType = 'content' | 'advanced';

export default function BlockSettingsModal({
  isOpen,
  onClose,
  block,
  onConfigChange,
  forms = [],
  pageContext,
}: BlockSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('content');
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});

  const typeInfo = getBlockTypeInfo(block.type);
  const IconComponent = BLOCK_ICONS[block.type] || Grid3x3;
  const supportsImage = block.type in IMAGE_BLOCKS;
  const imageField = IMAGE_BLOCKS[block.type];

  // Sync local config with block config when modal opens or block changes
  useEffect(() => {
    if (isOpen) {
      setLocalConfig({ ...block.config });
    }
  }, [isOpen, block.config]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const updateConfig = useCallback((updates: Record<string, unknown>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  }, [localConfig, onConfigChange]);

  const renderContentTab = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = localConfig as any;

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
        return (
          <p className="text-gray-500 text-sm">
            No configuration available for this block type.
          </p>
        );
    }
  };

  const renderAdvancedTab = () => {
    return (
      <div className="space-y-4">
        <FieldGroup label="CSS Classes">
          <TextInput
            value={(localConfig.customClassName as string) || ''}
            onChange={(v) => updateConfig({ customClassName: v })}
            placeholder="e.g., my-custom-class shadow-lg"
          />
          <p className="text-xs text-gray-400 mt-1">
            Additional CSS classes to apply to this block
          </p>
        </FieldGroup>

        <FieldGroup label="HTML ID">
          <TextInput
            value={(localConfig.htmlId as string) || ''}
            onChange={(v) => updateConfig({ htmlId: v })}
            placeholder="e.g., contact-section"
          />
          <p className="text-xs text-gray-400 mt-1">
            Used for anchor links (e.g., #contact-section)
          </p>
        </FieldGroup>

        <FieldGroup label="Custom CSS">
          <TextArea
            value={(localConfig.customCss as string) || ''}
            onChange={(v) => updateConfig({ customCss: v })}
            placeholder={`.block-${block.id} {\n  /* Your custom styles */\n}`}
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-gray-400 mt-1">
            Custom CSS scoped to this block. Use <code className="bg-gray-100 px-1 rounded">.block-{block.id}</code> as the selector.
          </p>
        </FieldGroup>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <IconComponent className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {typeInfo?.label || block.type} Settings
                </h2>
                <p className="text-xs text-gray-500">
                  Configure block content and appearance
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('content')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'content'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Content
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'advanced'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Advanced
            </button>
          </div>

          {/* AI Tools (only show on content tab) */}
          {activeTab === 'content' && block.type !== 'placeholder' && (
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Tools
              </label>
              <BlockAIToolbar
                blockType={block.type}
                config={localConfig}
                onConfigChange={(newConfig) => {
                  setLocalConfig(newConfig);
                  onConfigChange(newConfig);
                }}
                pageContext={pageContext}
                supportsImage={supportsImage}
                imageField={imageField}
              />
              <p className="text-xs text-gray-400 mt-2">
                Use AI to improve content or generate images
              </p>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'content' ? renderContentTab() : renderAdvancedTab()}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
