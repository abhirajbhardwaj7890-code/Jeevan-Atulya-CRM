import { Member, Account, AccountType, AccountStatus, Interaction, LoanType, Branch, Notification, Guarantor, AppSettings, Transaction, LedgerEntry, MemberGroup } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { parseSafeDate } from './utils';

const LOCAL_STORAGE_KEY_PREFIX = 'jeevan_atulya_';

export const DEFAULT_SETTINGS: AppSettings = {
    latePaymentFine: 500,
    gracePeriodDays: 30,
    defaultIntroducerFee: 200, // Default 200 Rs per member introduced
    interestRates: {
        optionalDeposit: 3.5,
        fixedDeposit: 6.8,
        recurringDeposit: 6.5,
        compulsoryDeposit: 10.0,
        shareMoney: 10.0,
        loan: {
            home: 8.5,
            personal: 12.0,
            gold: 9.0,
            agriculture: 7.0,
            vehicle: 10.0,
            emergency: 14.0
        }
    },
    messaging: {
        enabled: false,
        apiKey: '',
        deviceId: '',
        templates: {
            newMember: "Welcome {memberName} (ID: {memberId}) to Jeevan Atulya! Your membership is confirmed on {date}.",
            newAccount: "Dear {memberName} ({memberId}), your new {accountType} account {accountNo} has been opened with a balance of ₹{balance}.",
            deposit: "Transaction Alert: ₹{amount} credited to your {accountType} account {accountNo} on {date}. New Balance: ₹{balance}.",
            withdrawal: "Transaction Alert: ₹{amount} debited from your {accountType} account {accountNo} on {date}. New Balance: ₹{balance}.",
            maturity: "Maturity Alert: Your {accountType} account {accountNo} has matured. ₹{amount} has been transferred to your Optional Deposit. New Balance: ₹{balance}.",
            loanReminder: "Reminder: Dear {memberName}, your loan installment for account {accountNo} is due. Please pay soon to avoid fines.",
            rdReminder: "Reminder: Dear {memberName}, your RD installment for account {accountNo} is due. Please deposit to your account."
        }
    }
};

// Mocks removed. Using clean empty states.

// --- Data Mappers (CamelCase <-> Snake_Case) ---

export const mapMemberFromDB = (m: any): Member => ({
    id: m.id,
    fullName: m.full_name,
    fatherName: m.father_name,
    email: m.email,
    phone: m.phone,
    permanentAddress: m.permanent_address || m.address, // Fallback to old address field if migration pending
    currentAddress: m.current_address || m.address,
    city: m.city,
    pinCode: m.pin_code,
    residenceType: m.residence_type,
    joinDate: parseSafeDate(m.join_date),
    dateOfBirth: parseSafeDate(m.date_of_birth),
    status: m.status,
    riskScore: m.risk_score,
    avatarUrl: m.avatar_url || `https://ui-avatars.com/api/?name=${m.full_name.replace(' ', '+')}&background=random`,
    branchId: m.branch_id,
    introducerId: m.introducer_id,
    isIntroducerCommissionPaid: m.is_introducer_commission_paid || false,
    documents: m.documents || [],
    lastPrintedTransactionId: m.last_printed_transaction_id,
    nominee: m.nominee ? {
        name: m.nominee.name,
        relation: m.nominee.relation,
        dateOfBirth: m.nominee.dateOfBirth || m.nominee.age, // Fallback
        phone: m.nominee.phone,
        address: m.nominee.address
    } : undefined
});

const mapMemberToDB = (m: Member) => ({
    id: m.id,
    full_name: m.fullName,
    father_name: m.fatherName,
    email: m.email,
    phone: m.phone,
    // Note: We are phasing out the 'address' column in favor of 'current_address' and 'permanent_address'
    permanent_address: m.permanentAddress,
    current_address: m.currentAddress,
    city: m.city,
    pin_code: m.pinCode,
    residence_type: m.residenceType,
    join_date: parseSafeDate(m.joinDate),
    date_of_birth: m.dateOfBirth ? parseSafeDate(m.dateOfBirth) : null,
    status: m.status,
    risk_score: m.riskScore ?? 0,
    branch_id: m.branchId ?? null,
    introducer_id: m.introducerId ?? null,
    is_introducer_commission_paid: m.isIntroducerCommissionPaid ?? false,
    avatar_url: m.avatarUrl,
    last_printed_transaction_id: m.lastPrintedTransactionId ?? null,
    documents: m.documents || [],
    nominee: m.nominee ? {
        name: m.nominee.name,
        relation: m.nominee.relation,
        dateOfBirth: m.nominee.dateOfBirth,
        phone: m.nominee.phone,
        address: m.nominee.address
    } : null
});

export const mapAccountFromDB = (a: any): Account => {
    // Calculate term_months if NULL but maturity_date exists
    let termMonths = a.term_months;

    // Self-healing: Calculate term_months from maturity_date if missing
    if (!termMonths && a.maturity_date && (a.type === 'Recurring Deposit' || a.type === 'Fixed Deposit')) {
        const openingDate = new Date(a.opening_date || a.created_at);
        const maturityDate = new Date(a.maturity_date);
        const diffTime = maturityDate.getTime() - openingDate.getTime();
        const diffMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.4167));
        termMonths = diffMonths > 0 ? diffMonths : 12; // Default to 12 if calculation fails
    }

    // Fallback defaults for RD/FD without maturity_date
    if (!termMonths && a.type === 'Recurring Deposit') {
        termMonths = 24; // Default 2 years for RD
    } else if (!termMonths && a.type === 'Fixed Deposit') {
        termMonths = 12; // Default 1 year for FD
    }

    const result: Account = {
        id: a.id,
        memberId: a.member_id,
        type: a.type as AccountType,
        accountNumber: a.account_number,
        balance: Number(a.balance),
        status: a.status as AccountStatus,
        interestRate: Number(a.interest_rate),
        initialInterestRate: a.initial_interest_rate ? Number(a.initial_interest_rate) : Number(a.interest_rate),
        initialAmount: a.initial_amount ? Number(a.initial_amount) : Number(a.amount || a.original_amount),
        maturityDate: a.maturity_date,
        loanType: a.loan_type as LoanType,
        currency: a.currency,
        termMonths: termMonths, // Use calculated/fallback value
        tenureDays: a.tenure_days, // New explicit field
        odLimit: a.od_limit,
        rdFrequency: a.rd_frequency,
        guarantors: a.guarantors || [],
        lowBalanceAlertThreshold: a.low_balance_alert_threshold,
        createdAt: parseSafeDate(a.created_at),
        openingDate: parseSafeDate(a.opening_date),
        lastInterestPostDate: a.last_interest_post_date,
        // Derive missing values from transactions if columns don't exist in DB
        emi: a.emi ? Number(a.emi) : (a.transactions?.[0]?.amount || 0),
        originalAmount: a.original_amount ? Number(a.original_amount) : (a.transactions?.[0]?.amount || 0),
        maturityProcessed: a.maturity_processed || false,
        transactions: a.transactions ? a.transactions.map((t: any) => ({
            id: t.id,
            date: parseSafeDate(t.date),
            dueDate: t.due_date,
            amount: Number(t.amount),
            type: t.type,
            description: t.description,
            paymentMethod: t.payment_method,
            cashAmount: t.cash_amount ? Number(t.cash_amount) : undefined,
            onlineAmount: t.online_amount ? Number(t.online_amount) : undefined,
            utrNumber: t.utr_number,
            category: t.category
        })) : []
    };

    // Self-healing: Recalculate balance from transactions to ensure consistency
    const transactions = result.transactions || [];
    if (transactions.length > 0) {
        let calculatedBalance = 0;
        const isLoan = result.type === AccountType.LOAN;

        transactions.forEach(t => {
            if (t.category === 'Opening Balance') {
                calculatedBalance += t.amount;
                return;
            }

            if (isLoan) {
                if (t.type === 'credit') calculatedBalance -= t.amount;
                else calculatedBalance += t.amount;
            } else {
                if (t.type === 'credit') calculatedBalance += t.amount;
                else calculatedBalance -= t.amount;
            }
        });

        if (Math.abs(calculatedBalance - result.balance) > 0.01) {
            result.balance = calculatedBalance;
        }
    }

    return result;
};

const mapAccountToDB = (a: Account) => ({
    id: a.id,
    member_id: a.memberId,
    type: a.type,
    account_number: a.accountNumber,
    balance: a.balance,
    status: a.status,
    interest_rate: a.interestRate ?? null,
    initial_interest_rate: a.initialInterestRate ?? null,
    initial_amount: a.initialAmount ?? a.originalAmount ?? null,
    maturity_date: a.maturityDate ? parseSafeDate(a.maturityDate) : null, // Convert empty string to null
    loan_type: a.loanType ?? null,
    currency: a.currency,
    term_months: a.termMonths ?? null,
    tenure_days: a.tenureDays ?? null,
    od_limit: a.odLimit ?? null,
    rd_frequency: a.rdFrequency ?? null,
    guarantors: a.guarantors || [],
    low_balance_alert_threshold: a.lowBalanceAlertThreshold ?? null,
    // Safely include these if they exist in schema, but we don't strictly rely on them now
    emi: a.emi ?? null,
    original_amount: a.originalAmount ?? null,
    opening_date: a.openingDate ? parseSafeDate(a.openingDate) : null,
    last_interest_post_date: a.lastInterestPostDate ? parseSafeDate(a.lastInterestPostDate) : null
});

export const mapInteractionFromDB = (i: any): Interaction => ({
    id: i.id,
    memberId: i.member_id,
    date: parseSafeDate(i.date),
    staffName: i.staff_name,
    type: i.type,
    notes: i.notes,
    sentiment: i.sentiment
});

const mapInteractionToDB = (i: Interaction) => ({
    id: i.id,
    member_id: i.memberId,
    date: parseSafeDate(i.date),
    staff_name: i.staffName,
    type: i.type,
    notes: i.notes,
    sentiment: i.sentiment
});

export const mapLedgerFromDB = (l: any): LedgerEntry => ({
    id: l.id,
    date: parseSafeDate(l.date),
    description: l.description,
    amount: Number(l.amount),
    type: l.type,
    category: l.category,
    cashAmount: l.cash_amount ? Number(l.cash_amount) : undefined,
    onlineAmount: l.online_amount ? Number(l.online_amount) : undefined,
    utrNumber: l.utr_number
});

const mapLedgerToDB = (l: LedgerEntry) => ({
    id: l.id,
    member_id: l.memberId || null,
    date: parseSafeDate(l.date),
    description: l.description,
    amount: l.amount,
    type: l.type,
    category: l.category,
    cash_amount: l.cashAmount ?? null,
    online_amount: l.onlineAmount ?? null,
    utr_number: l.utrNumber ?? null
});

const mapBranchFromDB = (b: any): Branch => ({
    id: b.id,
    name: b.name,
    location: b.location,
    managerName: b.manager_name
});

const mapBranchToDB = (b: Branch) => ({
    id: b.id,
    name: b.name,
    location: b.location,
    manager_name: b.managerName
});



const mapTransactionToDB = (t: Transaction, accountId: string) => ({
    id: t.id,
    account_id: accountId,
    amount: t.amount,
    type: t.type,
    description: t.description,
    date: t.date,
    payment_method: t.paymentMethod ?? 'Cash',
    cash_amount: t.cashAmount ?? null,
    online_amount: t.onlineAmount ?? null,
    utr_number: t.utrNumber ?? null
});


// --- Helper Functions ---

export const createAccount = (
    memberId: string,
    type: AccountType,
    balance: number = 0,
    loanType?: LoanType,
    extra?: {
        odLimit?: number,
        rdFrequency?: 'Monthly' | 'Daily',
        guarantors?: Guarantor[],
        termMonths?: number,  // Added overrides
        tenureDays?: number,
        interestRate?: number,
        date?: string, // Added for bulk import/custom opening dates
        paymentMethod?: string,
        utrNumber?: string,
        cashAmount?: number,
        onlineAmount?: number
    },
    seriesNumber: number = 1,
    settings: AppSettings = DEFAULT_SETTINGS
): Account => {
    let code = 'ACC';
    let rate = extra?.interestRate || 0;
    let term = extra?.termMonths || 0;
    let originalAmount = balance;
    let emi: number | undefined = undefined;

    // Apply default interest rates if not overridden
    if (!extra?.interestRate) {
        switch (type) {
            case AccountType.OPTIONAL_DEPOSIT:
                rate = settings.interestRates.optionalDeposit;
                break;
            case AccountType.COMPULSORY_DEPOSIT:
                rate = settings.interestRates.compulsoryDeposit;
                break;
            case AccountType.FIXED_DEPOSIT:
                rate = settings.interestRates.fixedDeposit;
                if (!term) term = 12; // Default
                break;
            case AccountType.RECURRING_DEPOSIT:
                rate = settings.interestRates.recurringDeposit;
                if (!term) term = 24;
                break;
            case AccountType.LOAN:
                if (loanType === LoanType.HOME) { rate = settings.interestRates.loan.home; if (!term) term = 120; }
                else if (loanType === LoanType.GOLD) { rate = settings.interestRates.loan.gold; if (!term) term = 12; }
                else if (loanType === LoanType.AGRICULTURE) { rate = settings.interestRates.loan.agriculture; if (!term) term = 24; }
                else if (loanType === LoanType.VEHICLE) { rate = settings.interestRates.loan.vehicle; if (!term) term = 36; }
                else if (loanType === LoanType.EMERGENCY) { rate = settings.interestRates.loan.emergency; if (!term) term = 12; }
                else { rate = settings.interestRates.loan.personal; if (!term) term = 36; }
                break;
        }
    }

    // Set codes
    switch (type) {
        case AccountType.SHARE_CAPITAL: code = 'SHR'; break;
        case AccountType.OPTIONAL_DEPOSIT: code = 'ODP'; break;
        case AccountType.COMPULSORY_DEPOSIT: code = 'CD'; break;
        case AccountType.FIXED_DEPOSIT: code = 'FD'; originalAmount = balance; break;
        case AccountType.RECURRING_DEPOSIT: code = 'RD'; originalAmount = balance; emi = balance; break; // Set EMI as Installment for RD
        case AccountType.LOAN:
            if (loanType === LoanType.HOME) code = 'HL';
            else if (loanType === LoanType.GOLD) code = 'GL';
            else if (loanType === LoanType.AGRICULTURE) code = 'AL';
            else if (loanType === LoanType.VEHICLE) code = 'VL';
            else if (loanType === LoanType.EMERGENCY) code = 'EL';
            else code = 'PL';
            originalAmount = balance;
            break;
    }

    // Calculate EMI for Loans
    if (type === AccountType.LOAN && balance > 0 && term > 0) {
        if (loanType === LoanType.EMERGENCY) {
            // FLAT RATE Logic
            const years = term / 12;
            const totalInterest = balance * (rate / 100) * years;
            const totalPayable = balance + totalInterest;
            emi = Math.round(totalPayable / term);
        } else {
            // REDUCING BALANCE Logic
            const r = rate / 12 / 100;
            const numerator = balance * r * Math.pow(1 + r, term);
            const denominator = Math.pow(1 + r, term) - 1;
            emi = Math.round(numerator / denominator);
        }
    }

    return {
        id: `ACC-${memberId}-${code}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        memberId,
        type,
        loanType,
        accountNumber: `${memberId}-${code}-${seriesNumber}`,
        balance,
        originalAmount: originalAmount,
        initialAmount: originalAmount,
        emi: emi,
        odLimit: undefined,
        rdFrequency: extra?.rdFrequency,
        currency: 'INR',
        status: AccountStatus.ACTIVE,
        interestRate: rate,
        initialInterestRate: rate,
        termMonths: term > 0 ? term : undefined,
        tenureDays: extra?.tenureDays,
        guarantors: extra?.guarantors || [],
        openingDate: extra?.date || new Date().toISOString().split('T')[0],
        transactions: [{
            id: `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: extra?.date || new Date().toISOString().split('T')[0],
            amount: balance,
            type: type === AccountType.LOAN ? 'debit' : 'credit',
            category: type === AccountType.LOAN ? 'Loan Disbursement' : 'Opening Balance',
            description: type === AccountType.LOAN
                ? `New ${loanType || 'Personal'} Loan`
                : 'Initial Deposit / Disbursement',
            paymentMethod: (extra?.paymentMethod as 'Cash' | 'Online' | 'Both') || 'Cash',
            utrNumber: extra?.utrNumber,
            cashAmount: extra?.cashAmount,
            onlineAmount: extra?.onlineAmount
        }]
    };
};

// VOLATILE IN-MEMORY CACHE (Resets on Refresh)
// This ensures data "effects members" during usability but vanishes on refresh as requested.
let MEMORY_CACHE: any = null;

const getMemoryCache = () => {
    if (!MEMORY_CACHE) {
        MEMORY_CACHE = {
            members: [],
            accounts: [],
            interactions: [],
            settings: { ...DEFAULT_SETTINGS },
            ledger: [],
            branches: [],
            groups: []
        };
    }
    return MEMORY_CACHE;
};

// --- Local Storage Backup ---

export const saveLocalBackup = (data: any) => {
    try {
        localStorage.setItem('jeevan_atulya_local_backup', JSON.stringify({
            timestamp: new Date().toISOString(),
            ...data
        }));
        console.log("[BACKUP] Local snapshot saved to browser storage.");
    } catch (e) {
        console.error("[BACKUP] Failed to save local snapshot", e);
    }
};

export const getLocalBackup = () => {
    try {
        const stored = localStorage.getItem('jeevan_atulya_local_backup');
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (e) {
        return null;
    }
};

export const pingSupabase = async (): Promise<boolean> => {
    if (sessionStorage.getItem('offline_mode') === 'true') return true; // Always alive in dev
    if (!isSupabaseConfigured()) return false;
    try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('settings').select('count', { count: 'exact', head: true }).limit(1);
        return !error;
    } catch (e) {
        return false;
    }
};

export const loadData = async (): Promise<{ members: Member[], accounts: Account[], interactions: Interaction[], settings: AppSettings, ledger: LedgerEntry[], branches: Branch[], groups: MemberGroup[] }> => {
    // Check for Offline Mode Flag
    const isOfflineMode = sessionStorage.getItem('offline_mode') === 'true';

    // Check if Supabase is configured
    if (!isSupabaseConfigured() && !isOfflineMode) {
        throw new Error("DB_CONFIG_MISSING");
    }

    if (isOfflineMode) {
        console.log("[LOAD] Dev Mode Detected. Using empty/local state.");
        const cache = getMemoryCache();
        return {
            members: cache.members,
            accounts: cache.accounts,
            interactions: cache.interactions,
            settings: cache.settings,
            ledger: cache.ledger,
            branches: cache.branches,
            groups: cache.groups
        };
    }

    try {
        const supabase = getSupabaseClient();
        console.log("[LOAD] Fetching grid data...");
        const [membersRes, accountsRes, interactionsRes, ledgerRes, branchesRes, settingsRes] = await Promise.all([
            supabase.from('members').select('*'),
            supabase.from('accounts').select('*, transactions(*)'),
            supabase.from('interactions').select('*'),
            supabase.from('society_ledger').select('*'),
            supabase.from('branches').select('*'),
            supabase.from('settings').select('*')
        ]);

        const firstError = membersRes.error || accountsRes.error || interactionsRes.error || ledgerRes.error || branchesRes.error || settingsRes.error;
        if (firstError) {
            console.error("[LOAD] DB Error:", firstError);
            throw new Error("DB_FETCH_FAILED");
        }

        // Fetch Groups (Simulated via local cache to avoid breaking if table missing)
        const groups: MemberGroup[] = getMemoryCache().groups;

        const members = (membersRes.data || []).map(mapMemberFromDB);
        const accounts = (accountsRes.data || []).map(mapAccountFromDB);
        const interactions = (interactionsRes.data || []).map(mapInteractionFromDB);
        const ledger = (ledgerRes.data || []).map(mapLedgerFromDB);
        const branches = (branchesRes.data || []).map(mapBranchFromDB);

        // Merge Settings
        const settings = { ...DEFAULT_SETTINGS };

        if (settingsRes.data && settingsRes.data.length > 0) {
            const dbSettings = settingsRes.data[0];

            // 1. Try explicit column mapping (New Schema)
            // Check if one of the known columns exists to confirm schema type
            if (dbSettings.interest_rates !== undefined || dbSettings.messaging !== undefined) {
                if (dbSettings.interest_rates) settings.interestRates = dbSettings.interest_rates;
                if (dbSettings.late_payment_fine !== undefined) settings.latePaymentFine = dbSettings.late_payment_fine;
                if (dbSettings.grace_period_days !== undefined) settings.gracePeriodDays = dbSettings.grace_period_days;
                if (dbSettings.default_introducer_fee !== undefined) settings.defaultIntroducerFee = dbSettings.default_introducer_fee;
                if (dbSettings.messaging) settings.messaging = dbSettings.messaging;
            }
            // 2. Fallback to Key-Value (Old Schema)
            // This block iterates over all settings rows, assuming each row is a key-value pair.
            // The condition `dbSettings.key && dbSettings.value` was incorrect as it only checked the first row.
            // The correct approach is to iterate over `settingsRes.data` if it's an old schema.
            else if (settingsRes.data.some((row: any) => row.key && row.value)) { // Check if any row looks like a key-value pair
                settingsRes.data.forEach((row: any) => {
                    const val = row.value;
                    if (row.key === 'interest_rates') {
                        try { settings.interestRates = JSON.parse(val); }
                        catch (e) { console.error("[LOAD] Failed to parse interest_rates", e); }
                    }
                    else if (row.key === 'late_payment_fine') settings.latePaymentFine = Number(val);
                    else if (row.key === 'grace_period_days') settings.gracePeriodDays = Number(val);
                    else if (row.key === 'default_introducer_fee') settings.defaultIntroducerFee = Number(val);
                    else if (row.key === 'messaging') {
                        try {
                            settings.messaging = JSON.parse(val);
                            console.log("[LOAD] Parsed Messaging Config:", settings.messaging);
                        }
                        catch (e) {
                            console.error("[LOAD] Failed to parse messaging JSON:", val, e);
                        }
                    }
                });
            }
        }

        return { members, accounts, interactions, settings, ledger, branches, groups };
    } catch (error) {
        console.error("Critical: Failed to load data from Supabase", error);
        // Fail gracefully
        const cache = getMemoryCache();
        return {
            ...cache,
            members: [...cache.members],
            accounts: [...cache.accounts],
            interactions: [...cache.interactions],
            ledger: [...cache.ledger],
            branches: [...cache.branches],
            groups: [...cache.groups]
        };
    }
};

// --- Hybrid Upsert Functions ---

const saveToLocal = (key: string, item: any, idField = 'id') => {
    // 1. Sync Memory Cache (Essential for UI stability in Dev Mode)
    const cache = getMemoryCache();
    if (cache[key as keyof typeof cache]) {
        const arr = cache[key as keyof typeof cache] as any[];
        const index = arr.findIndex((e: any) => e[idField] === item[idField]);
        if (index >= 0) arr[index] = item;
        else arr.push(item);
    }

    // 2. Sync Local Storage (ONLY if NOT in Dev Mode)
    if (sessionStorage.getItem('offline_mode') !== 'true') {
        try {
            const fullKey = LOCAL_STORAGE_KEY_PREFIX + key;
            const existing = JSON.parse(localStorage.getItem(fullKey) || '[]');
            const index = existing.findIndex((e: any) => e[idField] === item[idField]);
            if (index >= 0) existing[index] = item;
            else existing.push(item);
            localStorage.setItem(fullKey, JSON.stringify(existing));
        } catch (e) {
            console.warn("[BACKUP] Failed to save to local storage (likely quota exceeded):", e);
        }
    }
};

const removeFromLocal = (key: string, id: string, idField = 'id') => {
    // 1. Sync Memory Cache
    const cache = getMemoryCache();
    if (cache[key as keyof typeof cache]) {
        cache[key as keyof typeof cache] = (cache[key as keyof typeof cache] as any[]).filter((e: any) => e[idField] !== id);
    }

    // 2. Sync Local Storage (ONLY if NOT in Dev Mode)
    if (sessionStorage.getItem('offline_mode') !== 'true') {
        try {
            const fullKey = LOCAL_STORAGE_KEY_PREFIX + key;
            const existing = JSON.parse(localStorage.getItem(fullKey) || '[]');
            const updated = existing.filter((e: any) => e[idField] !== id);
            localStorage.setItem(fullKey, JSON.stringify(updated));
        } catch (e) {
            console.error("[BACKUP] Failed to remove from local storage", e);
        }
    }
};

export const upsertMember = async (member: Member) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isSupabaseConfigured() && !isOffline) {
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.from('members').upsert(mapMemberToDB(member));
            if (error) throw error;
        } catch (e) { console.error("Supabase Write Failed:", e); }
    }
    // Always write to local as backup/hybrid
    saveToLocal('members', member);
};

export const bulkUpsertMembers = async (members: Member[]) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isSupabaseConfigured() && !isOffline) {
        const supabase = getSupabaseClient();
        await supabase.from('members').upsert(members.map(mapMemberToDB));
    }
    members.forEach(m => saveToLocal('members', m));
};

export const upsertAccount = async (account: Account) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isSupabaseConfigured() && !isOffline) {
        try {
            const supabase = getSupabaseClient();
            await supabase.from('accounts').upsert(mapAccountToDB(account));
        } catch (e) { console.error("Supabase Account Write Failed:", e); }
    }
    saveToLocal('accounts', account);
};

export const bulkUpsertAccounts = async (accounts: Account[]) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isSupabaseConfigured() && !isOffline) {
        const supabase = getSupabaseClient();
        await supabase.from('accounts').upsert(accounts.map(mapAccountToDB));
    }
    accounts.forEach(a => saveToLocal('accounts', a));
};

export const upsertInteraction = async (interaction: Interaction) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isSupabaseConfigured() && !isOffline) {
        try {
            const supabase = getSupabaseClient();
            await supabase.from('interactions').upsert(mapInteractionToDB(interaction));
        } catch (e) { console.error(e); }
    }
    saveToLocal('interactions', interaction);
};

export const upsertLedgerEntry = async (entry: LedgerEntry) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        saveToLocal('ledger', entry);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('society_ledger').upsert(mapLedgerToDB(entry));
    if (error) throw error;
};

export const bulkUpsertLedgerEntries = async (entries: LedgerEntry[]) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        entries.forEach(e => saveToLocal('ledger', e));
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('society_ledger').upsert(entries.map(mapLedgerToDB));
    if (error) throw error;
};

export const upsertTransaction = async (transaction: Transaction, accountId: string) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        // Find account in memory cache and update
        const cache = getMemoryCache();
        const acc = cache.accounts.find((a: Account) => a.id === accountId);
        if (acc) {
            // Deduplicate transaction
            const tidx = acc.transactions.findIndex((t: any) => t.id === transaction.id);
            if (tidx >= 0) acc.transactions[tidx] = transaction;
            else acc.transactions.unshift(transaction);

            if (transaction.type === 'credit') acc.balance += transaction.amount;
            else acc.balance -= transaction.amount;

            // PERSIST the updated account object (which contains the transaction)
            saveToLocal('accounts', acc);
        }
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('transactions').upsert(mapTransactionToDB(transaction, accountId));
    if (error) throw error;
};

export const bulkUpsertTransactions = async (txs: { transaction: Transaction, accountId: string }[]) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        const cache = getMemoryCache();
        const affectedAccounts = new Set<string>();
        for (const t of txs) {
            const acc = cache.accounts.find((a: Account) => a.id === t.accountId);
            if (acc) {
                const tidx = acc.transactions.findIndex((tx: any) => tx.id === t.transaction.id);
                if (tidx >= 0) acc.transactions[tidx] = t.transaction;
                else acc.transactions.unshift(t.transaction);

                if (t.transaction.type === 'credit') acc.balance += t.transaction.amount;
                else acc.balance -= t.transaction.amount;
                affectedAccounts.add(t.accountId);
            }
        }
        // Save each affected account
        affectedAccounts.forEach(aid => {
            const acc = cache.accounts.find((a: Account) => a.id === aid);
            if (acc) saveToLocal('accounts', acc);
        });
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('transactions').upsert(txs.map(t => mapTransactionToDB(t.transaction, t.accountId)));
    if (error) throw error;
};

export const bulkDeleteTransactions = async (ids: string[]) => {
    if (ids.length === 0) return;
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        // No-op for now, or implement cache deletion if needed.
        // Given this is DevMode/Mock, skipping deletion in cache is acceptable or can be added.
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) {
        console.error("[PERSISTENCE] Supabase Transaction Deletion Error:", error.message);
        throw error;
    }
};

export const upsertBranch = async (branch: Branch) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        saveToLocal('branches', branch);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('branches').upsert(mapBranchToDB(branch));
    if (error) throw error;
};



export const saveSettings = async (settings: AppSettings) => {
    const isOffline = sessionStorage.getItem('offline_mode') === 'true';
    if (isOffline) {
        const cache = getMemoryCache();
        cache.settings = settings;
        return;
    }
    const supabase = getSupabaseClient();

    const updates = [
        { key: 'late_payment_fine', value: String(settings.latePaymentFine) },
        { key: 'grace_period_days', value: String(settings.gracePeriodDays) },
        { key: 'interest_rates', value: JSON.stringify(settings.interestRates) },
        { key: 'default_introducer_fee', value: String(settings.defaultIntroducerFee) },
        { key: 'messaging', value: JSON.stringify(settings.messaging || {}) }
    ];

    const { error } = await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    if (error) throw error;
};

export const upsertGroup = async (group: MemberGroup) => {
    // Always sync with storage/cache for Dev Mode consistency
    saveToLocal('groups', group);

    // TODO: Add Supabase implementation using the 'groups' and 'group_members' tables
};

export const deleteGroup = async (groupId: string) => {
    removeFromLocal('groups', groupId);
};