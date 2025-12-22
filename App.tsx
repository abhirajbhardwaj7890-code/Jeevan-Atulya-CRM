import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { Members } from './pages/Members';
import { MemberDetail } from './pages/MemberDetail';
import { NewMember } from './pages/NewMember';
import { AllAccounts } from './pages/AllAccounts';
import { Reports } from './pages/Reports';
import { Network } from './pages/Network';
import { SettingsPage } from './pages/Settings';
import { Accounting } from './pages/Accounting';
import { PassbookPage } from './pages/PassbookPage';
import {
    loadData,
    upsertMember,
    upsertAccount,
    upsertInteraction,
    upsertLedgerEntry,
    upsertTransaction,
    upsertBranch,
    upsertAgent,
    saveSettings,
    MOCK_BRANCHES,
    MOCK_AGENTS,
    createAccount,
    DEFAULT_SETTINGS,
    MOCK_NOTIFICATIONS
} from './services/data';
import { Member, Interaction, Account, UserRole, Transaction, AccountType, AppSettings, LedgerEntry, AccountStatus, Branch, Agent, Notification } from './types';
import { Menu, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [userRole, setUserRole] = useState<UserRole>('Admin');

    // Application State
    const [isLoaded, setIsLoaded] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

    // Notification State
    const [actionNotifications, setActionNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
    const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());

    // Network State
    const [branches, setBranches] = useState<Branch[]>(MOCK_BRANCHES);
    const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);

    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // --- Dynamic System Alerts (Responsive Logic) ---
    const systemAlerts = useMemo(() => {
        const alerts: Notification[] = [];
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

        accounts.forEach(acc => {
            // 1. Low Balance Check for Deposits
            if (acc.type === AccountType.OPTIONAL_DEPOSIT && acc.status === AccountStatus.ACTIVE) {
                const threshold = acc.lowBalanceAlertThreshold ?? 500;
                if (acc.balance < threshold) {
                    alerts.push({
                        id: `ALERT-LOW-${acc.id}`,
                        title: 'Low Balance Alert',
                        message: `Account ${acc.accountNumber} balance (₹${acc.balance}) is below minimum limit (₹${threshold}).`,
                        type: 'warning',
                        date: todayStr,
                        read: false
                    });
                }
            }

            // 2. Loan Checks (Active Loans)
            if (acc.type === AccountType.LOAN && acc.status === AccountStatus.ACTIVE) {
                // A. Loan Maturity Check (Final Date)
                if (acc.maturityDate) {
                    const matDate = new Date(acc.maturityDate);
                    const diffTime = matDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays < 0 && acc.balance > 0) {
                        alerts.push({
                            id: `ALERT-LOAN-MAT-${acc.id}`,
                            title: 'Loan Maturity Overdue',
                            message: `Loan ${acc.accountNumber} matured on ${acc.maturityDate}. Outstanding: ₹${acc.balance}.`,
                            type: 'alert',
                            date: todayStr,
                            read: false
                        });
                    } else if (diffDays <= 30 && diffDays >= 0) {
                        alerts.push({
                            id: `ALERT-LOAN-NEAR-${acc.id}`,
                            title: 'Loan Maturity Approaching',
                            message: `Loan ${acc.accountNumber} matures in ${diffDays} days (${acc.maturityDate}).`,
                            type: 'info',
                            date: todayStr,
                            read: false
                        });
                    }
                }

                // B. Monthly Installment (EMI) Logic
                // If balance > 0, check if a credit transaction exists for this month
                if (acc.balance > 0) {
                    const hasPaidThisMonth = acc.transactions.some(t =>
                        t.type === 'credit' && t.date.startsWith(currentMonthStr)
                    );

                    if (!hasPaidThisMonth) {
                        const dayOfMonth = today.getDate();
                        if (dayOfMonth > 15) {
                            alerts.push({
                                id: `ALERT-EMI-LATE-${acc.id}`,
                                title: 'Loan Repayment Late',
                                message: `EMI for ${acc.type} (${acc.accountNumber}) is overdue for this month.`,
                                type: 'warning',
                                date: todayStr,
                                read: false
                            });
                        } else if (dayOfMonth > 5) { // Assuming typical due date is 5th
                            alerts.push({
                                id: `ALERT-EMI-DUE-${acc.id}`,
                                title: 'Loan Repayment Due',
                                message: `EMI for ${acc.type} (${acc.accountNumber}) is due this month.`,
                                type: 'info',
                                date: todayStr,
                                read: false
                            });
                        }
                    }
                }
            }

            // 3. Approaching Maturity Check (FD/RD)
            if ((acc.type === AccountType.FIXED_DEPOSIT || acc.type === AccountType.RECURRING_DEPOSIT)
                && acc.status === AccountStatus.ACTIVE && acc.maturityDate) {
                const matDate = new Date(acc.maturityDate);
                const diffTime = matDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 7) {
                    const isPast = diffDays < 0;
                    alerts.push({
                        id: `ALERT-FD-MAT-${acc.id}`,
                        title: isPast ? 'Maturity Action Pending' : 'Deposit Maturity Approaching',
                        message: isPast
                            ? `${acc.type} ${acc.accountNumber} matured on ${acc.maturityDate}.`
                            : `${acc.type} ${acc.accountNumber} matures in ${diffDays} days (${acc.maturityDate}).`,
                        type: isPast ? 'warning' : 'info',
                        date: todayStr,
                        read: false
                    });
                }
            }
        });
        return alerts;
    }, [accounts]);

    // Combine and Apply Read Status
    const allNotifications = useMemo(() => {
        const combined = [...actionNotifications, ...systemAlerts];
        // Sort by priority (alert > warning > info) then date
        return combined.map(n => ({
            ...n,
            read: readNotificationIds.has(n.id) || n.read
        })).sort((a, b) => {
            if (a.read === b.read) {
                if (a.type === 'alert' && b.type !== 'alert') return -1;
                if (b.type === 'alert' && a.type !== 'alert') return 1;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            }
            return a.read ? 1 : -1;
        });
    }, [actionNotifications, systemAlerts, readNotificationIds]);

    const handleMarkRead = (id: string) => {
        setReadNotificationIds(prev => new Set(prev).add(id));
    };

    // --- Scheduled Tasks Logic ---
    const runScheduledTasks = async (currentAccounts: Account[], currentMembers: Member[]) => {
        const today = new Date();
        const newActionNotifs: Notification[] = [];
        const updatedAccounts: Account[] = [...currentAccounts];
        let updatesMade = false;

        for (let i = 0; i < updatedAccounts.length; i++) {
            const acc = updatedAccounts[i];

            if ((acc.type === AccountType.FIXED_DEPOSIT || acc.type === AccountType.RECURRING_DEPOSIT)
                && acc.status === AccountStatus.ACTIVE
                && acc.maturityDate
                && !acc.maturityProcessed) {

                const maturityDate = new Date(acc.maturityDate);

                if (today >= maturityDate) {
                    const daysSinceMaturity = Math.floor((today.getTime() - maturityDate.getTime()) / (1000 * 3600 * 24));

                    if (daysSinceMaturity >= 3) {
                        const member = currentMembers.find(m => m.id === acc.memberId);
                        const odAccountIndex = updatedAccounts.findIndex(a => a.memberId === acc.memberId && a.type === AccountType.OPTIONAL_DEPOSIT);

                        if (odAccountIndex !== -1 && member) {
                            const odAccount = updatedAccounts[odAccountIndex];
                            const transferAmount = acc.balance;

                            updatedAccounts[i] = {
                                ...acc,
                                balance: 0,
                                status: AccountStatus.CLOSED,
                                maturityProcessed: true,
                                transactions: [
                                    {
                                        id: `TX-MAT-CLOSE-${Date.now()}`,
                                        date: new Date().toISOString().split('T')[0],
                                        amount: transferAmount,
                                        type: 'debit',
                                        category: 'Maturity Transfer',
                                        description: `Auto-Transfer to OD (${odAccount.accountNumber}) upon Maturity`
                                    },
                                    ...acc.transactions
                                ]
                            };

                            updatedAccounts[odAccountIndex] = {
                                ...odAccount,
                                balance: odAccount.balance + transferAmount,
                                transactions: [
                                    {
                                        id: `TX-MAT-CREDIT-${Date.now()}`,
                                        date: new Date().toISOString().split('T')[0],
                                        amount: transferAmount,
                                        type: 'credit',
                                        category: 'Maturity Credit',
                                        description: `Maturity Credit from ${acc.type} (${acc.accountNumber})`
                                    },
                                    ...odAccount.transactions
                                ]
                            };

                            newActionNotifs.push({
                                id: `NOTIF-TRANS-${acc.id}`,
                                title: `Maturity Transfer Complete`,
                                message: `${acc.type} (${acc.accountNumber}) matured. ₹${transferAmount} transferred to Optional Deposit.`,
                                type: 'info',
                                date: new Date().toISOString().split('T')[0],
                                read: false
                            });

                            await upsertAccount(updatedAccounts[i]);
                            await upsertTransaction(updatedAccounts[i].transactions[0], updatedAccounts[i].id);
                            await upsertAccount(updatedAccounts[odAccountIndex]);
                            await upsertTransaction(updatedAccounts[odAccountIndex].transactions[0], updatedAccounts[odAccountIndex].id);

                            updatesMade = true;
                        }
                    }
                }
            }
        }

        if (updatesMade) {
            setAccounts(updatedAccounts);
            setActionNotifications(prev => [...newActionNotifs, ...prev]);
        }
    };

    useEffect(() => {
        const initData = async () => {
            try {
                const data = await loadData();
                setMembers(data.members);
                setAccounts(data.accounts);
                setInteractions(data.interactions);
                setSettings(data.settings);
                setLedger(data.ledger);
                setBranches(data.branches);
                setAgents(data.agents);
                runScheduledTasks(data.accounts, data.members);
            } catch (e) {
                console.error("Initialization failed", e);
            } finally {
                setIsLoaded(true);
            }
        };
        initData();
    }, []);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const data = await loadData();
            setMembers(data.members);
            setAccounts(data.accounts);
            setInteractions(data.interactions);
            setSettings(data.settings);
            setLedger(data.ledger);
            setBranches(data.branches);
            setAgents(data.agents);
            runScheduledTasks(data.accounts, data.members);
        } catch (e) {
            console.error("Refresh failed", e);
        } finally {
            setIsRefreshing(false);
            if (!isLoaded) setIsLoaded(true);
        }
    };

    const memberAccounts = useMemo(() =>
        selectedMember ? accounts.filter(a => a.memberId === selectedMember.id) : [],
        [selectedMember, accounts]);

    const memberInteractions = useMemo(() =>
        selectedMember ? interactions.filter(i => i.memberId === selectedMember.id) : [],
        [selectedMember, interactions]);

    const nextMemberId = useMemo(() => {
        const maxId = members.reduce((max, member) => {
            const numericPart = member.id.replace(/\D/g, '');
            const idNum = parseInt(numericPart, 10);
            if (!isNaN(idNum) && idNum > max) return idNum;
            return max;
        }, 0);
        return (maxId + 1).toString();
    }, [members]);

    const handleLogin = (role: UserRole) => {
        setUserRole(role);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setSelectedMember(null);
        setCurrentPage('dashboard');
    };

    const handleNavigate = (page: string) => {
        setCurrentPage(page);
        setSelectedMember(null);
        setSidebarOpen(false);
    };

    const handleSelectMember = (member: Member) => {
        setSelectedMember(member);
        setCurrentPage('member-detail');
    };

    const handleUpdateSettings = async (newSettings: AppSettings) => {
        await saveSettings(newSettings);
        setSettings(newSettings);
    };

    const handleAddInteraction = async (interaction: Partial<Interaction>) => {
        const newInteraction: Interaction = {
            id: `INT-${Date.now()}`,
            memberId: interaction.memberId!,
            date: interaction.date!,
            staffName: interaction.staffName!,
            type: interaction.type!,
            notes: interaction.notes!,
            sentiment: interaction.sentiment
        };
        setInteractions([newInteraction, ...interactions]);
        await upsertInteraction(newInteraction);
    };

    const handleAddMember = async (newMember: Member, newAccounts: Account[], totalCollected: number, shouldNavigate: boolean = true): Promise<boolean> => {
        try {
            await upsertMember(newMember);
            for (const acc of newAccounts) {
                await upsertAccount(acc);
                for (const tx of acc.transactions) {
                    await upsertTransaction(tx, acc.id);
                }
            }
            let ledgerEntry: LedgerEntry | null = null;
            if (totalCollected > 0) {
                ledgerEntry = {
                    id: `LDG-REG-${Date.now()}`,
                    date: new Date().toISOString().split('T')[0],
                    description: `New Registration - ${newMember.fullName}`,
                    amount: totalCollected,
                    type: 'Income',
                    category: 'Admission Fees & Deposits'
                };
                await upsertLedgerEntry(ledgerEntry);
            }
            setMembers(prev => [newMember, ...prev]);
            setAccounts(prev => [...newAccounts, ...prev]);
            if (ledgerEntry) setLedger(prev => [ledgerEntry!, ...prev]);
            if (shouldNavigate) setCurrentPage('members');
            return true;
        } catch (e) {
            console.error("Save failed", e);
            throw e;
        }
    };

    const handleAddAccount = async (memberId: string, accountData: Partial<Account> & { openingDate?: string }) => {
        if (!accountData.type) return;

        // Extract opening date (use accountData.openingDate or default to today)
        const openingDate = accountData.openingDate || new Date().toISOString().split('T')[0];

        const currentCount = accounts.filter(a => a.memberId === memberId).length;
        const newAccount = createAccount(memberId, accountData.type, accountData.balance || 0, accountData.loanType, {
            odLimit: accountData.odLimit,
            rdFrequency: accountData.rdFrequency,
            guarantors: accountData.guarantors,
            termMonths: accountData.termMonths,
            interestRate: accountData.interestRate,
            date: openingDate // Pass opening date to createAccount
        }, currentCount + 1, settings);

        if (accountData.maturityDate) newAccount.maturityDate = accountData.maturityDate;
        if (accountData.currency) newAccount.currency = accountData.currency;

        // Loan Approval Workflow: Non-Admin users create loans in Pending status
        if (accountData.type === AccountType.LOAN && userRole !== 'Admin') {
            newAccount.status = AccountStatus.PENDING;
        } else if (accountData.status) {
            newAccount.status = accountData.status;
        }

        setAccounts(prev => [newAccount, ...prev]);
        await upsertAccount(newAccount);
        if (newAccount.transactions.length > 0) {
            await upsertTransaction(newAccount.transactions[0], newAccount.id);
        }

        if ((accountData.balance || 0) > 0 && accountData.type !== AccountType.LOAN) {
            const ledgerEntry: LedgerEntry = {
                id: `LDG-ACC-${Date.now()}`,
                date: openingDate, // Use opening date for ledger entry
                description: `New ${accountData.type} Opening - ${newAccount.accountNumber}`,
                amount: accountData.balance || 0,
                type: 'Income',
                category: 'Member Deposits'
            };
            setLedger(prev => [ledgerEntry, ...prev]);
            await upsertLedgerEntry(ledgerEntry);
        }
    };

    const handleAddTransaction = async (accountId: string, transactionData: Partial<Transaction>) => {
        const account = accounts.find(acc => acc.id === accountId);
        if (!account) return;

        const isLoan = account.type === AccountType.LOAN;
        const txAmount = transactionData.amount || 0;
        let newBalance = account.balance;
        let ledgerType: 'Income' | 'Expense' = 'Income';
        let ledgerCategory = 'Other';

        if (isLoan) {
            if (transactionData.type === 'credit') {
                newBalance = account.balance - txAmount;
                ledgerType = 'Income';
                ledgerCategory = 'Loan Repayment';
            } else {
                newBalance = account.balance + txAmount;
                ledgerType = 'Expense';
                ledgerCategory = 'Loan Disbursement';
            }
        } else {
            if (transactionData.type === 'credit') {
                newBalance = account.balance + txAmount;
                ledgerType = 'Income';
                ledgerCategory = 'Member Deposit';
            } else {
                if (account.balance < txAmount) {
                    alert("Transaction Failed: Not enough balance!");
                    return;
                }
                newBalance = account.balance - txAmount;
                ledgerType = 'Expense';
                ledgerCategory = 'Member Withdrawal';
            }
        }

        if (transactionData.description?.toLowerCase().includes('fine') || transactionData.description?.toLowerCase().includes('fee')) {
            ledgerType = 'Income';
            ledgerCategory = 'Fees & Fines';
        }

        const newTransaction: Transaction = {
            id: transactionData.id || `TX-${Date.now()}`,
            date: transactionData.date || new Date().toISOString().split('T')[0],
            amount: txAmount,
            type: transactionData.type!,
            description: transactionData.description!,
            dueDate: transactionData.dueDate,
            paymentMethod: transactionData.paymentMethod
        };

        const updatedAccount: Account = {
            ...account,
            balance: newBalance,
            transactions: [newTransaction, ...account.transactions]
        };

        const newLedgerEntry: LedgerEntry = {
            id: `LDG-AUTO-${Date.now()}`,
            date: transactionData.date || new Date().toISOString().split('T')[0],
            description: `Auto: ${transactionData.description} (${account.accountNumber})`,
            amount: txAmount,
            type: ledgerType,
            category: ledgerCategory
        };

        // Update state
        setAccounts(prevAccounts => prevAccounts.map(acc =>
            acc.id === accountId ? updatedAccount : acc
        ));
        setLedger(prev => [newLedgerEntry, ...prev]);

        // Persist
        try {
            await upsertTransaction(newTransaction, accountId);
            await upsertAccount(updatedAccount);
            await upsertLedgerEntry(newLedgerEntry);
        } catch (e) {
            console.error("Failed to persist transaction", e);
        }
    };

    const handleAddLedgerEntry = async (entry: LedgerEntry) => {
        setLedger([entry, ...ledger]);
        await upsertLedgerEntry(entry);
    };

    const handleUpdateMember = async (updatedMember: Member) => {
        const originalMembers = [...members];
        const originalSelected = selectedMember;

        try {
            // Optimistic update
            setMembers(prevMembers => prevMembers.map(m => m.id === updatedMember.id ? updatedMember : m));
            setSelectedMember(updatedMember);

            await upsertMember(updatedMember);

            if (updatedMember.status === 'Suspended') {
                const accountsToSuspend: Account[] = [];
                setAccounts(prevAccounts => prevAccounts.map(a => {
                    if (a.memberId === updatedMember.id && a.status === AccountStatus.ACTIVE) {
                        const updated = { ...a, status: AccountStatus.DORMANT as AccountStatus };
                        accountsToSuspend.push(updated);
                        return updated;
                    }
                    return a;
                }));
                for (const acc of accountsToSuspend) {
                    await upsertAccount(acc);
                }
            }
        } catch (e) {
            console.error("Failed to update member", e);
            // Revert on failure
            setMembers(originalMembers);
            setSelectedMember(originalSelected);
            alert("Failed to save member changes. Please check your connection and try again.");
            throw e;
        }
    };

    const handleUpdateAccount = async (updatedAccount: Account) => {
        setAccounts(prevAccounts => prevAccounts.map(a => a.id === updatedAccount.id ? updatedAccount : a));
        await upsertAccount(updatedAccount);
    };

    const handleAddBranch = async (branch: Branch) => {
        setBranches([...branches, branch]);
        await upsertBranch(branch);
    };

    const handleAddAgent = async (agent: Agent) => {
        setAgents(prev => {
            const exists = prev.find(a => a.id === agent.id);
            if (exists) return prev.map(a => a.id === agent.id ? agent : a);
            return [...prev, agent];
        });
        await upsertAgent(agent);
    };

    if (!isLoaded) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 animate-pulse flex-col gap-2"><RefreshCw className="animate-spin" size={32} /> Loading System Data...</div>;

    if (!isAuthenticated) return <LoginPage onLogin={handleLogin} />;

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {currentPage !== 'passbook-print' && (
                <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <Sidebar
                        activePage={currentPage === 'member-detail' || currentPage === 'new-member' ? 'members' : currentPage}
                        userRole={userRole}
                        onNavigate={handleNavigate}
                        onSwitchRole={setUserRole}
                        onLogout={handleLogout}
                        onRefresh={handleRefresh}
                        isRefreshing={isRefreshing}
                    />
                </div>
            )}

            {currentPage !== 'passbook-print' && <div className="hidden md:block w-64 flex-shrink-0" />}

            <main className={`flex-1 overflow-y-auto h-screen flex flex-col ${currentPage === 'passbook-print' ? 'p-0' : 'p-4 md:p-8'}`}>
                {currentPage !== 'passbook-print' && (
                    <div className="md:hidden flex items-center mb-4">
                        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-slate-600">
                            <Menu size={24} />
                        </button>
                        <span className="font-bold text-lg ml-2">Co-op Core</span>
                    </div>
                )}

                {/* Global Notification Bar - Hide on full page apps like passbook */}
                {currentPage !== 'passbook-print' && (
                    <TopBar
                        userRole={userRole}
                        notifications={allNotifications}
                        onMarkRead={handleMarkRead}
                    />
                )}

                {currentPage === 'dashboard' && (
                    <Dashboard
                        members={members}
                        accounts={accounts}
                        interactions={interactions}
                        systemNotifications={[]} // Notifications now handled globally
                    />
                )}

                {currentPage === 'members' && (
                    <Members
                        members={members}
                        agents={agents}
                        interactions={interactions}
                        userRole={userRole}
                        onSelectMember={handleSelectMember}
                        onAddNew={() => setCurrentPage('new-member')}
                    />
                )}

                {currentPage === 'new-member' && (
                    <NewMember
                        onCancel={() => setCurrentPage('members')}
                        onComplete={handleAddMember}
                        settings={settings}
                        nextId={nextMemberId}
                        agents={agents}
                    />
                )}

                {currentPage === 'member-detail' && selectedMember && (
                    <MemberDetail
                        member={selectedMember}
                        userRole={userRole}
                        appSettings={settings}
                        allMembers={members}
                        accounts={memberAccounts}
                        interactions={memberInteractions}
                        agents={agents}
                        ledger={ledger}
                        onBack={() => handleNavigate('members')}
                        onAddInteraction={handleAddInteraction}
                        onAddTransaction={handleAddTransaction}
                        onAddAccount={handleAddAccount}
                        onUpdateMember={handleUpdateMember}
                        onUpdateAccount={handleUpdateAccount}
                        onAddLedgerEntry={handleAddLedgerEntry}
                        onOpenPassbook={() => setCurrentPage('passbook-print')}
                    />
                )}

                {currentPage === 'passbook-print' && selectedMember && (
                    <PassbookPage
                        member={selectedMember}
                        accounts={memberAccounts}
                        onBack={() => setCurrentPage('member-detail')}
                        onUpdateMember={handleUpdateMember}
                    />
                )}

                {currentPage === 'accounts' && (
                    <AllAccounts accounts={accounts} members={members} />
                )}

                {currentPage === 'accounting' && (
                    <Accounting ledger={ledger} onAddEntry={handleAddLedgerEntry} />
                )}

                {currentPage === 'reports' && (
                    <Reports accounts={accounts} members={members} ledger={ledger} />
                )}

                {currentPage === 'network' && (
                    <Network
                        branches={branches}
                        agents={agents}
                        members={members}
                        accounts={accounts}
                        settings={settings}
                        onAddBranch={handleAddBranch}
                        onAddAgent={handleAddAgent}
                    />
                )}

                {currentPage === 'settings' && (
                    <SettingsPage
                        settings={settings}
                        onUpdateSettings={handleUpdateSettings}
                        members={members}
                        accounts={accounts}
                        onImportSuccess={handleRefresh}
                    />
                )}
            </main>
        </div>
    );
};

export default App;