import { Quote, User, Plus, X } from 'lucide-react';
import { TestimonialsConfig, TestimonialItem } from '../types';

interface TestimonialsBlockProps {
  config: TestimonialsConfig;
  isEditing?: boolean;
  onConfigChange?: (config: TestimonialsConfig) => void;
}

export default function TestimonialsBlock({ config, isEditing, onConfigChange }: TestimonialsBlockProps) {
  const {
    title = 'What Our Customers Say',
    items = [],
  } = config;

  const handleTitleChange = (newTitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, title: newTitle });
    }
  };

  const handleItemChange = (index: number, field: keyof TestimonialItem, value: string) => {
    if (onConfigChange) {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onConfigChange({ ...config, items: newItems });
    }
  };

  const handleAddItem = () => {
    if (onConfigChange) {
      const newItem: TestimonialItem = {
        quote: 'New testimonial quote...',
        author: 'Customer Name',
        company: 'Company Name',
        avatar: '',
      };
      onConfigChange({ ...config, items: [...items, newItem] });
    }
  };

  const handleRemoveItem = (index: number) => {
    if (onConfigChange) {
      const newItems = items.filter((_, i) => i !== index);
      onConfigChange({ ...config, items: newItems });
    }
  };

  return (
    <div className="py-16 px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-3xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
              placeholder="Section title..."
            />
          ) : (
            <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
          )}
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 relative group"
            >
              {/* Remove button */}
              {isEditing && (
                <button
                  onClick={() => handleRemoveItem(index)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                  title="Remove testimonial"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <Quote className="w-8 h-8 text-indigo-200 mb-4" />

              {isEditing ? (
                <textarea
                  value={item.quote}
                  onChange={(e) => handleItemChange(index, 'quote', e.target.value)}
                  className="w-full text-gray-700 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded resize-none mb-6"
                  placeholder="Customer quote..."
                  rows={3}
                />
              ) : (
                <p className="text-gray-700 mb-6 italic">"{item.quote}"</p>
              )}

              <div className="flex items-center gap-3">
                {item.avatar ? (
                  <img
                    src={item.avatar}
                    alt={item.author}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={item.author}
                        onChange={(e) => handleItemChange(index, 'author', e.target.value)}
                        className="w-full font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-sm"
                        placeholder="Author name..."
                      />
                      <input
                        type="text"
                        value={item.company}
                        onChange={(e) => handleItemChange(index, 'company', e.target.value)}
                        className="w-full text-gray-500 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-sm"
                        placeholder="Company name..."
                      />
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900 text-sm">{item.author}</p>
                      <p className="text-gray-500 text-sm">{item.company}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add testimonial button */}
          {isEditing && (
            <button
              onClick={handleAddItem}
              className="bg-gray-50 rounded-xl p-6 border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors flex flex-col items-center justify-center gap-2 min-h-[200px]"
            >
              <Plus className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-500 font-medium">Add Testimonial</span>
            </button>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Quote className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No testimonials added yet. Configure this block to add customer quotes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
