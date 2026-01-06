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
import { Groups } from './pages/Groups';
import { MessagingService } from './services/messaging';
import { parseSafeDate, formatDate } from './services/utils';
import {
    loadData,
    upsertMember,
    upsertAccount,
    upsertInteraction,
    upsertLedgerEntry,
    upsertTransaction,
    upsertBranch,
    saveSettings,
    createAccount,
    DEFAULT_SETTINGS,
    upsertGroup,
    deleteGroup,
    pingSupabase,
    saveLocalBackup
} from './services/data';
import { Member, Interaction, Account, UserRole, Transaction, AccountType, AppSettings, LedgerEntry, AccountStatus, Branch, Notification, MemberGroup } from './types';
import { Menu, RefreshCw, AlertCircle, WifiOff, Database } from 'lucide-react';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [userRole, setUserRole] = useState<UserRole>('Admin');

    // Application State
    const [isLoaded, setIsLoaded] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

    // Notification State
    const [actionNotifications, setActionNotifications] = useState<Notification[]>([]);
    const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());

    // Network State
    const [branches, setBranches] = useState<Branch[]>([]);
    const [groups, setGroups] = useState<MemberGroup[]>([]);

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

    const triggerSMS = async (type: 'newMember' | 'newAccount' | 'deposit' | 'withdrawal' | 'maturity', phone: string, data: any) => {
        if (!settings.messaging?.enabled || !phone) return;
        const template = (settings.messaging.templates as any)?.[type];
        if (!template) return;

        // Calculate specific account type balances for the member
        const memberId = data.memberId;
        const extraBalances: any = {
            cdBalance: '0',
            smBalance: '0',
            odBalance: '0',
            fdBalance: '0',
            rdBalance: '0',
            loanBalance: '0'
        };

        if (memberId) {
            let memberAccounts = accounts.filter(a => a.memberId === memberId);

            // If this is a new account, it won't be in the 'accounts' state yet
            if (type === 'newAccount' && data.accountNo && !memberAccounts.some(a => a.accountNumber === data.accountNo)) {
                memberAccounts.push({
                    accountNumber: data.accountNo,
                    type: data.accountType,
                    balance: Number(data.balance)
                } as any);
            }

            const totals: any = {};
            memberAccounts.forEach(acc => {
                // Use the fresh balance from 'data' if this is the account being transacted
                const currentBalance = (data.accountNo && acc.accountNumber === data.accountNo)
                    ? Number(data.balance)
                    : (acc.balance || 0);

                let tag = '';
                if (acc.type === AccountType.COMPULSORY_DEPOSIT) tag = 'cdBalance';
                else if (acc.type === AccountType.SHARE_CAPITAL) tag = 'smBalance';
                else if (acc.type === AccountType.OPTIONAL_DEPOSIT) tag = 'odBalance';
                else if (acc.type === AccountType.FIXED_DEPOSIT) tag = 'fdBalance';
                else if (acc.type === AccountType.RECURRING_DEPOSIT) tag = 'rdBalance';
                else if (acc.type === AccountType.LOAN) tag = 'loanBalance';

                if (tag) {
                    totals[tag] = (totals[tag] || 0) + currentBalance;
                }
            });

            Object.keys(totals).forEach(tag => {
                extraBalances[tag] = String(totals[tag]);
            });
        }

        const message = MessagingService.replacePlaceholders(template, {
            ...data,
            ...extraBalances,
            date: data.date || new Date().toLocaleDateString('en-IN'),
            balance: data.balance !== undefined ? String(data.balance) : '',
            amount: data.amount !== undefined ? String(data.amount) : '',
            accountNo: data.accountNo || '',
            accountType: data.accountType || '',
            memberName: data.memberName || '',
            memberId: data.memberId || ''
        });

        console.log(`[SMS] Sending ${type} to ${phone}: ${message}`);
        await MessagingService.sendMessage(settings, phone, message);
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

                            // SMS Trigger: Maturity
                            triggerSMS('maturity', member.phone, {
                                memberName: member.fullName,
                                accountNo: acc.accountNumber,
                                amount: transferAmount,
                                balance: updatedAccounts[odAccountIndex].balance
                            });

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
                setGroups(data.groups);
                runScheduledTasks(data.accounts, data.members);
                setDbError(null);
                saveLocalBackup(data);
            } catch (e: any) {
                console.error("Initialization failed", e);
                setDbError(e.message || "UNKNOWN_ERROR");
            } finally {
                setIsLoaded(true);
            }
        };
        initData();

        // Listen for browser offline events
        const handleOffline = () => setDbError("CONNECTION_LOST");
        window.addEventListener('offline', handleOffline);

        // Background connectivity ping every 30 seconds
        const interval = setInterval(async () => {
            const isAlive = await pingSupabase();
            if (!isAlive && isAuthenticated) {
                setDbError("CONNECTION_LOST");
            }
        }, 30000);

        return () => {
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [isAuthenticated]);

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
            setGroups(data.groups);
            runScheduledTasks(data.accounts, data.members);
            setDbError(null);
            saveLocalBackup(data);
        } catch (e: any) {
            console.error("Refresh failed", e);
            setDbError(e.message || "FETCH_ERROR");
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
        try {
            await saveSettings(newSettings);
            setSettings(newSettings);
        } catch (e) {
            console.error("Settings save failed", e);
            setDbError("CONNECTION_LOST");
            alert("Connection Lost. Settings could not be saved.");
        }
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
        try {
            await upsertInteraction(newInteraction);
            setInteractions([newInteraction, ...interactions]);
        } catch (e) {
            console.error("Interaction save failed", e);
            setDbError("CONNECTION_LOST");
        }
    };

    const handleAddMember = async (newMember: Member, newAccounts: Account[], totalCollected: number, shouldNavigate: boolean = true): Promise<boolean> => {
        try {
            // Find Registration Receipt Document upload date or use joinDate
            const regDate = newMember.joinDate;

            await upsertMember(newMember);
            for (const acc of newAccounts) {
                await upsertAccount(acc);
                for (const tx of acc.transactions) {
                    await upsertTransaction(tx, acc.id);
                }
            }

            if (totalCollected > 0) {
                // Registration Logic: 
                // SM (400) + CD (200) = 600 (Deposits)
                // Entry (100) + Building (450) + Welfare (400) = 950 (Admission Fees)
                // For 700 Plan: Entry (100) = 100 (Admission Fees)

                // We assume 600 is ALWAYS the deposit portion for ANY plan that has it
                const depositInflow = 600;
                const admissionIncome = totalCollected - depositInflow;

                // 1. Admission Fees (Income)
                if (admissionIncome > 0) {
                    const incomeEntry: LedgerEntry = {
                        id: `LDG-REG-INC-${Date.now()}`,
                        memberId: newMember.id,
                        date: parseSafeDate(regDate),
                        description: `Registration Fee - ${newMember.fullName}`,
                        amount: admissionIncome,
                        type: 'Income',
                        category: 'Admission Fees'
                    };
                    await upsertLedgerEntry(incomeEntry);
                    setLedger(prev => [incomeEntry, ...prev]);
                }

                // 2. Deposits Flow (CD/SM)
                if (depositInflow > 0) {
                    const depositEntry: LedgerEntry = {
                        id: `LDG-REG-DEP-${Date.now() + 1}`,
                        memberId: newMember.id,
                        date: parseSafeDate(regDate),
                        description: `Initial Deposit (SM/CD) - ${newMember.fullName}`,
                        amount: depositInflow,
                        type: 'Income', // Recorded as Inflow
                        category: 'Admission Fees & Deposits'
                    };
                    await upsertLedgerEntry(depositEntry);
                    setLedger(prev => [depositEntry, ...prev]);
                }
            }

            // Success: Update main state
            setMembers(prev => [newMember, ...prev]);
            setAccounts(prev => [...newAccounts, ...prev]);


            if (shouldNavigate) setCurrentPage('members');

            // SMS Trigger: New Member
            triggerSMS('newMember', newMember.phone, {
                memberName: newMember.fullName,
                memberId: newMember.id,
                date: newMember.joinDate
            });

            return true;
        } catch (e: any) {
            console.error("Save failed", e);
            setDbError("CONNECTION_LOST");
            alert("Connection Lost. Member could not be created.");
            throw e;
        }
    };

    const handleAddAccount = async (memberId: string, accountData: Partial<Account>) => {
        if (!accountData.type) return;

        // Extract opening date (normalize to ISO)
        const openingDate = parseSafeDate(accountData.openingDate);

        const currentCount = accounts.filter(a => a.memberId === memberId).length;
        const newAccount = createAccount(memberId, accountData.type, accountData.balance || 0, accountData.loanType, {
            odLimit: accountData.odLimit,
            rdFrequency: accountData.rdFrequency,
            guarantors: accountData.guarantors,
            termMonths: accountData.termMonths,
            tenureDays: accountData.tenureDays,
            interestRate: accountData.interestRate,
            date: openingDate, // Pass opening date to createAccount
            paymentMethod: accountData.paymentMethod,
            utrNumber: accountData.utrNumber,
            cashAmount: accountData.cashAmount,
            onlineAmount: accountData.onlineAmount
        }, currentCount + 1, settings);

        if (accountData.maturityDate) newAccount.maturityDate = accountData.maturityDate;
        if (accountData.currency) newAccount.currency = accountData.currency;

        // Loan Approval Workflow: Non-Admin users create loans in Pending status
        if (accountData.type === AccountType.LOAN && userRole !== 'Admin') {
            newAccount.status = AccountStatus.PENDING;
        } else if (accountData.status) {
            newAccount.status = accountData.status;
        }

        try {
            await upsertAccount(newAccount);
            if (newAccount.transactions.length > 0) {
                await upsertTransaction(newAccount.transactions[0], newAccount.id);
            }

            if ((accountData.balance || 0) > 0) {
                const isLoan = accountData.type === AccountType.LOAN;
                const ledgerEntry: LedgerEntry = {
                    id: `LDG-ACC-${Date.now()}`,
                    memberId: memberId,
                    date: openingDate, // Use opening date for ledger entry
                    description: isLoan
                        ? `Loan Disbursement - ${newAccount.accountNumber}${accountData.paymentMethod ? ` via ${accountData.paymentMethod}` : ''}`
                        : `New ${accountData.type} Opening - ${newAccount.accountNumber}${accountData.paymentMethod ? ` via ${accountData.paymentMethod}` : ''}`,
                    amount: accountData.balance || 0,
                    type: isLoan ? 'Expense' : 'Income',
                    category: isLoan ? 'Loan Disbursement' : 'Member Deposits',
                    cashAmount: accountData.paymentMethod === 'Both' ? (accountData.cashAmount || 0) : (accountData.paymentMethod === 'Cash' ? (accountData.balance || 0) : 0),
                    onlineAmount: accountData.paymentMethod === 'Both' ? (accountData.onlineAmount || 0) : (accountData.paymentMethod === 'Online' ? (accountData.balance || 0) : 0),
                    utrNumber: accountData.utrNumber
                };
                await upsertLedgerEntry(ledgerEntry);
                setLedger(prev => [ledgerEntry, ...prev]);
            }

            // Success: Update state
            setAccounts(prev => [newAccount, ...prev]);

            // SMS Trigger: New Account
            const member = members.find(m => m.id === memberId);
            if (member) {
                triggerSMS('newAccount', member.phone, {
                    memberName: member.fullName,
                    memberId: member.id,
                    accountNo: newAccount.accountNumber,
                    accountType: newAccount.type,
                    amount: newAccount.balance,
                    balance: newAccount.balance
                });
            }
        } catch (e: any) {
            console.error("Account save failed", e);
            setDbError("CONNECTION_LOST");
            alert("Connection Lost. Account could not be opened.");
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
            memberId: account.memberId,
            date: transactionData.date || new Date().toISOString().split('T')[0],
            description: `Auto: ${transactionData.description} (${account.accountNumber})`,
            amount: txAmount,
            type: ledgerType,
            category: ledgerCategory,
            cashAmount: transactionData.paymentMethod === 'Cash' ? txAmount : (transactionData.paymentMethod === 'Both' ? (transactionData as any).cashAmount : 0),
            onlineAmount: transactionData.paymentMethod === 'Online' ? txAmount : (transactionData.paymentMethod === 'Both' ? (transactionData as any).onlineAmount : 0),
            utrNumber: transactionData.utrNumber
        };

        // Persist
        try {
            const txToSave = { ...newTransaction, date: parseSafeDate(newTransaction.date) };
            await upsertTransaction(txToSave, accountId);
            const accToSave = { ...updatedAccount, openingDate: parseSafeDate(updatedAccount.openingDate) };
            await upsertAccount(accToSave);
            const ledgerToSave = { ...newLedgerEntry, date: parseSafeDate(newLedgerEntry.date) };
            await upsertLedgerEntry(ledgerToSave);

            // Update state ONLY after successful persistence
            setAccounts(prevAccounts => prevAccounts.map(acc =>
                acc.id === accountId ? updatedAccount : acc
            ));
            setLedger(prev => [newLedgerEntry, ...prev]);

            // SMS Trigger: Deposit/Withdrawal
            const member = members.find(m => m.id === account.memberId);
            if (member) {
                triggerSMS(newTransaction.type === 'credit' ? 'deposit' : 'withdrawal', member.phone, {
                    memberName: member.fullName,
                    memberId: member.id,
                    accountNo: account.accountNumber,
                    accountType: account.type,
                    amount: newTransaction.amount,
                    balance: newBalance,
                    date: newTransaction.date
                });
            }
        } catch (e: any) {
            console.error("Failed to persist transaction", e);
            setDbError("CONNECTION_LOST");
            alert("Connection Lost. Transaction could not be saved. Please refresh and try again.");
        }
    };

    const handleAddLedgerEntry = async (entry: LedgerEntry) => {
        try {
            await upsertLedgerEntry(entry);
            setLedger([entry, ...ledger]);
        } catch (e) {
            console.error("Ledger save failed", e);
            setDbError("CONNECTION_LOST");
        }
    };

    const handleUpdateMember = async (updatedMember: Member) => {
        const originalMembers = [...members];
        const originalSelected = selectedMember;

        try {
            await upsertMember(updatedMember);

            // Success: Update state
            setMembers(prevMembers => prevMembers.map(m => m.id === updatedMember.id ? updatedMember : m));
            setSelectedMember(updatedMember);

            if (updatedMember.status === 'Suspended' || updatedMember.status === 'Pending') {
                const accountsToSuspend: Account[] = [];
                const suspensionResults = accounts.map(a => {
                    if (a.memberId === updatedMember.id && a.status === AccountStatus.ACTIVE) {
                        const updated = { ...a, status: AccountStatus.DORMANT as AccountStatus };
                        accountsToSuspend.push(updated);
                        return updated;
                    }
                    return a;
                });

                for (const acc of accountsToSuspend) {
                    await upsertAccount(acc);
                }
                setAccounts(suspensionResults);
            }
        } catch (e: any) {
            console.error("Failed to update member", e);
            setDbError("CONNECTION_LOST");
            alert("Connection Lost. Member changes could not be saved.");
            throw e;
        }
    };

    const handleUpdateAccount = async (updatedAccount: Account) => {
        const previousAccount = accounts.find(a => a.id === updatedAccount.id);
        setAccounts(prevAccounts => prevAccounts.map(a => a.id === updatedAccount.id ? updatedAccount : a));
        await upsertAccount(updatedAccount);

    };



    const handleAddBranch = async (branch: Branch) => {
        setBranches([...branches, branch]);
        await upsertBranch(branch);
    };



    const handleAddGroup = async (group: MemberGroup) => {
        setGroups(prev => [...prev, group]);
        await upsertGroup(group);
    };

    const handleUpdateGroup = async (updatedGroup: MemberGroup) => {
        setGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
        await upsertGroup(updatedGroup);
    };

    const handleDeleteGroup = async (groupId: string) => {
        setGroups(prev => prev.filter(g => g.id !== groupId));
        await deleteGroup(groupId);
    };

    if (!isLoaded) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 animate-pulse flex-col gap-2"><RefreshCw className="animate-spin" size={32} /> Loading System Data...</div>;

    if (dbError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
                <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700 text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        {dbError === 'DB_CONFIG_MISSING' ? <Database size={40} /> : <WifiOff size={40} />}
                    </div>
                    <h1 className="text-2xl font-bold mb-2">
                        {dbError === 'DB_CONFIG_MISSING' ? 'Database Not Configured' : 'Connection Lost'}
                    </h1>
                    <p className="text-slate-400 mb-8 leading-relaxed">
                        {dbError === 'DB_CONFIG_MISSING'
                            ? 'The application is not connected to any database. Please configure your Supabase environment variables to continue.'
                            : 'Unable to reach the database. Please check your internet connection and try again.'}
                    </p>

                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={20} />
                        {isRefreshing ? 'Checking Connection...' : 'Try Again'}
                    </button>

                    {dbError === 'DB_CONFIG_MISSING' && (
                        <p className="mt-6 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                            Missing: SUPABASE_URL & ANON_KEY
                        </p>
                    )}
                </div>
            </div>
        );
    }

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
                        branches={branches}
                    />
                )}

                {currentPage === 'members' && (
                    <Members
                        members={members}
                        accounts={accounts} // Pass accounts prop
                        interactions={interactions}
                        userRole={userRole}
                        onSelectMember={handleSelectMember}
                        onAddNew={() => setCurrentPage('new-member')}
                        branches={branches}
                    />
                )}

                {currentPage === 'new-member' && (
                    <NewMember
                        onCancel={() => setCurrentPage('members')}
                        onComplete={handleAddMember}
                        settings={settings}
                        nextId={nextMemberId}
                        members={members}
                    />
                )}

                {currentPage === 'member-detail' && selectedMember && (
                    <MemberDetail
                        member={selectedMember}
                        userRole={userRole}
                        appSettings={settings}
                        allMembers={members}
                        accounts={memberAccounts}
                        allAccounts={accounts}
                        interactions={memberInteractions}
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
                    <Accounting ledger={ledger} members={members} onAddEntry={handleAddLedgerEntry} />
                )}

                {currentPage === 'reports' && (
                    <Reports accounts={accounts} members={members} ledger={ledger} />
                )}

                {currentPage === 'network' && (
                    <Network
                        branches={branches}
                        members={members}
                        accounts={accounts}
                        settings={settings}
                        onAddBranch={handleAddBranch}
                        onUpdateMember={handleUpdateMember}
                    />
                )}

                {currentPage === 'settings' && (
                    <SettingsPage
                        settings={settings}
                        onUpdateSettings={handleUpdateSettings}
                        members={members}
                        accounts={accounts}
                        ledger={ledger}
                        onImportSuccess={handleRefresh}
                    />
                )}

                {currentPage === 'groups' && (
                    <Groups
                        groups={groups}
                        members={members}
                        onAddGroup={handleAddGroup}
                        onUpdateGroup={handleUpdateGroup}
                        onDeleteGroup={handleDeleteGroup}
                    />
                )}
            </main>
        </div>
    );
};

export default App;