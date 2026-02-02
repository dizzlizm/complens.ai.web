import { Building2, Plus, X } from 'lucide-react';
import { LogoCloudConfig, LogoItem } from '../types';

// TODO: Add logo upload option (no AI generation - users need real client logos)
// See GalleryBlock.tsx for upload flow details

interface LogoCloudBlockProps {
  config: LogoCloudConfig;
  isEditing?: boolean;
  onConfigChange?: (config: LogoCloudConfig) => void;
}

export default function LogoCloudBlock({ config, isEditing, onConfigChange }: LogoCloudBlockProps) {
  const {
    title = 'Trusted By',
    subtitle = '',
    logos = [],
    grayscale = true,
  } = config;

  const handleChange = <K extends keyof LogoCloudConfig>(field: K, value: LogoCloudConfig[K]) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  const handleLogoChange = (index: number, field: keyof LogoItem, value: string) => {
    if (onConfigChange) {
      const newLogos = [...logos];
      newLogos[index] = { ...newLogos[index], [field]: value };
      onConfigChange({ ...config, logos: newLogos });
    }
  };

  const handleAddLogo = () => {
    if (onConfigChange) {
      const newLogos = [...logos, { name: '', url: '', link: '' }];
      onConfigChange({ ...config, logos: newLogos });
    }
  };

  const handleRemoveLogo = (index: number) => {
    if (onConfigChange) {
      const newLogos = logos.filter((_, i) => i !== index);
      onConfigChange({ ...config, logos: newLogos });
    }
  };

  return (
    <div className="py-12 px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Title */}
        {(title || isEditing) && (
          <h3 className="text-lg font-semibold text-gray-500 text-center mb-2 uppercase tracking-wide">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full text-center bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                placeholder="Section title..."
              />
            ) : (
              title
            )}
          </h3>
        )}

        {/* Subtitle */}
        {(subtitle || isEditing) && (
          <p className="text-gray-600 text-center mb-8">
            {isEditing ? (
              <input
                type="text"
                value={subtitle}
                onChange={(e) => handleChange('subtitle', e.target.value)}
                className="w-full text-center bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                placeholder="Subtitle (optional)..."
              />
            ) : (
              subtitle
            )}
          </p>
        )}

        {/* Logos Grid */}
        {logos.length > 0 ? (
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {logos.map((logo, index) => (
              <div key={index} className="relative group">
                {isEditing && (
                  <button
                    onClick={() => handleRemoveLogo(index)}
                    className="absolute -top-2 -right-2 z-10 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}

                {logo.url ? (
                  <div className="flex flex-col items-center">
                    {logo.link && !isEditing ? (
                      <a
                        href={logo.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={logo.url}
                          alt={logo.name || 'Partner logo'}
                          className={`h-10 md:h-12 w-auto object-contain transition-all hover:opacity-100 ${
                            grayscale ? 'filter grayscale opacity-60 hover:grayscale-0' : ''
                          }`}
                        />
                      </a>
                    ) : (
                      <img
                        src={logo.url}
                        alt={logo.name || 'Partner logo'}
                        className={`h-10 md:h-12 w-auto object-contain transition-all ${
                          grayscale ? 'filter grayscale opacity-60' : ''
                        }`}
                      />
                    )}

                    {isEditing && (
                      <div className="mt-2 space-y-1">
                        <input
                          type="text"
                          value={logo.name || ''}
                          onChange={(e) => handleLogoChange(index, 'name', e.target.value)}
                          className="w-32 px-2 py-1 text-xs text-center border border-gray-200 rounded"
                          placeholder="Name..."
                        />
                        <input
                          type="text"
                          value={logo.link || ''}
                          onChange={(e) => handleLogoChange(index, 'link', e.target.value)}
                          className="w-32 px-2 py-1 text-xs text-center border border-gray-200 rounded"
                          placeholder="Link (optional)..."
                        />
                      </div>
                    )}
                  </div>
                ) : isEditing ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-24 h-12 bg-gray-200 rounded flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={logo.url}
                      onChange={(e) => handleLogoChange(index, 'url', e.target.value)}
                      className="w-32 px-2 py-1 text-xs text-center border border-gray-200 rounded"
                      placeholder="Logo URL..."
                    />
                  </div>
                ) : (
                  <div className="w-24 h-12 bg-gray-200 rounded flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
            <Building2 className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No logos yet</p>
            {isEditing && (
              <button
                onClick={handleAddLogo}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Add Logo
              </button>
            )}
          </div>
        )}

        {/* Add logo button in editing mode */}
        {isEditing && logos.length > 0 && (
          <div className="mt-6 text-center">
            <button
              onClick={handleAddLogo}
              className="inline-flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add Logo
            </button>
          </div>
        )}

        {/* Grayscale toggle for editing */}
        {isEditing && logos.length > 0 && (
          <div className="mt-4 flex justify-center">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={grayscale}
                onChange={(e) => handleChange('grayscale', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Grayscale logos (hover to show color)
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
