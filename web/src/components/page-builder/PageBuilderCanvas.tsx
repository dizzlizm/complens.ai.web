import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  UniqueIdentifier,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Layers, Plus, Sparkles } from 'lucide-react';

import BlockToolbar from './BlockToolbar';
import BlockWrapper from './BlockWrapper';
import BlockConfigPanel from './BlockConfigPanel';
import AIBlockGenerator from './AIBlockGenerator';
import { PageBlock, createBlock, BlockType, getBlockTypeInfo } from './types';

// Block components
import HeroBlock from './blocks/HeroBlock';
import FeaturesBlock from './blocks/FeaturesBlock';
import CtaBlock from './blocks/CtaBlock';
import FormBlock from './blocks/FormBlock';
import TestimonialsBlock from './blocks/TestimonialsBlock';
import FaqBlock from './blocks/FaqBlock';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import StatsBlock from './blocks/StatsBlock';
import DividerBlock from './blocks/DividerBlock';
import PricingBlock from './blocks/PricingBlock';
import VideoBlock from './blocks/VideoBlock';
import ChatBlock from './blocks/ChatBlock';

// Form data for the form block selector
interface FormInfo {
  id: string;
  name: string;
  fields?: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
}

interface PageBuilderCanvasProps {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
  forms?: FormInfo[];
  pageHeadline?: string;
  pageSubheadline?: string;
}

// Droppable Canvas Zone component
function CanvasDropZone({
  children,
  isEmpty,
  isOver,
  onShowAIGenerator,
}: {
  children: React.ReactNode;
  isEmpty: boolean;
  isOver: boolean;
  onShowAIGenerator?: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: 'canvas-drop-zone',
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto p-6 transition-colors ${
        isOver ? 'bg-indigo-50' : ''
      }`}
    >
      {isEmpty ? (
        <div className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-colors ${
          isOver ? 'border-indigo-400 bg-indigo-100/50' : 'border-gray-300'
        }`}>
          <Layers className={`w-16 h-16 mb-4 transition-colors ${isOver ? 'text-indigo-500' : 'text-gray-300'}`} />
          <p className={`text-lg font-medium mb-2 ${isOver ? 'text-indigo-600' : 'text-gray-400'}`}>
            {isOver ? 'Drop to add block' : 'No blocks yet'}
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Drag blocks from the left panel or let AI build your page
          </p>
          {!isOver && onShowAIGenerator && (
            <button
              onClick={onShowAIGenerator}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-500/25"
            >
              <Sparkles className="w-5 h-5" />
              Build with AI
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function PageBuilderCanvas({
  blocks,
  onChange,
  forms = [],
  pageHeadline,
  pageSubheadline,
}: PageBuilderCanvasProps) {
  // Build page context for AI
  const pageContext = {
    headline: pageHeadline,
    subheadline: pageSubheadline,
    other_blocks: blocks.map(b => b.type),
  };
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setIsOverCanvas(over?.id === 'canvas-drop-zone' || blocks.some(b => b.id === over?.id));
  }, [blocks]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setIsOverCanvas(false);

      // Check if dragging a new block from toolbar
      const isNewBlock = String(active.id).startsWith('new-');

      if (isNewBlock) {
        // Only create if dropped on a valid target
        if (!over) return;

        const blockType = active.data.current?.type as BlockType;
        const newBlock = createBlock(blockType);

        // Find insert position
        let insertIndex = blocks.length;

        if (over.id !== 'canvas-drop-zone') {
          const overIndex = blocks.findIndex((b) => b.id === over.id);
          if (overIndex >= 0) {
            insertIndex = overIndex + 1;
          }
        }

        const newBlocks = [...blocks];
        newBlocks.splice(insertIndex, 0, newBlock);

        // Update order values
        newBlocks.forEach((b, i) => (b.order = i));
        onChange(newBlocks);

        // Select the new block
        setSelectedBlockId(newBlock.id);
      } else {
        // Reorder existing blocks
        if (over && active.id !== over.id && over.id !== 'canvas-drop-zone') {
          const oldIndex = blocks.findIndex((b) => b.id === active.id);
          const newIndex = blocks.findIndex((b) => b.id === over.id);

          if (oldIndex !== -1 && newIndex !== -1) {
            const newBlocks = arrayMove(blocks, oldIndex, newIndex);
            newBlocks.forEach((b, i) => (b.order = i));
            onChange(newBlocks);
          }
        }
      }
    },
    [blocks, onChange]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setIsOverCanvas(false);
  }, []);

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      const newBlocks = blocks.filter((b) => b.id !== blockId);
      newBlocks.forEach((b, i) => (b.order = i));
      onChange(newBlocks);
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
    },
    [blocks, onChange, selectedBlockId]
  );

  const handleDuplicateBlock = useCallback(
    (blockId: string) => {
      const blockToDuplicate = blocks.find((b) => b.id === blockId);
      if (!blockToDuplicate) return;

      const newBlock: PageBlock = {
        ...blockToDuplicate,
        id: Math.random().toString(36).substring(2, 10),
        config: { ...blockToDuplicate.config },
      };

      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      const newBlocks = [...blocks];
      newBlocks.splice(blockIndex + 1, 0, newBlock);
      newBlocks.forEach((b, i) => (b.order = i));

      onChange(newBlocks);
      setSelectedBlockId(newBlock.id);
    },
    [blocks, onChange]
  );

  const handleConfigChange = useCallback(
    (config: Record<string, unknown>) => {
      if (!selectedBlockId) return;

      const newBlocks = blocks.map((b) =>
        b.id === selectedBlockId ? { ...b, config } : b
      );
      onChange(newBlocks);
    },
    [blocks, onChange, selectedBlockId]
  );

  const handleWidthChange = useCallback(
    (width: 1 | 2 | 3 | 4) => {
      if (!selectedBlockId) return;

      const newBlocks = blocks.map((b) =>
        b.id === selectedBlockId ? { ...b, width } : b
      );
      onChange(newBlocks);
    },
    [blocks, onChange, selectedBlockId]
  );

  // Quick add block (click instead of drag)
  const handleQuickAdd = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    const newBlocks = [...blocks, newBlock];
    newBlocks.forEach((b, i) => (b.order = i));
    onChange(newBlocks);
    setSelectedBlockId(newBlock.id);
  }, [blocks, onChange]);

  // Handle AI-generated blocks
  const handleAIGenerate = useCallback((generatedBlocks: PageBlock[]) => {
    // Replace all blocks with generated ones
    const newBlocks = generatedBlocks.map((b, i) => ({ ...b, order: i }));
    onChange(newBlocks);
    setShowAIGenerator(false);
    // Select the first block
    if (newBlocks.length > 0) {
      setSelectedBlockId(newBlocks[0].id);
    }
  }, [onChange]);

  const renderBlock = (block: PageBlock, isOverlay = false) => {
    const props = {
      config: block.config as any,
      isEditing: selectedBlockId === block.id && !isOverlay,
      onConfigChange: (config: any) => {
        const newBlocks = blocks.map((b) =>
          b.id === block.id ? { ...b, config } : b
        );
        onChange(newBlocks);
      },
    };

    switch (block.type) {
      case 'hero':
        return <HeroBlock {...props} />;
      case 'features':
        return <FeaturesBlock {...props} />;
      case 'cta':
        return <CtaBlock {...props} />;
      case 'form':
        return <FormBlock {...props} forms={forms} />;
      case 'testimonials':
        return <TestimonialsBlock {...props} />;
      case 'faq':
        return <FaqBlock {...props} />;
      case 'text':
        return <TextBlock {...props} />;
      case 'image':
        return <ImageBlock {...props} />;
      case 'stats':
        return <StatsBlock {...props} />;
      case 'divider':
        return <DividerBlock config={block.config as any} />;
      case 'pricing':
        return <PricingBlock {...props} />;
      case 'video':
        return <VideoBlock {...props} />;
      case 'chat':
        return <ChatBlock {...props} />;
      default:
        return (
          <div className="p-8 bg-gray-100 text-gray-500 text-center">
            Unknown block type: {block.type}
          </div>
        );
    }
  };

  const activeBlock = activeId
    ? blocks.find((b) => b.id === activeId)
    : null;

  const activeTypeInfo = activeId && String(activeId).startsWith('new-')
    ? getBlockTypeInfo(String(activeId).replace('new-', '') as BlockType)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-[calc(100vh-280px)] min-h-[600px] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        {/* Left Toolbar */}
        <BlockToolbar onQuickAdd={handleQuickAdd} />

        {/* Main Canvas */}
        <CanvasDropZone
          isEmpty={blocks.length === 0}
          isOver={isOverCanvas && !!activeId}
          onShowAIGenerator={() => setShowAIGenerator(true)}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {/* Grid layout - 4 column system */}
            <div className="grid grid-cols-4 gap-4">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={`col-span-${block.width || 4}`}
                  style={{ gridColumn: `span ${block.width || 4}` }}
                >
                  <BlockWrapper
                    block={block}
                    isSelected={selectedBlockId === block.id}
                    onSelect={() => setSelectedBlockId(block.id)}
                    onDelete={() => handleDeleteBlock(block.id)}
                    onDuplicate={() => handleDuplicateBlock(block.id)}
                  >
                    {renderBlock(block)}
                  </BlockWrapper>
                </div>
              ))}
            </div>
          </SortableContext>

          {/* Add block button at bottom */}
          {blocks.length > 0 && (
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => handleQuickAdd('text')}
                className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add block
              </button>
              <button
                onClick={() => setShowAIGenerator(true)}
                className="flex items-center gap-2 px-4 py-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                AI Generate
              </button>
            </div>
          )}
        </CanvasDropZone>

        {/* Right Config Panel */}
        {selectedBlock && (
          <BlockConfigPanel
            block={selectedBlock}
            onConfigChange={handleConfigChange}
            onWidthChange={handleWidthChange}
            onClose={() => setSelectedBlockId(null)}
            forms={forms}
            pageContext={pageContext}
          />
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeBlock && (
          <div className="opacity-80 shadow-2xl rounded-lg overflow-hidden max-w-2xl">
            {renderBlock(activeBlock, true)}
          </div>
        )}
        {activeTypeInfo && (
          <div className="bg-white border-2 border-indigo-500 rounded-lg p-4 shadow-2xl min-w-[200px]">
            <p className="font-medium text-gray-900">{activeTypeInfo.label}</p>
            <p className="text-sm text-gray-500">{activeTypeInfo.description}</p>
          </div>
        )}
      </DragOverlay>

      {/* AI Block Generator Modal */}
      {showAIGenerator && (
        <AIBlockGenerator
          onGenerate={handleAIGenerate}
          onClose={() => setShowAIGenerator(false)}
        />
      )}
    </DndContext>
  );
}
