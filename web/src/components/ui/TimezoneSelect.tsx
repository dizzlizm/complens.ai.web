import { useState, useMemo } from 'react';
import { ChevronDown, Search, Globe } from 'lucide-react';

// Comprehensive list of timezones with friendly names
const TIMEZONES = [
  // Americas
  { value: 'America/New_York', label: 'Eastern Time', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Chicago', label: 'Central Time', region: 'Americas', offset: 'UTC-6' },
  { value: 'America/Denver', label: 'Mountain Time', region: 'Americas', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', region: 'Americas', offset: 'UTC-8' },
  { value: 'America/Anchorage', label: 'Alaska Time', region: 'Americas', offset: 'UTC-9' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', region: 'Americas', offset: 'UTC-10' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)', region: 'Americas', offset: 'UTC-7' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Vancouver', label: 'Vancouver', region: 'Americas', offset: 'UTC-8' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas', offset: 'UTC-6' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo', region: 'Americas', offset: 'UTC-3' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires', region: 'Americas', offset: 'UTC-3' },
  { value: 'America/Lima', label: 'Lima', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Bogota', label: 'Bogota', region: 'Americas', offset: 'UTC-5' },

  // Europe
  { value: 'Europe/London', label: 'London (GMT)', region: 'Europe', offset: 'UTC+0' },
  { value: 'Europe/Paris', label: 'Paris (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Rome', label: 'Rome', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Zurich', label: 'Zurich', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Stockholm', label: 'Stockholm', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Warsaw', label: 'Warsaw', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Athens', label: 'Athens', region: 'Europe', offset: 'UTC+2' },
  { value: 'Europe/Helsinki', label: 'Helsinki', region: 'Europe', offset: 'UTC+2' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe', offset: 'UTC+3' },
  { value: 'Europe/Istanbul', label: 'Istanbul', region: 'Europe', offset: 'UTC+3' },

  // Asia & Pacific
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia', offset: 'UTC+4' },
  { value: 'Asia/Karachi', label: 'Karachi', region: 'Asia', offset: 'UTC+5' },
  { value: 'Asia/Kolkata', label: 'Mumbai/Delhi (IST)', region: 'Asia', offset: 'UTC+5:30' },
  { value: 'Asia/Dhaka', label: 'Dhaka', region: 'Asia', offset: 'UTC+6' },
  { value: 'Asia/Bangkok', label: 'Bangkok', region: 'Asia', offset: 'UTC+7' },
  { value: 'Asia/Jakarta', label: 'Jakarta', region: 'Asia', offset: 'UTC+7' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Shanghai', label: 'Shanghai/Beijing', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Taipei', label: 'Taipei', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia', offset: 'UTC+9' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia', offset: 'UTC+9' },

  // Australia & Pacific
  { value: 'Australia/Perth', label: 'Perth', region: 'Pacific', offset: 'UTC+8' },
  { value: 'Australia/Adelaide', label: 'Adelaide', region: 'Pacific', offset: 'UTC+9:30' },
  { value: 'Australia/Brisbane', label: 'Brisbane', region: 'Pacific', offset: 'UTC+10' },
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Pacific', offset: 'UTC+10' },
  { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Pacific', offset: 'UTC+10' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Pacific', offset: 'UTC+12' },

  // Africa & Middle East
  { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa', offset: 'UTC+2' },
  { value: 'Africa/Lagos', label: 'Lagos', region: 'Africa', offset: 'UTC+1' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa', offset: 'UTC+2' },
  { value: 'Africa/Nairobi', label: 'Nairobi', region: 'Africa', offset: 'UTC+3' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem', region: 'Africa', offset: 'UTC+2' },
  { value: 'Asia/Riyadh', label: 'Riyadh', region: 'Africa', offset: 'UTC+3' },

  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', region: 'UTC', offset: 'UTC+0' },
];

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function TimezoneSelect({ value, onChange, className = '' }: TimezoneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredTimezones = useMemo(() => {
    if (!search) return TIMEZONES;
    const searchLower = search.toLowerCase();
    return TIMEZONES.filter(
      (tz) =>
        tz.label.toLowerCase().includes(searchLower) ||
        tz.value.toLowerCase().includes(searchLower) ||
        tz.region.toLowerCase().includes(searchLower)
    );
  }, [search]);

  const groupedTimezones = useMemo(() => {
    const groups: Record<string, typeof TIMEZONES> = {};
    filteredTimezones.forEach((tz) => {
      if (!groups[tz.region]) {
        groups[tz.region] = [];
      }
      groups[tz.region].push(tz);
    });
    return groups;
  }, [filteredTimezones]);

  const selectedTimezone = TIMEZONES.find((tz) => tz.value === value);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input w-full flex items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 truncate">
          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="truncate">
            {selectedTimezone ? selectedTimezone.label : 'Select timezone'}
          </span>
          {selectedTimezone && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              ({selectedTimezone.offset})
            </span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search timezones..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Timezone list */}
            <div className="overflow-y-auto max-h-60">
              {Object.entries(groupedTimezones).map(([region, timezones]) => (
                <div key={region}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                    {region}
                  </div>
                  {timezones.map((tz) => (
                    <button
                      key={tz.value}
                      type="button"
                      onClick={() => {
                        onChange(tz.value);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                        value === tz.value ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                      }`}
                    >
                      <span>{tz.label}</span>
                      <span className="text-xs text-gray-400">{tz.offset}</span>
                    </button>
                  ))}
                </div>
              ))}
              {filteredTimezones.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No timezones found
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
