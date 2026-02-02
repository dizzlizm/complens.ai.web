import { useState } from 'react';
import { Images, X, Plus } from 'lucide-react';
import { GalleryConfig, GalleryImage } from '../types';

// TODO: Add image upload/generation options when adding images:
// 1. Upload from device (needs presigned S3 URL endpoint)
// 2. Paste URL (current approach)
// 3. Generate with AI (use existing generate-image endpoint, warn about quality)
// See also: SliderBlock.tsx, LogoCloudBlock.tsx

interface GalleryBlockProps {
  config: GalleryConfig;
  isEditing?: boolean;
  onConfigChange?: (config: GalleryConfig) => void;
}

export default function GalleryBlock({ config, isEditing, onConfigChange }: GalleryBlockProps) {
  const {
    title = 'Gallery',
    images = [],
    columns = 3,
    showCaptions = true,
    enableLightbox = true,
  } = config;

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns];

  const handleChange = <K extends keyof GalleryConfig>(field: K, value: GalleryConfig[K]) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  const handleImageChange = (index: number, field: keyof GalleryImage, value: string) => {
    if (onConfigChange) {
      const newImages = [...images];
      newImages[index] = { ...newImages[index], [field]: value };
      onConfigChange({ ...config, images: newImages });
    }
  };

  const handleAddImage = () => {
    if (onConfigChange) {
      const newImages = [...images, { url: '', alt: '', caption: '' }];
      onConfigChange({ ...config, images: newImages });
    }
  };

  const handleRemoveImage = (index: number) => {
    if (onConfigChange) {
      const newImages = images.filter((_, i) => i !== index);
      onConfigChange({ ...config, images: newImages });
    }
  };

  const openLightbox = (index: number) => {
    if (enableLightbox && !isEditing) {
      setLightboxIndex(index);
    }
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (lightboxIndex === null) return;
    const newIndex = direction === 'prev'
      ? (lightboxIndex - 1 + images.length) % images.length
      : (lightboxIndex + 1) % images.length;
    setLightboxIndex(newIndex);
  };

  return (
    <div className="py-12 px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Title */}
        {(title || isEditing) && (
          <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full text-center bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
                placeholder="Gallery title..."
              />
            ) : (
              title
            )}
          </h3>
        )}

        {/* Gallery Grid */}
        {images.length > 0 ? (
          <div className={`grid ${gridColsClass} gap-4`}>
            {images.map((image, index) => (
              <div key={index} className="relative group">
                {isEditing && (
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-2 right-2 z-10 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <div
                  className={`aspect-square overflow-hidden rounded-lg ${
                    enableLightbox && !isEditing ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => openLightbox(index)}
                >
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={image.alt || ''}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={image.url}
                          onChange={(e) => handleImageChange(index, 'url', e.target.value)}
                          className="w-3/4 px-3 py-2 text-sm border border-gray-300 rounded"
                          placeholder="Image URL..."
                        />
                      ) : (
                        <Images className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                  )}
                </div>

                {showCaptions && image.caption && !isEditing && (
                  <p className="mt-2 text-sm text-gray-600 text-center">
                    {image.caption}
                  </p>
                )}

                {isEditing && showCaptions && (
                  <input
                    type="text"
                    value={image.caption || ''}
                    onChange={(e) => handleImageChange(index, 'caption', e.target.value)}
                    className="mt-2 w-full px-2 py-1 text-sm text-center border border-gray-200 rounded"
                    placeholder="Caption..."
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <Images className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No images yet</p>
            {isEditing && (
              <button
                onClick={handleAddImage}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Add Image
              </button>
            )}
          </div>
        )}

        {/* Add image button in editing mode */}
        {isEditing && images.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleAddImage}
              className="inline-flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add Image
            </button>
          </div>
        )}

        {/* Lightbox */}
        {lightboxIndex !== null && images[lightboxIndex] && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={closeLightbox}
          >
            <button
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
              className="absolute top-4 right-4 p-2 text-white hover:text-gray-300"
            >
              <X className="w-8 h-8" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox('prev'); }}
              className="absolute left-4 p-2 text-white hover:text-gray-300"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <img
              src={images[lightboxIndex].url}
              alt={images[lightboxIndex].alt || ''}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox('next'); }}
              className="absolute right-4 p-2 text-white hover:text-gray-300"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {images[lightboxIndex].caption && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-white">
                {images[lightboxIndex].caption}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
