import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Modal, { ModalFooter } from '../ui/Modal';
import type { ImportResult } from '../../lib/hooks/useContacts';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { csv_data: string; mapping: Record<string, string> }) => Promise<ImportResult>;
  isImporting: boolean;
}

const CONTACT_FIELDS = [
  { value: '', label: '-- Skip --' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags (comma-separated)' },
];

type Step = 'upload' | 'mapping' | 'results';

export default function CSVImportModal({ isOpen, onClose, onImport, isImporting }: CSVImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvData, setCsvData] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setCsvData('');
    setHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setResults(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      setCsvData(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    // Simple CSV parsing (handles quoted fields)
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const parsedHeaders = parseLine(lines[0]);
    setHeaders(parsedHeaders);

    // Preview first 5 data rows
    const preview = lines.slice(1, 6).map(parseLine);
    setPreviewRows(preview);

    // Auto-map obvious fields
    const autoMapping: Record<string, string> = {};
    parsedHeaders.forEach((header) => {
      const lower = header.toLowerCase().replace(/[_\s-]/g, '');
      if (lower.includes('email')) autoMapping[header] = 'email';
      else if (lower.includes('phone') || lower.includes('mobile')) autoMapping[header] = 'phone';
      else if (lower === 'firstname' || lower === 'first') autoMapping[header] = 'first_name';
      else if (lower === 'lastname' || lower === 'last') autoMapping[header] = 'last_name';
      else if (lower === 'source') autoMapping[header] = 'source';
      else if (lower === 'status') autoMapping[header] = 'status';
      else if (lower === 'tags' || lower === 'tag') autoMapping[header] = 'tags';
    });
    setMapping(autoMapping);
    setStep('mapping');
  };

  const handleImport = async () => {
    // Filter out unmapped columns
    const activeMapping: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field) activeMapping[col] = field;
    }

    if (Object.keys(activeMapping).length === 0) return;

    try {
      const result = await onImport({ csv_data: csvData, mapping: activeMapping });
      setResults(result);
      setStep('results');
    } catch {
      // Error handled by parent
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Contacts" size="lg">
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
          >
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Click to upload a CSV file</p>
            <p className="text-xs text-gray-500 mt-1">CSV files with headers in the first row</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-xs text-gray-500">
            <p className="font-medium mb-1">Expected format:</p>
            <code className="block bg-gray-50 rounded p-2">
              email,first_name,last_name,phone,tags<br/>
              john@example.com,John,Doe,+15551234567,"lead,vip"
            </code>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Map CSV columns to contact fields. Found <strong>{previewRows.length}</strong> rows to preview.
          </p>

          {/* Column mapping */}
          <div className="space-y-3">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3">
                <div className="w-1/3">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    {header}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">&rarr;</span>
                <select
                  value={mapping[header] || ''}
                  onChange={(e) => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                  className="input flex-1"
                >
                  {CONTACT_FIELDS.map((field) => (
                    <option key={field.value} value={field.value}>{field.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Preview</h4>
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 text-gray-700 truncate max-w-[150px]">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ModalFooter>
            <button onClick={handleClose} className="btn btn-secondary">Cancel</button>
            <button
              onClick={handleImport}
              disabled={isImporting || Object.values(mapping).every(v => !v)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isImporting ? 'Importing...' : 'Import Contacts'}
            </button>
          </ModalFooter>
        </div>
      )}

      {step === 'results' && results && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Import Complete</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{results.imported}</div>
              <div className="text-sm text-green-600">Imported</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-700">{results.skipped}</div>
              <div className="text-sm text-yellow-600">Skipped</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-700">{results.errors.length}</div>
              <div className="text-sm text-red-600">Errors</div>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800 mb-2">
                <AlertTriangle className="w-4 h-4" />
                Errors
              </div>
              <ul className="text-xs text-red-600 space-y-1">
                {results.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.error}</li>
                ))}
                {results.errors.length > 10 && (
                  <li>...and {results.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          <ModalFooter>
            <button onClick={handleClose} className="btn btn-primary">Done</button>
          </ModalFooter>
        </div>
      )}
    </Modal>
  );
}
