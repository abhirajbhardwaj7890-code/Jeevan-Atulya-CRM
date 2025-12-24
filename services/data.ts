import { Member, Account, AccountType, AccountStatus, Interaction, LoanType, Branch, Agent, Notification, Guarantor, AppSettings, Transaction, LedgerEntry, MemberGroup } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export const DEFAULT_SETTINGS: AppSettings = {
    latePaymentFine: 500,
    gracePeriodDays: 30,
    defaultAgentFee: 500, // Default 500 Rs per member
    interestRates: {
        optionalDeposit: 3.5,
        fixedDeposit: 6.8,
        recurringDeposit: 6.5,
        compulsoryDeposit: 4.0,
        loan: {
            home: 8.5,
            personal: 12.0,
            gold: 9.0,
            agriculture: 7.0,
            vehicle: 10.0,
            emergency: 14.0
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
    joinDate: m.join_date,
    dateOfBirth: m.date_of_birth,
    status: m.status,
    riskScore: m.risk_score,
    avatarUrl: m.avatar_url || `https://ui-avatars.com/api/?name=${m.full_name.replace(' ', '+')}&background=random`,
    branchId: m.branch_id,
    agentId: m.agent_id,
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
    join_date: m.joinDate,
    date_of_birth: m.dateOfBirth || null,
    status: m.status,
    risk_score: m.riskScore ?? 0,
    branch_id: m.branchId ?? null,
    agent_id: m.agentId ?? null,
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
        termMonths: a.term_months,
        odLimit: a.od_limit,
        rdFrequency: a.rd_frequency,
        guarantors: a.guarantors || [],
        lowBalanceAlertThreshold: a.low_balance_alert_threshold,
        createdAt: a.created_at,
        openingDate: a.opening_date,
        // Derive missing values from transactions if columns don't exist in DB
        emi: a.emi ? Number(a.emi) : (a.transactions?.[0]?.amount || 0),
        originalAmount: a.original_amount ? Number(a.original_amount) : (a.transactions?.[0]?.amount || 0),
        maturityProcessed: a.maturity_processed || false,
        transactions: a.transactions ? a.transactions.map((t: any) => ({
            id: t.id,
            date: t.date,
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
    maturity_date: a.maturityDate || null, // Convert empty string to null
    loan_type: a.loanType ?? null,
    currency: a.currency,
    term_months: a.termMonths ?? null,
    od_limit: a.odLimit ?? null,
    rd_frequency: a.rdFrequency ?? null,
    guarantors: a.guarantors || [],
    low_balance_alert_threshold: a.lowBalanceAlertThreshold ?? null,
    // Safely include these if they exist in schema, but we don't strictly rely on them now
    emi: a.emi ?? null,
    original_amount: a.originalAmount ?? null,
    opening_date: a.openingDate || null
});

export const mapInteractionFromDB = (i: any): Interaction => ({
    id: i.id,
    memberId: i.member_id,
    date: i.date,
    staffName: i.staff_name,
    type: i.type,
    notes: i.notes,
    sentiment: i.sentiment
});

const mapInteractionToDB = (i: Interaction) => ({
    id: i.id,
    member_id: i.memberId,
    date: i.date,
    staff_name: i.staffName,
    type: i.type,
    notes: i.notes,
    sentiment: i.sentiment
});

export const mapLedgerFromDB = (l: any): LedgerEntry => ({
    id: l.id,
    date: l.date,
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
    date: l.date,
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

const mapAgentFromDB = (a: any): Agent => ({
    id: a.id,
    memberId: a.member_id,
    name: a.name,
    branchId: a.branch_id,
    phone: a.phone,
    commissionFee: a.commission_fee ? Number(a.commission_fee) : undefined, // Changed
    activeMembers: 0,
    totalCollections: 0,
    status: a.status
});

const mapAgentToDB = (a: Agent) => ({
    id: a.id,
    member_id: a.memberId ?? null,
    name: a.name,
    branch_id: a.branchId,
    phone: a.phone,
    commission_fee: a.commissionFee, // Changed
    status: a.status
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
        interestRate?: number,
        date?: string // Added for bulk import/custom opening dates
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
            paymentMethod: 'Cash'
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
            agents: [],
            groups: []
        };
    }
    return MEMORY_CACHE;
};

export const loadData = async (): Promise<{ members: Member[], accounts: Account[], interactions: Interaction[], settings: AppSettings, ledger: LedgerEntry[], branches: Branch[], agents: Agent[], groups: MemberGroup[] }> => {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
        const cache = getMemoryCache();
        return {
            ...cache,
            members: [...cache.members],
            accounts: [...cache.accounts],
            interactions: [...cache.interactions],
            ledger: [...cache.ledger],
            branches: [...cache.branches],
            agents: [...cache.agents],
            groups: [...cache.groups]
        };
    }

    try {
        const supabase = getSupabaseClient();
        const [membersRes, accountsRes, interactionsRes, ledgerRes, branchesRes, agentsRes, settingsRes] = await Promise.all([
            supabase.from('members').select('*'),
            supabase.from('accounts').select('*, transactions(*)'),
            supabase.from('interactions').select('*'),
            supabase.from('society_ledger').select('*'),
            supabase.from('branches').select('*'),
            supabase.from('agents').select('*'),
            supabase.from('app_settings').select('*')
        ]);

        // Fetch Groups (Simulated via local cache if table missing or fetch fails, for resilience during dev)
        // ideally we would do: supabase.from('groups').select('*')
        // For now, we return empty or cached groups if not implemented in DB yet
        const groups: MemberGroup[] = getMemoryCache().groups; // Fallback to local until SQL is run

        const members = (membersRes.data || []).map(mapMemberFromDB);
        const accounts = (accountsRes.data || []).map(mapAccountFromDB);
        const interactions = (interactionsRes.data || []).map(mapInteractionFromDB);
        const ledger = (ledgerRes.data || []).map(mapLedgerFromDB);
        const branches = (branchesRes.data || []).map(mapBranchFromDB);
        const agents = (agentsRes.data || []).map(mapAgentFromDB);

        // Merge Settings
        const settings = { ...DEFAULT_SETTINGS };

        // Handle new schema format where specific columns exist on the first row
        if (settingsRes.data && settingsRes.data.length > 0) {
            // Check if data is in the new schema format (single row with columns)
            const dbSettings = settingsRes.data[0];

            // Try explicit column mapping first (priority)
            if (dbSettings.interest_rates) settings.interestRates = dbSettings.interest_rates;
            if (dbSettings.late_payment_fine !== undefined) settings.latePaymentFine = dbSettings.late_payment_fine;
            if (dbSettings.grace_period_days !== undefined) settings.gracePeriodDays = dbSettings.grace_period_days;

            // Fallback: Check if it's the old key-value format (array of {key, value} objects)
            // This handles the case where the table might still be using the old schema or data migration hasn't happened
            if (dbSettings.key && dbSettings.value) {
                settingsRes.data.forEach((row: any) => {
                    const val = row.value;
                    if (row.key === 'interest_rates') { try { settings.interestRates = JSON.parse(val); } catch (e) { } }
                    else if (row.key === 'late_payment_fine') settings.latePaymentFine = Number(val);
                    else if (row.key === 'grace_period_days') settings.gracePeriodDays = Number(val);
                    else if (row.key === 'default_agent_fee') settings.defaultAgentFee = Number(val);
                });
            }
        }

        return { members, accounts, interactions, settings, ledger, branches, agents, groups };
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
            agents: [...cache.agents],
            groups: [...cache.groups]
        };
    }
};

// CRITICAL UPDATE: All upsert functions now check for Local Mode first.

export const upsertMember = async (member: Member) => {
    if (!isSupabaseConfigured()) {
        console.warn("[PERSISTENCE] Volatile (Memory) Mode Active - Member Save Hidden on Refresh");
        console.log("[Volatile] Saving Member", member.fullName);
        const cache = getMemoryCache();
        const idx = cache.members.findIndex((m: Member) => m.id === member.id);
        if (idx >= 0) cache.members[idx] = member; else cache.members.push(member);
        return;
    }

    console.log("[PERSISTENCE] Saving member to Supabase:", member.id);
    const supabase = getSupabaseClient();
    const mappedData = mapMemberToDB(member);
    const { error } = await supabase.from('members').upsert(mappedData);

    if (error) {
        console.error("[PERSISTENCE] Supabase Member Upsert Error:", error.message, error.details);
        throw new Error(`Failed to save member: ${error.message}`);
    }
    console.log("[PERSISTENCE] Member saved successfully:", member.id);
};

export const bulkUpsertMembers = async (members: Member[]) => {
    if (!isSupabaseConfigured()) {
        for (const m of members) await upsertMember(m);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('members').upsert(members.map(mapMemberToDB));
    if (error) throw error;
};

export const upsertAccount = async (account: Account) => {
    if (!isSupabaseConfigured()) {
        console.log("[Volatile] Saving Account", account.accountNumber);
        const cache = getMemoryCache();
        const idx = cache.accounts.findIndex((a: Account) => a.id === account.id);
        if (idx >= 0) cache.accounts[idx] = account; else cache.accounts.push(account);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('accounts').upsert(mapAccountToDB(account));
    if (error) throw error;
};

export const bulkUpsertAccounts = async (accounts: Account[]) => {
    if (!isSupabaseConfigured()) {
        for (const a of accounts) await upsertAccount(a);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('accounts').upsert(accounts.map(mapAccountToDB));
    if (error) throw error;
};

export const upsertInteraction = async (interaction: Interaction) => {
    if (!isSupabaseConfigured()) {
        console.log("[Volatile] Saving Interaction");
        const cache = getMemoryCache();
        const idx = cache.interactions.findIndex((i: Interaction) => i.id === interaction.id);
        if (idx >= 0) cache.interactions[idx] = interaction; else cache.interactions.push(interaction);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('interactions').upsert(mapInteractionToDB(interaction));
    if (error) throw error;
};

export const upsertLedgerEntry = async (entry: LedgerEntry) => {
    if (!isSupabaseConfigured()) {
        const cache = getMemoryCache();
        const idx = cache.ledger.findIndex((l: LedgerEntry) => l.id === entry.id);
        if (idx >= 0) cache.ledger[idx] = entry; else cache.ledger.push(entry);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('society_ledger').upsert(mapLedgerToDB(entry));
    if (error) throw error;
};

export const bulkUpsertLedgerEntries = async (entries: LedgerEntry[]) => {
    if (!isSupabaseConfigured()) {
        for (const e of entries) await upsertLedgerEntry(e);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('society_ledger').upsert(entries.map(mapLedgerToDB));
    if (error) throw error;
};

export const upsertTransaction = async (transaction: Transaction, accountId: string) => {
    if (!isSupabaseConfigured()) {
        console.log("[Volatile] Saving Transaction to Account", accountId);
        const cache = getMemoryCache();
        const account = cache.accounts.find((a: Account) => a.id === accountId);
        if (account) {
            const txIdx = account.transactions.findIndex((t: Transaction) => t.id === transaction.id);
            if (txIdx >= 0) account.transactions[txIdx] = transaction; else account.transactions.unshift(transaction);
        }
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('transactions').upsert(mapTransactionToDB(transaction, accountId));
    if (error) throw error;
};

export const bulkUpsertTransactions = async (txs: { transaction: Transaction, accountId: string }[]) => {
    if (!isSupabaseConfigured()) {
        for (const t of txs) await upsertTransaction(t.transaction, t.accountId);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('transactions').upsert(txs.map(t => mapTransactionToDB(t.transaction, t.accountId)));
    if (error) throw error;
};

export const upsertBranch = async (branch: Branch) => {
    if (!isSupabaseConfigured()) {
        const cache = getMemoryCache();
        const idx = cache.branches.findIndex((b: Branch) => b.id === branch.id);
        if (idx >= 0) cache.branches[idx] = branch; else cache.branches.push(branch);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('branches').upsert(mapBranchToDB(branch));
    if (error) throw error;
};

export const upsertAgent = async (agent: Agent) => {
    if (!isSupabaseConfigured()) {
        const cache = getMemoryCache();
        const idx = cache.agents.findIndex((a: Agent) => a.id === agent.id);
        if (idx >= 0) cache.agents[idx] = agent; else cache.agents.push(agent);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('agents').upsert(mapAgentToDB(agent));
    if (error) throw error;
};

export const bulkUpsertAgents = async (agents: Agent[]) => {
    if (!isSupabaseConfigured()) {
        for (const a of agents) await upsertAgent(a);
        return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('agents').upsert(agents.map(mapAgentToDB));
    if (error) throw error;
};

export const saveSettings = async (settings: AppSettings) => {
    if (!isSupabaseConfigured()) {
        const cache = getMemoryCache();
        cache.settings = settings;
        return;
    }
    const supabase = getSupabaseClient();

    const updates = [
        { key: 'late_payment_fine', value: String(settings.latePaymentFine) },
        { key: 'grace_period_days', value: String(settings.gracePeriodDays) },
        { key: 'interest_rates', value: JSON.stringify(settings.interestRates) },
        { key: 'default_agent_fee', value: String(settings.defaultAgentFee) }
    ];

    const { error } = await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    if (error) throw error;
};

export const upsertGroup = async (group: MemberGroup) => {
    // Local Only for now (Memory Cache)
    const cache = getMemoryCache();
    const idx = cache.groups.findIndex((g: MemberGroup) => g.id === group.id);
    if (idx >= 0) cache.groups[idx] = group; else cache.groups.push(group);

    // TODO: Add Supabase implementation using the 'groups' and 'group_members' tables
    // const supabase = getSupabaseClient();
    // if (isSupabaseConfigured()) { 
    //    ... logic to sync with DB ...
    // }
};

export const deleteGroup = async (groupId: string) => {
    const cache = getMemoryCache();
    cache.groups = cache.groups.filter((g: MemberGroup) => g.id !== groupId);
};