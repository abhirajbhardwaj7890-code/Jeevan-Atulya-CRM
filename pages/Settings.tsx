import React, { useState } from 'react';
import { AppSettings, Member, AccountType, Account, AccountStatus } from '../types';
import { createAccount, upsertMember, upsertAccount, upsertTransaction } from '../services/data';
import { Save, AlertTriangle, Percent, Loader, FileText, Upload, Database, CheckCircle, AlertCircle, Download, Settings } from 'lucide-react';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => Promise<void>;
  members?: Member[]; // Added for validation
  onImportSuccess?: () => void;
}

// --- CSV Parsing Utility ---
const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Basic splitting handling comma inside quotes
    const splitRow = (row: string) => {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < row.length; i++) {
            const c = row[i];
            if (c === '"') { inQuote = !inQuote; continue; }
            if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
            else { cur += c; }
        }
        result.push(cur.trim());
        return result;
    };

    const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[\s_]+/g, ''));
    const rows = lines.slice(1).map(l => {
        const values = splitRow(l);
        const obj: any = {};
        headers.forEach((h, i) => {
            obj[h] = values[i];
        });
        return obj;
    });

    return { headers, rows };
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings, members = [], onImportSuccess }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'import'>('config');
  const [form, setForm] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  
  // Import State
  const [importType, setImportType] = useState<'members' | 'accounts'>('members');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  // --- Configuration Logic ---
  const handleSave = async () => {
      setIsSaving(true);
      try {
          await onUpdateSettings(form);
          alert("Settings saved successfully to Database!");
      } catch (err: any) {
          console.error(err);
          alert(`Failed to save settings: ${err.message || "Unknown Error"}`);
      } finally {
          setIsSaving(false);
      }
  };

  const updateRate = (category: keyof AppSettings['interestRates'], value: number) => {
      setForm({ ...form, interestRates: { ...form.interestRates, [category]: value } });
  };

  const updateLoanRate = (type: keyof AppSettings['interestRates']['loan'], value: number) => {
      setForm({ ...form, interestRates: { ...form.interestRates, loan: { ...form.interestRates.loan, [type]: value } } });
  };

  // --- Import Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const { rows } = parseCSV(text);
          validateData(rows);
      };
      reader.readAsText(file);
  };

  const validateData = (rows: any[]) => {
      const errors: string[] = [];
      const validRows: any[] = [];

      rows.forEach((row, idx) => {
          const rowNum = idx + 2; // header is 1
          if (importType === 'members') {
              // Required: fullname, phone, joindate
              if (!row.fullname || !row.phone || !row.joindate) {
                  errors.push(`Row ${rowNum}: Missing Name, Phone or Join Date`);
              } else if (members.some(m => m.phone === row.phone)) {
                   errors.push(`Row ${rowNum}: Member with phone ${row.phone} already exists`);
              } else {
                  validRows.push(row);
              }
          } else {
              // Accounts
              // Required: memberphone, accounttype, openingbalance, openingdate
              if (!row.memberphone || !row.accounttype || !row.openingbalance) {
                  errors.push(`Row ${rowNum}: Missing Member Phone, Type or Balance`);
              } else {
                  const memberExists = members.find(m => m.phone === row.memberphone || m.id === row.memberphone);
                  if (!memberExists) {
                      errors.push(`Row ${rowNum}: Member with phone/ID ${row.memberphone} not found`);
                  } else {
                      validRows.push({ ...row, memberId: memberExists.id });
                  }
              }
          }
      });

      setValidationErrors(errors);
      setPreviewData(validRows);
  };

  const executeImport = async () => {
      if (previewData.length === 0) return;
      setIsImporting(true);
      let count = 0;

      try {
          if (importType === 'members') {
              for (const row of previewData) {
                  const newMember: Member = {
                      id: row.legacyid || `MEM-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                      fullName: row.fullname,
                      phone: row.phone,
                      email: row.email || '',
                      fatherName: row.fathername,
                      currentAddress: row.address,
                      permanentAddress: row.address,
                      joinDate: row.joindate, // Historical Date
                      status: 'Active',
                      avatarUrl: `https://ui-avatars.com/api/?name=${row.fullname.replace(' ', '+')}`,
                      riskScore: 0
                  };
                  await upsertMember(newMember);
                  count++;
              }
          } else {
              for (const row of previewData) {
                  // Map CSV Account Type string to Enum
                  let type = AccountType.OPTIONAL_DEPOSIT;
                  const inputType = row.accounttype.toLowerCase();
                  if (inputType.includes('share')) type = AccountType.SHARE_CAPITAL;
                  else if (inputType.includes('compulsory')) type = AccountType.COMPULSORY_DEPOSIT;
                  else if (inputType.includes('fixed')) type = AccountType.FIXED_DEPOSIT;
                  else if (inputType.includes('recurring')) type = AccountType.RECURRING_DEPOSIT;
                  else if (inputType.includes('loan')) type = AccountType.LOAN;
                  
                  // Use helper but Override transactions to set historical date
                  const balance = parseFloat(row.openingbalance) || 0;
                  const newAcc = createAccount(row.memberId, type, balance, undefined, undefined, settings);
                  
                  // Override Opening Transaction Date
                  if (row.openingdate && newAcc.transactions.length > 0) {
                      newAcc.transactions[0].date = row.openingdate;
                      newAcc.transactions[0].description = "Opening Balance (Imported)";
                  }

                  await upsertAccount(newAcc);
                  await upsertTransaction(newAcc.transactions[0], newAcc.id);
                  count++;
              }
          }
          
          setSuccessCount(count);
          setPreviewData([]);
          setValidationErrors([]);
          if (onImportSuccess) onImportSuccess();
          alert(`Successfully imported ${count} records!`);
      } catch (err) {
          console.error(err);
          alert("Import failed partially. Check console.");
      } finally {
          setIsImporting(false);
      }
  };

  const downloadTemplate = () => {
      let content = "";
      if (importType === 'members') {
          content = "legacy_id,full_name,phone,join_date,address,father_name,email\n1001,John Doe,9876543210,2022-01-15,123 Main St,Father Doe,john@example.com";
      } else {
          content = "member_phone,account_type,opening_balance,opening_date\n9876543210,Share Capital,500,2022-01-15\n9876543210,Optional Deposit,5000,2022-02-01";
      }
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${importType}_template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in max-w-5xl pb-10">
      <div className="mb-6 flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
           <p className="text-slate-500 text-sm">Configure system parameters and manage data.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200 mb-6">
          <button 
             onClick={() => setActiveTab('config')} 
             className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'config' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
          >
             <Settings size={16}/> System Configuration
          </button>
          <button 
             onClick={() => setActiveTab('import')} 
             className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'import' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
          >
             <Database size={16}/> Data Management (Bulk Import)
          </button>
      </div>

      {activeTab === 'config' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
             <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <h3 className="font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Fees & Commissions</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Late Payment Fine</label>
                          <input 
                              type="number"
                              className="border border-slate-300 bg-white text-slate-900 rounded-lg p-2 w-full"
                              value={form.latePaymentFine}
                              onChange={(e) => setForm({...form, latePaymentFine: parseInt(e.target.value) || 0})}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Grace Period (Days)</label>
                          <input 
                              type="number"
                              className="border border-slate-300 bg-white text-slate-900 rounded-lg p-2 w-full"
                              value={form.gracePeriodDays}
                              onChange={(e) => setForm({...form, gracePeriodDays: parseInt(e.target.value) || 0})}
                          />
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                   <h3 className="font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Deposit Interest Rates (%)</h3>
                   <div className="space-y-4">
                       {[
                           { label: 'Optional Deposit', key: 'optionalDeposit' },
                           { label: 'Fixed Deposit (FD)', key: 'fixedDeposit' },
                           { label: 'Recurring Deposit (RD)', key: 'recurringDeposit' },
                       ].map((item) => (
                           <div key={item.key} className="flex justify-between items-center">
                               <label className="text-sm text-slate-600">{item.label}</label>
                               <input 
                                   type="number" step="0.1"
                                   className="border border-slate-300 bg-white text-slate-900 rounded-lg p-1 w-20 text-right"
                                   value={form.interestRates[item.key as keyof typeof form.interestRates] as number}
                                   onChange={(e) => updateRate(item.key as any, parseFloat(e.target.value))}
                               />
                           </div>
                       ))}
                   </div>
              </div>

              <div className="col-span-1 md:col-span-2 flex justify-end">
                   <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                      {isSaving ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
                      Save Configuration
                  </button>
              </div>
          </div>
      )}

      {activeTab === 'import' && (
          <div className="animate-fade-in space-y-6">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3 text-blue-800 text-sm">
                  <Database className="shrink-0" size={20} />
                  <div>
                      <p className="font-bold">Historical Data Migration</p>
                      <p>Use this tool to bulk import members and their account balances from your previous system. Always import <strong>Members</strong> first, then <strong>Accounts</strong>.</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                       <h3 className="font-bold text-slate-900">Step 1: Select Import Type</h3>
                       <div className="flex gap-4">
                           <button 
                             onClick={() => { setImportType('members'); setPreviewData([]); setValidationErrors([]); }}
                             className={`flex-1 p-4 border rounded-xl text-left transition-all ${importType === 'members' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300'}`}
                           >
                               <div className="font-bold text-slate-900 mb-1">Members</div>
                               <div className="text-xs text-slate-500">Name, Phone, Address, Join Date</div>
                           </button>
                           <button 
                             onClick={() => { setImportType('accounts'); setPreviewData([]); setValidationErrors([]); }}
                             className={`flex-1 p-4 border rounded-xl text-left transition-all ${importType === 'accounts' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300'}`}
                           >
                               <div className="font-bold text-slate-900 mb-1">Accounts</div>
                               <div className="text-xs text-slate-500">Balances, Open Date, Type</div>
                           </button>
                       </div>

                       <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                           <div className="flex justify-between items-center">
                               <span className="font-bold text-sm text-slate-700">Upload CSV File</span>
                               <button onClick={downloadTemplate} className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                                   <Download size={12}/> Download Template
                               </button>
                           </div>
                           <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors bg-slate-50 relative">
                               <input 
                                 type="file" 
                                 accept=".csv"
                                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                 onChange={handleFileUpload}
                               />
                               <Upload className="mx-auto text-slate-400 mb-2" size={24} />
                               <p className="text-sm text-slate-500">Click to upload or drag {importType} CSV</p>
                           </div>
                       </div>
                  </div>

                  <div className="space-y-4">
                      <h3 className="font-bold text-slate-900">Step 2: Preview & Validate</h3>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-[320px] overflow-hidden flex flex-col">
                          {validationErrors.length > 0 ? (
                              <div className="p-4 bg-red-50 text-red-700 text-sm overflow-y-auto flex-1">
                                  <p className="font-bold flex items-center gap-2 mb-2"><AlertCircle size={16}/> Found {validationErrors.length} Errors</p>
                                  <ul className="list-disc pl-4 space-y-1">
                                      {validationErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                                      {validationErrors.length > 10 && <li>...and {validationErrors.length - 10} more</li>}
                                  </ul>
                              </div>
                          ) : previewData.length > 0 ? (
                              <div className="flex-1 flex flex-col">
                                  <div className="p-3 bg-green-50 text-green-700 text-sm font-bold flex justify-between items-center">
                                      <span className="flex items-center gap-2"><CheckCircle size={16}/> {previewData.length} Valid Records Ready</span>
                                  </div>
                                  <div className="flex-1 overflow-auto p-0">
                                      <table className="w-full text-xs text-left">
                                          <thead className="bg-slate-50 sticky top-0">
                                              <tr>
                                                  {Object.keys(previewData[0]).slice(0, 3).map(k => <th key={k} className="p-2 border-b capitalize">{k}</th>)}
                                              </tr>
                                          </thead>
                                          <tbody>
                                              {previewData.slice(0, 10).map((row, i) => (
                                                  <tr key={i} className="border-b">
                                                      {Object.values(row).slice(0, 3).map((v: any, j) => <td key={j} className="p-2">{v}</td>)}
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                      {previewData.length > 10 && <p className="p-2 text-center text-xs text-slate-400">...and {previewData.length - 10} more</p>}
                                  </div>
                              </div>
                          ) : (
                              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm italic">
                                  No data loaded yet.
                              </div>
                          )}
                          
                          <div className="p-4 border-t border-slate-100 bg-slate-50">
                              <button 
                                onClick={executeImport}
                                disabled={isImporting || previewData.length === 0}
                                className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                  {isImporting ? <Loader className="animate-spin" size={16}/> : <Database size={16}/>}
                                  {isImporting ? 'Importing...' : 'Import to Database'}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};