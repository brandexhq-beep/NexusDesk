import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '../services/db';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, ShieldAlert } from 'lucide-react';

interface ImportCustomersModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

interface ParsedCustomerRow {
  rowNum: number;
  name: string;
  phone: string;
  available_minutes: number;
  wallet_balance: number;
  loyalty_points: number;
  isDuplicate: boolean;
  isMissingPhone: boolean;
  action: 'import' | 'update' | 'skip';
}

export function ImportCustomersModal({ open, onClose, onImportSuccess }: ImportCustomersModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedCustomerRow[]>([]);
  const [skipMissingPhone, setSkipMissingPhone] = useState<boolean>(true);
  const [handleDuplicateAction, setHandleDuplicateAction] = useState<'update' | 'skip'>('skip');
  const [loading, setLoading] = useState<boolean>(false);
  const [stats, setStats] = useState({ total: 0, valid: 0, duplicates: 0, missingPhone: 0 });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    await processFile(selectedFile, skipMissingPhone, handleDuplicateAction);
  };

  const processFile = async (
    targetFile: File,
    shouldSkipNoPhone: boolean,
    duplicateAction: 'update' | 'skip'
  ) => {
    try {
      setLoading(true);
      const buffer = await targetFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      const existingCustomers = await db.customers.getAll();
      const existingPhones = new Set(existingCustomers.map(c => c.phone.trim().replace(/\s+/g, '')));

      let missingPhoneCount = 0;
      let duplicateCount = 0;
      const filePhoneSet = new Set<string>();

      const rows: ParsedCustomerRow[] = rawData.map((row, index) => {
        // Flexibly locate column names
        const nameKey = Object.keys(row).find(k => /name|customer/i.test(k)) || Object.keys(row)[0];
        const phoneKey = Object.keys(row).find(k => /phone|mobile|contact|number/i.test(k));
        const minsKey = Object.keys(row).find(k => /time|minute|duration/i.test(k));
        const walletKey = Object.keys(row).find(k => /wallet|balance|amount/i.test(k));
        const pointsKey = Object.keys(row).find(k => /point|loyalty/i.test(k));

        const name = String(row[nameKey] || '').trim();
        let rawPhone = phoneKey ? String(row[phoneKey] || '').trim() : '';
        // Clean phone string
        rawPhone = rawPhone.replace(/[^\d+]/g, '');

        const available_minutes = minsKey ? Math.max(0, parseInt(row[minsKey], 10) || 0) : 0;
        const wallet_balance = walletKey ? Math.max(0, parseFloat(row[walletKey]) || 0) : 0;
        const loyalty_points = pointsKey ? Math.max(0, parseInt(row[pointsKey], 10) || 0) : 0;

        const isMissingPhone = !rawPhone;
        const isDbDuplicate = existingPhones.has(rawPhone);
        const isFileDuplicate = filePhoneSet.has(rawPhone) && rawPhone !== '';
        const isDuplicate = isDbDuplicate || isFileDuplicate;

        if (rawPhone) filePhoneSet.add(rawPhone);

        if (isMissingPhone) missingPhoneCount++;
        if (isDuplicate) duplicateCount++;

        let action: 'import' | 'update' | 'skip' = 'import';
        if (isMissingPhone && shouldSkipNoPhone) {
          action = 'skip';
        } else if (isDuplicate) {
          action = duplicateAction === 'update' ? 'update' : 'skip';
        }

        return {
          rowNum: index + 2, // Accounting for header row
          name: name || 'Unnamed Customer',
          phone: rawPhone,
          available_minutes,
          wallet_balance,
          loyalty_points,
          isDuplicate,
          isMissingPhone,
          action
        };
      }).filter(r => r.name !== 'Unnamed Customer' || r.phone !== '');

      setParsedRows(rows);
      setStats({
        total: rows.length,
        valid: rows.filter(r => r.action !== 'skip').length,
        duplicates: duplicateCount,
        missingPhone: missingPhoneCount
      });
    } catch (err) {
      console.error('Error parsing Excel file:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSkipPhone = async (checked: boolean) => {
    setSkipMissingPhone(checked);
    if (file) {
      await processFile(file, checked, handleDuplicateAction);
    }
  };

  const handleToggleDuplicateAction = async (action: 'update' | 'skip') => {
    setHandleDuplicateAction(action);
    if (file) {
      await processFile(file, skipMissingPhone, action);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;
    setLoading(true);

    try {
      const existingCustomers = await db.customers.getAll();
      const existingMap = new Map(existingCustomers.map(c => [c.phone.trim(), c]));

      let imported = 0;
      let updated = 0;

      for (const r of parsedRows) {
        if (r.action === 'skip') continue;

        const existing = r.phone ? existingMap.get(r.phone.trim()) : null;

        if (existing && r.action === 'update') {
          await db.customers.update(existing.id, {
            name: r.name || existing.name,
            available_minutes: existing.available_minutes + r.available_minutes,
            wallet_balance: existing.wallet_balance + r.wallet_balance,
            loyalty_points: existing.loyalty_points + r.loyalty_points
          });
          updated++;
        } else if (!existing && (r.phone || !skipMissingPhone)) {
          await db.customers.add({
            name: r.name,
            phone: r.phone || 'N/A',
            available_minutes: r.available_minutes,
            wallet_balance: r.wallet_balance,
            loyalty_points: r.loyalty_points
          });
          imported++;
        }
      }

      onImportSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Failed to import customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setParsedRows([]);
    setStats({ total: 0, valid: 0, duplicates: 0, missingPhone: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/10 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Import Customers from Excel / CSV
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Bulk upload customer data from Excel (.xlsx, .xls) or CSV files with smart deduplication and field mapping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Upload Drop Zone */}
          <div className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-xl p-6 text-center bg-black/20 transition-all">
            <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">
              {file ? file.name : 'Select Excel (.xlsx, .xls) or CSV file to import'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supported columns: Name, Phone, Wallet Balance, Time Minutes, Loyalty Points</p>

            <Input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
              id="excel-file-input"
            />
            <Label htmlFor="excel-file-input" className="inline-block mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-md shadow-indigo-600/20">
              {file ? 'Change File' : 'Browse File'}
            </Label>
          </div>

          {/* Import Rules & Edge Case Controls */}
          {parsedRows.length > 0 && (
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-indigo-400" /> Import Rules & Edge Case Toggles
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Missing Phone Number Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <div>
                    <div className="font-semibold text-foreground">Skip Missing Phone Numbers</div>
                    <div className="text-[10px] text-muted-foreground">Skip entries that have a name but no phone number</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={skipMissingPhone}
                    onChange={(e) => handleToggleSkipPhone(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                {/* Duplication Handler Toggle */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-semibold text-foreground">Duplicate Phone Action</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleDuplicateAction('skip')}
                      className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition-all ${
                        handleDuplicateAction === 'skip' ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-black/30 text-muted-foreground'
                      }`}
                    >
                      Skip Duplicates
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDuplicateAction('update')}
                      className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition-all ${
                        handleDuplicateAction === 'update' ? 'bg-indigo-600 text-white' : 'bg-black/30 text-muted-foreground'
                      }`}
                    >
                      Merge & Add Balance
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Validation Metrics Summary */}
          {parsedRows.length > 0 && (
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="text-muted-foreground text-[10px] uppercase font-sans">Total Rows</div>
                <div className="text-base font-bold text-foreground mt-0.5">{stats.total}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                <div className="text-emerald-400 text-[10px] uppercase font-sans">To Import</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">{stats.valid}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30">
                <div className="text-amber-400 text-[10px] uppercase font-sans">Duplicates</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">{stats.duplicates}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30">
                <div className="text-rose-400 text-[10px] uppercase font-sans">No Phone</div>
                <div className="text-base font-bold text-rose-400 mt-0.5">{stats.missingPhone}</div>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="border border-white/10 rounded-lg overflow-x-auto max-h-48 bg-black/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent text-[11px] uppercase">
                    <TableHead className="text-muted-foreground">Row</TableHead>
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Phone</TableHead>
                    <TableHead className="text-muted-foreground text-right">Time Mins</TableHead>
                    <TableHead className="text-muted-foreground text-right">Wallet</TableHead>
                    <TableHead className="text-muted-foreground text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className="border-border hover:bg-white/5 text-xs">
                      <TableCell className="font-mono text-muted-foreground">#{r.rowNum}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {r.phone || <span className="text-rose-400 italic">No Phone</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-indigo-300">{r.available_minutes}m</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">{r.wallet_balance}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.action === 'import' && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold">Import</span>
                        )}
                        {r.action === 'update' && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 font-semibold">Merge</span>
                        )}
                        {r.action === 'skip' && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 font-semibold">Skip</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 border-t border-white/10 pt-3">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-white/10">Cancel</Button>
          <Button
            onClick={handleConfirmImport}
            disabled={loading || stats.valid === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-600/20"
          >
            {loading ? 'Processing Import...' : `Import ${stats.valid} Customers`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
