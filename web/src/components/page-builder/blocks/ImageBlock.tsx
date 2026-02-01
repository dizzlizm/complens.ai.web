import { ImageIcon } from 'lucide-react';
import { ImageConfig } from '../types';

interface ImageBlockProps {
  config: ImageConfig;
  isEditing?: boolean;
  onConfigChange?: (config: ImageConfig) => void;
}

export default function ImageBlock({ config, isEditing, onConfigChange }: ImageBlockProps) {
  const {
    url = '',
    alt = '',
    caption = '',
    width = 'large',
  } = config;

  const widthClass = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    full: 'max-w-none',
  }[width];

  const handleChange = (field: keyof ImageConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  return (
    <div className="py-8 px-8 bg-white">
      <div className={`mx-auto ${widthClass}`}>
        {url ? (
          <figure>
            <img
              src={url}
              alt={alt}
              className="w-full rounded-lg shadow-sm"
            />
            {caption && (
              <figcaption className="mt-3 text-center text-sm text-gray-500">
                {isEditing ? (
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => handleChange('caption', e.target.value)}
                    className="w-full text-center bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                    placeholder="Image caption..."
                  />
                ) : (
                  caption
                )}
              </figcaption>
            )}
          </figure>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
            <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500 mb-2">No image set</p>
            {isEditing && (
              <input
                type="text"
                value={url}
                onChange={(e) => handleChange('url', e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Enter image URL..."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
