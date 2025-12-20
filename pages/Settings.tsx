import React, { useState } from 'react';
import { AppSettings, Member, AccountType, Account, AccountStatus, Transaction } from '../types';
import { createAccount, upsertMember, upsertAccount, upsertTransaction, bulkUpsertMembers, bulkUpsertAccounts, bulkUpsertTransactions } from '../services/data';
import { Save, AlertTriangle, Percent, Loader, FileText, Upload, Database, CheckCircle, AlertCircle, Download, Settings, Info, Plus, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SettingsPageProps {
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => Promise<void>;
    members?: Member[]; // Added for validation
    onImportSuccess?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings, members = [], onImportSuccess }) => {
    const [activeTab, setActiveTab] = useState<'config' | 'import'>('config');
    const [form, setForm] = useState(settings);
    const [isSaving, setIsSaving] = useState(false);

    // Import State
    const [importType, setImportType] = useState<'members' | 'accounts'>('members');
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importLogs, setImportLogs] = useState<{ name: string, error: string }[]>([]);
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
    const MEMBER_COLS = ['member_id', 'full_name', 'father_name', 'phone', 'current_address', 'join_date', 'email'];
    const ACCOUNT_COLS = ['member_id', 'account_type', 'opening_balance', 'opening_date'];

    const handlePaste = (text: string) => {
        if (!text.trim()) return;

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        const cols = importType === 'members' ? MEMBER_COLS : ACCOUNT_COLS;

        // Determine start position
        let startRow = focusedCell?.row ?? (previewData.length > 0 ? 0 : 0);
        let startColKey = focusedCell?.col ?? cols[0];
        let startColIdx = cols.indexOf(startColKey);

        // Parse text into 2D array
        const pasteGrid = lines.map(line => line.split('\t').map(v => v.trim()));

        // Check if first row is headers (only if the grid is empty)
        const firstLineNorm = lines[0].toLowerCase().replace(/[^a-z0-9\t]/g, '');
        const headerKeywords = ['name', 'id', 'phone', 'member', 'address', 'balance', 'amount', 'date', 'type', 'mno', 'legacy', 'father'];
        const isHeaderRow = headerKeywords.some(k => firstLineNorm.includes(k));

        let finalData = [...previewData];

        if (isHeaderRow && previewData.length === 0) {
            // Use Header Mapping for initial paste
            const headers = lines[0].split('\t').map(h => h.trim());
            const rowsToProcess = lines.slice(1).map(line => {
                const values = line.split('\t');
                const obj: any = {};
                headers.forEach((h, i) => { if (h) obj[h] = values[i]?.trim(); });
                return obj;
            });

            finalData = rowsToProcess.map(row => {
                const lookup: any = {};
                Object.keys(row).forEach(k => { lookup[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k]; });

                if (importType === 'members') {
                    return {
                        member_id: lookup.memberid || lookup.legacyid || lookup.id || lookup.mno || '',
                        full_name: lookup.fullname || lookup.name || lookup.membersname || '',
                        father_name: lookup.fathername || lookup.fatherhusbandname || '',
                        phone: lookup.phone || lookup.mobile || lookup.phonenumber || '',
                        current_address: lookup.address || lookup.currentaddress || '',
                        join_date: lookup.joindate || lookup.openingdate || lookup.date || '',
                        email: lookup.email || ''
                    };
                } else {
                    return {
                        member_id: lookup.memberid || lookup.legacyid || '',
                        account_type: lookup.accounttype || lookup.type || 'Optional Deposit',
                        opening_balance: lookup.openingbalance || lookup.balance || lookup.amount || '',
                        opening_date: lookup.openingdate || lookup.date || ''
                    };
                }
            });
        } else {
            // Positional Overlay Pattern (Excel style)
            pasteGrid.forEach((rowValues, rOffset) => {
                const targetRowIdx = startRow + rOffset;

                // Initialize row if it doesn't exist
                if (!finalData[targetRowIdx]) {
                    finalData[targetRowIdx] = importType === 'members'
                        ? { member_id: '', full_name: '', father_name: '', phone: '', current_address: '', join_date: '', email: '' }
                        : { member_id: '', account_type: 'Optional Deposit', opening_balance: '', opening_date: '' };
                }

                rowValues.forEach((val, cOffset) => {
                    const targetColIdx = startColIdx + cOffset;
                    if (targetColIdx < cols.length) {
                        finalData[targetRowIdx][cols[targetColIdx]] = val;
                    }
                });
            });
        }

        setPreviewData(finalData);
        setValidationErrors([]);
    };



    const validateData = (rows: any[]) => {
        const errors: string[] = [];
        const warn: string[] = [];
        const validRows: any[] = [];

        rows.forEach((row, idx) => {
            const rowNum = idx + 2;

            if (importType === 'members') {
                // FLEXIBLE VALIDATION: Smart Matching
                const hasName = !!row.fullname || !!row.name || !!row.membername || !!row.customername || !!row.member || !!row.membersname;
                const hasPhone = !!row.phone || !!row.phonenumber || !!row.mobile || !!row.contact || !!row.cell || !!row.mob;
                const hasLegacyId = !!row.legacyid || !!row.id || !!row.memberid || !!row.oldid || !!row.mno;

                if (!hasName && !hasPhone && !hasLegacyId) {
                    errors.push(`Row ${rowNum}: Skipped - No Name, Phone, or ID found. Found keys: ${Object.keys(row).join(', ')}`);
                } else {
                    const phone = row.phone || row.phonenumber || row.mobile || row.contact || row.cell || row.mob;
                    if (phone && members.some(m => m.phone === String(phone))) {
                        warn.push(`Row ${rowNum}: Member with phone ${phone} already exists. Skipping.`);
                    } else {
                        // MAP TO DB SCHEMA (snake_case)
                        const mappedRow = {
                            member_id: row.legacyid || row.id || row.memberid || row.oldid || row.mno,
                            full_name: row.fullname || row.name || row.membername || row.customername || row.member || row.membersname,
                            phone: String(phone || ''),
                            email: row.email || row.mail || row.emailaddress,
                            father_name: row.fathername || row.father || row.guardian || row.fatherhusbandname,
                            current_address: row.address || row.currentaddress || row.addr || row.location,
                            join_date: row.joindate || row.date || row.joiningdate || row.startdate || row.openingdate || new Date().toISOString().split('T')[0],
                        };
                        validRows.push(mappedRow);
                    }
                }
            } else {
                // ... (Accounts remains similar)
                const memberId = row.memberid || row.networkid || row.mid || row.legacyid;
                const memberPhone = row.memberphone || row.phone || row.mobile || row.contact;
                const balance = row.openingbalance || row.balance || row.amount || row.openbal || row.deposit;

                if ((!memberId && !memberPhone) || balance === undefined) {
                    errors.push(`Row ${rowNum}: Skipped - Missing Link (ID/Phone) or Balance.`);
                } else {
                    let linkedMember = null;
                    if (memberId) linkedMember = members.find(m => m.id === String(memberId));
                    if (!linkedMember && memberPhone) linkedMember = members.find(m => m.phone === String(memberPhone));

                    if (!linkedMember) {
                        warn.push(`Row ${rowNum}: Member not found (ID: ${memberId}, Phone: ${memberPhone}). Record skipped.`);
                    } else {
                        validRows.push({
                            member_id: linkedMember.id,
                            account_type: row.accounttype || row.type || row.acctype || row.product,
                            opening_balance: balance,
                            opening_date: row.openingdate || row.opendate || row.date || row.startdate,
                            _linkedMemberId: linkedMember.id
                        });
                    }
                }
            }
        });

        setValidationErrors(errors);
        setWarnings(warn);
        setPreviewData(validRows);
    };

    const normalizeDate = (dateStr: string) => {
        if (!dateStr || dateStr.trim() === "") return new Date().toISOString().split('T')[0];

        // Replace all common separators with a standard one
        const cleanStr = dateStr.replace(/[./]/g, '-');
        const parts = cleanStr.split('-');

        if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1].padStart(2, '0');
            let year = parts[2];

            // Handle 2-digit years
            if (year.length === 2) {
                const prefix = parseInt(year) > 50 ? '19' : '20';
                year = prefix + year;
            }

            // Ensure YYYY-MM-DD
            if (day.length === 2 && month.length === 2 && year.length === 4) {
                return `${year}-${month}-${day}`;
            }
        }

        return dateStr;
    };

    const executeImport = async () => {
        if (previewData.length === 0) return;
        setIsImporting(true);
        setImportLogs([]);
        let count = 0;
        let failCount = 0;

        try {
            if (importType === 'members') {
                const membersToImport: Member[] = previewData.map(row => ({
                    id: row.member_id ? String(row.member_id) : `MEM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                    fullName: row.full_name || "Unknown Member",
                    phone: String(row.phone || ""),
                    email: row.email || "",
                    fatherName: row.father_name || "",
                    currentAddress: row.current_address || row.address || "",
                    permanentAddress: row.current_address || row.address || "",
                    joinDate: normalizeDate(row.join_date),
                    status: 'Active',
                    avatarUrl: `https://ui-avatars.com/api/?name=${(row.full_name || "Unknown").replace(' ', '+')}`,
                    riskScore: 0
                }));

                try {
                    await bulkUpsertMembers(membersToImport);
                    count = membersToImport.length;
                } catch (err: any) {
                    console.error("Bulk Member Import Failed", err);
                    setImportLogs([{ name: "All Records", error: err.message || "Database rejected bulk import. Possible duplicate ID or missing data." }]);
                    failCount = membersToImport.length;
                }
            } else {
                const accountsToImport: Account[] = [];
                const txsToImport: { transaction: Transaction, accountId: string }[] = [];

                previewData.forEach(row => {
                    let type = AccountType.OPTIONAL_DEPOSIT;
                    const inputType = (row.account_type || '').toLowerCase();
                    if (inputType.includes('share')) type = AccountType.SHARE_CAPITAL;
                    else if (inputType.includes('compulsory')) type = AccountType.COMPULSORY_DEPOSIT;
                    else if (inputType.includes('fixed')) type = AccountType.FIXED_DEPOSIT;
                    else if (inputType.includes('recurring')) type = AccountType.RECURRING_DEPOSIT;
                    else if (inputType.includes('loan')) type = AccountType.LOAN;

                    const balance = parseFloat(String(row.opening_balance || '0'));
                    const memberId = row.member_id || row._linkedMemberId;

                    if (memberId) {
                        const newAcc = createAccount(memberId, type, balance, undefined, undefined, settings);
                        const openDate = normalizeDate(row.opening_date);
                        if (openDate && newAcc.transactions.length > 0) {
                            newAcc.transactions[0].date = openDate;
                            newAcc.transactions[0].description = "Opening Balance (Imported)";
                        }
                        accountsToImport.push(newAcc);
                        txsToImport.push({ transaction: newAcc.transactions[0], accountId: newAcc.id });
                    }
                });

                try {
                    await bulkUpsertAccounts(accountsToImport);
                    await bulkUpsertTransactions(txsToImport);
                    count = accountsToImport.length;
                } catch (err: any) {
                    console.error("Bulk Account Import Failed", err);
                    setImportLogs([{ name: "All Records", error: err.message || "Bulk import failed. Ensure all Member IDs exist in the database first." }]);
                    failCount = accountsToImport.length;
                }
            }

            setSuccessCount(count);
            if (failCount === 0) {
                setPreviewData([]);
                setPage(1);
                setValidationErrors([]);
                if (onImportSuccess) onImportSuccess();
                alert(`Successfully imported ${count} records!`);
            } else {
                alert(`Import failed. See the "Failed Records" section below for details.`);
            }
        } catch (err: any) {
            console.error(err);
            alert("Critical error during import procedure. Check console.");
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
                    <h2 className="text-2xl font-bold text-slate-900">Settings (Copy-Paste Import)</h2>
                    <p className="text-slate-500 text-sm">Configure system parameters and manage data.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-slate-200 mb-6">
                <button
                    onClick={() => setActiveTab('config')}
                    className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'config' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
                >
                    <Settings size={16} /> System Configuration
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'import' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
                >
                    <Database size={16} /> Data Management (Bulk Import)
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
                                    onChange={(e) => setForm({ ...form, latePaymentFine: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Grace Period (Days)</label>
                                <input
                                    type="number"
                                    className="border border-slate-300 bg-white text-slate-900 rounded-lg p-2 w-full"
                                    value={form.gracePeriodDays}
                                    onChange={(e) => setForm({ ...form, gracePeriodDays: parseInt(e.target.value) || 0 })}
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
                <div className="animate-fade-in h-[calc(100vh-200px)] flex flex-col space-y-4">
                    {/* Header & Mode Selection */}
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex justify-between items-center text-blue-800 text-sm">
                        <div className="flex gap-3">
                            <Database className="shrink-0" size={20} />
                            <div>
                                <p className="font-bold">Bulk Import ({importType})</p>
                                <p>Copy rows from Excel and Paste (Ctrl+V) anywhere on the grid.</p>
                            </div>
                        </div>
                        <div className="flex bg-white rounded-lg border border-blue-200 p-1">
                            <button
                                onClick={() => { setImportType('members'); setPreviewData([]); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'members' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Members
                            </button>
                            <button
                                onClick={() => { setImportType('accounts'); setPreviewData([]); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'accounts' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Accounts
                            </button>
                        </div>
                    </div>

                    {/* Validation & Warnings */}
                    {(validationErrors.length > 0 || warnings.length > 0 || importLogs.length > 0) && (
                        <div className="max-h-32 overflow-y-auto space-y-2">
                            {importLogs.length > 0 && (
                                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                                    <h4 className="text-red-800 font-bold mb-2 flex items-center gap-2">
                                        <X className="w-4 h-4" />
                                        Failed Records ({importLogs.length})
                                    </h4>
                                    <div className="max-h-60 overflow-y-auto space-y-2">
                                        {importLogs.map((log, i) => (
                                            <div key={i} className="text-xs bg-white p-2 rounded border border-red-100 flex justify-between gap-4">
                                                <span className="font-bold text-slate-700">{log.name}</span>
                                                <span className="text-red-500 font-mono italic">{log.error}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {validationErrors.length > 0 && (
                                <div className="p-3 bg-red-50 text-red-700 text-xs border border-red-100 rounded-lg">
                                    <p className="font-bold flex items-center gap-2 mb-1"><AlertCircle size={12} /> Errors ({validationErrors.length})</p>
                                    <ul className="list-disc pl-4 space-y-1">{validationErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                                </div>
                            )}
                            {warnings.length > 0 && (
                                <div className="p-3 bg-yellow-50 text-yellow-800 text-xs border border-yellow-100 rounded-lg">
                                    <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={12} /> Warnings ({warnings.length})</p>
                                    <ul className="list-disc pl-4 space-y-1">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SPREADSHEET GRID */}
                    <div
                        className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative outline-none focus-within:ring-1 focus-within:ring-blue-100"
                        onPaste={(e) => {
                            const text = e.clipboardData.getData('text');
                            if (text.includes('\t') || text.includes('\n')) {
                                e.preventDefault();
                                handlePaste(text);
                            }
                        }}
                    >
                        {/* Grid Toolbar */}
                        <div className="p-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                            <div className="flex gap-2">
                                <span className="font-bold text-slate-700 px-2 py-1">Grid Area</span>
                                <span className="text-slate-400 border-l border-slate-300 pl-2 ml-2 flex items-center gap-1">
                                    {previewData.length} Rows
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const newRow = importType === 'members'
                                            ? { member_id: '', full_name: '', father_name: '', phone: '', current_address: '', join_date: '', email: '' }
                                            : { member_id: '', account_type: 'Optional Deposit', opening_balance: '', opening_date: '' };
                                        setPreviewData([...previewData, newRow]);
                                    }}
                                    className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add Row
                                </button>
                                <button
                                    onClick={() => { setPreviewData([]); setValidationErrors([]); setWarnings([]); }}
                                    className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1"
                                >
                                    <Trash2 size={12} /> Clear All
                                </button>
                                <div className="mx-2 w-px h-6 bg-slate-200" />
                                <button
                                    onClick={executeImport}
                                    disabled={isImporting || validationErrors.length > 0 || previewData.length === 0}
                                    className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                                >
                                    {isImporting ? <Loader className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                                    Import {previewData.length} Records
                                </button>
                            </div>
                        </div>

                        {/* Editable Table */}
                        <div className="flex-1 overflow-auto bg-slate-50 relative">
                            <table className="w-full text-xs border-collapse bg-white">
                                <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm text-slate-600 font-semibold text-left">
                                    <tr>
                                        <th className="p-2 border border-slate-200 w-10 text-center">#</th>
                                        {importType === 'members' ? (
                                            <>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Member ID</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Full Name</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Father's Name</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Phone</th>
                                                <th className="p-2 border border-slate-200 min-w-[200px]">Address</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Join Date</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Email</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Member ID</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Account Type</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Balance</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Open Date</th>
                                            </>
                                        )}
                                        <th className="p-2 border border-slate-200 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewData.length === 0 && (
                                        <tr className="absolute inset-x-0 top-20 pointer-events-none">
                                            <td colSpan={10} className="text-slate-300 font-bold text-lg flex flex-col items-center gap-2">
                                                <Database size={48} className="opacity-20" />
                                                <span>Copy Your Excel Rows & Press Ctrl+V</span>
                                            </td>
                                        </tr>
                                    )}

                                    {previewData.slice(0, page * pageSize).map((row, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="p-1 border border-slate-200 text-center text-slate-400 bg-slate-50 font-mono">{idx + 1}</td>
                                            {importType === 'members' ? (
                                                <>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.member_id || ''} onFocus={() => setFocusedCell({ row: idx, col: 'member_id' })} onChange={(e) => { const n = [...previewData]; n[idx].member_id = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.full_name || ''} onFocus={() => setFocusedCell({ row: idx, col: 'full_name' })} onChange={(e) => { const n = [...previewData]; n[idx].full_name = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.father_name || ''} onFocus={() => setFocusedCell({ row: idx, col: 'father_name' })} onChange={(e) => { const n = [...previewData]; n[idx].father_name = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.phone || ''} onFocus={() => setFocusedCell({ row: idx, col: 'phone' })} onChange={(e) => { const n = [...previewData]; n[idx].phone = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.current_address || ''} onFocus={() => setFocusedCell({ row: idx, col: 'current_address' })} onChange={(e) => { const n = [...previewData]; n[idx].current_address = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" placeholder="DD-MM-YYYY" className="w-full h-full p-2 outline-none bg-transparent" value={row.join_date || ''} onFocus={() => setFocusedCell({ row: idx, col: 'join_date' })} onChange={(e) => { const n = [...previewData]; n[idx].join_date = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.email || ''} onFocus={() => setFocusedCell({ row: idx, col: 'email' })} onChange={(e) => { const n = [...previewData]; n[idx].email = e.target.value; setPreviewData(n); }} /></td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.member_id || ''} onFocus={() => setFocusedCell({ row: idx, col: 'member_id' })} onChange={(e) => { const n = [...previewData]; n[idx].member_id = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0">
                                                        <select className="w-full h-full p-2 outline-none bg-transparent" value={row.account_type || 'Optional Deposit'} onFocus={() => setFocusedCell({ row: idx, col: 'account_type' })} onChange={(e) => { const n = [...previewData]; n[idx].account_type = e.target.value; setPreviewData(n); }}>
                                                            {Object.values(AccountType).map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="border border-slate-200 p-0"><input type="number" className="w-full h-full p-2 outline-none bg-transparent" value={row.opening_balance || ''} onFocus={() => setFocusedCell({ row: idx, col: 'opening_balance' })} onChange={(e) => { const n = [...previewData]; n[idx].opening_balance = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" placeholder="DD-MM-YYYY" className="w-full h-full p-2 outline-none bg-transparent" value={row.opening_date || ''} onFocus={() => setFocusedCell({ row: idx, col: 'opening_date' })} onChange={(e) => { const n = [...previewData]; n[idx].opening_date = e.target.value; setPreviewData(n); }} /></td>
                                                </>
                                            )}
                                            <td className="p-1 border border-slate-200 text-center">
                                                <button
                                                    onClick={() => { const n = [...previewData]; n.splice(idx, 1); setPreviewData(n); }}
                                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {previewData.length > page * pageSize && (
                                        <tr>
                                            <td colSpan={importType === 'members' ? 8 : 5} className="p-4 text-center">
                                                <button
                                                    onClick={() => setPage(p => p + 1)}
                                                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-xs"
                                                >
                                                    Load More Rows (Showing {page * pageSize} of {previewData.length})
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};