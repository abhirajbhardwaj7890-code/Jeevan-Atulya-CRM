
export enum AccountType {
  OPTIONAL_DEPOSIT = 'Optional Deposit',
  SHARE_CAPITAL = 'Share Capital',
  LOAN = 'Loan',
  FIXED_DEPOSIT = 'Fixed Deposit',
  RECURRING_DEPOSIT = 'Recurring Deposit',
  COMPULSORY_DEPOSIT = 'Compulsory Deposit'
}

export enum LoanType {
  HOME = 'Home Loan',
  PERSONAL = 'Personal Loan',
  GOLD = 'Gold Loan',
  AGRICULTURE = 'Agriculture Loan',
  VEHICLE = 'Vehicle Loan',
  EMERGENCY = 'Emergency Loan'
}

export enum AccountStatus {
  ACTIVE = 'Active',
  DORMANT = 'Dormant',
  CLOSED = 'Closed',
  DEFAULTED = 'Defaulted'
}

export type UserRole = 'Admin' | 'Staff';

export interface AppSettings {
  latePaymentFine: number;
  gracePeriodDays: number;
  defaultAgentFee: number; // Changed: Flat fee per member
  // Interest Rates Configuration
  interestRates: {
    optionalDeposit: number;
    fixedDeposit: number;
    recurringDeposit: number;
    compulsoryDeposit: number;
    loan: {
      home: number;
      personal: number;
      gold: number;
      agriculture: number;
      vehicle: number;
      emergency: number;
    }
  }
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  managerName: string;
}

export interface Agent {
  id: string;
  memberId?: string; // Linked Member ID
  name: string;
  branchId: string;
  phone: string;
  commissionFee?: number; // Changed: Specific fee for this agent
  activeMembers: number; // Derived for demo
  totalCollections: number; // Derived for demo
  status: 'Active' | 'Inactive';
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  date: string;
  read: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  dueDate?: string; // Optional due date for the payment/transaction
  amount: number;
  type: 'credit' | 'debit';
  category?: string; // e.g., Deposit, Withdrawal, Fee
  description: string;
  paymentMethod?: 'Cash' | 'Online' | 'Both';
  cashAmount?: number; // Added
  onlineAmount?: number; // Added
  utrNumber?: string; // Unique Transaction Reference
}

export interface Guarantor {
  memberId?: string; // Optional link to actual member
  name: string;
  phone: string;
  relation: string;
}

export interface Nominee {
  name: string;
  relation: string;
  dateOfBirth?: string; // Changed from age
  phone?: string;
  address?: string; // Added
}

export interface Account {
  id: string;
  memberId: string;
  type: AccountType;
  loanType?: LoanType; // Optional, only for loans
  accountNumber: string;
  balance: number;
  originalAmount?: number; // Initial Principal or Deposit
  initialAmount?: number; // Captured at creation (Immutable)
  emi?: number; // For Loans
  odLimit?: number; // For Overdraft (Deprecated, kept for type safety if needed temporarily, but logic removed)
  rdFrequency?: 'Monthly' | 'Daily'; // For RD
  currency: string;
  status: AccountStatus;
  interestRate?: number;
  initialInterestRate?: number; // Captured at creation (Immutable)
  maturityDate?: string; // For FD, RD or Loans
  maturityProcessed?: boolean; // Flag to check if maturity auto-transfer is done
  termMonths?: number; // For FD/RD duration
  transactions: Transaction[];
  guarantors?: Guarantor[];
  lowBalanceAlertThreshold?: number; // New field for alerts
}

export interface Interaction {
  id: string;
  memberId: string;
  date: string;
  staffName: string;
  type: 'Call' | 'Email' | 'In-Person' | 'System';
  notes: string;
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
}

export interface MemberDocument {
  id: string;
  name: string;
  type: string; // 'pdf' | 'image' | 'doc'
  category?: 'KYC' | 'Loan Application' | 'Income Proof' | 'Address Proof' | 'Other';
  description?: string;
  uploadDate: string;
  url?: string;
}

export interface Member {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  fatherName?: string; 
  permanentAddress?: string; // Renamed from address
  currentAddress?: string;   // Added
  city?: string; // Added
  pinCode?: string; // Added
  residenceType?: 'Owned' | 'Rented'; // Added
  joinDate: string;
  dateOfBirth?: string; // Added
  status: 'Active' | 'Suspended' | 'Pending';
  avatarUrl: string;
  riskScore?: number; // 0-100
  riskReason?: string;
  documents?: MemberDocument[];
  branchId?: string; // Linked to Branch
  agentId?: string; // Linked to Agent (This is the ID of the Agent entity)
  lastPrintedTransactionId?: string; // Track last printed passbook entry
  nominee?: Nominee;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  category: string;
  cashAmount?: number; // Added
  onlineAmount?: number; // Added
  utrNumber?: string; // Added
}

export interface DashboardStats {
  totalMembers: number;
  totalAssets: number;
  activeLoans: number;
  loanPortfolioValue: number;
}
