import React, { useState } from 'react';
import { ArrowLeft, User, Phone, Wallet, CheckCircle, Printer, X, Save, Users, Loader, AlertCircle, Search } from 'lucide-react';
import { Member, AccountType, MemberDocument, AccountStatus, AppSettings, Agent } from '../types';
import { createAccount } from '../services/data';

interface NewMemberProps {
    onCancel: () => void;
    // onComplete returns a promise to await DB confirmation
    onComplete: (member: Member, initialAccounts: any[], totalCollected: number, shouldNavigate?: boolean) => Promise<boolean>;
    settings?: AppSettings;
    nextId: string;
    agents?: Agent[];
}

const RELATION_OPTIONS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Nephew', 'Niece', 'Grandfather', 'Grandmother'];

export const NewMember: React.FC<NewMemberProps> = ({ onCancel, onComplete, settings, nextId, agents = [] }) => {
    const [step, setStep] = useState(1);
    const [showReceipt, setShowReceipt] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [createdMemberData, setCreatedMemberData] = useState<{ member: Member, accounts: any[] } | null>(null);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        fatherName: '',
        email: '',
        phone: '',
        permanentAddress: '',
        currentAddress: '',
        city: '',
        pinCode: '',
        agentId: '', // Stores the actual agent ID (e.g. AG-123)
        agentInput: '', // Stores what user types
        residenceType: 'Owned' as 'Owned' | 'Rented',
        status: 'Active' as 'Active' | 'Suspended' | 'Pending',
        dateOfBirth: '',
        // Nominee Details
        nomineeName: '',
        nomineeRelation: '',
        nomineeDob: '', // Changed from Age
        nomineePhone: '',
        nomineeAddress: '', // Added
        // Fixed Fee Structure
        buildingFund: 450,
        shareMoney: 400,
        compulsoryDeposit: 200,
        welfareFund: 400,
        entryCharge: 100,
        // Payment
        paymentMethod: 'Cash' as 'Cash' | 'Online' | 'Both',
        utrNumber: '' // Added for online payments
    });

    const [resolvedAgentName, setResolvedAgentName] = useState<string | null>(null);
    const [paymentSplit, setPaymentSplit] = useState({ cash: '', online: '' });
    const [sameAsPermanent, setSameAsPermanent] = useState(false);

    const handleSameAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSameAsPermanent(e.target.checked);
        if (e.target.checked) {
            setFormData(prev => ({ ...prev, currentAddress: prev.permanentAddress }));
        }
    };

    const handleAgentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setFormData(prev => ({ ...prev, agentInput: val, agentId: '' })); // Reset ID when typing
        setResolvedAgentName(null);

        if (!val) return;

        // Try to find matching agent by ID or Member ID
        const match = agents.find(a =>
            a.id.toLowerCase() === val.toLowerCase() ||
            (a.memberId && a.memberId === val)
        );

        if (match) {
            setResolvedAgentName(match.name);
            setFormData(prev => ({ ...prev, agentInput: val, agentId: match.id }));
        }
    };

    const totalAmount = (Number(formData.buildingFund) || 0) + (Number(formData.shareMoney) || 0) + (Number(formData.compulsoryDeposit) || 0) + (Number(formData.welfareFund) || 0) + (Number(formData.entryCharge) || 0);

    const handleNext = () => setStep(step + 1);
    const handleBack = () => setStep(step - 1);

    const handleSubmit = async () => {
        if (isSaving) return; // Prevent double clicks

        // Validate Split Payment if Both
        if (formData.status !== 'Pending' && formData.paymentMethod === 'Both') {
            const cash = parseFloat(paymentSplit.cash) || 0;
            const online = parseFloat(paymentSplit.online) || 0;
            if (Math.abs((cash + online) - totalAmount) > 1) { // 1 rupee tolerance
                alert(`Split payment amounts must sum to Total Payable (₹${totalAmount}). Current sum: ₹${cash + online}`);
                return;
            }
        }

        if (formData.status !== 'Pending' && (formData.paymentMethod === 'Online' || formData.paymentMethod === 'Both') && !formData.utrNumber) {
            alert("Please enter UTR / Reference Number for online payment.");
            return;
        }

        // Agent Validation: If input provided but not resolved
        if (formData.agentInput && !formData.agentId) {
            const confirm = window.confirm("Agent ID entered but not found in system. Continue without assigning an agent?");
            if (!confirm) return;
        }

        setIsSaving(true);
        setErrorMessage(null);

        // Construct Member
        const newMember: Member = {
            id: nextId,
            fullName: `${formData.firstName} ${formData.lastName}`,
            fatherName: formData.fatherName,
            email: formData.email,
            phone: formData.phone,
            permanentAddress: formData.permanentAddress,
            currentAddress: formData.currentAddress,
            city: formData.city,
            pinCode: formData.pinCode,
            residenceType: formData.residenceType,
            joinDate: new Date().toISOString().split('T')[0],
            dateOfBirth: formData.dateOfBirth,
            status: formData.status,
            avatarUrl: `https://ui-avatars.com/api/?name=${formData.firstName}+${formData.lastName}&background=random`,
            riskScore: 0,
            documents: [],
            agentId: formData.agentId || undefined,
            // Add Nominee
            nominee: formData.nomineeName ? {
                name: formData.nomineeName,
                relation: formData.nomineeRelation,
                dateOfBirth: formData.nomineeDob,
                phone: formData.nomineePhone,
                address: formData.nomineeAddress
            } : undefined
        };

        const isPending = formData.status === 'Pending';
        let accounts: any[] = [];
        let finalTotal = 0;

        if (!isPending) {
            // Add Registration Receipt as a Document (Simulated) only if paying
            const regReceiptDoc: MemberDocument = {
                id: `DOC-REG-${newMember.id}`, // Deterministic ID to avoid duplicates
                name: 'Registration Receipt',
                type: 'Receipt',
                category: 'Other',
                description: 'Initial Membership Registration Receipt',
                uploadDate: new Date().toISOString().split('T')[0],
                url: '#'
            };
            newMember.documents = [regReceiptDoc];

            finalTotal = totalAmount;

            // Construct Initial Accounts
            const initialAccountStatus = AccountStatus.ACTIVE;

            const shareCap = createAccount(newMember.id, AccountType.SHARE_CAPITAL, parseFloat(formData.shareMoney as any) || 0, undefined, undefined, 1, settings);
            shareCap.id = `ACC-${newMember.id}-SHR-INIT`;
            if (shareCap.transactions.length > 0) {
                shareCap.transactions[0].id = `TX-${newMember.id}-SHR-INIT`;
                shareCap.transactions[0].paymentMethod = formData.paymentMethod;
                shareCap.transactions[0].utrNumber = formData.utrNumber;
            }
            shareCap.status = initialAccountStatus;

            const compDep = createAccount(newMember.id, AccountType.COMPULSORY_DEPOSIT, parseFloat(formData.compulsoryDeposit as any) || 0, undefined, undefined, 2, settings);
            compDep.id = `ACC-${newMember.id}-CD-INIT`;
            if (compDep.transactions.length > 0) {
                compDep.transactions[0].id = `TX-${newMember.id}-CD-INIT`;
                compDep.transactions[0].paymentMethod = formData.paymentMethod;
                compDep.transactions[0].utrNumber = formData.utrNumber;
            }
            compDep.status = initialAccountStatus;

            accounts = [shareCap, compDep];
        }

        try {
            // Attempt to save to DB immediately. Pass 'false' to NOT navigate away yet.
            await onComplete(newMember, accounts, finalTotal, false);

            // Only if successful:
            if (isPending) {
                onCancel(); // Navigate back immediately for pending members
            } else {
                setCreatedMemberData({ member: newMember, accounts });
                setShowReceipt(true);
            }
        } catch (error: any) {
            console.error("Registration failed", error);
            // Show a user-friendly error but keep data so they can retry
            const msg = error.message || "Failed to connect to server.";
            setErrorMessage(`Registration Failed: ${msg}. Please check your connection and click 'Register & Pay' again.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinalize = () => {
        // Data is already saved. Just navigate back to list.
        onCancel();
    };

    const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

        const convertLessThanOneThousand = (n: number): string => {
            if (n === 0) return '';
            if (n < 10) return ones[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
            return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanOneThousand(n % 100) : '');
        };

        if (num === 0) return 'Zero';

        let words = '';
        if (num >= 1000) {
            words += convertLessThanOneThousand(Math.floor(num / 1000)) + ' Thousand ';
            num %= 1000;
        }
        words += convertLessThanOneThousand(num);
        return words.trim();
    };

    const handlePrintReceipt = () => {
        const amountInWords = numberToWords(totalAmount);
        const dateStr = new Date().toLocaleDateString('en-GB');

        // Use Member ID if generated, else fallback
        const memberId = createdMemberData?.member.id || 'New Member';
        const numId = memberId.replace(/\D/g, ''); // Just numbers for M.No

        let paymentDetails = formData.paymentMethod;
        if (formData.paymentMethod === 'Both') {
            paymentDetails = `Cash (${paymentSplit.cash}) Online (${paymentSplit.online})`;
        }
        if (formData.utrNumber) {
            paymentDetails += ` UTR:${formData.utrNumber}`;
        }

        const items = [
            { label: 'Admission Fee', val: Number(formData.entryCharge) },
            { label: 'Building Fund', val: Number(formData.buildingFund) },
            { label: 'Member Welfare Fund', val: Number(formData.welfareFund) },
            { label: 'COMPULSARY DEPOSIT (1)', val: Number(formData.compulsoryDeposit) },
            { label: 'SHARE MONEY (1)', val: Number(formData.shareMoney) },
        ];

        // Compact Receipt Template matching the image provided
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
                    <div class="cell"><span class="lbl">Recd. from</span> : <b>${formData.firstName} ${formData.lastName}</b></div>
                    <div class="cell right"><span class="lbl">M.No.</span> <b>${numId}</b></div>
                </div>
                <div class="row">
                    <div class="cell"><span class="lbl">F/H Name</span> : ${formData.fatherName}</div>
                </div>
                <div class="row">
                    <div class="cell"><span class="lbl">Recd. Mode</span> : ${paymentDetails}</div>
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
                    SM:${formData.shareMoney} Cr CD:${formData.compulsoryDeposit} Cr
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
            @page { size: landscape; margin: 4mm; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10px; margin: 0; padding: 0; color: #000; line-height: 1.2; }
            .page-container { display: flex; flex-direction: row; width: 100%; justify-content: space-between; align-items: flex-start; }
            .receipt-copy { width: 49%; border-right: 1px dashed #ccc; padding-right: 2mm; }
            .receipt-copy:last-child { border-right: none; padding-right: 0; padding-left: 2mm; }
            
            .receipt-box { padding: 5px; display: flex; flex-direction: column; min-height: 120mm; position:relative; }
            
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
          <div class="page-container">
            <div class="receipt-copy">
                ${getReceiptHTML('MEMBER COPY')}
            </div>
            <div class="receipt-copy">
                ${getReceiptHTML('OFFICE COPY')}
            </div>
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

    if (showReceipt && createdMemberData) {
        return (
            <div className="animate-fade-in max-w-2xl mx-auto py-8">
                <div className="bg-white p-8 rounded-xl shadow-lg text-center border border-slate-200">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Registration Successful!</h2>
                    <p className="text-slate-500 mb-8">
                        Member <strong>{createdMemberData.member.fullName}</strong> has been onboarded with ID <strong>{createdMemberData.member.id}</strong>.
                    </p>

                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={handlePrintReceipt}
                            className="px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm"
                        >
                            <Printer size={20} /> Print Receipt
                        </button>
                        <button
                            onClick={handleFinalize}
                            className="px-6 py-3 bg-slate-900 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg"
                        >
                            <Save size={20} /> Finish
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <datalist id="newMemberRelationOptions">
                {RELATION_OPTIONS.map(opt => <option key={opt} value={opt} />)}
            </datalist>

            <div className="mb-6 flex items-center gap-4">
                <button onClick={onCancel} disabled={isSaving} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 disabled:opacity-50">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Member Onboarding</h1>
                    <p className="text-slate-500">Register a new member to Jeevan Atulya CO-OP Society.</p>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between mb-8 px-8">
                {[
                    { n: 1, label: 'Personal Info', icon: User },
                    { n: 2, label: 'Contact & Nominee', icon: Phone },
                    { n: 3, label: 'Fee Payment', icon: Wallet }
                ].map((s) => (
                    <div key={s.n} className={`flex flex-col items-center ${step === s.n ? 'text-blue-600' : step > s.n ? 'text-green-600' : 'text-slate-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 mb-2 ${step === s.n ? 'border-blue-600 bg-blue-50' :
                            step > s.n ? 'border-green-600 bg-green-50' : 'border-slate-300'
                            }`}>
                            {step > s.n ? <CheckCircle size={20} /> : <s.icon size={18} />}
                        </div>
                        <span className="text-xs font-bold">{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Form Steps */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 relative">
                {isSaving && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center rounded-xl">
                        <Loader className="animate-spin text-blue-600 mb-2" size={32} />
                        <p className="font-bold text-slate-900">Saving to Database...</p>
                        <p className="text-xs text-slate-500">Please do not close this window.</p>
                    </div>
                )}

                {errorMessage && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-bold">Submission Error</p>
                            <p>{errorMessage}</p>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4 animate-fade-in">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Personal Information</h3>
                        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-100 mb-4">
                            Assigned Member ID: <strong>{nextId}</strong>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.firstName}
                                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.lastName}
                                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                                <input
                                    type="date"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.dateOfBirth}
                                    onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Father/Husband Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.fatherName}
                                    onChange={e => setFormData({ ...formData, fatherName: e.target.value })}
                                    placeholder="Required for records"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                <input
                                    type="text"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.city}
                                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Pin Code</label>
                                <input
                                    type="text"
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.pinCode}
                                    onChange={e => setFormData({ ...formData, pinCode: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Agent (ID or Member ID)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className={`w-full bg-white text-slate-900 border rounded-lg pl-3 pr-8 py-2.5 focus:ring-2 focus:outline-none ${resolvedAgentName ? 'border-green-500 ring-green-100' : 'border-slate-300 focus:ring-blue-500'}`}
                                        value={formData.agentInput}
                                        onChange={handleAgentInputChange}
                                        placeholder="Search ID (e.g. AG-001 or 1001)"
                                    />
                                    {resolvedAgentName && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 pointer-events-none">
                                            <CheckCircle size={16} />
                                        </div>
                                    )}
                                </div>
                                {resolvedAgentName && <p className="text-xs text-green-600 mt-1 font-medium">Found: {resolvedAgentName}</p>}
                                {!resolvedAgentName && formData.agentInput && <p className="text-xs text-red-500 mt-1">Agent not found</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                <select
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                >
                                    <option value="Active">Active</option>
                                    <option value="Pending">Pending (Fee Later)</option>
                                    <option value="Suspended">Suspended</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Contact Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number</label>
                                    <input
                                        type="tel"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+91"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="optional"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Permanent Address</label>
                                <textarea
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    rows={2}
                                    value={formData.permanentAddress}
                                    onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })}
                                />
                            </div>
                            <div className="mt-4">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-slate-700">Current Residence Address</label>
                                    <label className="flex items-center gap-1.5 text-xs text-blue-600 cursor-pointer">
                                        <input type="checkbox" checked={sameAsPermanent} onChange={handleSameAddressChange} className="rounded" />
                                        Same as Permanent
                                    </label>
                                </div>
                                <textarea
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    rows={2}
                                    value={formData.currentAddress}
                                    onChange={e => setFormData({ ...formData, currentAddress: e.target.value })}
                                    disabled={sameAsPermanent}
                                />
                            </div>
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Residence Type</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer border p-2 rounded-lg flex-1 hover:bg-slate-50">
                                        <input type="radio" name="residenceType" value="Owned" checked={formData.residenceType === 'Owned'} onChange={() => setFormData({ ...formData, residenceType: 'Owned' })} />
                                        <span className="text-sm">Owned</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer border p-2 rounded-lg flex-1 hover:bg-slate-50">
                                        <input type="radio" name="residenceType" value="Rented" checked={formData.residenceType === 'Rented'} onChange={() => setFormData({ ...formData, residenceType: 'Rented' })} />
                                        <span className="text-sm">Rented</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Nominee Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nominee Name</label>
                                    <input
                                        type="text"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.nomineeName}
                                        onChange={e => setFormData({ ...formData, nomineeName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Relation</label>
                                    <input
                                        type="text"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        list="newMemberRelationOptions"
                                        value={formData.nomineeRelation}
                                        onChange={e => setFormData({ ...formData, nomineeRelation: e.target.value })}
                                        placeholder="Select or type..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.nomineeDob}
                                        onChange={e => setFormData({ ...formData, nomineeDob: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.nomineePhone}
                                        onChange={e => setFormData({ ...formData, nomineePhone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nominee Address</label>
                                <textarea
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    rows={2}
                                    value={formData.nomineeAddress}
                                    onChange={e => setFormData({ ...formData, nomineeAddress: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        {formData.status === 'Pending' ? (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Registration Pending</h3>
                                <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                                    You are registering a member with <strong>Pending</strong> status.
                                    Fee collection and account creation will be skipped for now.
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-200 inline-block text-left">
                                    <p><strong>Note:</strong></p>
                                    <ul className="list-disc pl-4 mt-1 space-y-1">
                                        <li>No Share Capital or CD accounts will be created.</li>
                                        <li>No Receipt will be generated.</li>
                                        <li>You can activate the member and collect fees later.</li>
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-slate-900 mb-4">Initial Fees & Deposits</h3>
                                <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                                    {[
                                        { key: 'entryCharge', label: 'Admission Fee' },
                                        { key: 'buildingFund', label: 'Building Fund' },
                                        { key: 'welfareFund', label: 'Member Welfare Fund' },
                                        { key: 'compulsoryDeposit', label: 'Compulsory Deposit (Refundable)', highlight: true },
                                        { key: 'shareMoney', label: 'Share Money (Refundable)', highlight: true },
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                                            <span className={item.highlight ? 'font-bold text-slate-700 pt-2' : 'text-slate-600 pt-2'}>{item.label}</span>
                                            <div className="relative w-32">
                                                <span className="absolute left-2 top-1.5 text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full pl-6 pr-2 py-1 border border-slate-300 rounded text-right font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-100 text-slate-500 cursor-not-allowed"
                                                    value={(formData as any)[item.key]}
                                                    readOnly
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-3 mt-2 border-t border-slate-300">
                                        <span className="font-bold text-lg text-slate-900">Total Payable</span>
                                        <span className="font-bold text-xl text-blue-600">₹{totalAmount.toFixed(2)}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                                    <div className="flex gap-4">
                                        {['Cash', 'Online', 'Both'].map(method => (
                                            <button
                                                key={method}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, paymentMethod: method as any })}
                                                className={`flex-1 py-2 border rounded-lg text-sm font-bold transition-all ${formData.paymentMethod === method
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {method}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Split Payment Inputs */}
                                {formData.paymentMethod === 'Both' && (
                                    <div className="grid grid-cols-2 gap-4 animate-fade-in bg-slate-50 p-4 rounded-lg border border-slate-200">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Cash Portion</label>
                                            <input
                                                type="number"
                                                className="w-full border p-2 rounded-lg"
                                                placeholder="0"
                                                value={paymentSplit.cash}
                                                onChange={e => setPaymentSplit({ ...paymentSplit, cash: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Online Portion</label>
                                            <input
                                                type="number"
                                                className="w-full border p-2 rounded-lg"
                                                placeholder="0"
                                                value={paymentSplit.online}
                                                onChange={e => setPaymentSplit({ ...paymentSplit, online: e.target.value })}
                                            />
                                        </div>
                                        <div className="col-span-2 text-right text-xs">
                                            <span className={`font-bold ${(parseFloat(paymentSplit.cash) || 0) + (parseFloat(paymentSplit.online) || 0) === totalAmount ? 'text-green-600' : 'text-red-600'}`}>
                                                Sum: ₹{(parseFloat(paymentSplit.cash) || 0) + (parseFloat(paymentSplit.online) || 0)} / ₹{totalAmount}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* UTR Number for Online/Both */}
                                {(formData.paymentMethod === 'Online' || formData.paymentMethod === 'Both') && (
                                    <div className="animate-fade-in">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">UTR / Ref No. (Required)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono uppercase"
                                            value={formData.utrNumber}
                                            onChange={e => setFormData({ ...formData, utrNumber: e.target.value })}
                                            placeholder="e.g. UTR12345678"
                                        />
                                    </div>
                                )}

                                <div className="bg-amber-50 p-4 rounded-lg flex gap-3 text-amber-800 text-sm">
                                    <CheckCircle className="shrink-0" size={20} />
                                    <p>By clicking "Register & Pay", the system will attempt to save the member data to the secure database. A receipt will be generated only after successful confirmation.</p>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8 pt-4 border-t border-slate-100">
                    {step > 1 ? (
                        <button onClick={handleBack} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors" disabled={isSaving}>
                            Back
                        </button>
                    ) : (
                        <div />
                    )}

                    {step < 3 ? (
                        <button onClick={handleNext} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium transition-colors flex items-center gap-2">
                            Next Step
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? 'Processing...' : formData.status === 'Pending' ? 'Save as Pending' : 'Register & Pay'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};