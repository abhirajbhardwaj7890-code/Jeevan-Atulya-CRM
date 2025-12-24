import React, { useState } from 'react';
import { createAccount, upsertMember, upsertAccount, upsertTransaction, bulkUpsertMembers, bulkUpsertAccounts, bulkUpsertTransactions, bulkUpsertLedgerEntries, bulkUpsertAgents } from '../services/data';
import { AppSettings, Member, AccountType, Account, AccountStatus, Transaction, Agent, LedgerEntry, MemberDocument } from '../types';
import { Save, AlertTriangle, Percent, Loader, FileText, Upload, Database, CheckCircle, AlertCircle, Download, Settings, Info, Plus, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SettingsPageProps {
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => Promise<void>;
    members?: Member[]; // Added for validation
    accounts?: Account[]; // Added for transaction ID resolution
    ledger?: LedgerEntry[]; // Added for maintenance checks
    onImportSuccess?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings, members = [], accounts = [], ledger = [], onImportSuccess }) => {
    const [activeTab, setActiveTab] = useState<'config' | 'import' | 'maintenance'>('config');
    const [form, setForm] = useState(settings);
    const [isSaving, setIsSaving] = useState(false);

    // Import State
    const [importType, setImportType] = useState<'members' | 'accounts' | 'staff' | 'transactions'>('members');
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importLogs, setImportLogs] = useState<{ name: string, error: string }[]>([]);
    const [successCount, setSuccessCount] = useState(0);
    const [isRepairing, setIsRepairing] = useState(false);

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
    const STAFF_COLS = ['name', 'phone', 'member_id', 'branch_id', 'commission_fee'];
    const TRANSACTION_COLS = ['account_no', 'type', 'amount', 'date', 'description', 'payment_method', 'utr'];

    const handlePaste = (text: string) => {
        if (!text.trim()) return;

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        const cols = importType === 'members' ? MEMBER_COLS :
            (importType === 'accounts' ? ACCOUNT_COLS :
                (importType === 'transactions' ? TRANSACTION_COLS : STAFF_COLS));

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
                } else if (importType === 'accounts') {
                    // SMART PASTE: Detect Wide Format (Multiple Account Type Columns)
                    const accountTypeNames = Object.values(AccountType);
                    const detectedAccountColumns: string[] = [];

                    // Check if any headers match account type names
                    Object.keys(row).forEach(key => {
                        const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
                        accountTypeNames.forEach(accType => {
                            const accTypeNorm = accType.toLowerCase().replace(/[^a-z]/g, '');
                            if (normalized.includes(accTypeNorm) || accTypeNorm.includes(normalized)) {
                                if (!detectedAccountColumns.includes(key)) {
                                    detectedAccountColumns.push(key);
                                }
                            }
                        });
                    });

                    // If Wide Format detected (multiple account columns), unpivot
                    if (detectedAccountColumns.length > 1) {
                        const memberId = lookup.memberid || lookup.legacyid || lookup.id || '';
                        const openDate = lookup.openingdate || lookup.date || '';

                        // Return array marker - we'll flatten later
                        return {
                            _isWideFormat: true,
                            _memberId: memberId,
                            _openDate: openDate,
                            _accounts: detectedAccountColumns.map(col => {
                                const balance = row[col];
                                if (balance && parseFloat(balance) > 0) {
                                    // Match column name to account type
                                    let matchedType = AccountType.OPTIONAL_DEPOSIT;
                                    const colNorm = col.toLowerCase().replace(/[^a-z]/g, '');

                                    accountTypeNames.forEach(accType => {
                                        const accTypeNorm = accType.toLowerCase().replace(/[^a-z]/g, '');
                                        if (colNorm.includes(accTypeNorm) || accTypeNorm.includes(colNorm)) {
                                            matchedType = accType;
                                        }
                                    });

                                    return {
                                        member_id: memberId,
                                        account_type: matchedType,
                                        opening_balance: balance,
                                        opening_date: openDate
                                    };
                                }
                                return null;
                            }).filter(Boolean)
                        };
                    }

                    // Standard Long Format
                    return {
                        member_id: lookup.memberid || lookup.legacyid || '',
                        account_type: lookup.accounttype || lookup.type || 'Optional Deposit',
                        opening_balance: lookup.openingbalance || lookup.balance || lookup.amount || '',
                        opening_date: lookup.openingdate || lookup.date || ''
                    };
                } else if (importType === 'transactions') {
                    return {
                        account_no: lookup.accountno || lookup.accountnumber || lookup.accno || '',
                        type: lookup.type || lookup.txtype || 'credit',
                        amount: lookup.amount || lookup.amt || '',
                        date: lookup.date || lookup.txdate || '',
                        description: lookup.description || lookup.particulars || '',
                        payment_method: lookup.paymentmethod || lookup.mode || 'Cash',
                        utr: lookup.utr || lookup.utrnumber || ''
                    };
                } else {
                    return {
                        name: lookup.name || lookup.fullname || lookup.staffname || lookup.agentname || '',
                        phone: lookup.phone || lookup.mobile || lookup.phonenumber || '',
                        member_id: lookup.memberid || lookup.id || lookup.linkedid || '',
                        branch_id: lookup.branchid || lookup.branch || lookup.office || 'BR-MAIN',
                        commission_fee: lookup.commissionfee || lookup.fee || lookup.commission || ''
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
                        : (importType === 'accounts'
                            ? { member_id: '', account_type: 'Optional Deposit', opening_balance: '', opening_date: '' }
                            : (importType === 'transactions'
                                ? { account_no: '', type: 'credit', amount: '', date: '', description: '', payment_method: 'Cash', utr: '' }
                                : { name: '', phone: '', member_id: '', branch_id: 'BR-MAIN', commission_fee: '' }
                            )
                        );
                }

                rowValues.forEach((val, cOffset) => {
                    const targetColIdx = startColIdx + cOffset;
                    if (targetColIdx < cols.length) {
                        finalData[targetRowIdx][cols[targetColIdx]] = val;
                    }
                });
            });
        }

        // Flatten Wide Format accounts (unpivot multi-column account data)
        if (importType === 'accounts' && isHeaderRow && previewData.length === 0) {
            const flattened: any[] = [];
            finalData.forEach(item => {
                if (item._isWideFormat && item._accounts) {
                    flattened.push(...item._accounts);
                } else if (!item._isWideFormat) {
                    flattened.push(item);
                }
            });
            if (flattened.length > 0) {
                finalData = flattened;
            }
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
            } else if (importType === 'accounts') {
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
            } else if (importType === 'transactions') {
                const accNo = row.account_no || row.accountnumber || row.accno;
                const amt = row.amount || row.amt;
                if (!accNo || !amt) {
                    errors.push(`Row ${rowNum}: Skipped - Missing Account Number or Amount.`);
                } else {
                    validRows.push({
                        account_no: String(accNo),
                        type: (row.type || 'credit').toLowerCase().includes('deb') ? 'debit' : 'credit',
                        amount: parseFloat(String(amt)) || 0,
                        date: row.date || row.txdate || new Date().toISOString().split('T')[0],
                        description: row.description || row.particulars || 'Imported Transaction',
                        payment_method: row.payment_method || row.mode || 'Cash',
                        utr: row.utr || row.utrnumber || ''
                    });
                }
            } else {
                // STAFF VALIDATION
                const name = row.name || row.fullname || row.staffname || row.agentname;
                const phone = row.phone || row.mobile || row.phonenumber;

                if (!name || !phone) {
                    errors.push(`Row ${rowNum}: Skipped - Missing Name or Phone.`);
                } else {
                    validRows.push({
                        name: name,
                        phone: String(phone),
                        member_id: row.member_id || row.memberid || row.id || '',
                        branch_id: row.branch_id || row.branchid || row.branch || 'BR-MAIN',
                        commission_fee: parseFloat(row.commission_fee || row.fee || row.commission) || settings.defaultAgentFee
                    });
                }
            }
        });

        setValidationErrors(errors);
        setWarnings(warn);
        setPreviewData(validRows);
    };

    const normalizeDate = (dateStr: string, enforceMin: boolean = true) => {
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
                const normalized = `${year}-${month}-${day}`;

                // Validate minimum date (22/10/2025)
                if (enforceMin) {
                    const MIN_DATE = '2025-10-22';
                    if (normalized < MIN_DATE) {
                        console.warn(`Date ${dateStr} (normalized: ${normalized}) is before minimum date 22/10/2025. Using minimum date instead.`);
                        return MIN_DATE;
                    }
                }

                return normalized;
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

        const accountsToImport: Account[] = [];
        const txsToImport: { transaction: Transaction, accountId: string }[] = [];
        const ledgerToImport: LedgerEntry[] = [];

        try {
            if (importType === 'members') {
                const membersToImport: Member[] = previewData.map(row => {
                    const memberId = row.member_id || `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                    // Account Opening Date: Enforce Min Date (22/10/2025)
                    const openDate = normalizeDate(row.join_date, true);

                    // Member Join Date: Enforce Min Date (Society created 22/10/2025)
                    const memberJoinDate = normalizeDate(row.join_date, true);

                    // Automatically create CD and SM accounts for new members
                    const smAccount = createAccount(memberId, AccountType.SHARE_CAPITAL, 400, undefined, { date: openDate }, 1, settings);
                    const cdAccount = createAccount(memberId, AccountType.COMPULSORY_DEPOSIT, 200, undefined, { date: openDate }, 2, settings);

                    accountsToImport.push(smAccount, cdAccount);

                    // Add transactions for initial balances
                    smAccount.transactions.forEach(tx => txsToImport.push({ transaction: tx, accountId: smAccount.id }));
                    cdAccount.transactions.forEach(tx => txsToImport.push({ transaction: tx, accountId: cdAccount.id }));

                    // Registration Receipt Document
                    const regReceiptDoc: MemberDocument = {
                        id: `DOC-REG-${memberId}`,
                        name: 'Registration Receipt',
                        type: 'Receipt',
                        category: 'Other',
                        description: 'Bulk Imported Registration Receipt',
                        uploadDate: new Date().toISOString().split('T')[0],
                        url: '#'
                    };

                    // Ledger Entry for registration
                    const totalFees = 450 + 400 + 100 + 400 + 200; // Building + Welfare + Entry + SM + CD
                    ledgerToImport.push({
                        id: `LDG-REG-${memberId}`,
                        date: memberJoinDate,
                        description: `Bulk Reg - ${row.full_name || 'Imported Member'}`,
                        amount: totalFees,
                        type: 'Income',
                        category: 'Admission Fees & Deposits'
                    });

                    return {
                        id: memberId,
                        fullName: row.full_name || '',
                        fatherName: row.father_name || '',
                        dateOfBirth: row.dateOfBirth || '',
                        gender: row.gender || 'Male',
                        joinDate: memberJoinDate, // Use formatted date, allowing historical
                        phone: row.phone || '',
                        email: row.email || '',
                        currentAddress: row.current_address || '',
                        permanentAddress: row.current_address || '',
                        status: 'Active',
                        avatarUrl: '',
                        documents: [regReceiptDoc]
                    } as Member;
                });

                try {
                    // Deduplicate all arrays to prevent "ON CONFLICT DO UPDATE" batch errors
                    const uniqueMembers = Array.from(new Map(membersToImport.map(m => [m.id, m])).values());
                    const uniqueAccounts = Array.from(new Map(accountsToImport.map(a => [a.id, a])).values());

                    // Deduplicate transactions by Transaction ID
                    const uniqueTxs = Array.from(new Map(txsToImport.map(item => [item.transaction.id, item])).values());
                    const uniqueLedger = Array.from(new Map(ledgerToImport.map(l => [l.id, l])).values());

                    await bulkUpsertMembers(uniqueMembers);
                    await bulkUpsertAccounts(uniqueAccounts);
                    await bulkUpsertTransactions(uniqueTxs);
                    await bulkUpsertLedgerEntries(uniqueLedger);
                    count = uniqueMembers.length;
                } catch (err: any) {
                    console.error("Bulk Member Import Failed", err);
                    setImportLogs([{ name: "All Records", error: err.message || "Database rejected bulk import. Possible duplicate ID or missing data." }]);
                    failCount = membersToImport.length;
                }
            } else if (importType === 'accounts') {
                const accs: Account[] = previewData.map(row => {
                    const acc = createAccount(
                        row.member_id || '',
                        (row.account_type as AccountType) || AccountType.OPTIONAL_DEPOSIT,
                        parseFloat(row.opening_balance) || 0,
                        undefined,
                        { date: normalizeDate(row.opening_date) },
                        1,
                        settings
                    );

                    // Create ledger entry for opening balance if > 0 and not loan
                    if (acc.balance > 0 && acc.type !== AccountType.LOAN) {
                        ledgerToImport.push({
                            id: `LDG-OPEN-${acc.id}`,
                            date: normalizeDate(row.opening_date),
                            description: `Bulk Open ${acc.type} - ${acc.accountNumber}`,
                            amount: acc.balance,
                            type: 'Income',
                            category: 'Member Deposits'
                        });
                    }

                    acc.transactions.forEach(tx => txsToImport.push({ transaction: tx, accountId: acc.id }));
                    return acc;
                });
                try {
                    // Deduplicate
                    const uniqueAccs = Array.from(new Map(accs.map(a => [a.id, a])).values());
                    const uniqueTxs = Array.from(new Map(txsToImport.map(item => [item.transaction.id, item])).values());
                    const uniqueLedger = Array.from(new Map(ledgerToImport.map(l => [l.id, l])).values());

                    await bulkUpsertAccounts(uniqueAccs);
                    await bulkUpsertTransactions(uniqueTxs);
                    await bulkUpsertLedgerEntries(uniqueLedger);
                    count = uniqueAccs.length;
                } catch (err: any) {
                    console.error("Bulk Account Import Failed", err);
                    setImportLogs([{ name: "All Records", error: err.message || "Bulk import failed. Ensure all Member IDs exist in the database first." }]);
                    failCount = accs.length;
                }
            } else if (importType === 'transactions') {
                const txs = previewData.map(row => {
                    const tx = {
                        id: `TX-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        date: normalizeDate(row.date, true), // Normalize and enforce min date
                        amount: parseFloat(row.amount) || 0,
                        type: (row.type?.toLowerCase() === 'credit' ? 'credit' : 'debit') as 'credit' | 'debit',
                        description: row.description || 'Bulk Imported Transaction',
                        paymentMethod: row.payment_method || 'Cash'
                    } as Transaction;

                    // Create ledger entry for each transaction
                    const account = row.account_no || 'Unknown';
                    ledgerToImport.push({
                        id: `LDG-TX-${tx.id}`,
                        date: tx.date,
                        description: `Bulk Tx: ${tx.description} (${account})`,
                        amount: tx.amount,
                        type: tx.type === 'credit' ? 'Income' : 'Expense',
                        category: tx.type === 'credit' ? 'Member Deposit' : 'Member Withdrawal'
                    });

                    const targetAccount = accounts.find(a => a.accountNumber === String(row.account_no));
                    if (!targetAccount) {
                        setImportLogs(prev => [...prev, { name: row.account_no || 'Unknown', error: `Account Number ${row.account_no} not found.` }]);
                        failCount++;
                        return null;
                    }

                    return {
                        transaction: tx,
                        accountId: targetAccount.id
                    };
                }).filter(Boolean) as { transaction: Transaction, accountId: string }[];

                if (txs.length > 0) {
                    try {
                        // Deduplicate
                        const uniqueTxs = Array.from(new Map(txs.map(item => [item.transaction.id, item])).values());
                        const uniqueLedger = Array.from(new Map(ledgerToImport.map(l => [l.id, l])).values());

                        await bulkUpsertTransactions(uniqueTxs);
                        await bulkUpsertLedgerEntries(uniqueLedger);
                        count = uniqueTxs.length;
                    } catch (err: any) {
                        console.error("Bulk Transaction Import Failed", err);
                        setImportLogs(prev => [...prev, { name: "Batch", error: err.message || "Database rejected bulk txn import." }]);
                        failCount += txs.length;
                    }
                }
            } else {
                // STAFF IMPORT
                const agentsToImport: any[] = previewData.map(row => ({
                    id: `AG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    name: row.name || "Unknown Staff",
                    phone: String(row.phone || ""),
                    memberId: row.member_id || "",
                    branchId: row.branch_id || "BR-MAIN",
                    commissionFee: parseFloat(row.commission_fee) || settings.defaultAgentFee,
                    status: 'Active',
                    activeMembers: 0,
                    totalCollections: 0
                }));

                try {
                    await bulkUpsertAgents(agentsToImport);
                    count = agentsToImport.length;
                } catch (err: any) {
                    console.error("Bulk Staff Import Failed", err);
                    setImportLogs([{ name: "All Records", error: err.message || "Staff import failed. Ensure Member IDs are correct." }]);
                    failCount = agentsToImport.length;
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
        } else if (importType === 'accounts') {
            content = "member_phone,account_type,opening_balance,opening_date\n9876543210,Share Capital,500,2022-01-15\n9876543210,Optional Deposit,5000,2022-02-01";
        } else if (importType === 'transactions') {
            content = "account_no,type,amount,date,description,payment_method,utr\n1-SH-1,credit,100,2024-01-01,Monthly Deposit,Cash,";
        } else {
            content = "name,phone,member_id,branch_id,commission_fee\nStaff Name,9999999999,,BR-MAIN,100";
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
                <button
                    onClick={() => setActiveTab('maintenance')}
                    className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'maintenance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
                >
                    <Trash2 size={16} /> Maintenance
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
                                <p className="text-[10px] mt-1 text-blue-600 font-medium">
                                    <Info className="inline" size={10} /> <strong>Tip:</strong> If importing historical transactions, set account opening balance to 0 to avoid double-counting, or ensure transactions start <em>after</em> the opening date.
                                </p>
                            </div>
                        </div>
                        <div className="flex bg-white rounded-lg border border-blue-200 p-1">
                            <button
                                onClick={() => { setImportType('members'); setPreviewData([]); setPage(1); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'members' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Members
                            </button>
                            <button
                                onClick={() => { setImportType('accounts'); setPreviewData([]); setPage(1); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'accounts' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Accounts
                            </button>
                            <button
                                onClick={() => { setImportType('transactions'); setPreviewData([]); setPage(1); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'transactions' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Transactions
                            </button>
                            <button
                                onClick={() => { setImportType('staff'); setPreviewData([]); setPage(1); }}
                                className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${importType === 'staff' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                Staff/Agents
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
                                            : importType === 'accounts'
                                                ? { member_id: '', account_type: 'Optional Deposit', opening_balance: '', opening_date: '' }
                                                : { name: '', phone: '', member_id: '', branch_id: '', commission_fee: '' };
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
                                        ) : importType === 'accounts' ? (
                                            <>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Member ID</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Account Type</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Balance</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Open Date</th>
                                            </>
                                        ) : importType === 'transactions' ? (
                                            <>
                                                <th className="p-2 border border-slate-200 min-w-[120px]">Account No.</th>
                                                <th className="p-2 border border-slate-200 min-w-[80px]">Type</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Amount</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Date</th>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Description</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Method</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">UTR</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="p-2 border border-slate-200 min-w-[150px]">Staff Name</th>
                                                <th className="p-2 border border-slate-200 min-w-[120px]">Phone</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Linked Member ID</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Branch ID</th>
                                                <th className="p-2 border border-slate-200 min-w-[100px]">Comm. Fee</th>
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
                                            ) : importType === 'accounts' ? (
                                                <>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.member_id || ''} onFocus={() => setFocusedCell({ row: idx, col: 'member_id' })} onChange={(e) => { const n = [...previewData]; n[idx].member_id = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0">
                                                        <select
                                                            className="w-full h-full p-2 outline-none bg-transparent"
                                                            value={row.account_type || 'Optional Deposit'}
                                                            onFocus={() => setFocusedCell({ row: idx, col: 'account_type' })}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const n = [...previewData];
                                                                if (idx === 0) {
                                                                    // Auto-fill all subsequent rows if the first row is changed
                                                                    n.forEach(r => r.account_type = val);
                                                                } else {
                                                                    n[idx].account_type = val;
                                                                }
                                                                setPreviewData(n);
                                                            }}
                                                        >
                                                            {Object.values(AccountType).map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="border border-slate-200 p-0"><input type="number" className="w-full h-full p-2 outline-none bg-transparent" value={row.opening_balance || ''} onFocus={() => setFocusedCell({ row: idx, col: 'opening_balance' })} onChange={(e) => { const n = [...previewData]; n[idx].opening_balance = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" placeholder="DD-MM-YYYY" className="w-full h-full p-2 outline-none bg-transparent" value={row.opening_date || ''} onFocus={() => setFocusedCell({ row: idx, col: 'opening_date' })} onChange={(e) => { const n = [...previewData]; n[idx].opening_date = e.target.value; setPreviewData(n); }} /></td>
                                                </>
                                            ) : importType === 'transactions' ? (
                                                <>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.account_no || ''} onFocus={() => setFocusedCell({ row: idx, col: 'account_no' })} onChange={(e) => { const n = [...previewData]; n[idx].account_no = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0">
                                                        <select className="w-full h-full p-2 outline-none bg-transparent" value={row.type || 'credit'} onFocus={() => setFocusedCell({ row: idx, col: 'type' })} onChange={(e) => { const n = [...previewData]; n[idx].type = e.target.value; setPreviewData(n); }}>
                                                            <option value="credit">Credit (+)</option>
                                                            <option value="debit">Debit (-)</option>
                                                        </select>
                                                    </td>
                                                    <td className="border border-slate-200 p-0"><input type="number" className="w-full h-full p-2 outline-none bg-transparent" value={row.amount || ''} onFocus={() => setFocusedCell({ row: idx, col: 'amount' })} onChange={(e) => { const n = [...previewData]; n[idx].amount = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" placeholder="DD-MM-YYYY" className="w-full h-full p-2 outline-none bg-transparent" value={row.date || ''} onFocus={() => setFocusedCell({ row: idx, col: 'date' })} onChange={(e) => { const n = [...previewData]; n[idx].date = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.description || ''} onFocus={() => setFocusedCell({ row: idx, col: 'description' })} onChange={(e) => { const n = [...previewData]; n[idx].description = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.payment_method || ''} onFocus={() => setFocusedCell({ row: idx, col: 'payment_method' })} onChange={(e) => { const n = [...previewData]; n[idx].payment_method = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.utr || ''} onFocus={() => setFocusedCell({ row: idx, col: 'utr' })} onChange={(e) => { const n = [...previewData]; n[idx].utr = e.target.value; setPreviewData(n); }} /></td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.name || ''} onFocus={() => setFocusedCell({ row: idx, col: 'name' })} onChange={(e) => { const n = [...previewData]; n[idx].name = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.phone || ''} onFocus={() => setFocusedCell({ row: idx, col: 'phone' })} onChange={(e) => { const n = [...previewData]; n[idx].phone = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.member_id || ''} onFocus={() => setFocusedCell({ row: idx, col: 'member_id' })} onChange={(e) => { const n = [...previewData]; n[idx].member_id = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="text" className="w-full h-full p-2 outline-none bg-transparent" value={row.branch_id || ''} onFocus={() => setFocusedCell({ row: idx, col: 'branch_id' })} onChange={(e) => { const n = [...previewData]; n[idx].branch_id = e.target.value; setPreviewData(n); }} /></td>
                                                    <td className="border border-slate-200 p-0"><input type="number" className="w-full h-full p-2 outline-none bg-transparent" value={row.commission_fee || ''} onFocus={() => setFocusedCell({ row: idx, col: 'commission_fee' })} onChange={(e) => { const n = [...previewData]; n[idx].commission_fee = e.target.value; setPreviewData(n); }} /></td>
                                                </>
                                            )
                                            }
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
                                            <td colSpan={importType === 'members' ? 8 : (importType === 'accounts' ? 5 : (importType === 'transactions' ? 8 : 6))} className="p-4 text-center">
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

            {activeTab === 'maintenance' && (
                <div className="animate-fade-in space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                            <Database size={20} className="text-blue-600" />
                            Data Integrity Utilities
                        </h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-blue-900">Repair Missing Transactions</h4>
                                    <p className="text-sm text-blue-700 max-w-md">
                                        Identifies accounts that have a balance but are missing their initial "Opening Balance" transaction.
                                        This utility will backfill these transactions using the account's opening date.
                                    </p>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!confirm("This will scan all accounts and create missing opening transactions. Continue?")) return;
                                        setIsRepairing(true);
                                        try {
                                            const missingTxs: { transaction: Transaction, accountId: string }[] = [];
                                            accounts.forEach(acc => {
                                                // Check for accounts with balance but no transactions
                                                if (acc.balance > 0 && (!acc.transactions || acc.transactions.length === 0)) {
                                                    const tx: Transaction = {
                                                        id: `TX-OPENING-${acc.id}`,
                                                        date: acc.openingDate || acc.createdAt || new Date().toISOString().split('T')[0],
                                                        amount: acc.balance,
                                                        type: acc.type === AccountType.LOAN ? 'debit' : 'credit',
                                                        category: acc.type === AccountType.LOAN ? 'Loan Disbursement' : 'Opening Balance',
                                                        description: 'Repaired Opening Balance Transaction',
                                                        paymentMethod: 'Cash'
                                                    };
                                                    missingTxs.push({ transaction: tx, accountId: acc.id });
                                                }
                                            });

                                            if (missingTxs.length === 0) {
                                                alert("No accounts found with missing transactions.");
                                                return;
                                            }

                                            if (confirm(`Found ${missingTxs.length} accounts missing transactions. Repair now?`)) {
                                                await bulkUpsertTransactions(missingTxs);
                                                alert(`Successfully repaired ${missingTxs.length} transactions!`);
                                                if (onImportSuccess) onImportSuccess(); // Refresh data
                                            }
                                        } catch (err: any) {
                                            console.error(err);
                                            alert("Repair failed: " + err.message);
                                        } finally {
                                            setIsRepairing(false);
                                        }
                                    }}
                                    disabled={isRepairing}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 disabled:opacity-50 shadow-sm"
                                >
                                    {isRepairing ? <Loader className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                                    Run Repair
                                </button>
                            </div>

                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-amber-900">Backfill Registration Fees</h4>
                                    <p className="text-sm text-amber-700 max-w-md">
                                        Identifies members who are missing the compulsory ₹1550 registration fee in the society ledger.
                                        This utility will create missing Income entries (Admission Fees & Deposits) for these members.
                                    </p>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!confirm("This will scan all members and add missing ₹1550 registration fee ledger entries. Continue?")) return;
                                        setIsRepairing(true);
                                        try {
                                            const missingLedger: LedgerEntry[] = [];
                                            members.forEach(m => {
                                                const regId = `LDG-REG-${m.id}`;
                                                const exists = ledger.some(l => l.id === regId || (l.description.includes("Reg") && l.description.includes(m.fullName)));

                                                if (!exists) {
                                                    missingLedger.push({
                                                        id: regId,
                                                        date: m.joinDate || new Date().toISOString().split('T')[0],
                                                        description: `Bulk Reg - ${m.fullName}`,
                                                        amount: 1550,
                                                        type: 'Income',
                                                        category: 'Admission Fees & Deposits'
                                                    });
                                                }
                                            });

                                            if (missingLedger.length === 0) {
                                                alert("No members found with missing registration fees.");
                                                return;
                                            }

                                            if (confirm(`Found ${missingLedger.length} members missing registration fees. Backfill now?`)) {
                                                await bulkUpsertLedgerEntries(missingLedger);
                                                alert(`Successfully backfilled ${missingLedger.length} registration fee entries!`);
                                                if (onImportSuccess) onImportSuccess(); // Refresh data
                                            }
                                        } catch (err: any) {
                                            console.error(err);
                                            alert("Backfill failed: " + err.message);
                                        } finally {
                                            setIsRepairing(false);
                                        }
                                    }}
                                    disabled={isRepairing}
                                    className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-bold flex items-center gap-2 disabled:opacity-50 shadow-sm"
                                >
                                    {isRepairing ? <Loader className="animate-spin" size={18} /> : <Database size={18} />}
                                    Backfill Fees
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};