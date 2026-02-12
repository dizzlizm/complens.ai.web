import { useState } from 'react';
import { ChevronDown, HelpCircle, Plus, X } from 'lucide-react';
import { FaqConfig, FaqItem } from '../types';

interface FaqBlockProps {
  config: FaqConfig;
  isEditing?: boolean;
  onConfigChange?: (config: FaqConfig) => void;
}

export default function FaqBlock({ config, isEditing, onConfigChange }: FaqBlockProps) {
  const {
    title = 'Frequently Asked Questions',
    items = [],
  } = config;

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleTitleChange = (newTitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, title: newTitle });
    }
  };

  const handleItemChange = (index: number, field: keyof FaqItem, value: string) => {
    if (onConfigChange) {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onConfigChange({ ...config, items: newItems });
    }
  };

  const handleAddItem = () => {
    if (onConfigChange) {
      const newItem: FaqItem = {
        question: 'New question?',
        answer: 'Answer goes here...',
      };
      onConfigChange({ ...config, items: [...items, newItem] });
      // Open the newly added item
      setOpenIndex(items.length);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (onConfigChange) {
      const newItems = items.filter((_, i) => i !== index);
      onConfigChange({ ...config, items: newItems });
      // Reset open index if needed
      if (openIndex === index) {
        setOpenIndex(null);
      } else if (openIndex !== null && openIndex > index) {
        setOpenIndex(openIndex - 1);
      }
    }
  };

  return (
    <div className="py-16 px-8 bg-white">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-3xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center hover:border-b hover:border-dashed hover:border-gray-300 focus:border-b-2 focus:border-solid focus:border-indigo-400"
              placeholder="Section title..."
            />
          ) : (
            <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
          )}
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg overflow-hidden relative group"
            >
              {/* Remove button */}
              {isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveItem(index);
                  }}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                  title="Remove FAQ item"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                className="w-full flex items-center justify-between p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => handleItemChange(index, 'question', e.target.value)}
                    className="flex-1 font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded hover:border-b hover:border-dashed hover:border-gray-300 focus:border-b-2 focus:border-solid focus:border-indigo-400"
                    placeholder="Question..."
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="font-medium text-gray-900">{item.question}</span>
                )}
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ml-2 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openIndex === index && (
                <div className="p-4 bg-white">
                  {isEditing ? (
                    <textarea
                      value={item.answer}
                      onChange={(e) => handleItemChange(index, 'answer', e.target.value)}
                      className="w-full text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded resize-none hover:border-b hover:border-dashed hover:border-gray-300 focus:border-b-2 focus:border-solid focus:border-indigo-400"
                      placeholder="Answer..."
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-600">{item.answer}</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add FAQ button */}
          {isEditing && (
            <button
              onClick={handleAddItem}
              className="w-full p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500 font-medium">Add FAQ Item</span>
            </button>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No FAQ items added yet. Configure this block to add questions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
