import DOMPurify from 'dompurify';
import { TextConfig } from '../types';

interface TextBlockProps {
  config: TextConfig;
  isEditing?: boolean;
  onConfigChange?: (config: TextConfig) => void;
}

export default function TextBlock({ config, isEditing, onConfigChange }: TextBlockProps) {
  const {
    content = 'Add your content here...',
    alignment = 'left',
  } = config;

  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[alignment];

  const handleChange = (field: keyof TextConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  return (
    <div className={`py-12 px-8 bg-white ${alignmentClass}`}>
      <div className="max-w-4xl mx-auto">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => handleChange('content', e.target.value)}
            className={`w-full text-gray-700 leading-relaxed bg-transparent border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg p-4 resize-none min-h-[150px] ${alignmentClass}`}
            placeholder="Enter your text content here..."
          />
        ) : (
          <div
            className="text-gray-700 leading-relaxed prose prose-indigo max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.replace(/\n/g, '<br />')) }}
          />
        )}
      </div>
    </div>
  );
}
