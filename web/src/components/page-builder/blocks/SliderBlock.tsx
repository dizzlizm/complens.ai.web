import { useState, useEffect, useCallback } from 'react';
import { Play, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { SliderConfig, SliderSlide } from '../types';
import ImageUploadButton from './ImageUploadButton';

interface SliderBlockProps {
  config: SliderConfig;
  isEditing?: boolean;
  onConfigChange?: (config: SliderConfig) => void;
  workspaceId?: string;
}

export default function SliderBlock({ config, isEditing, onConfigChange, workspaceId }: SliderBlockProps) {
  const {
    slides = [],
    autoplay = true,
    autoplayInterval = 5000,
    showDots = true,
    showArrows = true,
  } = config;

  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-advance slides
  useEffect(() => {
    if (!autoplay || isEditing || slides.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, autoplayInterval);

    return () => clearInterval(timer);
  }, [autoplay, autoplayInterval, slides.length, isEditing]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleSlideChange = (index: number, field: keyof SliderSlide, value: string) => {
    if (onConfigChange) {
      const newSlides = [...slides];
      newSlides[index] = { ...newSlides[index], [field]: value };
      onConfigChange({ ...config, slides: newSlides });
    }
  };

  const handleAddSlide = () => {
    if (onConfigChange) {
      const newSlides = [...slides, { imageUrl: '', headline: '', description: '' }];
      onConfigChange({ ...config, slides: newSlides });
      setCurrentSlide(newSlides.length - 1);
    }
  };

  const handleRemoveSlide = (index: number) => {
    if (onConfigChange) {
      const newSlides = slides.filter((_, i) => i !== index);
      onConfigChange({ ...config, slides: newSlides });
      if (currentSlide >= newSlides.length) {
        setCurrentSlide(Math.max(0, newSlides.length - 1));
      }
    }
  };

  if (slides.length === 0) {
    return (
      <div className="py-12 px-8 bg-gray-100">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-300">
          <Play className="w-16 h-16 text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No slides yet</p>
          {isEditing && (
            <button
              onClick={handleAddSlide}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Add Slide
            </button>
          )}
        </div>
      </div>
    );
  }

  const slide = slides[currentSlide];

  return (
    <div className="relative overflow-hidden bg-gray-900">
      {/* Slides */}
      <div className="relative aspect-[16/9] max-h-[600px]">
        {/* Background Image */}
        {slide?.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt={slide.headline || ''}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-purple-900" />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
          {isEditing && (
            <button
              onClick={() => handleRemoveSlide(currentSlide)}
              className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {(slide?.headline || isEditing) && (
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 max-w-3xl">
              {isEditing ? (
                <input
                  type="text"
                  value={slide?.headline || ''}
                  onChange={(e) => handleSlideChange(currentSlide, 'headline', e.target.value)}
                  className="w-full bg-transparent text-center border-none focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
                  placeholder="Slide headline..."
                />
              ) : (
                slide?.headline
              )}
            </h2>
          )}

          {(slide?.description || isEditing) && (
            <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl">
              {isEditing ? (
                <input
                  type="text"
                  value={slide?.description || ''}
                  onChange={(e) => handleSlideChange(currentSlide, 'description', e.target.value)}
                  className="w-full bg-transparent text-center border-none focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
                  placeholder="Slide description..."
                />
              ) : (
                slide?.description
              )}
            </p>
          )}

          {(slide?.buttonText || isEditing) && (
            <div>
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={slide?.buttonText || ''}
                    onChange={(e) => handleSlideChange(currentSlide, 'buttonText', e.target.value)}
                    className="px-4 py-2 bg-white/20 text-white border border-white/30 rounded-lg"
                    placeholder="Button text..."
                  />
                  <input
                    type="text"
                    value={slide?.buttonLink || ''}
                    onChange={(e) => handleSlideChange(currentSlide, 'buttonLink', e.target.value)}
                    className="px-4 py-2 bg-white/20 text-white border border-white/30 rounded-lg"
                    placeholder="Button link..."
                  />
                </div>
              ) : (
                slide?.buttonText && (
                  <a
                    href={slide?.buttonLink || '#'}
                    className="inline-block px-8 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {slide?.buttonText}
                  </a>
                )
              )}
            </div>
          )}

          {/* Image URL input + upload for editing */}
          {isEditing && (
            <div className="mt-6 w-full max-w-lg flex items-center gap-2">
              {workspaceId && (
                <ImageUploadButton
                  workspaceId={workspaceId}
                  onUploaded={(url) => handleSlideChange(currentSlide, 'imageUrl', url)}
                  label="Upload"
                  className="text-white border-white/30 hover:bg-white/20"
                />
              )}
              <input
                type="text"
                value={slide?.imageUrl || ''}
                onChange={(e) => handleSlideChange(currentSlide, 'imageUrl', e.target.value)}
                className="flex-1 px-4 py-2 bg-white/20 text-white border border-white/30 rounded-lg"
                placeholder="or paste background image URL..."
              />
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        {showArrows && slides.length > 1 && (
          <>
            <button
              onClick={prevSlide}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Dots Navigation */}
      {showDots && slides.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentSlide
                  ? 'bg-white'
                  : 'bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}

      {/* Add slide button in editing mode */}
      {isEditing && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={handleAddSlide}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30"
          >
            <Plus className="w-4 h-4" />
            Add Slide
          </button>
        </div>
      )}
    </div>
  );
}
