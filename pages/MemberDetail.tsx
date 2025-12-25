import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Member, Account, Interaction, Transaction, AccountType, AccountStatus, LoanType, MemberDocument, UserRole, AppSettings, Guarantor, Nominee, LedgerEntry, Agent } from '../types';
import { generateMemberSummary, analyzeFinancialHealth, draftInteractionNote, calculateMemberRisk } from '../services/gemini';
import { formatDate, parseSafeDate } from '../services/utils';
import { Sparkles, ArrowLeft, Phone, Mail, Plus, CreditCard, Clock, X, Check, AlertTriangle, Pencil, Download, BookOpen, Printer, Wallet, User, TrendingUp, Calendar, Trash2, FileText, ChevronDown, ChevronUp, Lock, Users, ArrowUpRight, ArrowDownLeft, Upload, Calculator, AlertCircle, PieChart, Info, MapPin, Target, Shield, PiggyBank, MousePointerClick, AlignVerticalSpaceAround, History, RotateCcw, CheckCircle, Search, DollarSign, XCircle } from 'lucide-react';

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
    const [interestChecked, setInterestChecked] = useState(false);
    const [loanProjectEmi, setLoanProjectEmi] = useState<string>('');
    const [loanProjectTenure, setLoanProjectTenure] = useState<string>('');

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
        date: new Date().toISOString().split('T')[0], // Transaction date (YYYY-MM-DD)
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
    const [isLockedAccount, setIsLockedAccount] = useState(false);

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
    const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
    const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
    const [isActivating, setIsActivating] = useState(false);

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
        purpose: '', // Personalization
        openingDate: new Date().toISOString().split('T')[0], // Account opening date (YYYY-MM-DD)
        paymentMethod: 'Cash' as 'Cash' | 'Online' | 'Both',
        cashAmount: '',
        onlineAmount: '',
        utrNumber: ''
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
        onlineAmount: '',
        activationDate: new Date().toISOString().split('T')[0]
    });

    // Loan Guarantor State
    const [guarantors, setGuarantors] = useState({
        g1Name: '', g1Phone: '', g1Rel: 'Friend', g1MemberId: '',
        g2Name: '', g2Phone: '', g2Rel: 'Family', g2MemberId: ''
    });
    const [guarantorSearch, setGuarantorSearch] = useState({ g1: '', g2: '' });
    const [showG1Results, setShowG1Results] = useState(false);
    const [showG2Results, setShowG2Results] = useState(false);

    const handleSelectGuarantor = (slot: 'g1' | 'g2', member: Member) => {
        setGuarantors(prev => ({
            ...prev,
            [`${slot}Name`]: member.fullName,
            [`${slot}Phone`]: member.phone,
            [`${slot}MemberId`]: member.id
        }));
        setGuarantorSearch(prev => ({ ...prev, [slot]: '' }));
        if (slot === 'g1') setShowG1Results(false);
        else setShowG2Results(false);
    };

    const clearGuarantor = (slot: 'g1' | 'g2') => {
        setGuarantors(prev => ({
            ...prev,
            [`${slot}Name`]: '',
            [`${slot}Phone`]: '',
            [`${slot}MemberId`]: ''
        }));
    };

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

    const submitEditMember = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate Phone (10 digits)
        const phoneRegex = /^\d{10}$/;
        if (editMemberForm.phone && !phoneRegex.test(editMemberForm.phone)) {
            alert("Member Phone Number must be exactly 10 digits.");
            return;
        }
        if (editNomineeForm.phone && !phoneRegex.test(editNomineeForm.phone)) {
            alert("Nominee Phone Number must be exactly 10 digits.");
            return;
        }

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

        try {
            await onUpdateMember(updatedMember);
            setShowEditMemberModal(false);
        } catch (err) {
            console.error("Save failed", err);
        }
    };

    const submitEditAccount = (e: React.FormEvent) => { e.preventDefault(); if (!editingAccount) return; const updatedAccount: Account = { ...editingAccount, status: editAccountForm.status as AccountStatus, interestRate: parseFloat(editAccountForm.interestRate), maturityDate: editAccountForm.maturityDate || undefined, lowBalanceAlertThreshold: editAccountForm.lowBalanceThreshold ? parseFloat(editAccountForm.lowBalanceThreshold) : undefined }; onUpdateAccount(updatedAccount); setShowEditAccountModal(false); };

    const openViewAccountModal = (acc: Account) => {
        setViewingAccount(acc);
        // Reset simulator defaults
        setViewSimAmount('');
        setViewSimType('deposit');
        setViewForecastMonths('12');
        setLoanProjectEmi(acc.emi?.toString() || '');
        setLoanProjectTenure(acc.termMonths?.toString() || '');
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

    const handlePrintLoanApplication = (acc: Account) => {
        if (acc.type !== AccountType.LOAN) return;

        const dateStr = formatDate(new Date().toISOString());
        const amountInWords = numberToWords(acc.balance || 0);

        // Calculate Age
        const birthDate = new Date(member.dateOfBirth || '');
        const age = member.dateOfBirth ? new Date().getFullYear() - birthDate.getFullYear() : '';

        // Guarantors
        const g1 = acc.guarantors && acc.guarantors[0] ? acc.guarantors[0] : { name: '', relation: '', phone: '' };
        const g2 = acc.guarantors && acc.guarantors[1] ? acc.guarantors[1] : { name: '', relation: '', phone: '' };

        const htmlContent = `
            <html>
            <head>
                <title>Loan Application - ${acc.accountNumber}</title>
                <style>
                    @page { size: A4; margin: 10mm; }
                    body { font-family: 'Times New Roman', serif; font-size: 13px; color: #000; line-height: 1.4; }
                    .header { text-align: center; margin-bottom: 20px; position: relative; }
                    .header h2 { margin: 0; text-decoration: underline; font-size: 18px; margin-bottom: 5px; font-weight: bold; }
                    .header-box { border: 1px solid #000; padding: 2px 5px; display: inline-block; min-width: 80px; }
                    .address-block { text-align: center; font-weight: bold; margin-bottom: 20px; font-size: 14px; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: flex-end; }
                    .field-label { display: inline-block; min-width: 120px; }
                    .field-value { border-bottom: 1px dotted #000; padding: 0 5px; flex: 1; font-weight: bold; font-family: 'Courier New', monospace; min-height: 18px; }
                    .section-title { text-align: center; font-weight: bold; margin: 15px 0 10px; font-size: 14px; text-transform: uppercase; }
                    .declaration { text-align: justify; margin: 10px 0; font-size: 12px; }
                    .declaration ul { list-style-type: none; padding-left: 20px; margin: 5px 0; }
                    .sureties-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; background: #ddd; padding: 2px; }
                    .sureties-content { background: #fff; padding: 10px; display: flex; width: 100%; gap: 20px; }
                    .surety-box { flex: 1; display: flex; flex-direction: column; gap: 8px; }
                    .footer { position: fixed; bottom: 0; left: 0; right: 0; }
                    .signature-row { display: flex; justify-content: space-between; margin-top: 30px; align-items: flex-end; }
                    .signature-area { border-top: 1px solid #000; width: 220px; text-align: right; padding-top: 5px; font-size: 11px; margin-left: auto; }
                    .big-text { font-size: 18px; font-weight: bold; }
                    .w-label { width: 140px; font-size: 12px; }
                    .logo-circle { width: 60px; height: 60px; border: 1px solid #ccc; border-radius: 50%; float: left; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #ccc; margin-right: 15px; }
                </style>
            </head>
            <body>
                <div style="font-size: 10px; font-weight: bold; margin-bottom: 5px;">Reg. No. : REG.NO-10954</div>
                
                <div class="header">
                    <h2>EL / RL LOAN APPLICATION</h2>
                    <div style="position: absolute; right: 0; top: 0; border: 1px solid #000; padding: 5px; text-align: left; width: 150px; font-size: 11px;">
                        <div>Date : <span style="font-weight: bold;">${dateStr}</span></div>
                        <div style="margin-top: 5px;">A/C No. <span style="font-weight: bold; font-size: 14px; margin-left: 5px;">${acc.accountNumber.split('-').pop()}</span></div>
                    </div>
                </div>

                <div class="row" style="align-items: flex-start; margin-top: 30px;">
                    <div style="width: 40px;">To,</div>
                    <div style="flex:1;">
                        <div style="font-weight: bold;">The Secretary / President</div>
                        <div class="address-block" style="margin-top: 10px;">
                            <div class="logo-circle">Atulya</div>
                            <span class="big-text">JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</span><br/>
                            E-287/8, PUL PEHLADPUR, DELHI-110044
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px; font-size: 12px;">
                    Dear Sir,
                    <p style="text-indent: 40px; margin-top: 10px; line-height: 2;">
                        Kindly grant me Emergency Loan Rs. <span style="border-bottom: 1px dotted #000; font-weight:bold; padding: 0 10px;">${formatCurrency(acc.balance || 0)}</span> Rupees <span style="border-bottom: 1px dotted #000; font-weight:bold; padding: 0 10px;">${amountInWords} Only</span>. Repaid Months <span style="border-bottom: 1px dotted #000; padding: 0 10px; font-weight: bold;">${acc.termMonths || '12'}</span>. Subject to the Rules and Byelaws of the Society and any subsequent modification thereto I agree to abide by them. My full particulars as under :-
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px; border-top: 1px dotted #ccc; padding-top: 15px;">
                    <div class="row">
                        <span class="w-label">1. Member's Name</span>
                        <span>:</span>
                        <span class="field-value" style="font-size: 16px;">${member.fullName}</span>
                        <div style="width: 200px; display:flex; justify-content: flex-end; gap: 5px; align-items: flex-end;">
                            <span style="font-size: 11px;">PAN No. :</span>
                            <span style="border-bottom: 1px dotted #000; width: 100px;"></span>
                        </div>
                    </div>
                    <div class="row">
                        <span class="w-label">2. W/F/H / Name</span>
                        <span>:</span>
                        <span class="field-value">${member.fatherName || ''}</span>
                        <div style="width: 250px; display:flex; justify-content: flex-end; gap: 5px; align-items: flex-end;">
                            <span style="font-size: 11px;">Aadhaar No. :</span>
                            <span style="border-bottom: 1px dotted #000; width: 120px; font-weight: bold;"></span>
                        </div>
                    </div>
                    <div class="row">
                        <span class="w-label">3. Date of Birth</span>
                        <span>:</span>
                        <span class="field-value" style="flex: 0 0 150px;">${member.dateOfBirth ? formatDate(member.dateOfBirth) : ''}</span>
                        <span style="margin-left: 20px;">Age : <span style="border-bottom: 1px dotted #000; font-weight: bold; padding: 0 10px;">${age}</span></span>
                        <span style="flex: 1; text-align: right;">Mobile No. : <span style="border-bottom: 1px dotted #000; font-weight: bold; padding: 0 10px;">${member.phone}</span></span>
                    </div>
                    <div class="row">
                        <span class="w-label">4. Local Address</span>
                        <span>:</span>
                        <span class="field-value">${member.currentAddress || ''}</span>
                    </div>
                    <div class="row">
                        <span class="w-label">5. Permanent Add</span>
                        <span>:</span>
                        <span class="field-value">${member.permanentAddress || member.currentAddress || ''}</span>
                    </div>
                    <div class="row">
                        <span class="w-label">6. Cheque Numbers</span>
                        <span>:</span>
                        <span class="field-value"></span>
                        <span style="margin-left: 10px; font-size: 11px;">Name of the Bank : </span>
                        <span class="field-value"></span>
                    </div>
                </div>

                <div style="border: 1px solid #000; padding: 10px; margin-top: 15px; font-size: 11px; background: #f9f9f9;">
                    I hereby also agree, if the above Loan sanctioned, to deposit the following amounts with the society before receiving the Loan Amount: -
                    <div style="margin-top: 5px; margin-left: 10px;">
                        i.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Share Money up to 10% of the Loan Amount.<br/>
                        ii.&nbsp;&nbsp;&nbsp;&nbsp;C.D. @ 200 /- per month for Number of Monthly Installments of Loan & any arrears from month of membership to the month of Loan.
                    </div>
                </div>

                <div class="declaration" style="font-style: italic;">
                    I hereby nominate the following person to whom all money due to me by the Society or payable by me to the Society in the event to my death may be recovered as the case may be.
                </div>

                <div class="section-title">NOMINATION DETAILS</div>
                
                <div class="row">
                    <span style="width: 120px;">Name of Nominee</span>
                    <span>:</span>
                    <span class="field-value">${member.nominee?.name || ''}</span>
                    <span style="width: 60px; text-align: right;">Relation</span>
                    <span>:</span>
                    <span class="field-value" style="width: 100px; flex: none;">${member.nominee?.relation || ''}</span>
                    <span style="width: 40px; text-align: right;">Age</span>
                    <span>:</span>
                    <span class="field-value" style="width: 50px; flex: none;"></span>
                </div>
                <div class="row">
                    <span style="width: 120px;">Address</span>
                    <span>:</span>
                    <span class="field-value">${member.nominee?.address || ''}</span>
                    <span style="flex: none; margin-left:10px;">Mobile No. :</span>
                    <span class="field-value" style="width: 120px; flex: none;">${member.nominee?.phone || ''}</span>
                </div>

                <div style="background-color: #999; color: white; padding: 4px 10px; margin-top: 20px; font-weight: bold; font-size: 12px; text-align: center; text-transform: uppercase;">SURETIES DETAILS</div>
                <div class="sureties-content" style="border: 1px solid #999; border-top: none;">
                     <div class="surety-box">
                        <div class="row"><span style="width: 60px;">Name &</span><span>:</span><span class="field-value">${g1.name}</span></div>
                        <div class="row"><span style="width: 60px;">A/c No.</span><span>:</span><span class="field-value">${g1.memberId || ''}</span></div>
                        <div style="margin-top: 25px; border-bottom: 1px solid #000; width: 100%;"></div>
                        <div style="text-align: right; font-size: 10px; padding-right: 10px;">Signature</div>
                    </div>
                     <div style="width: 1px; background: #ccc;"></div>
                     <div class="surety-box">
                        <div class="row"><span style="width: 60px;">Name &</span><span>:</span><span class="field-value">${g2.name}</span></div>
                        <div class="row"><span style="width: 60px;">A/c No.</span><span>:</span><span class="field-value">${g2.memberId || ''}</span></div>
                        <div style="margin-top: 25px; border-bottom: 1px solid #000; width: 100%;"></div>
                        <div style="text-align: right; font-size: 10px; padding-right: 10px;">Signature</div>
                    </div>
                </div>

                <div style="text-align: right; margin-top: 15px;">
                    <div class="signature-area">Signature of Applicant</div>
                </div>

                <div class="section-title" style="margin-top: 10px;">AFFIDAVIT</div>
                <div class="declaration">
                    I solemnly declate that I am neither a member of any other Co-operative Thrift & Credit Society operating or working in Delhi nor taken any kind of Loan which is outstanding as on date.
                </div>
                 <div class="declaration" style="margin-top: 5px;">
                    The above declaration is true to the best of my knowledge and belief.
                </div>

                 <div style="text-align: right; margin-top: 20px;">
                    <div class="signature-area">Signature of Applicant</div>
                </div>

                <div style="border: 1px solid #000; padding: 8px 15px; margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <div style="font-weight: bold; margin-bottom: 5px;">Member Applied for EL / RL Loan Rs. .....................................................</div>
                        <div style="font-weight: bold;">Sanctioned as per Society Terms & Condition.</div>
                    </div>
                    <div style="text-align: center; width: 200px; border-top: 1px solid #000; padding-top: 5px; font-weight: bold;">
                        President / Secretary
                    </div>
                </div>
            </body>
            </html>
        `;

        printViaWindow(htmlContent);
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
                <div class="gray-bar"><span>REG.NO-10954</span><span style="border: 1px solid #000; padding: 2px 10px;">${acc.transactions[0]?.paymentMethod || 'Cash'}</span></div>
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

        const fees = { building: 450, welfare: 400, entry: 100 };
        const smAmount = shareAcc?.originalAmount ?? 400;
        const cdAmount = cdAcc?.originalAmount ?? 200;

        const totalAmount = overrideAmount || (fees.building + fees.welfare + fees.entry + smAmount + cdAmount);
        const amountInWords = numberToWords(totalAmount);
        const dateStr = formatDate(member.joinDate);
        const numId = member.id.replace(/\D/g, '');

        // Payment Mode String Logic
        let paymentModeStr = `Cash`; // Default fallback
        const initTx = shareAcc?.transactions?.[shareAcc.transactions.length - 1];
        if (initTx?.paymentMethod) {
            paymentModeStr = initTx.paymentMethod;
            if (initTx.paymentMethod === 'Both') {
                paymentModeStr = `Cash (${initTx.cashAmount || ''}) Online (${initTx.onlineAmount || ''})`;
            }
            if (initTx.utrNumber) {
                paymentModeStr += ` UTR:${initTx.utrNumber}`;
            }
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
            
            <div style="text-align:center; position:relative; margin-top: 2px;">
                <span style="font-size:12px; font-weight:bold; letter-spacing: 2px;">RECEIPT</span>
                <span style="position:absolute; right:0; top:2px; font-size:10px;">${copyType}</span>
            </div>

            <div style="text-align:center; font-weight:bold; font-size:11px; margin-top:2px;">
                JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.
            </div>
            <div style="text-align:center; font-size:9px; margin-bottom: 8px;">
                E-287/8, PUL PEHLADPUR, DELHI-110044
            </div>

            <div class="info-grid">
                <div class="row">
                    <div class="cell"></div>
                    <div class="cell right"><span class="lbl">Rcpt.Date</span>: ${dateStr}</div>
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
                    <div class="p-row" style="margin-top:2px; font-size: 8px; color: #444;">
                        Freezed by : ADMIN on dated : ${dateStr}
                    </div>
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
            <div style="text-align:center; font-size:9px; margin-top:10px;">Have a Nice Day</div>
        </div>
    `;

        const htmlContent = `
        <html>
        <head>
          <title>Registration Receipt</title>
          <style>
            @page { size: portrait; margin: 4mm; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10px; margin: 0; padding: 0; color: #000; line-height: 1.2; }
            .receipt-container { display: flex; flex-direction: row; gap: 4mm; width: 100%; justify-content: space-between; }
            .receipt-copy-box { width: 48%; border-right: 1px dashed #444; padding-right: 2mm; }
            .receipt-copy-box:last-child { border-right: none; padding-right: 0; padding-left: 2mm; }
            
            .receipt-box { padding: 6px; display: flex; flex-direction: column; min-height: 135mm; position:relative; border: 1.5px solid #000; width: 100%; box-sizing: border-box; }
            
            .header-top { font-size: 9px; font-weight: bold; margin-bottom: 2px; }
            
            .info-grid { margin-top: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .cell { flex: 1; font-size: 10px; }
            .cell.right { text-align: right; }
            .lbl { display: inline-block; width: 70px; }
            
            .particulars-section { margin-top: 8px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
            .p-header { display: flex; justify-content: space-between; font-weight: bold; padding-bottom: 4px; border-bottom: 1px solid #eee; }
            .p-body { padding: 4px 0; min-height: 80px; }
            .p-row { display: flex; justify-content: space-between; line-height: 1.4; }
            .p-total { text-align: right; font-weight: bold; font-size: 12px; margin-top: 5px; border-top: 1px solid #444; padding-top: 4px; }
            
            .words { margin-top: 10px; font-weight: bold; font-size: 10px; border-top: 1px solid #eee; padding-top: 5px; }
            
            .auth-for { text-align: center; margin-top: 15px; font-weight: bold; font-size: 10px; }
            
            .footer-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; }
            .balances { font-weight: bold; font-size: 10px; border-top: 1.5px solid #000; padding-top: 3px; }
            .sigs { text-align: right; font-weight: bold; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="receipt-copy-box">${getReceiptHTML('MEMBER COPY')}</div>
            <div class="receipt-copy-box">${getReceiptHTML('OFFICE COPY')}</div>
          </div>
        </body>
        </html>
    `;

        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 500);
        }
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

        const isRD = acc.type === AccountType.RECURRING_DEPOSIT;
        const isLoan = acc.type === AccountType.LOAN;

        // Balance summaries for footer
        const smAcc = accounts.find(a => a.type === AccountType.SHARE_CAPITAL);
        const cdAcc = accounts.find(a => a.type === AccountType.COMPULSORY_DEPOSIT);
        const smBal = smAcc ? smAcc.balance : 0;
        const cdBal = cdAcc ? cdAcc.balance : 0;

        // Recipient Summary (Other accounts)
        const otherAccs = accounts.filter(a => a.id !== acc.id);
        const accSummaries = otherAccs.map(a => `${a.accountNumber.split('-').pop()} ${a.balance} ${a.type === AccountType.LOAN ? 'Dr' : 'Cr'}`).join(' ');

        const getReceipt = (copyType: string) => {
            if (isRD) {
                // RD/DD Format - Calculate installments paid based on amount
                const installmentAmount = acc.originalAmount || 0;

                // Calculate total amount paid (all credit transactions)
                const totalPaid = acc.transactions
                    .filter(t => t.type === 'credit')
                    .reduce((sum, t) => sum + t.amount, 0);

                // Calculate number of installments paid
                const installmentsPaid = installmentAmount > 0 ? Math.floor(totalPaid / installmentAmount) : 0;

                const freqLabel = acc.rdFrequency === 'Daily' ? 'Days' : 'Months';
                const countDisplay = `${acc.rdFrequency === 'Daily' ? 'DD' : 'RD'}/${installmentsPaid} ${freqLabel}`;

                return `
                <div class="receipt-box rd-receipt">
                    <div class="header">
                        <div class="reg-no">REG.NO-10954</div>
                        <div class="org-contact">9911770293, 9911773542</div>
                        <div class="org-name">JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</div>
                        <div class="org-address">E-287/8, PUL PEHLADPUR, DELHI-110044</div>
                        <div class="receipt-title">RECEIPT <span style="font-size: 8px; font-weight: normal; margin-left: 10px;">${copyType}</span></div>
                    </div>

                    <div class="info-grid">
                        <div class="info-row"><span>Rcpt.Date:</span> : ${dateStr}</div>
                        <div class="info-row"><span>M.No.</span> : ${mem.id.split('-').pop()}</div>
                        <div class="info-row"><span>Recd. from</span> : ${mem.fullName.toUpperCase()}</div>
                        <div class="info-row"><span>Recd. Mode</span> : By ${tx.paymentMethod || 'Cash'}</div>
                        <div class="info-row"><span>F/H Name</span> : ${mem.fatherName || '-'}</div>
                    </div>

                    <table class="particulars-table">
                        <thead>
                            <tr>
                                <th>Particulars</th>
                                <th style="text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-size: 9px; line-height: 1.2;">
                                    ${countDisplay} Rate: ${acc.interestRate || 0}% Dep.Amt: ${acc.originalAmount || 0}<br/>
                                    A/c No: ${acc.accountNumber}
                                </td>
                                <td style="text-align: right; vertical-align: top;">${tx.amount.toFixed(2)}</td>
                            </tr>
                            <tr class="total-row">
                                <td style="text-align: right; border-top: 1px solid #000;">Total</td>
                                <td style="text-align: right; border-top: 1px solid #000; font-weight: bold;">${tx.amount.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="amount-words">${numberToWords(tx.amount)} Rupees only</div>

                    <div class="society-name">For JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</div>

                    <div class="signature-block">
                        <div class="sig-title">Cashier Signature</div>
                        <div class="sig-title">Administrator</div>
                    </div>

                    <div class="other-balances" style="display:flex; justify-content:space-between; font-weight:bold;">
                        <span style="font-size: 8px; color: #000; text-align: center; width: 100%;">
                            ${accounts
                        .filter(a => a.type !== AccountType.LOAN && a.status === AccountStatus.ACTIVE)
                        .map(a => {
                            let label = a.type === AccountType.SHARE_CAPITAL ? 'SM' :
                                a.type === AccountType.COMPULSORY_DEPOSIT ? 'CD' :
                                    a.type === AccountType.RECURRING_DEPOSIT ? (a.rdFrequency === 'Daily' ? 'DD' : 'RD') :
                                        a.type === AccountType.FIXED_DEPOSIT ? 'FD' :
                                            a.type === AccountType.OPTIONAL_DEPOSIT ? 'OD' : 'SB';
                            const bal = a.id === acc.id ? balanceAfter : a.balance;
                            return `${label}: ₹${bal.toFixed(0)}`;
                        })
                        .join(' | ')}
                        </span>
                    </div>
                    <div class="nice-day">Have a Nice Day</div>
                </div>`;
            }

            if (isLoan) {
                // Loan Receipt Format
                return `
                <div class="receipt-box loan-receipt">
                    <div class="header">
                        <div class="reg-no">Reg. No.: 10954</div>
                        <div style="text-align: right; font-size: 8px;">${copyType}</div>
                        <div class="org-name">JEEVAN ATULYA CO-OPERATIVE (U) T/C.SOCIETY LTD.</div>
                        <div class="org-contact">Ph: 9911770293 , 9911773542</div>
                    </div>
                    <div class="tx-header">
                        <h3>LOAN REPAYMENT RECEIPT</h3>
                    </div>
                    <div class="row"><span class="label">Date:</span><span class="val">${dateStr}</span></div>
                    <div class="row"><span class="label">Receipt No:</span><span class="val">${tx.id}</span></div>
                    <div class="divider"></div>
                    <div class="row"><span class="label">Member Name:</span><span class="val">${mem.fullName}</span></div>
                    <div class="row"><span class="label">Loan Account:</span><span class="val">${acc.accountNumber}</span></div>
                    <div class="row"><span class="label">Loan Type:</span><span class="val">${acc.loanType || 'Personal'}</span></div>
                    <div class="divider"></div>
                    <div class="row"><span class="label">Repayment Amount:</span><span class="val" style="font-weight: bold;">${formatCurrency(tx.amount)}</span></div>
                    <div class="row"><span class="label">Payment Mode:</span><span class="val">${paymentDetails}</span></div>
                    <div class="divider"></div>
                    <div class="row"><span class="label">Remaining Principal:</span><span class="val" style="font-weight: bold;">${formatCurrency(balanceAfter)}</span></div>
                    <div class="footer">
                        <div class="sig-line">Authorized Signatory</div>
                    </div>
                </div>`;
            }

            // Standard General Format
            return `
            <div class="receipt-box">
                <div class="watermark">ATULYA</div>
                <div class="header">
                    <div class="reg-no">Reg. No.: 10954</div>
                    <div style="text-align: right; font-size: 8px;">${copyType}</div>
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
                <div class="row"><span class="label">Account Number:</span><span class="val">${acc.accountNumber}</span></div>
                <div class="row"><span class="label">Account Type:</span><span class="val">${acc.type}</span></div>
                <div class="divider"></div>
                <div class="row"><span class="label">Tx Type:</span><span class="val" style="text-transform: uppercase;">${tx.type}</span></div>
                <div class="row"><span class="label">Amount:</span><span class="val" style="font-weight: bold;">${formatCurrency(tx.amount)}</span></div>
                <div class="row"><span class="label">Method:</span><span class="val" style="font-size: 9px;">${paymentDetails}</span></div>
                <div class="divider"></div>
                <div class="row"><span class="label">Available Balance:</span><span class="val" style="font-weight: bold;">${formatCurrency(balanceAfter)}</span></div>
                <div class="footer">
                    <div class="sig-line">Authorized Signatory</div>
                </div>
                <div style="margin-top: 10px; padding-top: 5px; border-top: 1px solid #ccc; font-size: 8px; font-weight: bold; text-align: center;">
                    ${accounts
                    .filter(a => a.type !== AccountType.LOAN && a.status === AccountStatus.ACTIVE)
                    .map(a => {
                        let label = a.type === AccountType.SHARE_CAPITAL ? 'SM' :
                            a.type === AccountType.COMPULSORY_DEPOSIT ? 'CD' :
                                a.type === AccountType.RECURRING_DEPOSIT ? (a.rdFrequency === 'Daily' ? 'DD' : 'RD') :
                                    a.type === AccountType.FIXED_DEPOSIT ? 'FD' :
                                        a.type === AccountType.OPTIONAL_DEPOSIT ? 'OD' : 'SB';
                        const bal = a.id === acc.id ? balanceAfter : a.balance;
                        return `${label}: ₹${bal.toFixed(0)}`;
                    })
                    .join(' | ')}
                </div>
            </div>`;
        };

        return `
    <html>
      <head>
        <title>Receipt ${tx.id}</title>
        <style>
          @page { size: portrait; margin: 4mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 0; margin: 0; }
          .page-container { display: flex; flex-direction: row; width: 100%; gap: 4mm; justify-content: space-between; }
          .receipt-copy { width: 48%; border-right: 1px dashed #444; padding-right: 2mm; }
          .receipt-copy:last-child { border-right: none; padding-right: 0; padding-left: 2mm; }
          
          .receipt-box { border: 1.5px solid #000; padding: 12px; background: #fff; position: relative; min-height: 115mm; width: 100%; box-sizing: border-box; }
          
          /* RD Receipt Styles */
          .rd-receipt { padding: 10px; font-family: 'Courier New', Courier, monospace; }
          .rd-receipt .header { border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 8px; }
          .rd-receipt .reg-no { font-size: 10px; position: static; text-align: left; }
          .rd-receipt .org-contact { font-size: 10px; text-align: right; margin-top: -12px; }
          .rd-receipt .org-name { font-size: 11px; margin-top: 5px; border: none; }
          .rd-receipt .org-address { font-size: 8px; text-align: center; font-weight: bold; margin-bottom: 5px; }
          .rd-receipt .receipt-title { text-align: center; font-size: 14px; font-weight: bold; text-decoration: underline; margin-top: 5px; }
          .rd-receipt .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 2px 10px; margin-bottom: 8px; font-size: 10px; }
          .rd-receipt .info-row { display: flex; }
          .rd-receipt .info-row span { min-width: 65px; }
          .rd-receipt .particulars-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; font-size: 10px; }
          .rd-receipt .particulars-table th { border-bottom: 1px solid #000; border-top: 1px solid #000; text-align: left; padding: 2px; }
          .rd-receipt .particulars-table td { padding: 2px; }
          .rd-receipt .amount-words { font-size: 9px; font-style: italic; margin-bottom: 15px; border-bottom: 1px solid #000; }
          .rd-receipt .society-name { font-size: 9px; font-weight: bold; text-align: center; margin-bottom: 20px; }
          .rd-receipt .signature-block { display: flex; justify-content: flex-end; gap: 40px; margin-bottom: 10px; }
          .rd-receipt .sig-title { font-size: 10px; font-weight: bold; text-align: center; border-top: 1px solid #000; padding-top: 2px; min-width: 80px; }
          .rd-receipt .other-balances { font-size: 8px; border-top: 1px solid #000; padding-top: 2px; margin-bottom: 2px; }
          .rd-receipt .nice-day { text-align: center; font-size: 10px; border-top: 1px solid #000; padding-top: 2px; }

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
             ${getReceipt('OFFICE COPY')}
           </div>
           <div class="receipt-copy">
             ${getReceipt('MEMBER COPY')}
           </div>
        </div>
      </body>
    </html>
  `;
    };

    const printReceipt = (tx: Transaction, acc: Account, balanceAfter: number) => {
        printViaWindow(generateReceiptHTML(tx, acc, balanceAfter, member));
    };

    const submitTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingTransaction) return;

        if (!transForm.accountId) return;
        const account = accounts.find(a => a.id === transForm.accountId);
        if (!account) return;

        // Disallow transactions on pending loan accounts
        if (account.type === AccountType.LOAN && account.status === AccountStatus.PENDING) {
            alert('Cannot process transactions on a pending loan account.');
            return;
        }

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

        const type = transForm.type as 'credit' | 'debit';
        const isLoan = account.type === AccountType.LOAN;
        const isFD = account.type === AccountType.FIXED_DEPOSIT;
        const isRD = account.type === AccountType.RECURRING_DEPOSIT;
        const isCD = account.type === AccountType.COMPULSORY_DEPOSIT;

        // 1. Guard: Withdrawals blocked for Loan, FD, RD, CD
        if (type === 'debit' && (isLoan || isFD || isRD || isCD)) {
            alert(`Withdrawals are not allowed for ${account.type} accounts.`);
            return;
        }

        // 2. Guard: FD Deposits blocked after initial
        if (type === 'credit' && isFD) {
            alert('Fixed Deposit accounts do not support additional deposits.');
            return;
        }

        // Validate minimum date (22/10/2025)
        const MIN_DATE = '2025-10-22';
        if (transForm.date < MIN_DATE) {
            alert(`Transaction date cannot be earlier than 22/10/2025.\nSelected date: ${formatDate(transForm.date)}`);
            return;
        }

        setIsSubmittingTransaction(true);
        try {
            const txId = `TX-${Date.now()}`;
            const txDate = transForm.date;

            let newBal = account.balance;
            if (isLoan) {
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

            await onAddTransaction(transForm.accountId, newTx);

            if (type === 'debit') {
                await onAddLedgerEntry({
                    id: `LDG-WDL-${Date.now()}`,
                    date: transForm.date,
                    description: `Withdrawal - ${member.fullName} (${account.accountNumber})`,
                    amount: amt,
                    type: 'Expense',
                    category: 'Member Withdrawals',
                    cashAmount: transForm.paymentMethod === 'Both' ? (parseFloat(transForm.cashAmount) || 0) : (transForm.paymentMethod === 'Cash' ? amt : 0),
                    onlineAmount: transForm.paymentMethod === 'Both' ? (parseFloat(transForm.onlineAmount) || 0) : (transForm.paymentMethod === 'Online' ? amt : 0),
                    utrNumber: transForm.utrNumber
                });
            }

            setTransactionSuccess({
                txId,
                amount: amt,
                type,
                accountNumber: account.accountNumber,
                accountType: account.type,
                date: new Date().toLocaleString(),
                balanceAfter: newBal,
                description: transForm.description
            });
            setTransForm({
                accountId: accounts[0]?.id || '',
                type: 'credit',
                amount: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                dueDate: '',
                paymentMethod: 'Cash',
                cashAmount: '',
                onlineAmount: '',
                utrNumber: ''
            });
        } finally {
            setIsSubmittingTransaction(false);
        }
    };

    const handlePrintSuccessReceipt = () => {
        if (!transactionSuccess) return;
        const acc = accounts.find(a => a.accountNumber === transactionSuccess.accountNumber);
        if (acc) {
            printReceipt({
                id: transactionSuccess.txId,
                amount: transactionSuccess.amount,
                type: transactionSuccess.type as any,
                date: new Date().toISOString(),
                description: transactionSuccess.description,
                paymentMethod: 'Cash'
            }, acc, transactionSuccess.balanceAfter);
        }
    };

    const closeTransModal = () => {
        setShowTransModal(false);
        setTransactionSuccess(null);
        setIsLockedAccount(false);
    };

    // --- Automated Interest Posting ---
    useEffect(() => {
        if (!interestChecked && accounts.length > 0) {
            const today = new Date();
            accounts.forEach(acc => {
                const startDateStr = acc.lastInterestPostDate || acc.openingDate || acc.createdAt || member.joinDate;
                let startDate = new Date(startDateStr);

                while (true) {
                    const nextMonth = new Date(startDate);
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    if (nextMonth > today) break;

                    let interest = 0;
                    let description = '';
                    const rate = acc.interestRate || 0;
                    const isLoan = acc.type === AccountType.LOAN;

                    if (isLoan) {
                        if (acc.loanType === LoanType.EMERGENCY) {
                            const principal = acc.initialAmount || acc.originalAmount || 0;
                            interest = principal * (rate / 100) / 12;
                            description = `Monthly Interest (Flat Rate ${rate}%) - ${nextMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
                        } else {
                            interest = acc.balance * (rate / 100) / 12;
                            description = `Monthly Interest (Reducing ${rate}%) - ${nextMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
                        }
                    } else if (acc.type !== AccountType.SHARE_CAPITAL) {
                        interest = acc.balance * (rate / 100) / 12;
                        description = `Monthly Interest (Compounding ${rate}%) - ${nextMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
                    }

                    if (interest > 0) {
                        const postDate = nextMonth.toISOString().split('T')[0];
                        const newTx: Transaction = {
                            id: `TX-INT-AUTO-${acc.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            amount: Math.round(interest),
                            type: isLoan ? 'debit' : 'credit',
                            category: 'Interest',
                            description: description,
                            date: postDate,
                            paymentMethod: 'Cash'
                        };

                        onAddTransaction(acc.id, newTx);
                        if (!isLoan) acc.balance += Math.round(interest);
                        onUpdateAccount({ ...acc, lastInterestPostDate: postDate });
                        startDate = nextMonth;
                    } else {
                        break;
                    }
                }
            });
            setInterestChecked(true);
        }
    }, [interestChecked, accounts, member.joinDate, onAddTransaction, onUpdateAccount]);

    // --- Account Wizard Logic ---
    const handleNextStep = () => {
        if (accountWizardStep === 1) {
            setAccountWizardStep(2);
        } else if (accountWizardStep === 2) {
            if (accountForm.type === AccountType.LOAN && (!guarantors.g1Name || !guarantors.g1Phone)) {
                alert("At least one guarantor is required for loans.");
                return;
            }
            setAccountWizardStep(3);
        }
    };

    const handlePrevStep = () => {
        if (accountWizardStep > 1) setAccountWizardStep(accountWizardStep - 1);
    };

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
        const maturityDate = new Date(accountForm.openingDate || new Date().toISOString().split('T')[0]);
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
            if (accountForm.loanType === LoanType.PERSONAL) {
                const r = R / 12 / 100;
                if (termMonths > 0) {
                    const emi = (P * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
                    const totalPay = emi * termMonths;
                    setCalcResult({ emi: Math.round(emi), totalInterest: Math.round(totalPay - P), totalPayable: Math.round(totalPay), principal: P, maturityDate: maturityDateStr });
                } else {
                    setCalcResult({ principal: P, maturityDate: maturityDateStr });
                }
            } else if (accountForm.loanType === LoanType.EMERGENCY) {
                const emi = termMonths > 0 ? P / termMonths : 0;
                setCalcResult({ emi: Math.round(emi), totalInterest: 0, totalPayable: P, principal: P, maturityDate: maturityDateStr });
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

    const submitAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingAccount) return;

        // Validate minimum date (22/10/2025)
        const MIN_DATE = '2025-10-22';
        if (accountForm.openingDate < MIN_DATE) {
            alert(`Account opening date cannot be earlier than 22/10/2025.\nSelected date: ${formatDate(accountForm.openingDate)}`);
            return;
        }

        setIsSubmittingAccount(true);
        try {
            const openingBalance = parseFloat(accountForm.amount) || 0;

            if (accountForm.type === AccountType.LOAN && accountForm.loanType === LoanType.EMERGENCY) {
                const feeAmount = 700;
                await onAddLedgerEntry({
                    id: `LDG-FEES-${Date.now()}`,
                    memberId: member.id,
                    date: accountForm.openingDate,
                    description: `Loan Fees (Emergency) - ${member.fullName} | Breakdown: Verification ₹450, File ₹100, Affidavit ₹150`,
                    amount: feeAmount,
                    type: 'Income',
                    category: 'Loan Processing Fees',
                    cashAmount: feeAmount,
                    onlineAmount: 0
                });
            }

            const finalGuarantors: Guarantor[] = [];
            if (accountForm.type === AccountType.LOAN) {
                if (guarantors.g1Name) finalGuarantors.push({ name: guarantors.g1Name, phone: guarantors.g1Phone, relation: guarantors.g1Rel });
                if (guarantors.g2Name) finalGuarantors.push({ name: guarantors.g2Name, phone: guarantors.g2Phone, relation: guarantors.g2Rel });
            }

            const newAccountData: Partial<Account> & { cashAmount?: number; onlineAmount?: number; utrNumber?: string } = {
                type: accountForm.type,
                loanType: accountForm.type === AccountType.LOAN ? accountForm.loanType : undefined,
                balance: openingBalance,
                status: AccountStatus.ACTIVE,
                currency: 'INR',
                interestRate: parseFloat(accountForm.interestRate),
                termMonths: accountForm.type === AccountType.FIXED_DEPOSIT
                    ? (parseFloat(accountForm.tenureYears) || 0) * 12
                    : accountForm.type === AccountType.RECURRING_DEPOSIT && accountForm.rdFrequency === 'Daily'
                        ? Math.round((parseInt(accountForm.tenureDays) || 0) / 30.41)
                        : (parseInt(accountForm.tenureMonths) || 0),
                tenureDays: accountForm.type === AccountType.RECURRING_DEPOSIT && accountForm.rdFrequency === 'Daily'
                    ? parseInt(accountForm.tenureDays) || 0
                    : undefined,
                maturityDate: calcResult?.maturityDate,
                rdFrequency: accountForm.type === AccountType.RECURRING_DEPOSIT ? accountForm.rdFrequency as any : undefined,
                originalAmount: openingBalance,
                initialAmount: openingBalance,
                emi: calcResult?.emi,
                guarantors: finalGuarantors,
                openingDate: accountForm.openingDate,
                paymentMethod: accountForm.paymentMethod,
                cashAmount: accountForm.paymentMethod === 'Both' ? (parseFloat(accountForm.cashAmount) || 0) : undefined,
                onlineAmount: accountForm.paymentMethod === 'Both' ? (parseFloat(accountForm.onlineAmount) || 0) : undefined,
                utrNumber: accountForm.utrNumber
            };

            await onAddAccount(member.id, newAccountData as any);

            setAccountSuccess({
                id: `NEW-${Date.now()}`,
                type: accountForm.type,
                accountNumber: 'Generated...',
                amount: openingBalance
            });
        } finally {
            setIsSubmittingAccount(false);
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
        if (isActivating) return;

        const activationDate = activateForm.activationDate || new Date().toISOString().split('T')[0];
        const totalFees = activateForm.buildingFund + activateForm.shareMoney + activateForm.compulsoryDeposit + activateForm.welfareFund + activateForm.entryCharge;

        if (activateForm.paymentMethod === 'Both') {
            const cash = parseFloat(activateForm.cashAmount) || 0;
            const online = parseFloat(activateForm.onlineAmount) || 0;
            if (Math.abs((cash + online) - totalFees) > 1) {
                alert(`Split payment amounts must sum to Total Payable (₹${totalFees}).`);
                return;
            }
        }

        setIsActivating(true);
        try {
            const activationReceiptDoc: MemberDocument = {
                id: `DOC-REG-${Date.now()}`,
                name: 'Registration Receipt',
                type: 'Receipt',
                category: 'Other',
                description: 'Membership Activation Receipt',
                uploadDate: activationDate,
                url: '#'
            };

            const memberWithReceipt = {
                ...member,
                status: 'Active' as const,
                documents: [...(member.documents || []), activationReceiptDoc]
            };

            await onUpdateMember(memberWithReceipt);

            await onAddAccount(member.id, {
                type: AccountType.SHARE_CAPITAL,
                balance: activateForm.shareMoney,
                originalAmount: activateForm.shareMoney,
                status: AccountStatus.ACTIVE,
                currency: 'INR',
                interestRate: 0,
                openingDate: activationDate
            });

            await onAddAccount(member.id, {
                type: AccountType.COMPULSORY_DEPOSIT,
                balance: activateForm.compulsoryDeposit,
                originalAmount: activateForm.compulsoryDeposit,
                status: AccountStatus.ACTIVE,
                currency: 'INR',
                interestRate: appSettings.interestRates.compulsoryDeposit,
                openingDate: activationDate
            });

            await onAddLedgerEntry({
                id: `LDG-ACTIVATE-${Date.now()}`,
                date: activationDate,
                description: `Activation Fees - ${member.fullName}`,
                amount: totalFees,
                type: 'Income',
                category: 'Admission Fees & Deposits',
                cashAmount: activateForm.paymentMethod === 'Both' ? parseFloat(activateForm.cashAmount) || 0 : undefined,
                onlineAmount: activateForm.paymentMethod === 'Both' ? parseFloat(activateForm.onlineAmount) || 0 : undefined,
            });

            handlePrintRegReceipt(totalFees);
            setShowActivateModal(false);
        } finally {
            setIsActivating(false);
        }
    };

    const handlePrintStatement = () => {
        // ... (Existing statement print logic unchanged)
        const allTx = accounts
            .filter(a => !(a.type === AccountType.LOAN && a.status === 'Pending'))
            .flatMap(a => a.transactions.map(t => ({ ...t, account: a.accountNumber, accType: a.type })))
            .sort((a, b) => {
                const da = new Date(a.date).getTime();
                const db = new Date(b.date).getTime();
                if (da !== db) return db - da;
                return b.id.localeCompare(a.id);
            });
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
        const isCD = acc.type === AccountType.COMPULSORY_DEPOSIT;

        // Row 1 & 2: Key Financial Metrics
        if (isLoan) {
            rows.push({ label: 'Original Loan', value: formatCurrency(acc.originalAmount || 0), icon: Target });
            rows.push({ label: 'Loan Type', value: acc.loanType || 'Personal', icon: Shield });
            rows.push({ label: 'EMI Amount', value: formatCurrency(acc.emi || 0), icon: Calendar });
            const tenure = acc.termMonths || 0;
            rows.push({ label: 'Tenure', value: `${tenure} Months`, icon: Clock });
        } else if (isFD) {
            rows.push({ label: 'Principal', value: formatCurrency(acc.initialAmount || acc.balance), icon: Target });
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
            rows.push({ label: 'Maturity Date', value: formatDate(acc.maturityDate), icon: Clock });
            const tenure = acc.termMonths || 0;
            rows.push({ label: 'Tenure', value: tenure >= 12 ? `${tenure / 12} Years` : `${tenure} Months`, icon: History });
        } else if (isRD) {
            rows.push({ label: 'Installment', value: formatCurrency(acc.emi || 0) + (acc.rdFrequency === 'Daily' ? '/day' : '/mo'), icon: Target });
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
            rows.push({ label: 'Maturity Date', value: formatDate(acc.maturityDate), icon: Clock });

            // Improved tenure calculation with fallback
            const termMonths = acc.termMonths || 0;
            let tenureText = '';

            if (acc.rdFrequency === 'Daily') {
                // Use explicit tenureDays if available, else fallback to termMonths conversion
                const days = acc.tenureDays || (termMonths > 0 ? Math.round(termMonths * 30.41) : 0);
                tenureText = days > 0 ? `${days} Days` : 'Not Set';
            } else {
                tenureText = termMonths > 0 ? `${termMonths} Months` : 'Not Set';
            }

            rows.push({ label: 'Tenure', value: tenureText, icon: History });
        } else if (isOD || isCD) {
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
            const minBal = getMinBalanceForYear(acc);
            rows.push({ label: 'Min Balance (YTD)', value: formatCurrency(minBal), icon: Shield });
        }

        // Row 3: Projection/Detail
        if (isFD) {
            const P = acc.initialAmount || acc.balance;
            const R = acc.interestRate || 0;
            let matVal = 0;
            if (acc.maturityDate) {
                const t = (acc.termMonths || 12) / 12;
                matVal = P * Math.pow((1 + R / 100), t);
            }
            rows.push({ label: 'Est. Maturity Value', value: formatCurrency(Math.round(matVal)), icon: PiggyBank, highlight: true });
        } else if (isRD) {
            const P = acc.emi || 0;
            const R = acc.interestRate || 0;
            const termMonths = acc.termMonths || 0;
            let matVal = 0;
            if (acc.rdFrequency === 'Daily' && acc.maturityDate) {
                const startDate = new Date(acc.openingDate || acc.createdAt || member.joinDate);
                const matDate = new Date(acc.maturityDate);
                const days = Math.round((matDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                matVal = (P * days) + ((P * (days * (days + 1)) / 2) * (R / 36500));
            } else {
                matVal = (P * termMonths) + (P * (termMonths * (termMonths + 1) / 2) * (R / 1200));
            }
            rows.push({ label: 'Est. Maturity Value', value: formatCurrency(Math.round(matVal)), icon: PiggyBank, highlight: true });

            // Add RD Installment Status
            const installment = acc.originalAmount || 0;

            // Use the date of the first transaction (opening balance) as the start date
            const firstTransaction = acc.transactions
                .filter(t => t.type === 'credit')
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

            const startDateStr = firstTransaction?.date || acc.createdAt || member.joinDate;
            const startDate = new Date(startDateStr);
            const todayDate = new Date();

            let periodsPassed = 0;
            if (acc.rdFrequency === 'Daily') {
                const diffTime = todayDate.getTime() - startDate.getTime();
                periodsPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            } else {
                periodsPassed = (todayDate.getFullYear() - startDate.getFullYear()) * 12 + (todayDate.getMonth() - startDate.getMonth());
            }

            const totalInstallmentsDue = Math.max(0, periodsPassed) + 1;
            const totalAmountDue = totalInstallmentsDue * installment;

            // Include ALL credit transactions (including opening balance)
            const totalPaid = acc.transactions
                .filter(t => t.type === 'credit')
                .reduce((sum, t) => sum + t.amount, 0);

            const installmentsPaid = Math.floor(totalPaid / installment);
            const backlog = Math.max(0, totalAmountDue - totalPaid);
            const futurePayments = Math.max(0, totalPaid - totalAmountDue);

            if (backlog > 0) {
                rows.push({ label: 'Backlog', value: `${formatCurrency(backlog)} (${Math.ceil(backlog / installment)} ${acc.rdFrequency === 'Daily' ? 'days' : 'months'})`, icon: AlertTriangle, highlight: false });
            } else if (futurePayments > 0) {
                rows.push({ label: 'Advance Paid', value: `${formatCurrency(futurePayments)} (${Math.floor(futurePayments / installment)} ${acc.rdFrequency === 'Daily' ? 'days' : 'months'})`, icon: CheckCircle, highlight: false });
            } else {
                rows.push({ label: 'Status', value: 'Up to Date ✓', icon: CheckCircle, highlight: false });
            }
        } else if (isLoan) {
            rows.push({ label: 'Interest Rate', value: `${acc.interestRate}%`, icon: TrendingUp });
        } else if (isOD) {
            rows.push({ label: 'Est. Interest (Y)', value: formatCurrency(Math.round(acc.balance * (acc.interestRate || 0) / 100)), icon: PiggyBank });
        } else if (acc.type === AccountType.COMPULSORY_DEPOSIT) {
            // CD Due Logic
            const startDateStr = acc.openingDate || acc.createdAt || member.joinDate;
            const startDate = new Date(startDateStr);
            const today = new Date();

            // Calculate months passed
            let months = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
            if (months < 0) months = 0;
            // Include current month
            months += 1;

            const expected = months * 200;
            const paid = acc.transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

            const due = expected - paid;

            if (due > 0) {
                rows.push({
                    label: 'Total Due',
                    value: `${formatCurrency(due)}`,
                    icon: AlertCircle,
                    highlight: false, // Custom style handled by icon color if needed, but 'highlight' usually makes text blue. 
                    // We want RED for due. Let's handle it by hacking the value string or relying on standard color.
                    // The component maps highlight to blue. Let's not use highlight=true, but just show it.
                });
                // Force add a custom "Due" class via a hack or just rely on the label? 
                // The helper function returns plain objects.
                // Let's modify the helper or the rendering to checking for 'Total Due'.
                // Actually, let's just add it.
            } else {
                rows.push({ label: 'Status', value: 'Up to Date ✓', icon: CheckCircle });
            }
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

                {/* Member Avatar with ID Badge */}
                <div className="relative">
                    <img src={member.avatarUrl} alt={member.fullName} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md" />
                    <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-white shadow-sm">
                        {member.id}
                    </div>
                </div>

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
                                            {acc.type === AccountType.LOAN && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrintLoanApplication(acc); }}
                                                    className="bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm hover:bg-amber-700"
                                                >
                                                    <FileText size={12} /> Print Application
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
                                            <div className="text-right pr-2 flex flex-col items-end">
                                                <p className={`text-lg font-bold ${acc.type === AccountType.LOAN ? 'text-red-600' : 'text-slate-900'}`}>{formatCurrency(acc.balance)}</p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full mt-1 ${acc.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                                    acc.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>{acc.status}</span>
                                                <div className="flex gap-2 mt-3">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTransForm(prev => ({ ...prev, accountId: acc.id }));
                                                            setIsLockedAccount(true);
                                                            setShowTransModal(true);
                                                        }}
                                                        className="text-[10px] font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors group/btn"
                                                    >
                                                        <Plus size={12} className="group-hover/btn:rotate-90 transition-transform" /> Transaction
                                                    </button>
                                                </div>
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
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                            <History size={18} className="text-blue-600" />
                                            Financial Activity & Receipts
                                        </h3>
                                        <div className="text-xs text-slate-500 font-medium">
                                            Showing last 1000 financial interactions
                                        </div>
                                    </div>

                                    {/* Account Filter Tabs */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                        <button
                                            onClick={() => setHistoryFilter(prev => ({ ...prev, accountId: 'All' }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historyFilter.accountId === 'All' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                                        >
                                            All Accounts
                                        </button>
                                        {accounts.map(acc => (
                                            <button
                                                key={acc.id}
                                                onClick={() => setHistoryFilter(prev => ({ ...prev, accountId: acc.id }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historyFilter.accountId === acc.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                                            >
                                                {acc.type} ({acc.accountNumber.split('-').pop()})
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setHistoryFilter(prev => ({ ...prev, accountId: 'Ledger' }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historyFilter.accountId === 'Ledger' ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-purple-300 hover:text-purple-600'}`}
                                        >
                                            Admission & Fees
                                        </button>
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
                                                    ...accounts
                                                        .filter(a => historyFilter.accountId === 'All' || historyFilter.accountId === a.id)
                                                        .flatMap(a => a.transactions.map(t => ({
                                                            ...t,
                                                            ref: `${a.type.split(' ')[0]} - ${a.accountNumber.split('-').pop()}`,
                                                            itemType: 'transaction' as const,
                                                            fullAcc: a
                                                        }))),
                                                    ...(historyFilter.accountId === 'All' || historyFilter.accountId === 'Ledger' ? (ledger || []).filter(l => l.memberId === member.id).map(l => ({
                                                        id: l.id,
                                                        date: l.date,
                                                        description: l.description,
                                                        amount: l.amount,
                                                        type: l.type === 'Income' ? 'credit' : 'debit',
                                                        paymentMethod: l.onlineAmount && l.onlineAmount > 0 ? (l.cashAmount && l.cashAmount > 0 ? 'Both' : 'Online') : 'Cash',
                                                        utrNumber: l.utrNumber,
                                                        ref: l.category,
                                                        itemType: 'ledger' as const
                                                    })) : [])
                                                ].sort((a, b) => {
                                                    const da = new Date(a.date).getTime();
                                                    const db = new Date(b.date).getTime();
                                                    if (da !== db) return db - da;
                                                    return b.id.localeCompare(a.id); // Newest first
                                                })
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
                                                                        const placeholderAccount = { type: 'FEE_PAYMENT', accountNumber: 'SOCIETY-LEDGER' } as any;
                                                                        printReceipt(item as any, placeholderAccount, 0);
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

                            <form onSubmit={submitEditAccount} className="space-y-4">
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
                                                    {[LoanType.PERSONAL, LoanType.EMERGENCY].map(t => <option key={t} value={t}>{t}</option>)}
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

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Opening Date</label>
                                            <input
                                                type="date"
                                                className="w-full border p-2 rounded-lg"
                                                value={accountForm.openingDate}
                                                min="2025-10-22"
                                                onChange={e => setAccountForm({ ...accountForm, openingDate: e.target.value })}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">Format: DD/MM/YYYY • Minimum: 22/10/2025</p>
                                        </div>

                                        <div className="border-t pt-4 mt-2">
                                            <label className="block text-xs font-bold text-slate-500 mb-2">Payment Method</label>
                                            <div className="flex gap-4 mb-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="accPaymentMethod"
                                                        checked={accountForm.paymentMethod === 'Cash'}
                                                        onChange={() => setAccountForm({ ...accountForm, paymentMethod: 'Cash' })}
                                                    />
                                                    <span className="text-sm">Cash</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="accPaymentMethod"
                                                        checked={accountForm.paymentMethod === 'Online'}
                                                        onChange={() => setAccountForm({ ...accountForm, paymentMethod: 'Online' })}
                                                    />
                                                    <span className="text-sm">Online</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="accPaymentMethod"
                                                        checked={accountForm.paymentMethod === 'Both'}
                                                        onChange={() => setAccountForm({ ...accountForm, paymentMethod: 'Both' })}
                                                    />
                                                    <span className="text-sm">Both</span>
                                                </label>
                                            </div>

                                            {(accountForm.paymentMethod === 'Online' || accountForm.paymentMethod === 'Both') && (
                                                <div className="mb-4">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">UTR / Transaction ID</label>
                                                    <input
                                                        type="text"
                                                        className="w-full border p-2 rounded-lg bg-white"
                                                        placeholder="Enter UTR Number"
                                                        value={accountForm.utrNumber}
                                                        onChange={e => setAccountForm({ ...accountForm, utrNumber: e.target.value })}
                                                    />
                                                </div>
                                            )}

                                            {accountForm.paymentMethod === 'Both' && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Cash Amount</label>
                                                        <input
                                                            type="number"
                                                            className="w-full border p-2 rounded-lg"
                                                            placeholder="0"
                                                            value={accountForm.cashAmount}
                                                            onChange={e => setAccountForm({ ...accountForm, cashAmount: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Online Amount</label>
                                                        <input
                                                            type="number"
                                                            className="w-full border p-2 rounded-lg"
                                                            placeholder="0"
                                                            value={accountForm.onlineAmount}
                                                            onChange={e => setAccountForm({ ...accountForm, onlineAmount: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                                                    {/* Guarantor 1 */}
                                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 relative">
                                                        <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Guarantor 1 (Primary)</p>

                                                        {guarantors.g1MemberId ? (
                                                            <div className="bg-white p-2 rounded border border-blue-200 flex justify-between items-center mb-2">
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">{guarantors.g1Name}</p>
                                                                    <p className="text-xs text-slate-500">{guarantors.g1MemberId} • {guarantors.g1Phone}</p>
                                                                </div>
                                                                <button type="button" onClick={() => clearGuarantor('g1')} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={16} /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="mb-2 relative">
                                                                <div className="relative">
                                                                    <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
                                                                    <input
                                                                        type="text"
                                                                        className="w-full border p-2 pl-7 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                                        placeholder="Search Member ID or Name..."
                                                                        value={guarantorSearch.g1}
                                                                        onChange={e => {
                                                                            setGuarantorSearch({ ...guarantorSearch, g1: e.target.value });
                                                                            setShowG1Results(true);
                                                                        }}
                                                                        onFocus={() => setShowG1Results(true)}
                                                                    />
                                                                </div>
                                                                {showG1Results && guarantorSearch.g1 && (
                                                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 shadow-lg rounded-b-lg max-h-48 overflow-y-auto z-10">
                                                                        {allMembers.filter(m => m.id !== member.id && (m.fullName.toLowerCase().includes(guarantorSearch.g1.toLowerCase()) || m.id.toLowerCase().includes(guarantorSearch.g1.toLowerCase())))
                                                                            .map(m => (
                                                                                <button
                                                                                    key={m.id}
                                                                                    type="button"
                                                                                    className="w-full text-left p-2 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0"
                                                                                    onClick={() => handleSelectGuarantor('g1', m)}
                                                                                >
                                                                                    <div className="font-bold text-slate-900">{m.fullName}</div>
                                                                                    <div className="text-xs text-slate-500">{m.id} • {m.phone}</div>
                                                                                </button>
                                                                            ))}
                                                                        {allMembers.filter(m => m.id !== member.id && (m.fullName.toLowerCase().includes(guarantorSearch.g1.toLowerCase()) || m.id.toLowerCase().includes(guarantorSearch.g1.toLowerCase()))).length === 0 && (
                                                                            <div className="p-2 text-xs text-slate-400 text-center">No members found</div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <input className="w-full border p-2 rounded text-sm bg-slate-100 text-slate-500" value={guarantors.g1Phone} readOnly placeholder="Phone" />
                                                            </div>
                                                            <select
                                                                className="w-full border p-2 rounded text-sm bg-white"
                                                                value={guarantors.g1Rel}
                                                                onChange={e => setGuarantors({ ...guarantors, g1Rel: e.target.value })}
                                                            >
                                                                {RELATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Guarantor 2 */}
                                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 relative">
                                                        <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Guarantor 2 (Secondary)</p>

                                                        {guarantors.g2MemberId ? (
                                                            <div className="bg-white p-2 rounded border border-blue-200 flex justify-between items-center mb-2">
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">{guarantors.g2Name}</p>
                                                                    <p className="text-xs text-slate-500">{guarantors.g2MemberId} • {guarantors.g2Phone}</p>
                                                                </div>
                                                                <button type="button" onClick={() => clearGuarantor('g2')} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={16} /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="mb-2 relative">
                                                                <div className="relative">
                                                                    <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
                                                                    <input
                                                                        type="text"
                                                                        className="w-full border p-2 pl-7 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                                        placeholder="Search Member ID or Name..."
                                                                        value={guarantorSearch.g2}
                                                                        onChange={e => {
                                                                            setGuarantorSearch({ ...guarantorSearch, g2: e.target.value });
                                                                            setShowG2Results(true);
                                                                        }}
                                                                        onFocus={() => setShowG2Results(true)}
                                                                    />
                                                                </div>
                                                                {showG2Results && guarantorSearch.g2 && (
                                                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 shadow-lg rounded-b-lg max-h-48 overflow-y-auto z-10">
                                                                        {allMembers.filter(m => m.id !== member.id && (m.fullName.toLowerCase().includes(guarantorSearch.g2.toLowerCase()) || m.id.toLowerCase().includes(guarantorSearch.g2.toLowerCase())))
                                                                            .map(m => (
                                                                                <button
                                                                                    key={m.id}
                                                                                    type="button"
                                                                                    className="w-full text-left p-2 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0"
                                                                                    onClick={() => handleSelectGuarantor('g2', m)}
                                                                                >
                                                                                    <div className="font-bold text-slate-900">{m.fullName}</div>
                                                                                    <div className="text-xs text-slate-500">{m.id} • {m.phone}</div>
                                                                                </button>
                                                                            ))}
                                                                        {allMembers.filter(m => m.id !== member.id && (m.fullName.toLowerCase().includes(guarantorSearch.g2.toLowerCase()) || m.id.toLowerCase().includes(guarantorSearch.g2.toLowerCase()))).length === 0 && (
                                                                            <div className="p-2 text-xs text-slate-400 text-center">No members found</div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <input className="w-full border p-2 rounded text-sm bg-slate-100 text-slate-500" value={guarantors.g2Phone} readOnly placeholder="Phone" />
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
                                        <button type="submit" disabled={isSubmittingAccount} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg disabled:opacity-50">
                                            {isSubmittingAccount ? 'Creating...' : 'Confirm Creation'}
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
                                    <button onClick={handlePrintRegReceipt} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2"><Printer size={18} /> Print Receipt</button>
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
                                    {!isLockedAccount && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Select Account</label>
                                            <select
                                                className="w-full border p-2 rounded-lg bg-white"
                                                value={transForm.accountId}
                                                onChange={e => setTransForm({ ...transForm, accountId: e.target.value })}
                                            >
                                                {accounts
                                                    .filter(a => !(a.type === AccountType.LOAN && a.status === AccountStatus.PENDING))
                                                    .map(a => (
                                                        <option key={a.id} value={a.id}>{a.type} - {a.accountNumber} ({formatCurrency(a.balance)})</option>
                                                    ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        {(() => {
                                            const acc = accounts.find(a => a.id === transForm.accountId);
                                            const isLoan = acc?.type === AccountType.LOAN;
                                            const isRD = acc?.type === AccountType.RECURRING_DEPOSIT;
                                            const isCD = acc?.type === AccountType.COMPULSORY_DEPOSIT;
                                            const isFD = acc?.type === AccountType.FIXED_DEPOSIT;

                                            // Withdrawals blocked for Loan, FD, RD, CD
                                            const canDebit = !isLoan && !isFD && !isRD && !isCD;
                                            // Deposits blocked for FD (after initial)
                                            const canCredit = !isFD;

                                            return (
                                                <div className="flex flex-col gap-2 col-span-1">
                                                    <label className="block text-xs font-bold text-slate-500">Type</label>
                                                    <div className="flex gap-2">
                                                        {canCredit && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setTransForm({ ...transForm, type: 'credit' })}
                                                                className={`flex-1 py-2 text-sm font-bold rounded-lg ${transForm.type === 'credit' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-slate-100 text-slate-500'}`}
                                                            >
                                                                Credit (+)
                                                            </button>
                                                        )}
                                                        {canDebit && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setTransForm({ ...transForm, type: 'debit' })}
                                                                className={`flex-1 py-2 text-sm font-bold rounded-lg ${transForm.type === 'debit' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-slate-100 text-slate-500'}`}
                                                            >
                                                                Debit (-)
                                                            </button>
                                                        )}
                                                        {isFD && <p className="text-[10px] text-amber-600 font-medium py-2">FD accounts do not support additional transactions after creation.</p>}
                                                        {!canDebit && !isFD && <p className="text-[10px] text-amber-600 font-medium py-2">Withdrawals not allowed for this account type.</p>}
                                                    </div>
                                                </div>
                                            );
                                        })()}

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

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Transaction Date</label>
                                        <input
                                            type="date"
                                            className="w-full border p-2 rounded-lg"
                                            value={transForm.date}
                                            min="2025-10-22"
                                            onChange={e => setTransForm({ ...transForm, date: e.target.value })}
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1">Format: DD/MM/YYYY • Minimum: 22/10/2025</p>
                                    </div>

                                    <button type="submit" disabled={isSubmittingTransaction} className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-50">
                                        {isSubmittingTransaction ? <RotateCcw className="animate-spin" size={18} /> : <Check size={18} />}
                                        {isSubmittingTransaction ? 'Processing...' : 'Complete Transaction'}
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
                                        <p className="text-[10px] text-slate-500 mt-1">Format: DD/MM/YYYY</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-500">Joined Date</label>
                                        <input type="date" className="w-full border p-2 rounded" value={editMemberForm.joinDate || ''} onChange={e => setEditMemberForm({ ...editMemberForm, joinDate: e.target.value })} />
                                        <p className="text-[10px] text-slate-500 mt-1">Format: DD/MM/YYYY</p>
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

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Assigned Agent ID</label>
                                        <input
                                            className="w-full border p-2 rounded uppercase"
                                            placeholder="Agent ID (e.g. AG-123)"
                                            value={editMemberForm.agentId || ''}
                                            onChange={e => setEditMemberForm({ ...editMemberForm, agentId: e.target.value })}
                                        />
                                        {editMemberForm.agentId && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                {agents.find(a => a.id === editMemberForm.agentId || a.memberId === editMemberForm.agentId)?.name || 'Agent not found'}
                                            </p>
                                        )}
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
                                        <p className="text-[10px] text-slate-500">Format: DD/MM/YYYY</p>
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

                            <div className="pt-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Activation Date</label>
                                <input
                                    type="date"
                                    className="w-full border p-2 rounded text-sm"
                                    value={activateForm.activationDate}
                                    onChange={e => setActivateForm({ ...activateForm, activationDate: e.target.value })}
                                />
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

                            <button onClick={submitActivation} disabled={isActivating} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg mt-4 disabled:opacity-50">
                                {isActivating ? 'Activating...' : 'Activate Membership & Pay Fees'}
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
            {showAccountViewModal && viewingAccount && (() => {
                const isLoan = viewingAccount.type === AccountType.LOAN;
                const isPersonal = viewingAccount.loanType === LoanType.PERSONAL;
                const isFD = viewingAccount.type === AccountType.FIXED_DEPOSIT;
                const isRD = viewingAccount.type === AccountType.RECURRING_DEPOSIT;

                const initialPrincipal = viewingAccount.initialAmount || viewingAccount.originalAmount || 0;
                const totalInterestAdded = viewingAccount.transactions
                    .filter(t => t.category === 'Interest')
                    .reduce((sum, t) => sum + t.amount, 0);
                const totalRepayments = viewingAccount.transactions
                    .filter(t => t.type === 'credit' && isLoan)
                    .reduce((sum, t) => sum + t.amount, 0);

                const principalPaid = Math.max(0, initialPrincipal - (viewingAccount.balance - totalInterestAdded)); // Approx
                const progressPercent = isLoan
                    ? Math.min(100, (totalRepayments / (initialPrincipal + totalInterestAdded)) * 100)
                    : isFD || isRD
                        ? Math.min(100, (viewingAccount.balance / (viewingAccount.originalAmount || 1)) * 100)
                        : 0;

                return (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden relative flex flex-col shadow-2xl">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex items-center gap-4 relative">
                                <div className={`p-3 rounded-xl ${isLoan ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                    <CreditCard size={32} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-900">{viewingAccount.type}</h3>
                                    <p className="text-slate-500 font-mono flex items-center gap-2">
                                        {viewingAccount.accountNumber}
                                        {viewingAccount.loanType && <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-sans uppercase">{viewingAccount.loanType}</span>}
                                    </p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className="text-xs font-bold text-slate-400 uppercase">Current Balance</p>
                                    <p className={`text-3xl font-black ${isLoan ? 'text-red-600' : 'text-slate-900'}`}>{formatCurrency(viewingAccount.balance)}</p>
                                </div>
                                <button onClick={() => setShowAccountViewModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2"><X size={24} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Left Column: Stats & Progress */}
                                    <div className="lg:col-span-2 space-y-8">
                                        {/* Progress Card */}
                                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                                            <div className="flex justify-between items-end mb-4">
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-500 uppercase">Account Progress</h4>
                                                    <p className="text-xl font-bold text-slate-900">
                                                        {isLoan ? 'Loan Repayment Status' : 'Savings Accumulation'}
                                                    </p>
                                                </div>
                                                <span className="text-2xl font-black text-blue-600">{Math.round(progressPercent)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                                                <div className="bg-blue-600 h-3 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="bg-white p-3 rounded-xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{isLoan ? 'Principal' : 'Target'}</p>
                                                    <p className="text-sm font-bold text-slate-800">{formatCurrency(initialPrincipal || viewingAccount.originalAmount || 0)}</p>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{isLoan ? 'Interest Paid' : 'Interest Earned'}</p>
                                                    <p className="text-sm font-bold text-green-600">{isLoan ? '-' : '+'}{formatCurrency(totalInterestAdded)}</p>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{isLoan ? 'Repaid' : 'Current'}</p>
                                                    <p className="text-sm font-bold text-blue-600">{formatCurrency(isLoan ? totalRepayments : viewingAccount.balance)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Detailed Info Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                                <div className="flex items-center gap-2 mb-2 text-slate-400"><Calendar size={14} /> <span className="text-[10px] font-bold uppercase">Opening Date</span></div>
                                                <p className="text-sm font-bold text-slate-800">{formatDate(viewingAccount.openingDate || viewingAccount.createdAt)}</p>
                                            </div>
                                            <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                                <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingUp size={14} /> <span className="text-[10px] font-bold uppercase">Interest Rate</span></div>
                                                <p className="text-sm font-bold text-slate-800">{viewingAccount.interestRate}% <span className="text-[10px] font-normal text-slate-500">p.a.</span></p>
                                            </div>
                                            <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                                <div className="flex items-center gap-2 mb-2 text-slate-400"><Clock size={14} /> <span className="text-[10px] font-bold uppercase">Tenure</span></div>
                                                <p className="text-sm font-bold text-slate-800">{viewingAccount.termMonths || 0} Months</p>
                                            </div>
                                            {isLoan && (
                                                <>
                                                    <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                                        <div className="flex items-center gap-2 mb-2 text-slate-400"><DollarSign size={14} /> <span className="text-[10px] font-bold uppercase">Monthly EMI</span></div>
                                                        <p className="text-sm font-bold text-blue-600">{formatCurrency(viewingAccount.emi || 0)}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                                        <div className="flex items-center gap-2 mb-2 text-slate-400"><Users size={14} /> <span className="text-[10px] font-bold uppercase">Guarantors</span></div>
                                                        <p className="text-sm font-bold text-slate-800">{viewingAccount.guarantors?.length || 0} Members</p>
                                                    </div>
                                                </>
                                            )}
                                            {(isFD || isRD) && (
                                                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex justify-between items-center group/closure">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2 text-slate-400"><CheckCircle size={14} /> <span className="text-[10px] font-bold uppercase">Maturity Date</span></div>
                                                        <p className="text-sm font-bold text-green-600">{formatDate(viewingAccount.maturityDate)}</p>
                                                    </div>
                                                    {isFD && viewingAccount.status === AccountStatus.ACTIVE && (
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm("Are you sure you want to close this FD early?")) {
                                                                    // 1. Calculate Interest + Principal (Simple logic for now: Full Amount)
                                                                    const finalAmount = viewingAccount.balance; // Assuming balance includes everything for now

                                                                    // 2. Find or Create Optional Deposit Account
                                                                    let odAccount = accounts.find(a => a.type === AccountType.OPTIONAL_DEPOSIT);
                                                                    let odAccountId = odAccount?.id;

                                                                    if (!odAccount) {
                                                                        if (confirm("No Optional Deposit account found. Create one automatically to transfer funds?")) {
                                                                            const newOD: Account = {
                                                                                id: `ACC-OD-${member.id}-${Date.now()}`,
                                                                                memberId: member.id,
                                                                                type: AccountType.OPTIONAL_DEPOSIT,
                                                                                accountNumber: `OD-${member.id.toString().padStart(4, '0')}`,
                                                                                status: AccountStatus.ACTIVE,
                                                                                balance: 0,
                                                                                interestRate: appSettings.interestRates.optionalDeposit || 0,
                                                                                openingDate: new Date().toISOString().split('T')[0],
                                                                                currency: 'INR',
                                                                                transactions: []
                                                                            };
                                                                            onAddAccount(member.id, newOD);
                                                                            odAccount = newOD;
                                                                            odAccountId = newOD.id;
                                                                            alert(`Automatically created Optional Deposit Account: ${newOD.accountNumber}`);
                                                                        } else {
                                                                            return; // User cancelled creation
                                                                        }
                                                                    }

                                                                    if (odAccountId) {
                                                                        // 3. Mark FD as Matured
                                                                        const updatedFD: Account = {
                                                                            ...viewingAccount,
                                                                            status: AccountStatus.MATURED,
                                                                            maturityDate: new Date().toISOString().split('T')[0],
                                                                            balance: 0 // Zero out FD
                                                                        };
                                                                        onUpdateAccount(updatedFD);
                                                                        setViewingAccount(updatedFD);

                                                                        // 4. Create Transfer Transaction (Debit FD)
                                                                        const debitTx: Transaction = {
                                                                            id: `TX-CLOSE-FD-${Date.now()}`,
                                                                            amount: finalAmount,
                                                                            type: 'debit',
                                                                            category: 'Transfer',
                                                                            description: `FD Closure Transfer to ${odAccount!.accountNumber}`,
                                                                            date: new Date().toISOString().split('T')[0],
                                                                            paymentMethod: 'Cash'
                                                                        };
                                                                        onAddTransaction(viewingAccount.id, debitTx);

                                                                        // 5. Create Transfer Transaction (Credit OD)
                                                                        const creditTx: Transaction = {
                                                                            id: `TX-DEP-OD-${Date.now()}`,
                                                                            amount: finalAmount,
                                                                            type: 'credit',
                                                                            category: 'Deposit',
                                                                            description: `Transfer from FD Closure (${viewingAccount.accountNumber})`,
                                                                            date: new Date().toISOString().split('T')[0],
                                                                            paymentMethod: 'Cash'
                                                                        };
                                                                        onAddTransaction(odAccountId, creditTx);

                                                                        // Update OD Balance manually since we are in the closure flow
                                                                        // Note: onAddTransaction should handle balance update if properly implemented, 
                                                                        // but we might need to trigger a refresh or update the local odAccount state if we were viewing it.
                                                                        // Since we are viewing the FD, the global refresh via onUpdateAccount/onAddTransaction should suffice for the OD background update.

                                                                        alert(`FD Closed. ₹${finalAmount} transferred to Optional Deposit (${odAccount!.accountNumber}).`);
                                                                    }
                                                                }
                                                            }}
                                                            className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 transition-colors"
                                                        >
                                                            <XCircle size={12} /> Early Closure
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Projections / Actions */}
                                        <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
                                            <div className="absolute -right-10 -bottom-10 text-white/10 rotate-12"><Calculator size={160} /></div>
                                            <div className="relative z-10">
                                                <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                                                    {isLoan ? 'Standard Loan Overview' : 'Savings Growth Forecast'}
                                                </h4>

                                                {isLoan ? (
                                                    <div className="space-y-4">
                                                        <p className="text-sm text-blue-100">Projected repayment based on original EMI:</p>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
                                                                <p className="text-[10px] font-bold text-blue-200 uppercase">Estimated Remaining Months</p>
                                                                <p className="text-2xl font-black">
                                                                    {(() => {
                                                                        const P = viewingAccount.balance;
                                                                        const r = (viewingAccount.interestRate || 0) / 12 / 100;
                                                                        const E = viewingAccount.emi || 0;
                                                                        if (E <= P * r) return '∞';
                                                                        const n = Math.log(E / (E - P * r)) / Math.log(1 + r);
                                                                        return isNaN(n) ? '0' : Math.ceil(n);
                                                                    })()}
                                                                </p>
                                                            </div>
                                                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
                                                                <p className="text-[10px] font-bold text-blue-200 uppercase">Current Fixed EMI</p>
                                                                <p className="text-2xl font-black">{formatCurrency(viewingAccount.emi || 0)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-4">
                                                            <input type="range" min="1" max="60" className="flex-1 h-2 bg-blue-400/50 rounded-lg appearance-none cursor-pointer accent-white" value={viewForecastMonths} onChange={e => setViewForecastMonths(e.target.value)} />
                                                            <span className="font-bold min-w-[3rem] text-right">{viewForecastMonths}m</span>
                                                        </div>
                                                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 flex justify-between items-center">
                                                            <div>
                                                                <p className="text-[10px] font-bold text-blue-200 uppercase">Yield in {viewForecastMonths} months</p>
                                                                <p className="text-2xl font-black">+{formatCurrency((viewingAccount.balance * (viewingAccount.interestRate || 0) / 100) * (parseInt(viewForecastMonths) / 12))}</p>
                                                            </div>
                                                            <TrendingUp size={32} className="text-blue-200" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Loan Recalculation Tool */}
                                        {isLoan && isPersonal && (
                                            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 shadow-sm">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-2 bg-amber-200 text-amber-800 rounded-lg"><RotateCcw size={18} /></div>
                                                        <div>
                                                            <h4 className="font-bold text-amber-900">EMI & Tenure Recalculator</h4>
                                                            <p className="text-[10px] text-amber-700 font-medium">Use this to plan after extra payments</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const updatedAcc = {
                                                                    ...viewingAccount,
                                                                    emi: parseFloat(loanProjectEmi) || viewingAccount.emi,
                                                                    termMonths: parseInt(loanProjectTenure) || viewingAccount.termMonths
                                                                };
                                                                onUpdateAccount(updatedAcc);
                                                                setViewingAccount(updatedAcc);
                                                                alert("Primary EMI updated successfully!");
                                                            }}
                                                            className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-lg hover:bg-amber-700 transition-colors shadow-sm"
                                                        >
                                                            Apply to Account
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-black text-amber-700 uppercase">Target EMI (Revised)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-2.5 text-amber-400 text-sm">₹</span>
                                                            <input
                                                                type="number"
                                                                className="w-full border-amber-200 border-2 p-2 pl-7 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                                                placeholder="Enter EMI..."
                                                                value={loanProjectEmi}
                                                                onChange={e => {
                                                                    setLoanProjectEmi(e.target.value);
                                                                    const emi = parseFloat(e.target.value);
                                                                    if (emi > 0) {
                                                                        const r = (viewingAccount.interestRate || 0) / 12 / 100;
                                                                        const P = viewingAccount.balance;
                                                                        if (emi > P * r) {
                                                                            const n = Math.log(emi / (emi - P * r)) / Math.log(1 + r);
                                                                            setLoanProjectTenure(Math.ceil(n).toString());
                                                                        } else {
                                                                            setLoanProjectTenure('∞');
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-black text-amber-700 uppercase">Target Tenure (Months)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-2.5 text-amber-400 text-sm"><Clock size={14} /></span>
                                                            <input
                                                                type="number"
                                                                className="w-full border-amber-200 border-2 p-2 pl-8 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                                                placeholder="Months..."
                                                                value={loanProjectTenure}
                                                                onChange={e => {
                                                                    setLoanProjectTenure(e.target.value);
                                                                    const n = parseInt(e.target.value);
                                                                    if (n > 0) {
                                                                        const r = (viewingAccount.interestRate || 0) / 12 / 100;
                                                                        const P = viewingAccount.balance;
                                                                        const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                                                                        setLoanProjectEmi(Math.round(emi).toString());
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 p-3 bg-white/50 rounded-xl flex items-start gap-2 border border-amber-100">
                                                    <AlertCircle size={14} className="text-amber-600 mt-0.5" />
                                                    <p className="text-[9px] text-amber-800 leading-tight">
                                                        Changing the <strong>Target EMI</strong> will calculate the new <strong>Tenure</strong>.
                                                        Changing the <strong>Tenure</strong> will calculate the needed <strong>EMI</strong> to close the loan.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Mini History & Quick Settings */}
                                    <div className="space-y-8">
                                        <div>
                                            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                                <History size={18} className="text-slate-400" />
                                                Recent History
                                            </h4>
                                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                                {viewingAccount.transactions.length > 0 ? viewingAccount.transactions.slice(0, 20).map(t => (
                                                    <div key={t.id} className="p-3 border border-slate-100 rounded-xl bg-slate-50 hover:bg-white hover:shadow-sm transition-all">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{formatDate(t.date)}</span>
                                                            <span className={`text-sm font-bold ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                                {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-600 truncate font-medium">{t.description}</p>
                                                        <div className="mt-2 flex justify-between items-center">
                                                            <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase">{t.category || 'General'}</span>
                                                            <span className="text-[9px] text-slate-400">{t.paymentMethod}</span>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                                        <History size={32} className="text-slate-200 mx-auto mb-2" />
                                                        <p className="text-slate-400 text-sm italic">No history found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default MemberDetail;
