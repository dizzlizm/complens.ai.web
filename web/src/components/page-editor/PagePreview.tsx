import { type ContentBlock } from './ContentBlockEditor';
import { type Form } from '../../lib/hooks/useForms';

interface PagePreviewProps {
  headline: string;
  subheadline?: string;
  heroImageUrl?: string;
  blocks: ContentBlock[];
  forms: Form[];
  selectedFormIds: string[];
  chatConfig?: { enabled?: boolean; position?: string; initial_message?: string | null; ai_persona?: string | null };
  primaryColor: string;
}

export default function PagePreview({
  headline,
  subheadline,
  heroImageUrl,
  blocks,
  forms,
  selectedFormIds,
  chatConfig,
  primaryColor,
}: PagePreviewProps) {
  const selectedForms = forms.filter(f => selectedFormIds.includes(f.id));

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-full flex flex-col">
      {/* Preview Header */}
      <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-gray-500 ml-2">Preview</span>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-y-auto" style={{ '--primary-color': primaryColor } as React.CSSProperties}>
        {/* Hero Section */}
        <div
          className="text-center py-12 px-6"
          style={{
            background: heroImageUrl
              ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${heroImageUrl}) center/cover`
              : `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)`,
            color: heroImageUrl ? 'white' : 'inherit',
          }}
        >
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: heroImageUrl ? 'white' : primaryColor }}
          >
            {headline || 'Your Headline Here'}
          </h1>
          {subheadline && (
            <p className={`text-sm ${heroImageUrl ? 'text-gray-200' : 'text-gray-600'}`}>
              {subheadline}
            </p>
          )}
        </div>

        {/* Content Blocks */}
        <div className="px-6 py-8 space-y-8">
          {blocks.map((block) => (
            <PreviewBlock key={block.id} block={block} primaryColor={primaryColor} />
          ))}

          {blocks.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
              Add content blocks to see them here
            </div>
          )}

          {/* Forms */}
          {selectedForms.map((form) => (
            <div key={form.id} className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">{form.name}</h3>
              <div className="space-y-4">
                {form.fields.slice(0, 3).map((field) => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <div className="w-full h-16 bg-white border border-gray-300 rounded-lg" />
                    ) : (
                      <div className="w-full h-10 bg-white border border-gray-300 rounded-lg" />
                    )}
                  </div>
                ))}
                {form.fields.length > 3 && (
                  <p className="text-xs text-gray-500">+ {form.fields.length - 3} more fields</p>
                )}
                <button
                  className="w-full py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: primaryColor }}
                >
                  {form.submit_button_text || 'Submit'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Chat Widget Preview */}
        {chatConfig?.enabled !== false && (
          <div
            className="fixed bottom-4 right-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: primaryColor }}
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewBlock({ block, primaryColor }: { block: ContentBlock; primaryColor: string }) {
  switch (block.type) {
    case 'text': {
      const { heading, body } = block.content as { heading: string; body: string };
      return (
        <section>
          {heading && (
            <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>
              {heading}
            </h2>
          )}
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{body}</p>
        </section>
      );
    }

    case 'image': {
      const { url, alt, caption } = block.content as { url: string; alt: string; caption: string };
      if (!url) return null;
      return (
        <figure className="text-center">
          <img src={url} alt={alt} className="max-w-full rounded-lg mx-auto" />
          {caption && <figcaption className="text-xs text-gray-500 mt-2">{caption}</figcaption>}
        </figure>
      );
    }

    case 'features': {
      const { heading, items } = block.content as { heading: string; items: Array<{ title: string; description: string }> };
      return (
        <section>
          {heading && (
            <h2 className="text-lg font-semibold mb-4" style={{ color: primaryColor }}>
              {heading}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 mt-0.5 flex-shrink-0"
                  style={{ color: primaryColor }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case 'cta': {
      const { text, style } = block.content as { text: string; url: string; style: string };
      return (
        <div className="text-center">
          <button
            className={`px-6 py-2 rounded-lg font-medium text-sm ${
              style === 'secondary'
                ? 'border-2'
                : style === 'link'
                ? 'underline'
                : 'text-white'
            }`}
            style={{
              backgroundColor: style === 'primary' ? primaryColor : 'transparent',
              borderColor: style === 'secondary' ? primaryColor : 'transparent',
              color: style === 'primary' ? 'white' : primaryColor,
            }}
          >
            {text || 'Button'}
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
