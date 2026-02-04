interface PillTabItem<T extends string> {
  id: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  tabs: PillTabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
}

export default function PillTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: PillTabsProps<T>) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
