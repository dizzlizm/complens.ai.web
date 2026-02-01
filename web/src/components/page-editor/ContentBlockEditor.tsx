import { useState } from 'react';
import { Plus, GripVertical, Trash2, Type, Image, List, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

export type ContentBlock = {
  id: string;
  type: 'text' | 'image' | 'features' | 'cta';
  content: Record<string, unknown>;
};

interface ContentBlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

const BLOCK_TYPES = [
  { type: 'text', label: 'Text Section', icon: Type, description: 'Add a paragraph or rich text' },
  { type: 'image', label: 'Image', icon: Image, description: 'Add an image with caption' },
  { type: 'features', label: 'Features List', icon: List, description: 'Highlight key features' },
  { type: 'cta', label: 'Call to Action', icon: ArrowRight, description: 'Add a button or link' },
] as const;

function generateId() {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function ContentBlockEditor({ blocks, onChange }: ContentBlockEditorProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const addBlock = (type: ContentBlock['type']) => {
    const newBlock: ContentBlock = {
      id: generateId(),
      type,
      content: getDefaultContent(type),
    };
    onChange([...blocks, newBlock]);
    setShowAddMenu(false);
    setExpandedBlock(newBlock.id);
  };

  const updateBlock = (id: string, content: Record<string, unknown>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, content } : b));
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(b => b.id === id);
    if (direction === 'up' && index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index - 1]] = [newBlocks[index - 1], newBlocks[index]];
      onChange(newBlocks);
    } else if (direction === 'down' && index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      onChange(newBlocks);
    }
  };

  return (
    <div className="space-y-4">
      {blocks.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Type className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-500 mb-2">No content blocks yet</p>
          <p className="text-sm text-gray-400">Add sections to build your page</p>
        </div>
      )}

      {blocks.map((block, index) => (
        <BlockItem
          key={block.id}
          block={block}
          isExpanded={expandedBlock === block.id}
          onToggle={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
          onUpdate={(content) => updateBlock(block.id, content)}
          onRemove={() => removeBlock(block.id)}
          onMoveUp={index > 0 ? () => moveBlock(block.id, 'up') : undefined}
          onMoveDown={index < blocks.length - 1 ? () => moveBlock(block.id, 'down') : undefined}
        />
      ))}

      {/* Add Block Button */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Content Block
        </button>

        {showAddMenu && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-20">
            <div className="grid grid-cols-2 gap-2">
              {BLOCK_TYPES.map(({ type, label, icon: Icon, description }) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Icon className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{label}</p>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultContent(type: ContentBlock['type']): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { heading: '', body: '' };
    case 'image':
      return { url: '', alt: '', caption: '' };
    case 'features':
      return { heading: 'Features', items: [{ title: '', description: '' }] };
    case 'cta':
      return { text: 'Get Started', url: '#', style: 'primary' };
    default:
      return {};
  }
}

interface BlockItemProps {
  block: ContentBlock;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (content: Record<string, unknown>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function BlockItem({ block, isExpanded, onToggle, onUpdate, onRemove, onMoveUp, onMoveDown }: BlockItemProps) {
  const blockType = BLOCK_TYPES.find(t => t.type === block.type);
  const Icon = blockType?.icon || Type;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Block Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggle}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
        <div className="p-1.5 bg-white rounded border border-gray-200">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
        <span className="font-medium text-gray-900 flex-1">{blockType?.label}</span>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Block Content Editor */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {block.type === 'text' && (
            <TextBlockEditor
              content={block.content as { heading: string; body: string }}
              onChange={onUpdate}
            />
          )}
          {block.type === 'image' && (
            <ImageBlockEditor
              content={block.content as { url: string; alt: string; caption: string }}
              onChange={onUpdate}
            />
          )}
          {block.type === 'features' && (
            <FeaturesBlockEditor
              content={block.content as { heading: string; items: Array<{ title: string; description: string }> }}
              onChange={onUpdate}
            />
          )}
          {block.type === 'cta' && (
            <CtaBlockEditor
              content={block.content as { text: string; url: string; style: string }}
              onChange={onUpdate}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Individual block type editors
function TextBlockEditor({ content, onChange }: { content: { heading: string; body: string }; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Section Heading (optional)</label>
        <input
          type="text"
          value={content.heading || ''}
          onChange={(e) => onChange({ ...content, heading: e.target.value })}
          placeholder="e.g., About Us"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
        <textarea
          value={content.body || ''}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          placeholder="Write your content here..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

function ImageBlockEditor({ content, onChange }: { content: { url: string; alt: string; caption: string }; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
        <input
          type="url"
          value={content.url || ''}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          placeholder="https://example.com/image.jpg"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {content.url && (
        <div className="bg-gray-100 rounded-lg p-2">
          <img src={content.url} alt={content.alt || ''} className="max-h-40 mx-auto rounded" />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Alt Text</label>
        <input
          type="text"
          value={content.alt || ''}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
          placeholder="Describe the image"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Caption (optional)</label>
        <input
          type="text"
          value={content.caption || ''}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
          placeholder="Image caption"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

function FeaturesBlockEditor({ content, onChange }: { content: { heading: string; items: Array<{ title: string; description: string }> }; onChange: (c: Record<string, unknown>) => void }) {
  const addItem = () => {
    onChange({ ...content, items: [...content.items, { title: '', description: '' }] });
  };

  const updateItem = (index: number, field: 'title' | 'description', value: string) => {
    const newItems = [...content.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...content, items: newItems });
  };

  const removeItem = (index: number) => {
    onChange({ ...content, items: content.items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Section Heading</label>
        <input
          type="text"
          value={content.heading || ''}
          onChange={(e) => onChange({ ...content, heading: e.target.value })}
          placeholder="e.g., Why Choose Us"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Features</label>
        {content.items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={item.title}
                onChange={(e) => updateItem(index, 'title', e.target.value)}
                placeholder="Feature title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                placeholder="Brief description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              onClick={() => removeItem(index)}
              className="p-2 text-gray-400 hover:text-red-600 self-start"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Add feature
        </button>
      </div>
    </div>
  );
}

function CtaBlockEditor({ content, onChange }: { content: { text: string; url: string; style: string }; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
        <input
          type="text"
          value={content.text || ''}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="e.g., Get Started, Learn More"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
        <input
          type="text"
          value={content.url || ''}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          placeholder="#contact or https://..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
        <select
          value={content.style || 'primary'}
          onChange={(e) => onChange({ ...content, style: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="primary">Primary (Filled)</option>
          <option value="secondary">Secondary (Outlined)</option>
          <option value="link">Link Style</option>
        </select>
      </div>
      {/* Preview */}
      <div className="pt-2">
        <p className="text-xs text-gray-500 mb-2">Preview:</p>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            content.style === 'primary' ? 'bg-indigo-600 text-white' :
            content.style === 'secondary' ? 'border border-indigo-600 text-indigo-600' :
            'text-indigo-600 underline'
          }`}
        >
          {content.text || 'Button'}
        </button>
      </div>
    </div>
  );
}

// Helper to convert blocks to HTML for storage
export function blocksToHtml(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'text': {
        const { heading, body } = block.content as { heading: string; body: string };
        return `<section class="content-section">
  ${heading ? `<h2 class="section-heading">${escapeHtml(heading)}</h2>` : ''}
  <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
</section>`;
      }
      case 'image': {
        const { url, alt, caption } = block.content as { url: string; alt: string; caption: string };
        return `<figure class="content-image">
  <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />
  ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
</figure>`;
      }
      case 'features': {
        const { heading, items } = block.content as { heading: string; items: Array<{ title: string; description: string }> };
        return `<section class="features-section">
  ${heading ? `<h2 class="section-heading">${escapeHtml(heading)}</h2>` : ''}
  <ul class="features-list">
    ${items.map(item => `<li><strong>${escapeHtml(item.title)}</strong>${item.description ? `: ${escapeHtml(item.description)}` : ''}</li>`).join('\n    ')}
  </ul>
</section>`;
      }
      case 'cta': {
        const { text, url, style } = block.content as { text: string; url: string; style: string };
        const className = style === 'secondary' ? 'cta-secondary' : style === 'link' ? 'cta-link' : 'cta-primary';
        return `<div class="cta-section">
  <a href="${escapeHtml(url)}" class="${className}">${escapeHtml(text)}</a>
</div>`;
      }
      default:
        return '';
    }
  }).join('\n\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to parse HTML back to blocks (best effort)
export function htmlToBlocks(html: string): ContentBlock[] {
  // This is a simplified parser - in production you'd want something more robust
  if (!html || html.trim() === '') return [];

  // For now, if we have existing HTML that wasn't created by blocks,
  // wrap it in a single text block
  return [{
    id: generateId(),
    type: 'text',
    content: { heading: '', body: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() }
  }];
}
