import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Member, Account, Interaction, Transaction, AccountType, AccountStatus, LoanType, MemberDocument, UserRole, AppSettings, Guarantor, Nominee, LedgerEntry, Agent } from '../types';
import { generateMemberSummary, analyzeFinancialHealth, draftInteractionNote, calculateMemberRisk } from '../services/gemini';
import { Sparkles, ArrowLeft, Phone, Mail, Plus, CreditCard, Clock, X, Check, AlertTriangle, Pencil, Download, BookOpen, Printer, Wallet, User, TrendingUp, Calendar, Trash2, FileText, ChevronDown, ChevronUp, Lock, Users, ArrowUpRight, ArrowDownLeft, Upload, Calculator, AlertCircle, PieChart, Info, MapPin, Target, Shield, PiggyBank, MousePointerClick, AlignVerticalSpaceAround, History, RotateCcw, CheckCircle } from 'lucide-react';

interface MemberDetailProps {
    member: Member;
    allMembers: Member[]; // Needed for guarantor search
    accounts: Account[];
    agents?: Agent[]; // Added to resolve agent names
    interactions: Interaction[];
    userRole: UserRole;
    appSettings: AppSettings;
    onBack: () => void;
    onAddInteraction: (note: Partial<Interaction>) => void;
    onAddTransaction: (accountId: string, transaction: Partial<Transaction>) => void;
    onAddAccount: (memberId: string, account: Partial<Account>) => void;
    onUpdateMember: (member: Member) => void;
    onUpdateAccount: (account: Account) => void;
    onAddLedgerEntry: (entry: LedgerEntry) => void;
    onOpenPassbook: () => void;
    ledger?: LedgerEntry[]; // Added to show member-related fees/fines
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-GB');
};

// Helper Functions for Account Analysis
const getMinBalanceForYear = (account: Account): number => {
    const currentYear = new Date().getFullYear();
    let currentBal = account.balance;
    let minBal = currentBal;

    // Sort transactions descending (newest first)
    const sortedTxs = [...account.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const tx of sortedTxs) {
        const txYear = new Date(tx.date).getFullYear();
        if (txYear < currentYear) break;

        // Revert transaction to find previous balance (assuming Deposit Account logic: Credit=Inc, Debit=Dec)
        if (tx.type === 'credit') {
            currentBal -= tx.amount;
        } else {
            currentBal += tx.amount;
        }

        if (currentBal < minBal) minBal = currentBal;
    }
    return minBal;
};

const calculateInterest = (balance: number, rate: number, type: AccountType, acc: Account): { value: number } => {
    // Simple estimation for annual interest based on current balance
    const annualInterest = balance * (rate / 100);
    return { value: annualInterest };
};

const RELATION_OPTIONS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Nephew', 'Niece', 'Grandfather', 'Grandmother', 'Friend', 'Other'];

export const MemberDetail: React.FC<MemberDetailProps> = ({ member, allMembers, accounts, agents = [], interactions, userRole, appSettings, onBack, onAddInteraction, onAddTransaction, onAddAccount, onUpdateMember, onUpdateAccount, onAddLedgerEntry, onOpenPassbook, ledger = [] }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'receipts' | 'documents' | 'crm'>('overview');
    const [aiSummary, setAiSummary] = useState<string>('');
    const [loadingAi, setLoadingAi] = useState(false);
    const [loadingRisk, setLoadingRisk] = useState(false);
    const [financialHealth, setFinancialHealth] = useState<any>(null);

    // Interaction Form State
    const [newNote, setNewNote] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);

    // Transaction Modal State
    const [showTransModal, setShowTransModal] = useState(false);
    const [transForm, setTransForm] = useState({
        accountId: '',
        type: 'credit', // credit (Deposit/Repayment) or debit (Withdrawal/Disburse)
        amount: '',
        description: '',
        dueDate: '',
        paymentMethod: 'Cash' as 'Cash' | 'Online' | 'Both',
        cashAmount: '',
        onlineAmount: '',
        utrNumber: ''
    });
    const [transactionSuccess, setTransactionSuccess] = useState<{
        txId: string;
        amount: number;
        type: string;
        accountNumber: string;
        accountType: string;
        date: string;
        balanceAfter: number;
        description: string;
    } | null>(null);

    // Edit Member Modal State
    const [showEditMemberModal, setShowEditMemberModal] = useState(false);
    const [editMemberTab, setEditMemberTab] = useState<'profile' | 'contact' | 'nominee'>('profile');
    const [editMemberForm, setEditMemberForm] = useState<Partial<Member>>({});
    const [editNomineeForm, setEditNomineeForm] = useState<Partial<Nominee>>({});

    // Edit Account Modal State
    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [editAccountForm, setEditAccountForm] = useState({
        status: '',
        interestRate: '',
        maturityDate: '',
        lowBalanceThreshold: ''
    });

    // View Account Modal State (Detail & Calculators)
    const [showAccountViewModal, setShowAccountViewModal] = useState(false);
    const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
    // Calculator States for View Modal
    const [viewSimAmount, setViewSimAmount] = useState('');
    const [viewSimType, setViewSimType] = useState<'deposit' | 'withdraw'>('deposit');
    const [viewForecastMonths, setViewForecastMonths] = useState('12');

    // Document Upload Modal State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadForm, setUploadForm] = useState({
        category: 'KYC',
        description: '',
        file: null as File | null
    });
    const [isUploading, setIsUploading] = useState(false);

    // Account Modal State (Wizard)
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [accountWizardStep, setAccountWizardStep] = useState(1);
    const [accountSuccess, setAccountSuccess] = useState<{
        id: string;
        type: AccountType;
        accountNumber: string;
        amount: number;
    } | null>(null);
    const [accountForm, setAccountForm] = useState({
        type: AccountType.OPTIONAL_DEPOSIT,
        loanType: LoanType.PERSONAL,
        amount: '', // Principal / Loan Amount / Installment Amount
        interestRate: '0', // Will be auto-filled
        tenureMonths: '12',
        tenureYears: '3', // Default to 3 years for FD
        tenureDays: '365', // For Daily RD
        odLimit: '50000',
        rdFrequency: 'Monthly',
        processingFeePercent: '1.0',
        purpose: '' // Personalization
    });

    // Activate Member Modal State
    const [showActivateModal, setShowActivateModal] = useState(false);
    const [activateForm, setActivateForm] = useState({
        buildingFund: 450,
        shareMoney: 400,
        compulsoryDeposit: 200,
        welfareFund: 400,
        entryCharge: 100,
        paymentMethod: 'Cash' as 'Cash' | 'Online' | 'Both',
        cashAmount: '',
        onlineAmount: ''
    });

    // Loan Guarantor State
    const [guarantors, setGuarantors] = useState({
        g1Name: '', g1Phone: '', g1Rel: 'Friend',
        g2Name: '', g2Phone: '', g2Rel: 'Family'
    });

    // Calculator State (Wizard)
    const [calcResult, setCalcResult] = useState<{
        emi?: number,
        totalInterest?: number,
        totalPayable?: number,
        maturityAmount?: number,
        interestEarned?: number,
        principal?: number,
        maturityDate?: string
    } | null>(null);

    // History Tab Filters
    const [historyFilter, setHistoryFilter] = useState({
        accountId: 'All',
        type: 'All',
        startDate: '',
        endDate: '',
        sort: 'newest'
    });

    useEffect(() => {
        // Load AI Summary on mount if in overview
        if (activeTab === 'overview' && !aiSummary) {
            setLoadingAi(true);
            generateMemberSummary(member, accounts, interactions)
                .then(setAiSummary)
                .finally(() => setLoadingAi(false));
        }
        // Load Health on mount
        if (!financialHealth) {
            analyzeFinancialHealth(accounts).then(setFinancialHealth);
        }
        // Default selected account for transaction
        if (accounts.length > 0 && !transForm.accountId) {
            setTransForm(prev => ({ ...prev, accountId: accounts[0].id }));
        }
    }, [activeTab, member, accounts, interactions, aiSummary, financialHealth, transForm.accountId]);

    // --- Logic to Filter Available Account Types ---
    const availableAccountTypes = useMemo(() => {
        const existingTypes = new Set(accounts.map(a => a.type));
        // These accounts are singletons (one per member)
        const singletons = [
            AccountType.SHARE_CAPITAL,
            AccountType.COMPULSORY_DEPOSIT,
            AccountType.OPTIONAL_DEPOSIT
        ];

        return Object.values(AccountType).filter(type => {
            if (singletons.includes(type)) {
                return !existingTypes.has(type);
            }
            return true; // Allow multiples for FD, RD, Loan
        });
    }, [accounts]);

    // Ensure accountForm.type is valid when modal opens
    useEffect(() => {
        if (showAccountModal && !availableAccountTypes.includes(accountForm.type)) {
            // Default to first available or fallback to FD if list is somehow empty/weird
            setAccountForm(prev => ({ ...prev, type: availableAccountTypes[0] || AccountType.FIXED_DEPOSIT }));
        }
    }, [showAccountModal, availableAccountTypes, accountForm.type]);

    // Reset calculator and interest rates when account type changes
    useEffect(() => {
        setCalcResult(null);
        let defaultRate = 0;

        // Auto-fill interest rates from Settings
        if (accountForm.type === AccountType.OPTIONAL_DEPOSIT) defaultRate = appSettings.interestRates.optionalDeposit;
        else if (accountForm.type === AccountType.FIXED_DEPOSIT) defaultRate = appSettings.interestRates.fixedDeposit;
        else if (accountForm.type === AccountType.RECURRING_DEPOSIT) defaultRate = appSettings.interestRates.recurringDeposit;
        else if (accountForm.type === AccountType.COMPULSORY_DEPOSIT) defaultRate = appSettings.interestRates.compulsoryDeposit;
        else if (accountForm.type === AccountType.LOAN) {
            switch (accountForm.loanType) {
                case LoanType.HOME: defaultRate = appSettings.interestRates.loan.home; break;
                case LoanType.GOLD: defaultRate = appSettings.interestRates.loan.gold; break;
                case LoanType.VEHICLE: defaultRate = appSettings.interestRates.loan.vehicle; break;
                case LoanType.AGRICULTURE: defaultRate = appSettings.interestRates.loan.agriculture; break;
                case LoanType.EMERGENCY: defaultRate = appSettings.interestRates.loan.emergency; break;
                case LoanType.PERSONAL: defaultRate = appSettings.interestRates.loan.personal; break;
                default: defaultRate = appSettings.interestRates.loan.personal;
            }
        }
        setAccountForm(prev => ({
            ...prev,
            interestRate: defaultRate.toString(),
            processingFeePercent: '1.0',
            purpose: '',
            tenureYears: accountForm.type === AccountType.FIXED_DEPOSIT ? '3' : prev.tenureYears
        }));
    }, [accountForm.type, accountForm.loanType, appSettings]);

    // STABLE SORT HELPER: Ensures consistent order for Passbook and Counts
    const sortTransactions = (a: any, b: any) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        // Primary Sort: Date
        if (dateA !== dateB) return dateA - dateB;
        // Secondary Sort: ID (Lexicographical, which works for TX-{Timestamp} or UUIDs as tie-breaker)
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
    };

    // Flatten and Sort ALL transactions for the Member's Passbook
    const allMemberTransactions = useMemo(() => {
        const flattened = accounts.flatMap(acc =>
            acc.transactions.map(tx => ({
                ...tx,
                accType: acc.type,
                accNumber: acc.accountNumber,
                accId: acc.id,
                // Helper to group columns in passbook
                accCode: (() => {
                    switch (acc.type) {
                        case AccountType.SHARE_CAPITAL: return 'SM';
                        case AccountType.COMPULSORY_DEPOSIT: return 'CD';
                        case AccountType.OPTIONAL_DEPOSIT: return 'OD';
                        case AccountType.RECURRING_DEPOSIT: return 'RD';
                        case AccountType.LOAN: return 'RL';
                        case AccountType.FIXED_DEPOSIT: return 'FD';
                        default: return 'OTHER';
                    }
                })()
            }))
        );
        return flattened.sort(sortTransactions);
    }, [accounts]);

    // Calculate unprinted transactions count using the STABLE sorted list
    const unprintedCount = useMemo(() => {
        if (!member.lastPrintedTransactionId) return allMemberTransactions.length;
        const lastIdx = allMemberTransactions.findIndex(t => t.id === member.lastPrintedTransactionId);
        if (lastIdx === -1) return allMemberTransactions.length; // ID not found, assume all unprinted
        return Math.max(0, allMemberTransactions.length - 1 - lastIdx);
    }, [allMemberTransactions, member.lastPrintedTransactionId]);


    const handleDraft = async () => { if (!newNote) return; setIsDrafting(true); const refined = await draftInteractionNote('General Update', newNote); setNewNote(refined); setIsDrafting(false); };
    const handleCalculateRisk = async () => { setLoadingRisk(true); const result = await calculateMemberRisk(member, accounts); onUpdateMember({ ...member, riskScore: result.score, riskReason: result.reason }); setLoadingRisk(false); };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setUploadForm(prev => ({ ...prev, file: e.target.files![0] }));
        }
    };

    const submitUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadForm.file) return;

        setIsUploading(true);

        const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });

        try {
            const base64File = await toBase64(uploadForm.file);

            const newDoc: MemberDocument = {
                id: `DOC-${Date.now()}`,
                name: uploadForm.file.name,
                type: uploadForm.file.type.split('/')[1] || 'File',
                category: uploadForm.category as any,
                description: uploadForm.description,
                uploadDate: new Date().toISOString().split('T')[0],
                url: base64File
            };

            const updatedDocs = member.documents ? [...member.documents, newDoc] : [newDoc];
            onUpdateMember({ ...member, documents: updatedDocs });
            setShowUploadModal(false);
        } catch (err) {
            console.error("File processing error", err);
            alert("Failed to process file.");
        } finally {
            setIsUploading(false);
        }
    };

    const openEditMemberModal = () => {
        setEditMemberForm({ ...member });
        setEditNomineeForm(member.nominee || {});
        setEditMemberTab('profile');
        setShowEditMemberModal(true);
    };

    const submitEditMember = (e: React.FormEvent) => {
        e.preventDefault();

        const updatedMember: Member = {
            ...member,
            ...editMemberForm as Member,
            nominee: (editNomineeForm.name) ? {
                name: editNomineeForm.name,
                relation: editNomineeForm.relation || '',
                dateOfBirth: editNomineeForm.dateOfBirth,
                phone: editNomineeForm.phone,
                address: editNomineeForm.address
            } : undefined
        };
        onUpdateMember(updatedMember);
        setShowEditMemberModal(false);
    };

    const submitEditAccount = (e: React.FormEvent) => { e.preventDefault(); if (!editingAccount) return; const updatedAccount: Account = { ...editingAccount, status: editAccountForm.status as AccountStatus, interestRate: parseFloat(editAccountForm.interestRate), maturityDate: editAccountForm.maturityDate || undefined, lowBalanceAlertThreshold: editAccountForm.lowBalanceThreshold ? parseFloat(editAccountForm.lowBalanceThreshold) : undefined }; onUpdateAccount(updatedAccount); setShowEditAccountModal(false); };

    const openViewAccountModal = (acc: Account) => {
        setViewingAccount(acc);
        // Reset simulator defaults
        setViewSimAmount('');
        setViewSimType('deposit');
        setViewForecastMonths('12');
        setShowAccountViewModal(true);
    }

    const submitInteraction = () => { if (!newNote) return; onAddInteraction({ memberId: member.id, date: new Date().toISOString().split('T')[0], staffName: 'Current User', type: 'System', notes: newNote, sentiment: 'Neutral' }); setNewNote(''); };

    // --- Print Functions ---
    const printViaWindow = (content: string) => {
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (printWindow) {
            printWindow.document.write(content);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        } else {
            alert("Popup blocked. Please allow popups for this site to print.");
        }
    };

    // Helper for Receipt Generation
    const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

        const convert = (n: number): string => {
            if (n === 0) return '';
            if (n < 10) return ones[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
            return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
        };

        if (num === 0) return 'Zero';

        let words = '';
        let remaining = Math.floor(num);

        if (remaining >= 10000000) {
            words += convert(Math.floor(remaining / 10000000)) + ' Crore ';
            remaining %= 10000000;
        }
        if (remaining >= 100000) {
            words += convert(Math.floor(remaining / 100000)) + ' Lakh ';
            remaining %= 100000;
        }
        if (remaining >= 1000) {
            words += convert(Math.floor(remaining / 1000)) + ' Thousand ';
            remaining %= 1000;
        }
        words += convert(remaining);
        return words.trim();
    };

    const handlePrintFDCertificate = (acc: Account) => {
        if (acc.type !== AccountType.FIXED_DEPOSIT) return;

        const dateStr = formatDate(acc.transactions[0]?.date || new Date().toISOString());
        const termYears = (acc.termMonths || 12) / 12;
        const rate = acc.interestRate || 0;
        const maturityAmt = Math.round(acc.balance * Math.pow(1 + (rate / 100), termYears));

        const amountInWords = numberToWords(acc.balance);
        const maturityInWords = numberToWords(maturityAmt);

        const certNo = acc.id.split('-').pop(); // Simple cert number from ID

        const htmlContent = `
            <html>
            <head>
                <title>FD Certificate - ${acc.accountNumber}</title>
                <style>
                    @page { size: portrait; margin: 10mm; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; line-height: 1.2; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
                    .header h1 { margin: 0; font-size: 20px; color: #000; }
                    .header p { margin: 5px 0 0; font-size: 12px; }
                    .gray-bar { background: #f0f0f0; border: 1px solid #ccc; font-weight: bold; padding: 5px 10px; display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px; }
                    .info-section { display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; }
                    .info-column { display: flex; flex-direction: column; gap: 8px; }
                    .info-row { display: flex; line-height: 1.4; }
                    .label { width: 130px; color: #555; font-size: 10px; }
                    .value { flex: 1; font-weight: bold; color: #000; }
                    .footer { margin-top: 40px; font-weight: bold; font-size: 10px; }
                    .auth-text { text-align: center; margin-bottom: 40px; font-size: 11px; }
                    .sig-grid { display: flex; justify-content: space-between; text-align: center; font-weight: bold; font-size: 10px; margin-top: 40px; }
                    .spacer { height: 40px; border-bottom: 1px dashed #ccc; margin-bottom: 40px; }
                    .cert-title { background: #999; color: #fff; text-align: center; padding: 5px; margin-bottom: 15px; font-size: 16px; font-weight: bold; }
                    .lower-info { border: 1px solid #ccc; padding: 15px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</h1>
                    <p>E-287/8, PUL PEHLADPUR, DELHI-110044</p>
                </div>
                <div class="gray-bar"><span>REG.NO-10954</span><span style="border: 1px solid #000; padding: 2px 10px;">Cash</span></div>
                <div class="info-section">
                    <div class="info-column">
                        <div class="info-row"><span class="label">Certificate No.</span><span class="value">: ${certNo}</span></div>
                        <div class="info-row"><span class="label">Depositor Name</span><span class="value">: Mr./Ms. ${member.fullName.toUpperCase()}</span></div>
                        <div class="info-row"><span class="label">Nominee's Name</span><span class="value">: ${member.nominee?.name || '-'}</span></div>
                        <div class="info-row"><span class="label">Address</span><span class="value">: ${member.currentAddress}</span></div>
                        <div class="info-row" style="margin-top: 10px;"><span class="label">Deposit Period</span><span class="value">: ${acc.termMonths} Months</span></div>
                        <div class="info-row"><span class="label">Deposit Rate</span><span class="value">: ${acc.interestRate}%</span></div>
                        <div class="info-row"><span class="label">Voucher Details</span><span class="value">: Initial Deposit - ${dateStr}</span></div>
                    </div>
                    <div class="info-column" style="border-left: 1px solid #eee; padding-left: 20px;">
                        <div class="info-row"><span class="label">A/c.No.</span><span class="value">: ${acc.accountNumber}</span></div>
                        <div class="info-row"><span class="label">Deposit Date</span><span class="value">: ${dateStr}</span></div>
                        <div class="info-row"><span class="label">Value Date</span><span class="value">: ${dateStr}</span></div>
                        <div class="info-row"><span class="label">Deposit Amt.</span><span class="value">: ${acc.balance.toFixed(2)}</span></div>
                        <div class="info-row"><span class="label">Int.Cease Date</span><span class="value">: ${formatDate(acc.maturityDate)}</span></div>
                        <div class="info-row"><span class="label">Pay Date</span><span class="value">: ${formatDate(acc.maturityDate)}</span></div>
                        <div class="info-row"><span class="label">Maturity Amt.</span><span class="value">: ${maturityAmt.toFixed(2)}</span></div>
                    </div>
                </div>
                <div style="display:flex; justify-content: space-between; margin-top: 40px; font-weight: bold;"><span>Receiver Signature</span><span>Auth. Signature</span></div>
                <div class="spacer"></div>
                <div class="header">
                    <h1>JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</h1>
                    <p>E-287/8, PUL PEHLADPUR, DELHI-110044</p>
                </div>
                <div style="text-align:center; font-weight:bold; margin-bottom: 5px;">REG.NO-10954<br/>9911770293, 9911773542</div>
                <div class="cert-title">Fixed Deposit Certificate</div>
                <div class="lower-info">
                    <div class="info-section">
                        <div class="info-column">
                            <div class="info-row"><span class="label">Certificate No.</span><span class="value">: ${certNo}</span></div>
                            <div class="info-row"><span class="label">Depositor Name</span><span class="value">: Mr./Ms. ${member.fullName.toUpperCase()}</span></div>
                            <div class="info-row"><span class="label">Nominee's Name</span><span class="value">: ${member.nominee?.name || '-'}</span></div>
                            <div class="info-row"><span class="label">Father/Husband Name</span><span class="value">: ${member.fatherName || '-'}</span></div>
                            <div class="info-row"><span class="label">Address</span><span class="value">: ${member.currentAddress}</span></div>
                            <div class="info-row"><span class="label">Deposit in Words</span><span class="value">: ${amountInWords} Only</span></div>
                            <div class="info-row"><span class="label">Maturity in Words</span><span class="value">: ${maturityInWords} Only</span></div>
                            <div class="info-row"><span class="label">Voucher Details</span><span class="value">: Initial Deposit - ${dateStr}</span></div>
                        </div>
                        <div class="info-column" style="border-left: 1px solid #eee; padding-left: 20px;">
                            <div class="info-row"><span class="label">A/c.No.</span><span class="value">: ${acc.accountNumber}</span></div>
                            <div class="info-row"><span class="label">Deposit Date</span><span class="value">: ${dateStr}</span></div>
                            <div class="info-row"><span class="label">Value Date</span><span class="value">: ${dateStr}</span></div>
                            <div class="info-row"><span class="label">Deposit Amt.</span><span class="value">: ${acc.balance.toFixed(2)}</span></div>
                            <div class="info-row"><span class="label">Deposit Period</span><span class="value">: ${acc.termMonths} Months</span></div>
                            <div class="info-row"><span class="label">Deposit Rate</span><span class="value">: ${acc.interestRate}%</span></div>
                            <div class="info-row"><span class="label">Int.Cease Date</span><span class="value">: ${formatDate(acc.maturityDate)}</span></div>
                            <div class="info-row"><span class="label">Pay Date</span><span class="value">: ${formatDate(acc.maturityDate)}</span></div>
                            <div class="info-row"><span class="label">Maturity Amt.</span><span class="value">: ${maturityAmt.toFixed(2)}</span></div>
                        </div>
                    </div>
                </div>
                <div class="auth-text" style="margin-top: 30px;">For JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</div>
                <div class="sig-grid"><div>SEAL</div><div>MANAGER/ACCOUNTANT</div><div>PRESIDENT</div><div>HONY. SECRETARY</div><div>TREASURER</div></div>
                <div style="text-align:center; font-size:10px; margin-top:20px;">Have a Nice Day</div>
            </body>
            </html>
        `;

        printViaWindow(htmlContent);
    };

    const handlePrintRegReceipt = (overrideAmount?: number) => {
        // Reconstruct data
        const shareAcc = accounts.find(a => a.type === AccountType.SHARE_CAPITAL);
        const cdAcc = accounts.find(a => a.type === AccountType.COMPULSORY_DEPOSIT);

        // IMPORTANT: Registration receipt should ALWAYS show original registration amounts, not current balances
        // Use originalAmount (set during activation) or fallback to form values during initial activation
        const fees = { building: 450, welfare: 400, entry: 100 };
        const smAmount = shareAcc?.originalAmount ?? activateForm.shareMoney ?? 0;
        const cdAmount = cdAcc?.originalAmount ?? activateForm.compulsoryDeposit ?? 0;

        const totalAmount = overrideAmount || (fees.building + fees.welfare + fees.entry + smAmount + cdAmount);
        const amountInWords = numberToWords(totalAmount);
        const dateStr = formatDate(member.joinDate);
        const numId = member.id.replace(/\D/g, '');

        // Payment Mode String Logic
        let paymentModeStr = `Pay. Mode: ${activateForm.paymentMethod}`;
        if (activateForm.paymentMethod === 'Both') {
            paymentModeStr = `Cash (₹${activateForm.cashAmount}) Online (₹${activateForm.onlineAmount})`;
        }

        const items = [
            { label: 'Admission Fee', val: fees.entry },
            { label: 'Building Fund', val: fees.building },
            { label: 'Member Welfare Fund', val: fees.welfare },
            { label: 'COMPULSARY DEPOSIT (1)', val: cdAmount },
            { label: 'SHARE MONEY (1)', val: smAmount },
        ];

        const getReceiptHTML = (copyType: string) => `
        <div class="receipt-box">
            <div class="header-top">
                <span style="float:left">REG.NO-10954</span>
                <span style="float:right">9911770293, 9911773542</span>
                <div style="clear:both"></div>
            </div>
            
            <div style="text-align:center; position:relative; margin-top: 5px;">
                <span style="font-size:16px; font-weight:bold; letter-spacing: 2px;">RECEIPT</span>
                <span style="position:absolute; right:0; top:5px; font-size:10px;">${copyType}</span>
            </div>

            <div style="text-align:center; font-weight:bold; font-size:14px; margin-top:5px;">
                JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.
            </div>
            <div style="text-align:center; font-size:10px;">
                E-287/8, PUL PEHLADPUR, DELHI-110044
            </div>

            <div class="info-grid">
                <div class="row">
                    <div class="cell"><span class="lbl">Receipt No.</span> : <b>${member.id}</b></div>
                    <div class="cell right"><span class="lbl">Rcpt.Date</span> : ${dateStr}</div>
                </div>
                <div class="row">
                    <div class="cell"><span class="lbl">Recd. from</span> : <b>${member.fullName}</b></div>
                    <div class="cell right"><span class="lbl">M.No.</span> <b>${numId}</b></div>
                </div>
                <div class="row">
                    <div class="cell"><span class="lbl">F/H Name</span> : ${member.fatherName || ''}</div>
                </div>
                <div class="row">
                    <div class="cell"><span class="lbl">Recd. Mode</span> : ${paymentModeStr}</div>
                </div>
            </div>

            <div class="particulars-section">
                <div class="p-header">
                    <span class="p-lbl">Particulars</span>
                    <span class="p-val">Amount</span>
                </div>
                <div class="p-body">
                    ${items.map(i => i.val > 0 ? `
                        <div class="p-row">
                            <span class="p-lbl">${i.label}</span>
                            <span class="p-val">${i.val.toFixed(2)}</span>
                        </div>
                    ` : '').join('')}
                </div>
                <div class="p-total">
                    ${totalAmount.toFixed(2)}
                </div>
            </div>

            <div class="words">
                ${amountInWords} only
            </div>

            <div class="auth-for">
                For JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.
            </div>

            <div class="footer-bottom">
                <div class="balances">
                    SM:${smAmount} Cr CD:${cdAmount} Cr
                </div>
                <div class="sigs">
                    <div>Cashier Signature</div>
                    <div>Administrator</div>
                </div>
            </div>
            <div style="text-align:center; font-size:10px; margin-top:5px;">Have a Nice Day</div>
        </div>
    `;

        const htmlContent = `
        <html>
        <head>
          <title>Registration Receipt</title>
          <style>
            @page { size: landscape; margin: 5mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; color: #000; }
            .page-container { display: flex; flex-direction: row; width: 100%; justify-content: space-between; }
            .receipt-copy { width: 48%; }
            .separator { border-right: 1px dashed #000; margin: 0 10px; }
            
            .receipt-box { padding: 10px; display: flex; flex-direction: column; min-height: 400px; position:relative; }
            
            .header-top { font-size: 10px; font-weight: bold; }
            
            .info-grid { margin-top: 15px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .cell { flex: 1; }
            .cell.right { text-align: right; }
            .lbl { display: inline-block; width: 80px; }
            
            /* Compact Particulars */
            .particulars-section { margin-top: 10px; border-top: 1px solid #ccc; border-bottom: 1px solid #000; padding-bottom: 2px; }
            .p-header { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding: 2px 0; font-weight: bold; margin-bottom: 2px; }
            .p-row { display: flex; justify-content: space-between; line-height: 1.2; font-size: 11px; }
            .p-total { text-align: right; font-weight: bold; font-size: 12px; margin-top: 4px; padding-top: 2px; border-top: 1px solid #ccc; }
            
            .words { margin-top: 10px; font-style: italic; font-size: 11px; font-weight: bold; }
            
            .auth-for { text-align: right; margin-top: 20px; font-weight: bold; font-size: 10px; }
            
            .footer-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; }
            .balances { font-weight: bold; font-size: 10px; }
            .sigs { text-align: right; font-size: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="receipt-copy">
                ${getReceiptHTML('Office Copy')}
            </div>
            <div class="separator"></div>
            <div class="receipt-copy">
                ${getReceiptHTML('Member Copy')}
            </div>
          </div>
        </body>
        </html>
    `;
        printViaWindow(htmlContent);
    };

    const generateReceiptHTML = (tx: Transaction, acc: Account, balanceAfter: number, mem: Member) => {
        const dateStr = formatDate(tx.date);
        let paymentDetails: string = `Pay. Mode: ${tx.paymentMethod || 'Cash'}`;
        if (tx.paymentMethod === 'Both' && (tx.cashAmount || tx.onlineAmount)) {
            paymentDetails = `Pay. Mode: Cash (₹${tx.cashAmount || 0}) Online (₹${tx.onlineAmount || 0})`;
        }
        if (tx.utrNumber) {
            paymentDetails += ` UTR:${tx.utrNumber}`;
        }

        const getReceipt = () => `
        <div class="receipt-box">
            <div class="watermark">ATULYA</div>
            <div class="header">
                <div class="reg-no">Reg. No.: 10954</div>
                <div class="org-name">JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</div>
                <div class="org-contact">Ph: 9911770293 , 9911773542</div>
            </div>
            <div class="tx-header">
                <h3>TRANSACTION RECEIPT</h3>
            </div>
            <div class="row"><span class="label">Date:</span><span class="val">${dateStr}</span></div>
            <div class="row"><span class="label">Receipt No:</span><span class="val">${tx.id}</span></div>
            
            <div class="divider"></div>
            
            <div class="row"><span class="label">Member Name:</span><span class="val">${mem.fullName}</span></div>
            <div class="row"><span class="label">Father/Husband:</span><span class="val">${mem.fatherName || '-'}</span></div>
            <div class="row"><span class="label">Member ID:</span><span class="val">${mem.id}</span></div>
            <div class="row"><span class="label">Account No:</span><span class="val">${acc.accountNumber}</span></div>
            <div class="row"><span class="label">Account Type:</span><span class="val">${acc.type}</span></div>
            
            <div class="divider"></div>
            
            <div class="row"><span class="label">Tx Type:</span><span class="val" style="text-transform: uppercase;">${tx.type}</span></div>
            <div class="row"><span class="label">Description:</span><span class="val">${tx.description}</span></div>
            <div class="row" style="margin-top: 5px; font-size: 14px;"><span class="label">Amount:</span><span class="val" style="font-weight: bold;">${formatCurrency(tx.amount)}</span></div>
            <div class="row"><span class="label">Method:</span><span class="val" style="font-size: 9px;">${paymentDetails}</span></div>
            
            <div class="divider"></div>
            
            <div class="row"><span class="label">Available Balance:</span><span class="val" style="font-weight: bold;">${formatCurrency(balanceAfter)}</span></div>
            
            <div class="footer">
                <div class="sig-line">Authorized Signatory</div>
            </div>
        </div>
    `;

        return `
    <html>
      <head>
        <title>Receipt ${tx.id}</title>
        <style>
          /* Hide browser headers/footers */
          @page { margin: 0; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 10px; margin: 0; }
          .page-container { width: 100%; max-width: 400px; margin: 0 auto; }
          .receipt-copy { margin-bottom: 20px; border-bottom: 1px dashed #333; padding-bottom: 20px; }
          .receipt-copy:last-child { border-bottom: none; margin-bottom: 0; }
          .receipt-box { border: 1px solid #000; padding: 15px; background: #fff; position: relative; }
          .header { text-align: center; margin-bottom: 10px; position: relative; }
          .reg-no { font-size: 9px; position: absolute; top: -5px; left: 0; font-weight: bold; }
          .org-name { font-size: 12px; font-weight: bold; text-transform: uppercase; margin-top: 10px; }
          .org-contact { font-size: 9px; margin-top: 2px; font-weight: bold; }
          .tx-header h3 { text-align: center; margin: 5px 0 10px 0; border-bottom: 1px dashed #ccc; padding-bottom: 5px; font-size: 14px; font-weight: bold; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .label { font-weight: bold; color: #555; }
          .val { text-align: right; max-width: 60%; }
          .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
          .footer { text-align: right; margin-top: 20px; font-size: 10px; padding-top: 10px; color: #333; }
          .sig-line { border-top: 1px solid #ccc; display: inline-block; padding-top: 2px; width: 100px; text-align: center; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); opacity: 0.05; font-size: 40px; z-index: 0; font-weight: bold; pointer-events: none; }
        </style>
      </head>
      <body>
        <div class="page-container">
           <div class="receipt-copy">
             <div style="text-align: center; font-size: 9px; font-weight: bold; margin-bottom: 2px;">OFFICE COPY</div>
             ${getReceipt()}
           </div>
           <div class="receipt-copy">
             <div style="text-align: center; font-size: 9px; font-weight: bold; margin-bottom: 2px;">MEMBER COPY</div>
             ${getReceipt()}
           </div>
        </div>
      </body>
    </html>
  `;
    };

    const printReceipt = (tx: Transaction, acc: Account, balanceAfter: number) => {
        printViaWindow(generateReceiptHTML(tx, acc, balanceAfter, member));
    };

    const submitTransaction = (e: React.FormEvent) => {
        e.preventDefault();
        if (!transForm.accountId) return;

        const account = accounts.find(a => a.id === transForm.accountId);
        if (!account) return;

        // Calculate Amount
        let amt = 0;
        if (transForm.paymentMethod === 'Both') {
            const cash = parseFloat(transForm.cashAmount) || 0;
            const online = parseFloat(transForm.onlineAmount) || 0;
            amt = cash + online;
        } else {
            amt = parseFloat(transForm.amount) || 0;
        }

        if (amt <= 0) return;

        /*
        // UTR is now OPTIONAL as per request
        if ((transForm.paymentMethod === 'Online' || transForm.paymentMethod === 'Both') && !transForm.utrNumber) {
            // Warning removed
        } 
        */

        const type = transForm.type as 'credit' | 'debit';
        const txId = `TX-${Date.now()}`;
        const txDate = new Date().toISOString().split('T')[0];

        let newBal = account.balance;
        if (account.type === AccountType.LOAN) {
            if (type === 'credit') newBal -= amt;
            else newBal += amt;
        } else {
            if (type === 'credit') newBal += amt;
            else newBal -= amt;
        }

        const newTx: Transaction = {
            id: txId,
            amount: amt,
            type: type,
            description: transForm.description,
            date: txDate,
            dueDate: transForm.dueDate || undefined,
            paymentMethod: transForm.paymentMethod,
            cashAmount: transForm.paymentMethod === 'Both' ? parseFloat(transForm.cashAmount) || 0 : undefined,
            onlineAmount: transForm.paymentMethod === 'Both' ? parseFloat(transForm.onlineAmount) || 0 : undefined,
            utrNumber: transForm.utrNumber || undefined
        };

        onAddTransaction(transForm.accountId, newTx);
        setTransactionSuccess({ txId, amount: amt, type, accountNumber: account.accountNumber, accountType: account.type, date: new Date().toLocaleString(), balanceAfter: newBal, description: transForm.description });
        setTransForm({ accountId: accounts[0]?.id || '', type: 'credit', amount: '', description: '', dueDate: '', paymentMethod: 'Cash', cashAmount: '', onlineAmount: '', utrNumber: '' });
    };
    const handlePrintSuccessReceipt = () => { if (!transactionSuccess) return; const acc = accounts.find(a => a.accountNumber === transactionSuccess.accountNumber); if (acc) { printReceipt({ id: transactionSuccess.txId, amount: transactionSuccess.amount, type: transactionSuccess.type as any, date: new Date().toISOString(), description: transactionSuccess.description, paymentMethod: 'Cash' }, acc, transactionSuccess.balanceAfter); } };
    const closeTransModal = () => { setShowTransModal(false); setTransactionSuccess(null); };

    // --- Account Wizard Logic ---
    const handleNextStep = () => { if (accountWizardStep === 1) { setAccountWizardStep(2); } else if (accountWizardStep === 2) { if (accountForm.type === AccountType.LOAN && (!guarantors.g1Name || !guarantors.g1Phone)) { alert("At least one guarantor is required for loans."); return; } setAccountWizardStep(3); } };
    const handlePrevStep = () => { if (accountWizardStep > 1) setAccountWizardStep(accountWizardStep - 1); };

    const calculate = useCallback(() => {
        const P = parseFloat(accountForm.amount) || 0;
        const R = parseFloat(accountForm.interestRate) || 0;
        let termMonths = 0;
        let termDays = 0;

        if (accountForm.type === AccountType.FIXED_DEPOSIT) {
            termMonths = (parseFloat(accountForm.tenureYears) || 0) * 12;
        } else if (accountForm.type === AccountType.RECURRING_DEPOSIT && accountForm.rdFrequency === 'Daily') {
            termDays = parseInt(accountForm.tenureDays) || 0;
            termMonths = Math.round(termDays / 30);
        } else {
            termMonths = parseInt(accountForm.tenureMonths) || 0;
        }

        if (P === 0) { setCalcResult(null); return; }
        const maturityDate = new Date();
        if (termDays > 0) maturityDate.setDate(maturityDate.getDate() + termDays);
        else maturityDate.setMonth(maturityDate.getMonth() + termMonths);

        const maturityDateStr = maturityDate.toISOString().split('T')[0];

        if (accountForm.type === AccountType.OPTIONAL_DEPOSIT) {
            const interest = P * (R / 100);
            setCalcResult({ interestEarned: Math.round(interest), principal: P, maturityDate: undefined });
        } else if (accountForm.type === AccountType.FIXED_DEPOSIT) {
            const n_years = termMonths / 12;
            const A = P * Math.pow((1 + R / 100), n_years);
            setCalcResult({ maturityAmount: Math.round(A), interestEarned: Math.round(A - P), principal: P, totalPayable: Math.round(A), maturityDate: maturityDateStr });
        } else if (accountForm.type === AccountType.RECURRING_DEPOSIT) {
            let interest = 0;
            let totalPrincipal = 0;
            if (accountForm.rdFrequency === 'Daily') {
                const days = termDays;
                totalPrincipal = P * days;
                interest = (P * (days * (days + 1)) / 2) * (R / 36500);
            } else {
                interest = P * (termMonths * (termMonths + 1) / 2) * (R / 1200);
                totalPrincipal = P * termMonths;
            }
            setCalcResult({ maturityAmount: Math.round(totalPrincipal + interest), interestEarned: Math.round(interest), principal: totalPrincipal, totalPayable: Math.round(totalPrincipal + interest), maturityDate: maturityDateStr });
        } else if (accountForm.type === AccountType.LOAN) {
            if (accountForm.loanType === LoanType.EMERGENCY) {
                const years = termMonths / 12;
                const totalInterest = P * (R / 100) * years;
                const totalPay = P + totalInterest;
                const emi = termMonths > 0 ? totalPay / termMonths : 0;
                setCalcResult({ emi: Math.round(emi), totalInterest: Math.round(totalInterest), totalPayable: Math.round(totalPay), principal: P, maturityDate: maturityDateStr });
            } else {
                const r = R / 12 / 100;
                if (termMonths > 0) {
                    const emi = (P * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
                    const totalPay = emi * termMonths;
                    setCalcResult({ emi: Math.round(emi), totalInterest: Math.round(totalPay - P), totalPayable: Math.round(totalPay), principal: P, maturityDate: maturityDateStr });
                } else {
                    setCalcResult({ principal: P, maturityDate: maturityDateStr });
                }
            }
        } else {
            setCalcResult({ principal: P, maturityDate: maturityDateStr });
        }
    }, [accountForm]);

    useEffect(() => {
        if (showAccountModal && accountWizardStep === 2) {
            calculate();
        }
    }, [showAccountModal, accountWizardStep, accountForm, calculate]);

    const submitAccount = (e: React.FormEvent) => {
        e.preventDefault();
        const openingBalance = parseFloat(accountForm.amount) || 0;

        const finalGuarantors: Guarantor[] = [];
        if (accountForm.type === AccountType.LOAN) {
            if (guarantors.g1Name) finalGuarantors.push({ name: guarantors.g1Name, phone: guarantors.g1Phone, relation: guarantors.g1Rel });
            if (guarantors.g2Name) finalGuarantors.push({ name: guarantors.g2Name, phone: guarantors.g2Phone, relation: guarantors.g2Rel });
        }

        const newAccountData: Partial<Account> = {
            type: accountForm.type,
            loanType: accountForm.type === AccountType.LOAN ? accountForm.loanType : undefined,
            balance: openingBalance,
            status: AccountStatus.ACTIVE,
            currency: 'INR',
            interestRate: parseFloat(accountForm.interestRate),
            termMonths: accountForm.type === AccountType.FIXED_DEPOSIT
                ? (parseFloat(accountForm.tenureYears) || 0) * 12
                : accountForm.type !== AccountType.OPTIONAL_DEPOSIT
                    ? (accountForm.rdFrequency === 'Daily' ? undefined : parseInt(accountForm.tenureMonths))
                    : undefined,
            maturityDate: calcResult?.maturityDate,
            rdFrequency: accountForm.type === AccountType.RECURRING_DEPOSIT ? accountForm.rdFrequency as any : undefined,
            originalAmount: openingBalance,
            guarantors: finalGuarantors
        };

        onAddAccount(member.id, newAccountData);

        // Set success state for confirmation screen
        setAccountSuccess({
            id: `NEW-${Date.now()}`, // Temporary until refresh
            type: accountForm.type,
            accountNumber: 'Generated...',
            amount: openingBalance
        });

        // LOAN FEES LOGIC (700rs for Emergency Loans)
        if (accountForm.type === AccountType.LOAN && accountForm.loanType === LoanType.EMERGENCY) {
            onAddLedgerEntry({
                id: `LDG-FEES-${Date.now()}`,
                memberId: member.id,
                date: new Date().toISOString().split('T')[0],
                description: `Loan Fees (Emergency) - ${member.fullName} | Breakdown: Verification ₹450, File ₹100, Affidavit ₹150`,
                amount: 700,
                type: 'Income',
                category: 'Loan Processing Fees',
                cashAmount: 700, // Default to cash
                onlineAmount: 0
            });
        }
    };

    const closeAccountModal = () => {
        setShowAccountModal(false);
        setAccountSuccess(null);
        setAccountWizardStep(1);
        setAccountForm(prev => ({ ...prev, amount: '0', purpose: '' }));
        setGuarantors({ g1Name: '', g1Phone: '', g1Rel: 'Friend', g2Name: '', g2Phone: '', g2Rel: 'Family' });
        setActiveTab('accounts');
    };

    const submitActivation = async (e: React.FormEvent) => {
        e.preventDefault();

        const totalFees = activateForm.buildingFund + activateForm.shareMoney + activateForm.compulsoryDeposit + activateForm.welfareFund + activateForm.entryCharge;

        // Validation for Split
        if (activateForm.paymentMethod === 'Both') {
            const cash = parseFloat(activateForm.cashAmount) || 0;
            const online = parseFloat(activateForm.onlineAmount) || 0;
            if (Math.abs((cash + online) - totalFees) > 1) {
                alert(`Split payment amounts must sum to Total Payable (₹${totalFees}).`);
                return;
            }
        }

        // 1. Create Receipt Document
        const receiptDoc: MemberDocument = {
            id: `DOC-REG-${Date.now()}`,
            name: 'Registration Receipt',
            type: 'Receipt',
            category: 'Other',
            description: 'Membership Activation Receipt',
            uploadDate: new Date().toISOString().split('T')[0],
            url: '#'
        };

        // 2. Update Member Status & Docs
        const updatedMember = {
            ...member,
            status: 'Active' as const,
            documents: [...(member.documents || []), receiptDoc]
        };

        onUpdateMember(updatedMember);

        // 3. Create Accounts
        onAddAccount(member.id, {
            type: AccountType.SHARE_CAPITAL,
            balance: activateForm.shareMoney,
            originalAmount: activateForm.shareMoney,
            status: AccountStatus.ACTIVE,
            currency: 'INR',
            interestRate: 0,
        });

        onAddAccount(member.id, {
            type: AccountType.COMPULSORY_DEPOSIT,
            balance: activateForm.compulsoryDeposit,
            originalAmount: activateForm.compulsoryDeposit,
            status: AccountStatus.ACTIVE,
            currency: 'INR',
            interestRate: appSettings.interestRates.compulsoryDeposit,
        });

        // 4. Create Ledger Entry for Fees (using prop)
        onAddLedgerEntry({
            id: `LDG-ACTIVATE-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            description: `Activation Fees - ${member.fullName}`,
            amount: totalFees,
            type: 'Income',
            category: 'Admission Fees & Deposits',
            cashAmount: activateForm.paymentMethod === 'Both' ? parseFloat(activateForm.cashAmount) || 0 : undefined,
            onlineAmount: activateForm.paymentMethod === 'Both' ? parseFloat(activateForm.onlineAmount) || 0 : undefined,
        });

        // 5. Print Receipt
        handlePrintRegReceipt(totalFees);

        setShowActivateModal(false);
    };

    const handlePrintStatement = () => {
        // ... (Existing statement print logic unchanged)
        const allTx = accounts
            .filter(a => !(a.type === AccountType.LOAN && a.status === 'Pending'))
            .flatMap(a => a.transactions.map(t => ({ ...t, account: a.accountNumber, accType: a.type })))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const content = `<html><head><style>body { font-family: Arial, sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; } th, td { border: 1px solid #ccc; padding: 8px; text-align: left; } .amount { text-align: right; }</style></head><body><h1>Statement</h1><table><thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Description</th><th>UTR</th><th class="amount">Amount</th></tr></thead><tbody>${allTx.map(t => `<tr><td>${formatDate(t.date)}</td><td>${t.account}<br/>${t.accType}</td><td>${t.type}</td><td>${t.description}</td><td>${t.utrNumber || '-'}</td><td class="amount">${formatCurrency(t.amount)}</td></tr>`).join('')}</tbody></table></body></html>`;
        printViaWindow(content);
    };

    // --- Helper to get Account Card Detailed Rows ---
    const getAccountCardDetails = (acc: Account) => {
        const rows = [];
        const isLoan = acc.type === AccountType.LOAN;
        const isFD = acc.type === AccountType.FIXED_DEPOSIT;
        const isRD = acc.type === AccountType.RECURRING_DEPOSIT;
        const isOD = acc.type === AccountType.OPTIONAL_DEPOSIT;

        // Row 1: Key Financial Metric
        if (isLoan) {
            rows.push({ label: 'Original Loan', value: formatCurrency(acc.originalAmount || 0), icon: Target });
        } else if (isFD) {
            rows.push({ label: 'Principal', value: formatCurrency(acc.initialAmount || acc.balance), icon: Target });
        } else if (isRD) {
            rows.push({ label: 'Installment', value: formatCurrency(acc.emi || 0) + (acc.rdFrequency === 'Daily' ? '/day' : '/mo'), icon: Target });
        } else if (isOD) {
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
        } else {
            rows.push({ label: 'Balance', value: formatCurrency(acc.balance), icon: Wallet });
        }

        // Row 2: Secondary Metric
        if (isLoan) {
            rows.push({ label: 'EMI Amount', value: formatCurrency(acc.emi || 0), icon: Calendar });
        } else if (isFD || isRD) {
            rows.push({ label: 'Maturity Date', value: formatDate(acc.maturityDate), icon: Clock });
        } else if (isOD) {
            const minBal = getMinBalanceForYear(acc);
            rows.push({ label: 'Min Balance (YTD)', value: formatCurrency(minBal), icon: Shield });
        }

        // Row 3: Projection/Detail
        if (isFD) {
            const P = acc.initialAmount || acc.balance;
            const R = acc.interestRate || 0;
            const n_years = (acc.termMonths || 12) / 12;
            let matVal = 0;
            if (acc.maturityDate) {
                const t = (acc.termMonths || 12) / 12;
                matVal = P * Math.pow((1 + R / 100), t);
            }
            rows.push({ label: 'Est. Maturity Value', value: formatCurrency(Math.round(matVal)), icon: PiggyBank, highlight: true });
        } else if (isRD) {
            rows.push({ label: 'Frequency', value: acc.rdFrequency || 'Monthly', icon: Calendar });
        } else if (isLoan) {
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
        } else if (isOD) {
            rows.push({ label: 'Est. Interest', value: calculateInterest(acc.balance, acc.interestRate || 0, acc.type, acc).value.toFixed(0), icon: PiggyBank });
        }

        return rows;
    };

    const agentName = useMemo(() => {
        if (!member.agentId) return null;
        return agents.find(a => a.id === member.agentId)?.name;
    }, [member.agentId, agents]);

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            <datalist id="editRelationOptions">
                {RELATION_OPTIONS.map(opt => <option key={opt} value={opt} />)}
            </datalist>

            {/* Header and Tabs unchanged */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="text-slate-600" /></button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-900">{member.fullName}</h1>
                        <button onClick={openEditMemberModal} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={16} /></button>
                    </div>
                    <p className="text-slate-500 text-sm flex items-center gap-2">ID: {member.id} • <span className={`w-2 h-2 rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-700' : member.status === 'Pending' ? 'bg-yellow-500' : 'bg-red-500'}`}></span> {member.status}</p>
                </div>

                {/* Pending Member Activation Action */}
                {member.status === 'Pending' && (
                    <button
                        onClick={() => setShowActivateModal(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold flex items-center gap-2 animate-pulse"
                    >
                        <CheckCircle size={16} /> Activate Membership & Pay Fees
                    </button>
                )}

                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium flex items-center gap-2"><Phone size={16} /> Call</button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"><Mail size={16} /> Message</button>
                </div>
            </div>

            <div className="border-b border-slate-200 flex gap-6 overflow-x-auto">
                {['overview', 'accounts', 'receipts', 'documents', 'crm'].map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-3 text-sm font-medium capitalize transition-colors border-b-2 whitespace-nowrap ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab === 'crm' ? 'Interactions (CRM)' : tab === 'receipts' ? 'History & Receipts' : tab}</button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'overview' && (
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-100">
                            <div className="flex items-start gap-4"><div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600"><Sparkles size={24} /></div><div className="flex-1"><h3 className="text-indigo-900 font-bold mb-2">AI Member Insight</h3>{loadingAi ? <p>Loading...</p> : <p className="text-indigo-800 text-sm leading-relaxed">{aiSummary}</p>}</div></div>
                        </div>
                    )}

                    {activeTab === 'accounts' && (
                        <div className="space-y-4">
                            {/* Account List ... */}
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-slate-900">Member Accounts</h3>
                                <div className="flex gap-2">
                                    {/* Passbook Button: Shows 'Issue Passbook' if never printed, else 'Passbook' with count */}
                                    <button onClick={onOpenPassbook} className={`relative text-sm border px-3 py-1.5 rounded-lg flex items-center gap-2 ${unprintedCount > 0 || !member.lastPrintedTransactionId ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}>
                                        <BookOpen size={16} />
                                        {!member.lastPrintedTransactionId ? 'Issue Passbook' : 'Passbook'}
                                        {member.lastPrintedTransactionId && unprintedCount > 0 ? (
                                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                                                {unprintedCount > 99 ? '99+' : unprintedCount} Pending
                                            </span>
                                        ) : (
                                            !member.lastPrintedTransactionId ? null : <Check size={14} className="text-green-600" />
                                        )}
                                    </button>
                                    <button onClick={handlePrintStatement} className="text-sm bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-2"><Printer size={16} /> Full Statement</button>
                                    <button onClick={() => setShowTransModal(true)} className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2"><Plus size={16} /> Record Transaction</button>
                                </div>
                            </div>
                            {accounts.map(acc => {
                                const isFD = acc.type === AccountType.FIXED_DEPOSIT;
                                const details = getAccountCardDetails(acc);
                                return (
                                    <div key={acc.id} onClick={() => openViewAccountModal(acc)} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition-all hover:shadow-md cursor-pointer relative group">
                                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isFD && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrintFDCertificate(acc); }}
                                                    className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm hover:bg-emerald-700"
                                                >
                                                    <Printer size={12} /> Print Certificate
                                                </button>
                                            )}
                                            <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                                <Calculator size={12} /> Simulate
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${acc.type === AccountType.LOAN ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                                    <CreditCard size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                                        {acc.type}
                                                        {acc.loanType && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{acc.loanType}</span>}
                                                    </h4>
                                                    <p className="text-xs text-slate-500 font-mono">{acc.accountNumber}</p>
                                                </div>
                                            </div>
                                            <div className="text-right pr-8 flex flex-col items-end">
                                                <p className={`text-lg font-bold ${acc.type === AccountType.LOAN ? 'text-red-600' : 'text-slate-900'}`}>{formatCurrency(acc.balance)}</p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full mt-1 ${acc.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                                    acc.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>{acc.status}</span>
                                            </div>
                                        </div>

                                        {/* Pending Loan Approval Action */}
                                        {acc.status === 'Pending' && acc.type === AccountType.LOAN && userRole === 'Admin' && (
                                            <div className="mb-3 pb-3 border-b border-amber-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm(`Approve ${acc.loanType || 'Loan'} for ${formatCurrency(acc.balance)}?`)) {
                                                            onUpdateAccount({ ...acc, status: AccountStatus.ACTIVE });
                                                        }
                                                    }}
                                                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold flex items-center justify-center gap-2 animate-pulse"
                                                >
                                                    <CheckCircle size={16} /> Approve Loan
                                                </button>
                                            </div>
                                        )}

                                        {/* Enhanced Account Details Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
                                            {details.map((d, i) => (
                                                <div key={i} className={d.highlight ? 'bg-blue-50 p-1.5 rounded -m-1.5' : ''}>
                                                    <p className="text-slate-400 mb-1 flex items-center gap-1">
                                                        <d.icon size={10} /> {d.label}
                                                    </p>
                                                    <p className={`font-semibold ${d.highlight ? 'text-blue-700' : 'text-slate-700'}`}>
                                                        {d.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                            {accounts.length === 0 && (
                                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                                    <Wallet size={32} className="mx-auto text-slate-400 mb-2" />
                                    <p className="text-slate-500">No active accounts for this member.</p>
                                    <button onClick={() => setShowAccountModal(true)} className="text-blue-600 text-sm font-medium hover:underline mt-2">Open New Account</button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'receipts' && (
                        <div className="space-y-6">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <History size={18} className="text-blue-600" />
                                        Financial Activity & Receipts
                                    </h3>
                                    <div className="text-xs text-slate-500 font-medium">
                                        Showing last 1000 financial interactions
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-100/80 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold text-slate-700">Date</th>
                                                <th className="px-6 py-3 font-semibold text-slate-700">Description</th>
                                                <th className="px-6 py-3 font-semibold text-slate-700">Ref / Category</th>
                                                <th className="px-6 py-3 font-semibold text-slate-700">Method</th>
                                                <th className="px-6 py-3 font-semibold text-slate-700 text-right">Amount</th>
                                                <th className="px-6 py-3 font-semibold text-slate-700 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(() => {
                                                const allActivity = [
                                                    ...accounts.flatMap(a => a.transactions.map(t => ({
                                                        ...t,
                                                        ref: `${a.type.split(' ')[0]} - ${a.accountNumber.split('-').pop()}`,
                                                        itemType: 'transaction' as const,
                                                        fullAcc: a
                                                    }))),
                                                    ...(ledger || []).filter(l => l.memberId === member.id).map(l => ({
                                                        id: l.id,
                                                        date: l.date,
                                                        description: l.description,
                                                        amount: l.amount,
                                                        type: l.type === 'Income' ? 'credit' : 'debit',
                                                        paymentMethod: l.onlineAmount && l.onlineAmount > 0 ? (l.cashAmount && l.cashAmount > 0 ? 'Both' : 'Online') : 'Cash',
                                                        utrNumber: l.utrNumber,
                                                        ref: l.category,
                                                        itemType: 'ledger' as const
                                                    }))
                                                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                    .slice(0, 1000);

                                                if (allActivity.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic bg-slate-50/20">
                                                                No financial records found for this member.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return allActivity.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="px-6 py-4 text-slate-600 font-mono text-xs whitespace-nowrap">{formatDate(item.date)}</td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-slate-900 font-semibold">{item.description}</div>
                                                            {item.utrNumber && <div className="text-[10px] text-slate-400 font-mono mt-0.5">UTR: {item.utrNumber}</div>}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${item.itemType === 'transaction' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                                                                {item.ref}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{item.paymentMethod || 'Cash'}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className={`font-mono font-black ${item.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                                {item.type === 'credit' ? '+' : '-'}{formatCurrency(item.amount)}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    if (item.itemType === 'transaction') {
                                                                        printReceipt(item as any, (item as any).fullAcc, (item as any).fullAcc.balance);
                                                                    } else {
                                                                        // Custom Receipt for Fees/Ledger
                                                                        const mockAccount = { type: 'FEE_PAYMENT', accountNumber: 'SOCIETY-LEDGER' } as any;
                                                                        printReceipt(item as any, mockAccount, 0);
                                                                    }
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1 rounded-md text-xs font-bold border border-blue-200"
                                                            >
                                                                Print Receipt
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'documents' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-900">Member Documents</h3>
                                <button onClick={() => setShowUploadModal(true)} className="text-sm bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2">
                                    <Upload size={16} /> Upload Document
                                </button>
                            </div>

                            {(!member.documents || member.documents.length === 0) ? (
                                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                    <FileText size={48} className="mx-auto text-slate-300 mb-2" />
                                    <p className="text-slate-500">No documents uploaded yet.</p>
                                    <button onClick={() => setShowUploadModal(true)} className="text-blue-600 hover:underline text-sm mt-2">Upload KYC or Application forms</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {member.documents.map((doc) => (
                                        <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow group relative">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                    <FileText size={24} />
                                                </div>
                                                <span className="text-[10px] uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">{doc.type}</span>
                                            </div>
                                            <h4 className="font-bold text-slate-900 text-sm truncate" title={doc.name}>{doc.name}</h4>
                                            <p className="text-xs text-slate-500 mb-4">{doc.category} • {formatDate(doc.uploadDate)}</p>
                                            <div className="flex gap-2 mt-2">
                                                {doc.type === 'Receipt' && doc.name === 'Registration Receipt' ? (
                                                    <button
                                                        onClick={() => handlePrintRegReceipt()}
                                                        className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                        <Printer size={12} /> Print Receipt
                                                    </button>
                                                ) : (
                                                    <a
                                                        href={doc.url}
                                                        download={doc.name}
                                                        className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                        <Download size={12} /> Download
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'crm' && (
                        <div className="space-y-6">
                            {/* Add Note Section */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="font-bold text-slate-900 mb-3">Record Interaction</h3>
                                <textarea
                                    className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px]"
                                    placeholder="Type notes about call, visit, or request..."
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                />
                                <div className="flex justify-between items-center mt-3">
                                    <button
                                        onClick={handleDraft}
                                        disabled={isDrafting || !newNote}
                                        className="text-indigo-600 text-sm font-medium flex items-center gap-2 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        <Sparkles size={16} /> {isDrafting ? 'Refining...' : 'Refine with AI'}
                                    </button>
                                    <button
                                        onClick={submitInteraction}
                                        disabled={!newNote}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        Save Record
                                    </button>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-900">Interaction History</h3>
                                {interactions.length === 0 ? (
                                    <p className="text-slate-500 text-sm italic">No interactions recorded yet.</p>
                                ) : (
                                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pl-6 pb-2">
                                        {interactions.map((interaction) => (
                                            <div key={interaction.id} className="relative">
                                                <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${interaction.sentiment === 'Negative' ? 'bg-red-500' : interaction.sentiment === 'Positive' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                                                <div className="bg-white border border-slate-200 rounded-lg p-4">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <span className="text-xs font-bold text-slate-700 uppercase bg-slate-100 px-2 py-0.5 rounded mr-2">{interaction.type}</span>
                                                            <span className="text-xs text-slate-400">{formatDate(interaction.date)}</span>
                                                        </div>
                                                        <span className="text-xs text-slate-500">by {interaction.staffName}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-700 leading-relaxed">{interaction.notes}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-900 mb-4">Contact Information</h3>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3"><Mail className="text-slate-400 mt-0.5" size={18} /><div><p className="text-sm font-medium text-slate-900">Email</p><p className="text-sm text-slate-500">{member.email}</p></div></div>
                            <div className="flex items-start gap-3"><Phone className="text-slate-400 mt-0.5" size={18} /><div><p className="text-sm font-medium text-slate-900">Phone</p><p className="text-sm text-slate-500">{member.phone}</p></div></div>
                            <div className="flex items-start gap-3"><User className="text-slate-400 mt-0.5" size={18} /><div><p className="text-sm font-medium text-slate-900">Father/Husband</p><p className="text-sm text-slate-500">{member.fatherName || '-'}</p></div></div>
                            <div className="flex items-start gap-3"><Calendar className="text-slate-400 mt-0.5" size={18} /><div><p className="text-sm font-medium text-slate-900">Date of Birth</p><p className="text-sm text-slate-500">{formatDate(member.dateOfBirth)}</p></div></div>

                            <div className="pt-2 mt-2 border-t border-slate-100 space-y-3">
                                <div className="flex items-start gap-3">
                                    <MapPin className="text-slate-400 mt-0.5" size={18} />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Current Address <span className="text-xs text-slate-400 font-normal">({member.residenceType || 'Unknown'})</span></p>
                                        <p className="text-xs text-slate-500">{member.currentAddress || 'N/A'}</p>
                                        {(member.city || member.pinCode) && (
                                            <p className="text-xs text-slate-500 font-medium">{member.city} - {member.pinCode}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-[18px]" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Permanent Address</p>
                                        <p className="text-xs text-slate-500">{member.permanentAddress || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Agent Details */}
                            <div className="pt-2 mt-2 border-t border-slate-100">
                                <div className="flex items-start gap-3">
                                    <User className="text-slate-400 mt-0.5" size={18} />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Assigned Agent</p>
                                        <p className="text-xs text-slate-500">
                                            {agentName ? (
                                                <>{agentName} <span className="text-[10px] text-slate-400">({member.agentId})</span></>
                                            ) : (
                                                member.agentId || 'Unassigned'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <button onClick={() => setShowAccountModal(true)} className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-medium transition-colors"><Plus size={16} /> Open New Account</button>
                        </div>
                    </div>

                    {member.nominee && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Users size={18} className="text-purple-500" /> Nominee Details</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between border-b border-slate-50 pb-2">
                                    <span className="text-sm text-slate-500">Name</span>
                                    <span className="text-sm font-medium text-slate-900">{member.nominee.name}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-2">
                                    <span className="text-sm text-slate-500">Relation</span>
                                    <span className="text-sm font-medium text-slate-900">{member.nominee.relation}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-2">
                                    <span className="text-sm text-slate-500">DOB</span>
                                    <span className="text-sm font-medium text-slate-900">{member.nominee.dateOfBirth ? formatDate(member.nominee.dateOfBirth) : '-'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-2">
                                    <span className="text-sm text-slate-500">Contact</span>
                                    <span className="text-sm font-medium text-slate-900">{member.nominee.phone || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-slate-500 block mb-1">Address</span>
                                    <span className="text-xs text-slate-900">{member.nominee.address || '-'}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- MODALS SECTION --- */}

            {/* Account Wizard Modal (Restored) */}
            {showAccountModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold text-lg">Open New Account</h3>
                            <button onClick={closeAccountModal}><X size={20} /></button>
                        </div>

                        <div className="p-6">
                            {/* Stepper */}
                            <div className="flex justify-between mb-6 px-4">
                                {[1, 2, 3].map(s => (
                                    <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${accountWizardStep >= s ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-400'}`}>
                                        {s}
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={submitAccount} className="space-y-4">
                                {accountWizardStep === 1 && (
                                    <div className="animate-fade-in space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Account Type</label>
                                            <select
                                                className="w-full border p-2 rounded-lg bg-white"
                                                value={accountForm.type}
                                                onChange={e => setAccountForm({ ...accountForm, type: e.target.value as AccountType })}
                                            >
                                                {availableAccountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            {availableAccountTypes.length === 0 && <p className="text-xs text-red-500 mt-1">No account types available for creation.</p>}
                                        </div>

                                        {accountForm.type === AccountType.LOAN && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Loan Category</label>
                                                <select
                                                    className="w-full border p-2 rounded-lg bg-white"
                                                    value={accountForm.loanType}
                                                    onChange={e => setAccountForm({ ...accountForm, loanType: e.target.value as LoanType })}
                                                >
                                                    {Object.values(LoanType).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                                    {accountForm.type === AccountType.LOAN ? 'Loan Amount' : 'Opening Balance'}
                                                </label>
                                                <input
                                                    type="number"
                                                    className="w-full border p-2 rounded-lg"
                                                    value={accountForm.amount}
                                                    onChange={e => setAccountForm({ ...accountForm, amount: e.target.value })}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Interest Rate (%)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    className="w-full border p-2 rounded-lg"
                                                    value={accountForm.interestRate}
                                                    onChange={e => setAccountForm({ ...accountForm, interestRate: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {accountForm.type === AccountType.RECURRING_DEPOSIT && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Frequency</label>
                                                <div className="flex gap-4">
                                                    <label className="flex items-center gap-2"><input type="radio" name="rdFreq" checked={accountForm.rdFrequency === 'Monthly'} onChange={() => setAccountForm({ ...accountForm, rdFrequency: 'Monthly' })} /> Monthly</label>
                                                    <label className="flex items-center gap-2"><input type="radio" name="rdFreq" checked={accountForm.rdFrequency === 'Daily'} onChange={() => setAccountForm({ ...accountForm, rdFrequency: 'Daily' })} /> Daily</label>
                                                </div>
                                            </div>
                                        )}

                                        {accountForm.type === AccountType.FIXED_DEPOSIT && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                                    Tenure (Years)
                                                </label>
                                                <input
                                                    type="number"
                                                    className="w-full border p-2 rounded-lg"
                                                    value={accountForm.tenureYears}
                                                    onChange={e => setAccountForm({ ...accountForm, tenureYears: e.target.value })}
                                                />
                                            </div>
                                        )}

                                        {(accountForm.type === AccountType.RECURRING_DEPOSIT || accountForm.type === AccountType.LOAN) && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                                    {accountForm.rdFrequency === 'Daily' ? 'Tenure (Days)' : 'Tenure (Months)'}
                                                </label>
                                                <input
                                                    type="number"
                                                    className="w-full border p-2 rounded-lg"
                                                    value={accountForm.rdFrequency === 'Daily' ? accountForm.tenureDays : accountForm.tenureMonths}
                                                    onChange={e => accountForm.rdFrequency === 'Daily' ? setAccountForm({ ...accountForm, tenureDays: e.target.value }) : setAccountForm({ ...accountForm, tenureMonths: e.target.value })}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {accountWizardStep === 2 && (
                                    <div className="animate-fade-in space-y-4">
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                            <h4 className="font-bold text-blue-800 mb-2 text-sm flex items-center gap-2"><Calculator size={16} /> Projected Details</h4>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                {calcResult?.emi !== undefined && (
                                                    <div>
                                                        <p className="text-slate-500 text-xs">Estimated EMI</p>
                                                        <p className="font-bold text-slate-900">{formatCurrency(calcResult.emi)}</p>
                                                    </div>
                                                )}
                                                {calcResult?.maturityAmount !== undefined && (
                                                    <div>
                                                        <p className="text-slate-500 text-xs">Maturity Value</p>
                                                        <p className="font-bold text-green-600">{formatCurrency(calcResult.maturityAmount)}</p>
                                                    </div>
                                                )}
                                                {calcResult?.interestEarned !== undefined && (
                                                    <div>
                                                        <p className="text-slate-500 text-xs">Total Interest</p>
                                                        <p className="font-bold text-slate-900">{formatCurrency(calcResult.interestEarned)}</p>
                                                    </div>
                                                )}
                                                {calcResult?.maturityDate && (
                                                    <div>
                                                        <p className="text-slate-500 text-xs">Maturity Date</p>
                                                        <p className="font-bold text-slate-900">{formatDate(calcResult.maturityDate)}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {accountForm.type === AccountType.LOAN && (
                                            <div className="border-t pt-4">
                                                <h4 className="font-bold text-slate-900 text-sm mb-3">Guarantor Details (Required)</h4>
                                                <div className="space-y-4">
                                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                        <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Guarantor 1 (Primary)</p>
                                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                                            <input className="border p-2 rounded text-sm bg-white" placeholder="Name" value={guarantors.g1Name} onChange={e => setGuarantors({ ...guarantors, g1Name: e.target.value })} />
                                                            <input className="border p-2 rounded text-sm bg-white" placeholder="Phone" value={guarantors.g1Phone} onChange={e => setGuarantors({ ...guarantors, g1Phone: e.target.value })} />
                                                        </div>
                                                        <select
                                                            className="w-full border p-2 rounded text-sm bg-white"
                                                            value={guarantors.g1Rel}
                                                            onChange={e => setGuarantors({ ...guarantors, g1Rel: e.target.value })}
                                                        >
                                                            {RELATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </div>

                                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                        <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Guarantor 2 (Secondary)</p>
                                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                                            <input className="border p-2 rounded text-sm bg-white" placeholder="Name (Optional)" value={guarantors.g2Name} onChange={e => setGuarantors({ ...guarantors, g2Name: e.target.value })} />
                                                            <input className="border p-2 rounded text-sm bg-white" placeholder="Phone" value={guarantors.g2Phone} onChange={e => setGuarantors({ ...guarantors, g2Phone: e.target.value })} />
                                                        </div>
                                                        <select
                                                            className="w-full border p-2 rounded text-sm bg-white"
                                                            value={guarantors.g2Rel}
                                                            onChange={e => setGuarantors({ ...guarantors, g2Rel: e.target.value })}
                                                        >
                                                            {RELATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {accountSuccess ? (
                                    <div className="animate-fade-in text-center py-4">
                                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                            <Check size={32} />
                                        </div>
                                        <h4 className="text-xl font-bold text-slate-900">Account Created Successfully</h4>
                                        <p className="text-slate-500 text-sm mt-2 mb-6">
                                            A new <strong>{accountSuccess.type}</strong> account has been opened for {member.fullName} with an opening balance of <strong>{formatCurrency(accountSuccess.amount)}</strong>.
                                        </p>
                                        <div className="flex flex-col gap-3">
                                            {accountSuccess.type === AccountType.FIXED_DEPOSIT && (
                                                <button
                                                    onClick={() => {
                                                        const latestAcc = accounts.find(a => a.type === AccountType.FIXED_DEPOSIT);
                                                        if (latestAcc) handlePrintFDCertificate(latestAcc);
                                                    }}
                                                    className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-emerald-700"
                                                >
                                                    <Printer size={18} /> Print FD Certificate
                                                </button>
                                            )}
                                            <button onClick={closeAccountModal} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                ) : accountWizardStep === 3 && (
                                    <div className="animate-fade-in text-center py-4">
                                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle size={32} />
                                        </div>
                                        <h4 className="text-xl font-bold text-slate-900">Ready to Create</h4>
                                        <p className="text-slate-500 text-sm mt-2 mb-2">
                                            You are about to create a <strong>{accountForm.type}</strong> account for {member.fullName} with an opening balance of <strong>{formatCurrency(parseFloat(accountForm.amount) || 0)}</strong>.
                                        </p>

                                        {accountForm.type === AccountType.LOAN && accountForm.loanType === LoanType.EMERGENCY && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left mb-6">
                                                <p className="text-amber-800 font-bold text-xs uppercase mb-1">One-time Processing Fee: ₹700</p>
                                                <ul className="text-[10px] text-amber-700 space-y-0.5 list-disc pl-4">
                                                    <li>Verification Charge: ₹450</li>
                                                    <li>File Charge: ₹100</li>
                                                    <li>Affidavit Cost: ₹150</li>
                                                </ul>
                                            </div>
                                        )}
                                        {!(accountForm.type === AccountType.LOAN && accountForm.loanType === LoanType.PERSONAL) && <div className="mb-6"></div>}
                                        <button type="submit" className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg">
                                            Confirm Creation
                                        </button>
                                    </div>
                                )}

                                {/* Navigation Buttons */}
                                {!accountSuccess && accountWizardStep < 3 && (
                                    <div className="flex justify-between pt-4 border-t border-slate-100 mt-4">
                                        {accountWizardStep > 1 ? (
                                            <button type="button" onClick={handlePrevStep} className="text-slate-500 font-medium hover:text-slate-800">Back</button>
                                        ) : <div></div>}
                                        <button type="button" onClick={handleNextStep} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800">
                                            Next Step
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {showTransModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in relative">
                        {transactionSuccess ? (
                            <div className="p-8 text-center">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                    <Check size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Transaction Successful</h3>
                                <p className="text-slate-500 mb-6">Recorded {formatCurrency(transactionSuccess.amount)} {transactionSuccess.type} to {transactionSuccess.accountType}.</p>
                                <div className="flex flex-col gap-3">
                                    <button onClick={handlePrintSuccessReceipt} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2"><Printer size={18} /> Print Receipt</button>
                                    <button onClick={closeTransModal} className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg font-medium">Close</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                                    <h3 className="font-bold text-lg">Record Transaction</h3>
                                    <button onClick={closeTransModal}><X size={20} /></button>
                                </div>
                                <form onSubmit={submitTransaction} className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Select Account</label>
                                        <select
                                            className="w-full border p-2 rounded-lg bg-white"
                                            value={transForm.accountId}
                                            onChange={e => setTransForm({ ...transForm, accountId: e.target.value })}
                                        >
                                            {accounts.map(a => (
                                                <option key={a.id} value={a.id}>{a.type} - {a.accountNumber} ({formatCurrency(a.balance)})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setTransForm({ ...transForm, type: 'credit' })}
                                                    className={`flex-1 py-2 text-sm font-bold rounded-lg ${transForm.type === 'credit' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-slate-100 text-slate-500'}`}
                                                >
                                                    Credit (+)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTransForm({ ...transForm, type: 'debit' })}
                                                    className={`flex-1 py-2 text-sm font-bold rounded-lg ${transForm.type === 'debit' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-slate-100 text-slate-500'}`}
                                                >
                                                    Debit (-)
                                                </button>
                                            </div>
                                        </div>

                                        {/* Dynamic Amount Field(s) */}
                                        {transForm.paymentMethod !== 'Both' ? (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Amount</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-2 text-slate-400">₹</span>
                                                    <input
                                                        type="number"
                                                        className="w-full border p-2 pl-7 rounded-lg font-mono text-lg"
                                                        value={transForm.amount}
                                                        onChange={e => setTransForm({ ...transForm, amount: e.target.value })}
                                                        placeholder="0"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-end justify-center">
                                                <div className="text-right w-full">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Total</label>
                                                    <div className="text-lg font-bold font-mono">
                                                        ₹{(parseFloat(transForm.cashAmount) || 0) + (parseFloat(transForm.onlineAmount) || 0)}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
                                        <div className="flex gap-2">
                                            {['Cash', 'Online', 'Both'].map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setTransForm({ ...transForm, paymentMethod: m as any })}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded border ${transForm.paymentMethod === m ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Split Inputs if Both */}
                                    {transForm.paymentMethod === 'Both' && (
                                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-fade-in">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Cash Amount</label>
                                                <input
                                                    type="number"
                                                    className="w-full border p-2 rounded-lg font-mono"
                                                    placeholder="0"
                                                    value={transForm.cashAmount}
                                                    onChange={e => setTransForm({ ...transForm, cashAmount: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Online Amount</label>
                                                <input
                                                    type="number"
                                                    className="w-full border p-2 rounded-lg font-mono"
                                                    placeholder="0"
                                                    value={transForm.onlineAmount}
                                                    onChange={e => setTransForm({ ...transForm, onlineAmount: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* UTR Input */}
                                    {(transForm.paymentMethod === 'Online' || transForm.paymentMethod === 'Both') && (
                                        <div className="animate-fade-in">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">UTR / Ref No. (Required)</label>
                                            <input
                                                type="text"
                                                className="w-full border p-2 rounded-lg font-mono uppercase"
                                                placeholder="e.g. UTR12345678"
                                                value={transForm.utrNumber}
                                                onChange={e => setTransForm({ ...transForm, utrNumber: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Description</label>
                                        <input
                                            className="w-full border p-2 rounded-lg"
                                            placeholder="e.g. Monthly Savings, Loan Installment"
                                            value={transForm.description}
                                            onChange={e => setTransForm({ ...transForm, description: e.target.value })}
                                        />
                                    </div>

                                    <button type="submit" className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2">
                                        <Check size={18} /> Complete Transaction
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Member Modal */}
            {showEditMemberModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => setShowEditMemberModal(false)} className="absolute top-4 right-4 text-slate-400"><X size={20} /></button>
                        <h3 className="font-bold text-lg mb-4">Edit Member</h3>

                        <div className="flex gap-4 border-b mb-4">
                            <button onClick={() => setEditMemberTab('profile')} className={`pb-2 text-sm ${editMemberTab === 'profile' ? 'border-b-2 border-blue-600 font-bold' : ''}`}>Profile</button>
                            <button onClick={() => setEditMemberTab('contact')} className={`pb-2 text-sm ${editMemberTab === 'contact' ? 'border-b-2 border-blue-600 font-bold' : ''}`}>Contact</button>
                            <button onClick={() => setEditMemberTab('nominee')} className={`pb-2 text-sm ${editMemberTab === 'nominee' ? 'border-b-2 border-blue-600 font-bold' : ''}`}>Nominee</button>
                        </div>

                        <form onSubmit={submitEditMember} className="space-y-4">
                            {editMemberTab === 'profile' && (
                                <>
                                    <input className="w-full border p-2 rounded" placeholder="Full Name" value={editMemberForm.fullName || ''} onChange={e => setEditMemberForm({ ...editMemberForm, fullName: e.target.value })} />
                                    <input className="w-full border p-2 rounded" placeholder="Father/Husband Name" value={editMemberForm.fatherName || ''} onChange={e => setEditMemberForm({ ...editMemberForm, fatherName: e.target.value })} />
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-500">Date of Birth</label>
                                        <input type="date" className="w-full border p-2 rounded" value={editMemberForm.dateOfBirth || ''} onChange={e => setEditMemberForm({ ...editMemberForm, dateOfBirth: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-500">Current / Residence Address</label>
                                        <textarea className="w-full border p-2 rounded" placeholder="Current Address" value={editMemberForm.currentAddress || ''} onChange={e => setEditMemberForm({ ...editMemberForm, currentAddress: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500">City</label>
                                            <input className="w-full border p-2 rounded" placeholder="City" value={editMemberForm.city || ''} onChange={e => setEditMemberForm({ ...editMemberForm, city: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500">Pin Code</label>
                                            <input className="w-full border p-2 rounded" placeholder="Pin" value={editMemberForm.pinCode || ''} onChange={e => setEditMemberForm({ ...editMemberForm, pinCode: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-500">Permanent Address</label>
                                        <textarea className="w-full border p-2 rounded" placeholder="Permanent Address" value={editMemberForm.permanentAddress || ''} onChange={e => setEditMemberForm({ ...editMemberForm, permanentAddress: e.target.value })} />
                                    </div>
                                    <div className="flex gap-4 items-center border p-2 rounded">
                                        <span className="text-sm text-slate-600">Residence:</span>
                                        <label className="flex items-center gap-1 text-sm"><input type="radio" name="editResType" value="Owned" checked={editMemberForm.residenceType === 'Owned'} onChange={() => setEditMemberForm({ ...editMemberForm, residenceType: 'Owned' })} /> Owned</label>
                                        <label className="flex items-center gap-1 text-sm"><input type="radio" name="editResType" value="Rented" checked={editMemberForm.residenceType === 'Rented'} onChange={() => setEditMemberForm({ ...editMemberForm, residenceType: 'Rented' })} /> Rented</label>
                                    </div>

                                    <select className="w-full border p-2 rounded" value={editMemberForm.status || 'Active'} onChange={e => setEditMemberForm({ ...editMemberForm, status: e.target.value as any })}>
                                        <option value="Active">Active</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Suspended">Suspended</option>
                                    </select>
                                </>
                            )}
                            {editMemberTab === 'contact' && (
                                <>
                                    <input className="w-full border p-2 rounded" placeholder="Email" value={editMemberForm.email || ''} onChange={e => setEditMemberForm({ ...editMemberForm, email: e.target.value })} />
                                    <input className="w-full border p-2 rounded" placeholder="Phone" value={editMemberForm.phone || ''} onChange={e => setEditMemberForm({ ...editMemberForm, phone: e.target.value })} />
                                </>
                            )}
                            {editMemberTab === 'nominee' && (
                                <>
                                    <input className="w-full border p-2 rounded" placeholder="Nominee Name" value={editNomineeForm.name || ''} onChange={e => setEditNomineeForm({ ...editNomineeForm, name: e.target.value })} />
                                    <input
                                        className="w-full border p-2 rounded"
                                        placeholder="Relation"
                                        list="editRelationOptions"
                                        value={editNomineeForm.relation || ''}
                                        onChange={e => setEditNomineeForm({ ...editNomineeForm, relation: e.target.value })}
                                    />
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-slate-500">Date of Birth</label>
                                        <input className="w-full border p-2 rounded" type="date" value={editNomineeForm.dateOfBirth || ''} onChange={e => setEditNomineeForm({ ...editNomineeForm, dateOfBirth: e.target.value })} />
                                    </div>
                                    <input className="w-full border p-2 rounded" placeholder="Nominee Phone" value={editNomineeForm.phone || ''} onChange={e => setEditNomineeForm({ ...editNomineeForm, phone: e.target.value })} />
                                    <textarea className="w-full border p-2 rounded" placeholder="Nominee Address" value={editNomineeForm.address || ''} onChange={e => setEditNomineeForm({ ...editNomineeForm, address: e.target.value })} />
                                </>
                            )}
                            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold">Save Changes</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Activate Member Modal */}
            {showActivateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in relative">
                        <div className="bg-green-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold text-lg">Activate Membership</h3>
                            <button onClick={() => setShowActivateModal(false)}><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-green-50 p-4 rounded-lg flex items-center gap-3">
                                <div className="p-2 bg-green-100 text-green-600 rounded-full"><Sparkles size={24} /></div>
                                <div>
                                    <p className="text-green-800 font-bold">One-time Activation Fee</p>
                                    <p className="text-green-700 text-xs">Total Payable: ₹1,550</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2 bg-slate-50 border rounded">Building Fund: ₹450</div>
                                <div className="p-2 bg-slate-50 border rounded">Share Money: ₹400</div>
                                <div className="p-2 bg-slate-50 border rounded">Compulsory Dep: ₹200</div>
                                <div className="p-2 bg-slate-50 border rounded">Welfare Fund: ₹400</div>
                                <div className="p-2 bg-slate-50 border rounded">Entry Charge: ₹100</div>
                            </div>

                            <div className="pt-4 border-t">
                                <label className="block text-xs font-bold text-slate-500 mb-2">Payment Mode</label>
                                <div className="flex gap-2">
                                    {['Cash', 'Online', 'Both'].map(m => (
                                        <button key={m} onClick={() => setActivateForm({ ...activateForm, paymentMethod: m as any })} className={`flex-1 py-2 text-sm font-bold rounded border ${activateForm.paymentMethod === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activateForm.paymentMethod === 'Both' && (
                                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                    <input type="number" placeholder="Cash" className="border p-2 rounded" value={activateForm.cashAmount} onChange={e => setActivateForm({ ...activateForm, cashAmount: e.target.value })} />
                                    <input type="number" placeholder="Online" className="border p-2 rounded" value={activateForm.onlineAmount} onChange={e => setActivateForm({ ...activateForm, onlineAmount: e.target.value })} />
                                </div>
                            )}

                            <button onClick={submitActivation} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg mt-4">
                                Confirm & Activate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 relative">
                        <button onClick={() => setShowUploadModal(false)} className="absolute top-4 right-4 text-slate-400"><X size={20} /></button>
                        <h3 className="font-bold text-lg mb-4">Upload Document</h3>
                        <form onSubmit={submitUpload} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                                <select className="w-full border p-2 rounded" value={uploadForm.category} onChange={e => setUploadForm({ ...uploadForm, category: e.target.value })}>
                                    <option value="ID Proof">ID Proof</option>
                                    <option value="Address Proof">Address Proof</option>
                                    <option value="Photo">Photo</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <input type="file" className="w-full border p-2 rounded" onChange={handleFileChange} />
                            <textarea className="w-full border p-2 rounded" placeholder="Description" value={uploadForm.description} onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })} />
                            <button type="submit" disabled={isUploading} className="w-full py-2 bg-blue-600 text-white rounded font-bold">
                                {isUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Account Modal */}
            {showEditAccountModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 relative">
                        <button onClick={() => setShowEditAccountModal(false)} className="absolute top-4 right-4 text-slate-400"><X size={20} /></button>
                        <h3 className="font-bold text-lg mb-4">Edit Account Settings</h3>
                        <form onSubmit={submitEditAccount} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500">Status</label>
                                <select className="w-full border p-2 rounded" value={editAccountForm.status} onChange={e => setEditAccountForm({ ...editAccountForm, status: e.target.value })}>
                                    <option value="Active">Active</option>
                                    <option value="Dormant">Dormant</option>
                                    <option value="Closed">Closed</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500">Interest Rate (%)</label>
                                <input type="number" className="w-full border p-2 rounded" value={editAccountForm.interestRate} onChange={e => setEditAccountForm({ ...editAccountForm, interestRate: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full py-2 bg-slate-900 text-white rounded font-bold">Update Account</button>
                        </form>
                    </div>
                </div>
            )}

            {/* View Account Modal (Calculators) */}
            {showAccountViewModal && viewingAccount && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative p-6 shadow-2xl">
                        <button onClick={() => setShowAccountViewModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>

                        <div className="flex items-center gap-4 mb-8">
                            <div className={`p-3 rounded-xl ${viewingAccount.type === AccountType.LOAN ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                <CreditCard size={32} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900">{viewingAccount.type}</h3>
                                <p className="text-slate-500 font-mono">{viewingAccount.accountNumber}</p>
                            </div>
                            <div className="ml-auto text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase">Current Balance</p>
                                <p className="text-3xl font-black text-slate-900">{formatCurrency(viewingAccount.balance)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Projections & Calculators */}
                            <div className="space-y-6">
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp size={18} className="text-blue-600" />
                                        <h4 className="font-bold text-slate-900">Forecast Calculator</h4>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Forecast Period (Months)</label>
                                            <input type="range" min="1" max="60" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" value={viewForecastMonths} onChange={e => setViewForecastMonths(e.target.value)} />
                                            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>1m</span><span>{viewForecastMonths} months</span><span>60m</span></div>
                                        </div>
                                        <div className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-600">Projected Interest</span>
                                            <span className="text-lg font-bold text-green-600">+{formatCurrency((viewingAccount.balance * (viewingAccount.interestRate || 0) / 100) * (parseInt(viewForecastMonths) / 12))}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calculator size={18} className="text-blue-700" />
                                        <h4 className="font-bold text-blue-900">Simulation</h4>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setViewSimType('deposit')} className={`flex-1 py-1.5 text-xs font-bold rounded ${viewSimType === 'deposit' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 border border-blue-200'}`}>Deposit</button>
                                            <button type="button" onClick={() => setViewSimType('withdraw')} className={`flex-1 py-1.5 text-xs font-bold rounded ${viewSimType === 'withdraw' ? 'bg-amber-600 text-white' : 'bg-white text-amber-600 border border-amber-200'}`}>Withdraw</button>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-slate-400">₹</span>
                                            <input type="number" placeholder="Enter amount..." className="w-full border p-2 pl-7 rounded-lg" value={viewSimAmount} onChange={e => setViewSimAmount(e.target.value)} />
                                        </div>
                                        {viewSimAmount && (
                                            <div className="bg-white p-3 rounded-lg border border-blue-50 flex justify-between items-center animate-pulse">
                                                <span className="text-sm text-slate-600">New Balance</span>
                                                <span className="text-lg font-bold text-slate-900">
                                                    {formatCurrency(viewingAccount.balance + (viewSimType === 'deposit' ? parseFloat(viewSimAmount) || 0 : -(parseFloat(viewSimAmount) || 0)))}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Account History Snippet */}
                            <div>
                                <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <History size={18} className="text-slate-400" />
                                    Recent History
                                </h4>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                    {viewingAccount.transactions.length > 0 ? viewingAccount.transactions.slice(0, 10).map(t => (
                                        <div key={t.id} className="p-3 border rounded-lg bg-white hover:bg-slate-50 transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase">{formatDate(t.date)}</span>
                                                <span className={`text-sm font-bold ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600 truncate">{t.description}</p>
                                        </div>
                                    )) : <div className="text-center py-10 text-slate-400 text-sm italic">No transaction history</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
