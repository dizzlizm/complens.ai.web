import { DividerConfig } from '../types';

interface DividerBlockProps {
  config: DividerConfig;
}

export default function DividerBlock({ config }: DividerBlockProps) {
  const {
    style = 'line',
    height = 'medium',
  } = config;

  const heightClass = {
    small: 'py-4',
    medium: 'py-8',
    large: 'py-12',
  }[height];

  return (
    <div className={`${heightClass} px-8 bg-white`}>
      <div className="max-w-4xl mx-auto">
        {style === 'line' && (
          <hr className="border-gray-200" />
        )}
        {style === 'dots' && (
          <div className="flex justify-center gap-2">
            <span className="w-2 h-2 bg-gray-300 rounded-full" />
            <span className="w-2 h-2 bg-gray-300 rounded-full" />
            <span className="w-2 h-2 bg-gray-300 rounded-full" />
          </div>
        )}
        {style === 'space' && (
          <div className="h-4" />
        )}
      </div>
    </div>
  );
}
