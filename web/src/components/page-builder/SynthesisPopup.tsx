import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, ChevronRight, AlertCircle, FileText, Workflow, Image, Check, Building2, Plus, MessageSquare, Eye } from 'lucide-react';
import { BlockType, BLOCK_TYPES, PageBlock } from './types';
import { useSynthesizePage, useGenerateImage, useBusinessProfile, SynthesisResult } from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface FormFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'number';
  required: boolean;
  placeholder?: string;
  options?: string[];
  map_to_contact_field?: string;
}

interface SynthesisPopupProps {
  selectedBlockTypes: BlockType[];
  selectedSlotIds?: string[];  // Optional: slot IDs from visual canvas
  pageId?: string;
  onClose: () => void;
  onApply: (blocks: PageBlock[], synthesisResult: SynthesisResult, options: ApplyOptions) => void;
}

export interface ApplyOptions {
  createForm: boolean;
  createWorkflow: boolean;
  generateImages: boolean;
  formFields: FormFieldConfig[];
  workflowTrigger: string;
  // Workflow configuration
  workflowTags: string[];
  notifyOwner: boolean;
  ownerEmail: string;
  sendWelcomeEmail: boolean;
}

// Blocks that can benefit from AI-generated images
const IMAGE_CAPABLE_BLOCKS = ['hero', 'testimonials', 'image', 'gallery', 'slider'];

// Default form fields (always included)
const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  { name: 'first_name', label: 'Name', type: 'text', required: true, placeholder: 'Your name', map_to_contact_field: 'first_name' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'your@email.com', map_to_contact_field: 'email' },
  { name: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: '(555) 123-4567', map_to_contact_field: 'phone' },
  { name: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'How can we help?' },
];

// Extra field presets users can add
const EXTRA_FIELD_PRESETS: FormFieldConfig[] = [
  { name: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Your company', map_to_contact_field: 'custom_fields.company' },
  { name: 'job_title', label: 'Job Title', type: 'text', required: false, placeholder: 'Your role', map_to_contact_field: 'custom_fields.job_title' },
  { name: 'website', label: 'Website', type: 'text', required: false, placeholder: 'https://', map_to_contact_field: 'custom_fields.website' },
  { name: 'budget', label: 'Budget', type: 'select', required: false, options: ['Under $1k', '$1k - $5k', '$5k - $10k', '$10k - $25k', '$25k+'] },
  { name: 'service_interest', label: 'Service', type: 'select', required: false, options: ['Consulting', 'Development', 'Design', 'Marketing', 'Other'] },
  { name: 'preferred_date', label: 'Preferred Date', type: 'date', required: false },
];

// Workflow trigger options
const WORKFLOW_TRIGGERS: Array<{
  value: string;
  label: string;
  icon: typeof FileText;
  description: string;
  requiresBlock?: BlockType;
}> = [
  { value: 'trigger_form_submitted', label: 'Form Submission', icon: FileText, description: 'When someone submits the form' },
  { value: 'trigger_chat_message', label: 'Chat Message', icon: MessageSquare, description: 'When someone sends a chat message', requiresBlock: 'chat' },
  { value: 'trigger_page_visit', label: 'Page Visit', icon: Eye, description: 'When someone visits the page' },
];

// Map brand_voice from profile to synthesis style options
function mapBrandVoiceToStyle(brandVoice: string): 'professional' | 'bold' | 'minimal' | 'playful' {
  switch (brandVoice) {
    case 'professional':
    case 'authoritative':
      return 'professional';
    case 'bold':
    case 'inspirational':
      return 'bold';
    case 'casual':
    case 'technical':
      return 'minimal';
    case 'friendly':
    case 'playful':
      return 'playful';
    default:
      return 'professional';
  }
}

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Clean, corporate, trustworthy' },
  { value: 'bold', label: 'Bold', description: 'High-contrast, urgent, attention-grabbing' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant, lots of whitespace' },
  { value: 'playful', label: 'Playful', description: 'Colorful, friendly, approachable' },
] as const;

export default function SynthesisPopup({
  selectedBlockTypes,
  selectedSlotIds: _selectedSlotIds = [],  // Reserved for future slot-specific generation
  pageId,
  onClose,
  onApply,
}: SynthesisPopupProps) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: profile } = useBusinessProfile(workspaceId, pageId);
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<'professional' | 'bold' | 'minimal' | 'playful'>('professional');
  const [profileApplied, setProfileApplied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);

  // Options for what to create alongside blocks
  const [createForm, setCreateForm] = useState(true);
  const [createWorkflow, setCreateWorkflow] = useState(true);
  const [generateImages, setGenerateImages] = useState(true);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState<string>('');

  // Form field configuration
  const [formFields, setFormFields] = useState<FormFieldConfig[]>([...DEFAULT_FORM_FIELDS]);

  // Workflow configuration
  const [workflowTrigger, setWorkflowTrigger] = useState<string>('trigger_form_submitted');
  const [workflowTags, setWorkflowTags] = useState<string>('lead, website');
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Auto-apply profile defaults once when profile loads
  useEffect(() => {
    if (profile && !profileApplied) {
      if (profile.brand_voice) {
        setStyle(mapBrandVoiceToStyle(profile.brand_voice));
      }
      if (!description && profile.description) {
        setDescription(profile.description);
      }
      if (profile.contact_email && !ownerEmail) {
        setOwnerEmail(profile.contact_email);
      }
      setProfileApplied(true);
    }
  }, [profile, profileApplied, description, ownerEmail]);

  const synthesizePage = useSynthesizePage(workspaceId || '');
  const generateImage = useGenerateImage(workspaceId || '');

  // Check if any selected blocks can use images
  const hasImageCapableBlocks = selectedBlockTypes.some(type => IMAGE_CAPABLE_BLOCKS.includes(type));

  // Check if form/workflow options should be shown
  const willHaveForm = selectedBlockTypes.includes('form') || synthesisResult?.form_config;

  // Get block labels for display
  const getBlockLabel = (type: BlockType): string => {
    const blockInfo = BLOCK_TYPES.find((b) => b.type === type);
    return blockInfo?.label || type;
  };

  // Handle synthesis
  const handleSynthesize = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const result = await synthesizePage.mutateAsync({
        description: description || 'Generate content for the selected blocks',
        style_preference: style,
        page_id: pageId,
        include_form: selectedBlockTypes.includes('form'),
        include_chat: selectedBlockTypes.includes('chat'),
        block_types: selectedBlockTypes,
      });

      setSynthesisResult(result);
      setShowPreview(true);
    } catch (error) {
      console.error('Synthesis failed:', error);
    }
  }, [workspaceId, synthesizePage, description, style, pageId, selectedBlockTypes]);

  // Generate images for blocks that need them
  const generateImagesForBlocks = useCallback(async (blocks: SynthesisResult['blocks']): Promise<SynthesisResult['blocks']> => {
    const updatedBlocks = [...blocks];

    // Extract design context from synthesis result
    const colors = synthesisResult?.design_system?.colors;
    const designStyle = synthesisResult?.design_system?.style || style;
    const businessName = synthesisResult?.business_name || 'business';
    const tagline = synthesisResult?.tagline || '';
    const goal = synthesisResult?.intent?.goal || 'professional';

    // Build color description for prompts
    const colorContext = colors
      ? `brand colors: ${colors.primary} (primary), ${colors.secondary} (secondary), ${colors.accent} (accent)`
      : 'professional corporate colors';

    for (let i = 0; i < updatedBlocks.length; i++) {
      const block = updatedBlocks[i];

      // Hero block - generate abstract background with brand colors
      if (block.type === 'hero' && !block.config.backgroundImage) {
        setImageProgress(`Generating hero background...`);
        try {
          const result = await generateImage.mutateAsync({
            context: businessName,
            prompt: `Abstract gradient background for ${businessName}${tagline ? ` - ${tagline}` : ''}, ${designStyle} style, ${colorContext}, modern minimalist design, subtle geometric patterns, no text, high quality`,
            style: designStyle === 'playful' ? 'vibrant' : designStyle === 'bold' ? 'dramatic' : 'professional',
          });
          updatedBlocks[i] = {
            ...block,
            config: {
              ...block.config,
              backgroundType: 'image',
              backgroundImage: result.url,
            },
          };
        } catch (e) {
          console.warn('Failed to generate hero image:', e);
        }
      }

      // Testimonials - generate placeholder avatars with brand aesthetic
      if (block.type === 'testimonials') {
        const items = (block.config.items as Array<{ quote: string; author: string; company: string; avatar?: string }>) || [];
        const updatedItems = [];

        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          if (!item.avatar) {
            setImageProgress(`Generating avatar ${j + 1}/${items.length}...`);
            try {
              const result = await generateImage.mutateAsync({
                prompt: `Professional headshot avatar, abstract geometric style, ${designStyle} aesthetic, ${colors?.primary || 'blue'} accent tones, neutral background, modern corporate portrait`,
                style: 'portrait',
                width: 512,
                height: 512,
              });
              updatedItems.push({ ...item, avatar: result.url });
            } catch (e) {
              console.warn('Failed to generate testimonial avatar:', e);
              updatedItems.push(item);
            }
          } else {
            updatedItems.push(item);
          }
        }

        updatedBlocks[i] = {
          ...block,
          config: { ...block.config, items: updatedItems },
        };
      }

      // Image block - generate if no URL with brand context
      if (block.type === 'image' && !(block.config as { url?: string }).url) {
        setImageProgress(`Generating image...`);
        try {
          const result = await generateImage.mutateAsync({
            context: businessName,
            prompt: `Professional ${goal} image for ${businessName}, ${designStyle} style, ${colorContext}, high quality, modern`,
            style: designStyle,
          });
          updatedBlocks[i] = {
            ...block,
            config: { ...block.config, url: result.url },
          };
        } catch (e) {
          console.warn('Failed to generate image:', e);
        }
      }
    }

    setImageProgress('');
    return updatedBlocks;
  }, [generateImage, synthesisResult, style]);

  // Handle apply
  const handleApply = useCallback(async () => {
    if (!synthesisResult) return;

    let finalBlocks = synthesisResult.blocks;

    // Generate images if enabled and there are image-capable blocks
    if (generateImages && hasImageCapableBlocks) {
      setIsGeneratingImages(true);
      try {
        finalBlocks = await generateImagesForBlocks(finalBlocks);
      } finally {
        setIsGeneratingImages(false);
      }
    }

    // Convert synthesis blocks to PageBlock format
    const blocks: PageBlock[] = finalBlocks.map((block, index) => ({
      id: block.id,
      type: block.type as BlockType,
      config: block.config,
      order: index,
      width: (block.width || 4) as 1 | 2 | 3 | 4,
    }));

    onApply(blocks, synthesisResult, {
      createForm,
      createWorkflow,
      generateImages,
      formFields,
      workflowTrigger,
      workflowTags: workflowTags.split(',').map(t => t.trim()).filter(Boolean),
      notifyOwner,
      ownerEmail,
      sendWelcomeEmail,
    });
    onClose();
  }, [synthesisResult, generateImages, hasImageCapableBlocks, generateImagesForBlocks, onApply, onClose, createForm, createWorkflow, formFields, workflowTrigger, workflowTags, notifyOwner, ownerEmail, sendWelcomeEmail]);

  // Available extra fields (not already added)
  const availableExtras = EXTRA_FIELD_PRESETS.filter(
    preset => !formFields.some(f => f.name === preset.name)
  );

  // Render creation options (form, workflow, images)
  const renderCreationOptions = () => (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <h5 className="text-sm font-medium text-gray-700">Also create:</h5>

      {/* Form option */}
      {willHaveForm && (
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
              createForm ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
            }`}>
              {createForm && <Check className="w-3 h-3 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={createForm}
              onChange={(e) => setCreateForm(e.target.checked)}
              className="sr-only"
            />
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <div>
                <span className="text-sm text-gray-900">Lead Capture Form</span>
                <p className="text-xs text-gray-500">Auto-create form from synthesis</p>
              </div>
            </div>
          </label>

          {/* Form field configurator - shown when form is enabled */}
          {createForm && (
            <div className="ml-8 pl-4 border-l-2 border-indigo-200 space-y-2">
              <p className="text-xs font-medium text-gray-600">Form Fields</p>

              {/* Current fields list */}
              <div className="space-y-1.5">
                {formFields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800">{field.label}</span>
                      <span className="text-xs text-gray-400">{field.type}</span>
                      {field.required && (
                        <span className="text-xs text-red-500">*</span>
                      )}
                    </div>
                    <button
                      onClick={() => setFormFields(prev => prev.filter(f => f.name !== field.name))}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                      title={`Remove ${field.label}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add field presets */}
              {availableExtras.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {availableExtras.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setFormFields(prev => [...prev, preset])}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Workflow option */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
            createWorkflow ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
          }`}>
            {createWorkflow && <Check className="w-3 h-3 text-white" />}
          </div>
          <input
            type="checkbox"
            checked={createWorkflow}
            onChange={(e) => setCreateWorkflow(e.target.checked)}
            className="sr-only"
          />
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-green-600" />
            <div>
              <span className="text-sm text-gray-900">Automation Workflow</span>
              <p className="text-xs text-gray-500">Automate actions based on triggers</p>
            </div>
          </div>
        </label>

        {/* Workflow configuration - shown when workflow is enabled */}
        {createWorkflow && (
          <div className="ml-8 pl-4 border-l-2 border-green-200 space-y-3">
            {/* Trigger type selector */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Trigger</p>
              <div className="space-y-1.5">
                {WORKFLOW_TRIGGERS.map((trigger) => {
                  const isAvailable = !trigger.requiresBlock || selectedBlockTypes.includes(trigger.requiresBlock);
                  if (!isAvailable) return null;
                  const TriggerIcon = trigger.icon;
                  return (
                    <button
                      key={trigger.value}
                      onClick={() => setWorkflowTrigger(trigger.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                        workflowTrigger === trigger.value
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <TriggerIcon className={`w-4 h-4 flex-shrink-0 ${
                        workflowTrigger === trigger.value ? 'text-green-600' : 'text-gray-400'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${
                          workflowTrigger === trigger.value ? 'text-green-700' : 'text-gray-700'
                        }`}>
                          {trigger.label}
                        </p>
                        <p className="text-xs text-gray-500">{trigger.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Add tags to new contacts
              </label>
              <input
                type="text"
                value={workflowTags}
                onChange={(e) => setWorkflowTags(e.target.value)}
                placeholder="lead, website, inquiry"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Comma-separated list</p>
            </div>

            {/* Send welcome email */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendWelcomeEmail}
                onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">Send welcome email to lead</span>
            </label>

            {/* Notify owner */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOwner}
                onChange={(e) => setNotifyOwner(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">Email me when triggered</span>
            </label>

            {/* Owner email - shown when notify owner is enabled */}
            {notifyOwner && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Send notifications to
                </label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image generation option */}
      {hasImageCapableBlocks && (
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
            generateImages ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
          }`}>
            {generateImages && <Check className="w-3 h-3 text-white" />}
          </div>
          <input
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            className="sr-only"
          />
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-purple-600" />
            <div>
              <span className="text-sm text-gray-900">Generate AI Images</span>
              <p className="text-xs text-gray-500">Hero backgrounds, avatars, etc.</p>
            </div>
          </div>
        </label>
      )}

      {!willHaveForm && !hasImageCapableBlocks && !createWorkflow && (
        <p className="text-sm text-gray-500 italic">No additional resources needed for these blocks.</p>
      )}
    </div>
  );

  // Render preview content (simplified - no config toggles)
  const renderPreview = () => {
    if (!synthesisResult) return null;

    return (
      <div className="space-y-4">
        {/* Intent & Assessment Summary */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">
                {synthesisResult.business_name || 'Your Page'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {synthesisResult.tagline || 'AI-generated content ready'}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {synthesisResult.blocks.length} blocks generated
                </span>
                <span>Style: {synthesisResult.design_system.style}</span>
                <span>Goal: {synthesisResult.intent.goal}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Block Preview List */}
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-gray-700">Generated Blocks</h5>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {synthesisResult.blocks.map((block, index) => (
              <div
                key={block.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded text-xs font-medium text-gray-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {block.type}
                  </p>
                  {(block.config as { headline?: string }).headline && (
                    <p className="text-xs text-gray-500 truncate">
                      {(block.config as { headline: string }).headline}
                    </p>
                  )}
                  {(block.config as { title?: string }).title && !(block.config as { headline?: string }).headline && (
                    <p className="text-xs text-gray-500 truncate">
                      {(block.config as { title: string }).title}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {block.width === 4 ? 'Full' : `${block.width}/4`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Excluded Blocks Warning */}
        {Object.keys(synthesisResult.metadata.blocks_excluded).length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Some blocks were excluded</p>
                <ul className="text-xs text-amber-700 mt-1 space-y-1">
                  {Object.entries(synthesisResult.metadata.blocks_excluded).map(([type, reason]) => (
                    <li key={type}>
                      <span className="font-medium">{type}</span>: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Color Scheme Preview */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Colors:</span>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.primary }}
              title="Primary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.secondary }}
              title="Secondary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.accent }}
              title="Accent"
            />
          </div>
          <span className="text-xs text-gray-500 capitalize">
            {synthesisResult.design_system.style} style
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {showPreview ? 'Preview Synthesis' : 'AI Synthesis'}
              </h3>
              <p className="text-sm text-gray-500">
                {showPreview
                  ? 'Review and apply generated content'
                  : 'Generate content for selected blocks'}
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

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {!showPreview ? (
            <>
              {/* Profile Banner */}
              {profile?.business_name && (
                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-900">
                      Using AI Profile: {profile.business_name}
                    </p>
                    {profile.brand_voice && (
                      <p className="text-xs text-indigo-600 mt-0.5">
                        Brand voice: {profile.brand_voice} &middot; Style auto-selected
                      </p>
                    )}
                  </div>
                  <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                </div>
              )}

              {/* Selected Blocks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Blocks
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedBlockTypes.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-full"
                    >
                      {getBlockLabel(type)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe your page{profile?.description ? '' : ' (optional)'}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., A landing page for my AI-powered marketing automation tool that helps small businesses..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {profile?.description
                    ? 'Pre-filled from your AI profile. Edit to customize.'
                    : 'The more context you provide, the better the AI-generated content will be'}
                </p>
              </div>

              {/* Style Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Style
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setStyle(option.value)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        style === option.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${
                        style === option.value ? 'text-purple-700' : 'text-gray-900'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Creation Options (moved from preview screen) */}
              {renderCreationOptions()}
            </>
          ) : (
            renderPreview()
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 bg-gray-50 border-t border-gray-100">
          {!showPreview ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSynthesize}
                disabled={synthesizePage.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-purple-500/25"
              >
                {synthesizePage.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Synthesizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Content
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowPreview(false)}
                disabled={isGeneratingImages}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Back to Options
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSynthesize}
                  disabled={synthesizePage.isPending || isGeneratingImages}
                  className="px-4 py-2 text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {synthesizePage.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Regenerate'
                  )}
                </button>
                <button
                  onClick={handleApply}
                  disabled={isGeneratingImages}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/25 disabled:opacity-70"
                >
                  {isGeneratingImages ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {imageProgress || 'Generating...'}
                    </>
                  ) : (
                    <>
                      Apply to Page
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Error Display */}
        {synthesizePage.isError && (
          <div className="mx-5 mb-5 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              Synthesis failed. Please try again or provide more details about your page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
