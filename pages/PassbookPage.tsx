import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Member, Account, AccountType } from '../types';
import {
    ArrowLeft, Printer, RotateCcw, Check, Search, FileText,
    Settings, MousePointer2, ChevronDown, ChevronUp, AlignVerticalSpaceAround, CheckSquare, Square, FilePlus
} from 'lucide-react';

interface PassbookPageProps {
    member: Member;
    accounts: Account[];
    onBack: () => void;
    onUpdateMember: (member: Member) => void;
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
};

const abbreviateParticulars = (text: string) => {
    return text
        .replace(/Deposit/gi, 'Dep')
        .replace(/Withdrawal/gi, 'Wdl')
        .replace(/Transfer/gi, 'Trf')
        .replace(/Interest/gi, 'Int')
        .replace(/Balance/gi, 'Bal')
        .replace(/Account/gi, 'A/c')
        .replace(/Opening/gi, 'Op')
        .replace(/Closing/gi, 'Cl')
        .replace(/Payment/gi, 'Pmt')
        .replace(/Received/gi, 'Rcvd')
        .replace(/Cash/gi, 'Csh')
        .replace(/Multiple Trxn/gi, 'Multi Trx');
};

// Default PRT template for Cover Page
const DEFAULT_PRT_TEMPLATE = `. 































                              Member Personal Details                               
                            ============================                     
 Account No.       : $ACNO,5
 Name              :   $ACNAME,40
 F/H/D Of Name     :   $FATHER,40
 Address           :   $ACADD1,100
 City              :   $ACCITY,20
 Pin No            :   $ACPIN1,10  
 Mobile No.        :   $MOBILENO,12
 MemberShip Date   :   $MEMDATE,15 
                                   
END`;

export const PassbookPage: React.FC<PassbookPageProps> = ({ member, accounts, onBack, onUpdateMember }) => {
    const [printTab, setPrintTab] = useState<'ledger' | 'cover'>('ledger');

    // Selection State
    const [selectionMode, setSelectionMode] = useState<'auto' | 'manual'>('auto');
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());

    // Config State
    const [printLineOffset, setPrintLineOffset] = useState<number>(0);
    const [customPrtTemplate, setCustomPrtTemplate] = useState(DEFAULT_PRT_TEMPLATE);
    const [skipPrintedRows, setSkipPrintedRows] = useState(true); // If true, inserts blank lines for previously printed items on the same page
    const [printHeaders, setPrintHeaders] = useState(false);

    // Configuration for Dot Matrix layout
    const [printConfig] = useState({
        topMargin: 5,
        leftMargin: 5,
        rowHeight: 22
    });

    const sortTransactions = (a: any, b: any) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        // Primary Sort: Date
        if (dateA !== dateB) return dateA - dateB;
        // Secondary Sort: ID (preserve creation order if on same ms, assuming ID is time-sortable or strictly increasing)
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
    };

    const allMemberTransactions = useMemo(() => {
        const flattened = accounts
            .filter(acc => !(acc.type === AccountType.LOAN && acc.status === 'Pending'))
            .flatMap(acc =>
                acc.transactions.map(tx => ({
                    ...tx,
                    accType: acc.type,
                    accNumber: acc.accountNumber,
                    accId: acc.id,
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

    // Transform raw transactions into Passbook Rows with Split Logic
    const passbookRows = useMemo(() => {
        const printableCodes = ['SM', 'CD', 'OD', 'RD', 'RL'];
        // Filter relevant transactions first
        const flattened = allMemberTransactions.filter(t => printableCodes.includes(t.accCode));

        // 1. Calculate Running Balances for every single transaction sequentially
        //    This creates a "Snapshot" of the balance at the moment of that transaction.
        const balances = { SM: 0, CD: 0, OD: 0, RD: 0, RL: 0, FD: 0, OTHER: 0 };

        // Determine printing boundary
        let printBoundaryPassed = false;
        // If no last ID, then boundary is at the start (everything is unprinted)
        if (!member.lastPrintedTransactionId) printBoundaryPassed = true;

        const annotatedTxs = flattened.map(tx => {
            const code = tx.accCode as keyof typeof balances;
            const isLoan = tx.accType === AccountType.LOAN;

            // Update Balance
            if (isLoan) {
                if (tx.type === 'debit') balances.RL += tx.amount;
                else balances.RL -= tx.amount;
            } else {
                if (tx.type === 'credit') balances[code] += tx.amount;
                else balances[code] -= tx.amount;
            }

            // Check Print Status
            let isTxUnprinted = false;
            if (member.lastPrintedTransactionId === tx.id) {
                printBoundaryPassed = true;
                isTxUnprinted = false; // This specific one is the last printed one
            } else if (printBoundaryPassed) {
                isTxUnprinted = true; // Everything after boundary
            } else {
                isTxUnprinted = false; // Before boundary
            }

            return {
                ...tx,
                snapshotBalance: balances[code],
                isTxUnprinted
            };
        });

        // 2. Group by Date
        const groupedByDate: Record<string, typeof annotatedTxs> = {};
        annotatedTxs.forEach(tx => {
            if (!groupedByDate[tx.date]) groupedByDate[tx.date] = [];
            groupedByDate[tx.date].push(tx);
        });

        const processedRows: any[] = [];

        // 3. Grid Allocation (Bin Packing) per Date
        Object.keys(groupedByDate).forEach(date => {
            const txsForDate = groupedByDate[date];

            // List of visual rows for this date. 
            // Each row is an object { id, desc, cells: {}, isPrinted }
            const visualRowsForDate: any[] = [];

            txsForDate.forEach(tx => {
                // Find the first visual row where the slot for this account code is empty
                let placed = false;

                for (const row of visualRowsForDate) {
                    // If this row doesn't have a transaction for this Account Code yet
                    if (!row.cells[tx.accCode]) {
                        row.cells[tx.accCode] = {
                            dr: tx.type === 'debit' ? tx.amount : 0,
                            cr: tx.type === 'credit' ? tx.amount : 0,
                            bal: tx.snapshotBalance
                        };

                        // Update Row Metadata
                        row.id = tx.id; // Row ID takes latest transaction ID
                        row.allIds.push(tx.id);

                        // Logic: If ANY transaction in the row is unprinted, mark row as unprinted
                        if (tx.isTxUnprinted) row.isPrinted = false;

                        // Add payment method to set
                        if (tx.paymentMethod) row.methods.add(tx.paymentMethod);

                        placed = true;
                        break;
                    }
                }

                // If not placed in any existing row (collision), create a new row
                if (!placed) {
                    visualRowsForDate.push({
                        id: tx.id,
                        allIds: [tx.id],
                        date: formatDate(date),
                        cells: {
                            [tx.accCode]: {
                                dr: tx.type === 'debit' ? tx.amount : 0,
                                cr: tx.type === 'credit' ? tx.amount : 0,
                                bal: tx.snapshotBalance
                            }
                        },
                        methods: new Set([tx.paymentMethod || 'Cash']),
                        isPrinted: !tx.isTxUnprinted // If tx is unprinted, row is unprinted
                    });
                }
            });

            // 4. Finalize row descriptions (Payment Mode)
            visualRowsForDate.forEach(row => {
                const m = row.methods;
                if (m.has('Both') || (m.has('Cash') && m.has('Online'))) {
                    row.desc = 'cash/online';
                } else if (m.has('Online')) {
                    row.desc = 'online';
                } else {
                    row.desc = 'cash';
                }
            });

            // Add generated rows to final list
            processedRows.push(...visualRowsForDate);
        });

        return processedRows;
    }, [allMemberTransactions, member.lastPrintedTransactionId]);

    // Auto-Select Logic
    useEffect(() => {
        if (selectionMode === 'auto') {
            const newSet = new Set<string>();
            passbookRows.forEach(row => {
                if (!row.isPrinted) {
                    newSet.add(row.id);
                }
            });
            setSelectedTxIds(newSet);
            setPrintLineOffset(0);
        }
    }, [passbookRows, selectionMode]);

    // Monitor selection to Toggle Headers automatically if 1st transaction is selected
    useEffect(() => {
        if (passbookRows.length > 0) {
            // If the very first transaction (historically) is in the selection, enable headers
            const firstTxId = passbookRows[0].id;
            if (selectedTxIds.has(firstTxId)) {
                setPrintHeaders(true);
            }
        }
    }, [selectedTxIds, passbookRows]);

    const toggleRowSelection = (rowId: string) => {
        setSelectionMode('manual');
        const newSet = new Set(selectedTxIds);
        if (newSet.has(rowId)) {
            newSet.delete(rowId);
        } else {
            newSet.add(rowId);
        }
        setSelectedTxIds(newSet);
    };

    const handleNewPage = () => {
        setPrintLineOffset(0);
        setSkipPrintedRows(false);
        setPrintHeaders(true);
    };

    const parsePrtTemplate = (template: string) => {
        let output = template;
        const replacements: Record<string, string> = {
            'ACNO': member.id,
            'ACNAME': member.fullName,
            'FATHER': member.fatherName || '',
            'ACADD1': member.currentAddress || '',
            'ACCITY': member.city || '',
            'ACPIN1': member.pinCode || '',
            'MOBILENO': member.phone,
            'MEMDATE': formatDate(member.joinDate)
        };
        return output.replace(/\$([A-Z0-9]+)(?:,\d+)?/g, (match, key) => replacements[key] !== undefined ? replacements[key] : match);
    };

    const printViaWindow = (content: string) => {
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (printWindow) {
            printWindow.document.write(content);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 500);
        }
    };

    const handlePrint = () => {
        let content = '';
        const marginStyle = `padding-top: ${printConfig.topMargin}mm; padding-left: ${printConfig.leftMargin}mm;`;

        if (printTab === 'cover') {
            const parsedContent = parsePrtTemplate(customPrtTemplate);
            content = `
          <html><head><style>@page { margin: 0; } body { margin: 0; padding: 0; color: #000000; }</style></head>
          <body style="font-family: 'Courier New', monospace; font-size: 14px; white-space: pre; margin: 0; ${marginStyle}; color: #000000;">${parsedContent}</body></html>
        `;
        } else {
            // Build Print Rows based on selection and spacing
            const rowsToPrint: any[] = [];
            let spacerCount = printLineOffset;

            // If skipping printed rows, calculate how many printed rows precede the first selected row
            if (skipPrintedRows && selectedTxIds.size > 0) {
                // Find index of first selected row
                const firstIdx = passbookRows.findIndex(r => selectedTxIds.has(r.id));
                if (firstIdx > -1) {
                    // Add blank rows for every row before the selected one IF it was "printed".
                    for (let i = 0; i < firstIdx; i++) {
                        rowsToPrint.push({ type: 'spacer' });
                    }
                }
            }

            // Add manual top offset spacers
            for (let i = 0; i < spacerCount; i++) {
                rowsToPrint.unshift({ type: 'spacer' });
            }

            // Add Selected Rows
            passbookRows.forEach(row => {
                if (selectedTxIds.has(row.id)) {
                    rowsToPrint.push({ type: 'data', ...row });
                }
            });

            const renderAmount = (val: number | undefined) => val ? val.toFixed(0) : '';
            const shortDesc = (desc: string) => abbreviateParticulars(desc).substring(0, 15);

            // Updated Table Head to use 'sep' class for print window compatibility
            const tableHead = `
            <thead>
                <tr class="text-left bg-slate-50">
                    <th class="sep px-1">Trn.Date</th>
                    <th class="sep px-1">Particular</th>
                    <th colSpan="3" class="text-center">&lt;----- SM -----&gt;</th>
                    <th colSpan="3" class="text-center">&lt;----- CD -----&gt;</th>
                    <th colSpan="3" class="text-center">&lt;----- OD -----&gt;</th>
                    <th colSpan="3" class="text-center">&lt;----- RD -----&gt;</th>
                    <th colSpan="3" class="text-center">&lt;----- RL -----&gt;</th>
                </tr>
                <tr class="border-b border-dashed border-black text-right bg-slate-50">
                    <th class="sep"></th>
                    <th class="sep"></th>
                    <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                    <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                    <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                    <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                    <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                </tr>
            </thead>
        `;

            content = `
          <html>
            <head>
               <style>
                 @page { margin: 0; size: auto; }
                 body { ${marginStyle}; font-family: 'Courier New', monospace; font-size: 10px; margin: 0; font-weight: bold; color: #000000; }
                 table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #000000; }
                 th, td { padding: 0px 2px; vertical-align: top; overflow: hidden; height: ${printConfig.rowHeight}px; box-sizing: border-box; white-space: nowrap; border-color: #000000; }
                 .sep { border-right: 1px dashed #000000; }
                 .left { text-align: left; }
                 .right { text-align: right; }
                 .center { text-align: center; }
                 .dashed-bottom { border-bottom: 1px dashed #000000; }
                 .dashed-top { border-top: 1px dashed #000000; }
                 
                 /* Specific font sizes */
                 .txt { font-size: 14px; }
                 .num { font-size: 16px; }
               </style>
            </head>
            <body>
               <table>
                  <colgroup>
                    <col style="width: 75px;"> <!-- Date -->
                    <col style="width: 90px;"> <!-- Particulars (Reduced) -->
                    
                    <!-- Increased width for numbers (42,42,50) -->
                    <col style="width: 42px;"><col style="width: 42px;"><col style="width: 50px;"> <!-- SM -->
                    <col style="width: 42px;"><col style="width: 42px;"><col style="width: 50px;"> <!-- CD -->
                    <col style="width: 42px;"><col style="width: 42px;"><col style="width: 50px;"> <!-- OD -->
                    <col style="width: 42px;"><col style="width: 42px;"><col style="width: 50px;"> <!-- RD -->
                    <col style="width: 42px;"><col style="width: 42px;"><col style="width: 50px;"> <!-- RL -->
                  </colgroup>
                  ${printHeaders ? tableHead : ''}
                  <tbody>
                    ${rowsToPrint.map(r => {
                if (r.type === 'spacer') {
                    return `<tr><td colspan="17" style="height: ${printConfig.rowHeight}px; color: transparent;">.</td></tr>`;
                }
                return `
                        <tr>
                            <td class="left txt">${r.date}</td>
                            <td class="left txt" style="overflow: hidden;">${r.desc}</td>
                            <td class="right num">${renderAmount(r.cells.SM?.dr)}</td><td class="right num">${renderAmount(r.cells.SM?.cr)}</td><td class="right num">${r.cells.SM ? r.cells.SM.bal.toFixed(0) : ''}</td>
                            <td class="right num">${renderAmount(r.cells.CD?.dr)}</td><td class="right num">${renderAmount(r.cells.CD?.cr)}</td><td class="right num">${r.cells.CD ? r.cells.CD.bal.toFixed(0) : ''}</td>
                            <td class="right num">${renderAmount(r.cells.OD?.dr)}</td><td class="right num">${renderAmount(r.cells.OD?.cr)}</td><td class="right num">${r.cells.OD ? r.cells.OD.bal.toFixed(0) : ''}</td>
                            <td class="right num">${renderAmount(r.cells.RD?.dr)}</td><td class="right num">${renderAmount(r.cells.RD?.cr)}</td><td class="right num">${r.cells.RD ? r.cells.RD.bal.toFixed(0) : ''}</td>
                            <td class="right num">${renderAmount(r.cells.RL?.dr)}</td><td class="right num">${renderAmount(r.cells.RL?.cr)}</td><td class="right num">${r.cells.RL ? r.cells.RL.bal.toFixed(0) : ''}</td>
                        </tr>`
            }).join('')}
                  </tbody>
               </table>
            </body>
          </html>
        `;
        }

        printViaWindow(content);

        // Update last printed ID to the LAST selected one
        if (printTab === 'ledger' && selectedTxIds.size > 0) {
            // Find the selected row with the latest index
            let lastId = '';
            // Iterate backwards to find the last selected row
            for (let i = passbookRows.length - 1; i >= 0; i--) {
                if (selectedTxIds.has(passbookRows[i].id)) {
                    lastId = passbookRows[i].id;
                    break;
                }
            }

            if (lastId && window.confirm("Update 'Last Printed' transaction pointer?")) {
                onUpdateMember({ ...member, lastPrintedTransactionId: lastId });
            }
        }
    };

    const AmtCell = ({ val }: { val?: number }) => (
        <td className="text-right px-1 text-[16px]">{val ? val.toFixed(0) : ''}</td>
    );

    return (
        <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900">
            {/* Simple Top Bar */}
            <header className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            Passbook Printer
                        </h1>
                        <p className="text-sm text-slate-500">{member.fullName} ({member.id})</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setPrintTab('ledger')}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${printTab === 'ledger' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                        >
                            Ledger
                        </button>
                        <button
                            onClick={() => setPrintTab('cover')}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${printTab === 'cover' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                        >
                            Cover
                        </button>
                    </div>
                    <button
                        onClick={handlePrint}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm"
                    >
                        <Printer size={18} /> Print {selectedTxIds.size > 0 && printTab === 'ledger' ? `(${selectedTxIds.size})` : ''}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Right Controls Panel */}
                <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto flex flex-col gap-6">
                    {printTab === 'ledger' ? (
                        <>
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Print Selection</h3>
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2">
                                    <button
                                        onClick={() => {
                                            setSelectionMode('auto');
                                            const newSet = new Set<string>();
                                            passbookRows.forEach(r => !r.isPrinted && newSet.add(r.id));
                                            setSelectedTxIds(newSet);
                                        }}
                                        className={`w-full py-2 text-xs font-medium rounded border flex items-center justify-center gap-1 ${selectionMode === 'auto' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-transparent'}`}
                                    >
                                        Select Unprinted
                                    </button>
                                    <button
                                        onClick={() => setSelectedTxIds(new Set())}
                                        className="w-full py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200"
                                    >
                                        Clear Selection
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Alignment & Page</h3>
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                                    <button
                                        onClick={handleNewPage}
                                        className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 mb-2"
                                    >
                                        <FilePlus size={14} /> Start New Page
                                    </button>

                                    <div className="border-t border-slate-100 pt-2">
                                        <label className="flex justify-between text-xs font-medium text-slate-700 mb-2">
                                            Top Offset (Lines) <span className="bg-slate-100 px-1.5 rounded">{printLineOffset}</span>
                                        </label>
                                        <input
                                            type="range" min="0" max="30"
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                                            value={printLineOffset}
                                            onChange={(e) => setPrintLineOffset(parseInt(e.target.value))}
                                        />
                                    </div>

                                    <div className="space-y-2 pt-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="printHeaders"
                                                checked={printHeaders}
                                                onChange={(e) => setPrintHeaders(e.target.checked)}
                                                className="rounded text-blue-600"
                                            />
                                            <label htmlFor="printHeaders" className="text-xs text-slate-600 leading-tight">
                                                Print Table Headings
                                            </label>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="skipPrinted"
                                                checked={skipPrintedRows}
                                                onChange={(e) => setSkipPrintedRows(e.target.checked)}
                                                className="rounded text-blue-600"
                                            />
                                            <label htmlFor="skipPrinted" className="text-xs text-slate-600 leading-tight">
                                                Space for previous entries
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Info</h3>
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800">
                                    <p className="mb-2"><strong>Tip:</strong> Click on rows in the preview to toggle selection.</p>
                                    <p>Unprinted items are highlighted in blue.</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Variables</h3>
                            <div className="bg-white rounded-lg border border-slate-200 text-xs">
                                {['$ACNO', '$ACNAME', '$FATHER', '$ACADD1', '$ACCITY', '$ACPIN1', '$MOBILENO', '$MEMDATE'].map(v => (
                                    <div key={v} className="p-2 border-b border-slate-100 last:border-0 font-mono text-slate-600">
                                        {v}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Area */}
                <div className="flex-1 bg-slate-100 p-8 overflow-auto flex justify-center">
                    {printTab === 'ledger' ? (
                        <div className="bg-white shadow-lg w-[1000px] min-h-[600px] p-6 text-[10px] font-mono border border-slate-300 relative text-black">
                            {/* Simulation of Manual Offset */}
                            {printLineOffset > 0 && (
                                <div style={{ height: printLineOffset * 22 }} className="w-full bg-yellow-50 opacity-50 border-b border-dashed border-yellow-300 mb-1 flex items-center justify-center text-yellow-600 font-sans font-bold text-lg">
                                    Manual Offset Space ({printLineOffset} lines)
                                </div>
                            )}

                            <table className="w-full border-collapse table-fixed text-black">
                                <colgroup>
                                    <col style={{ width: '75px' }} />
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '50px' }} />
                                    <col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '50px' }} />
                                    <col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '50px' }} />
                                    <col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '50px' }} />
                                    <col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '50px' }} />
                                </colgroup>
                                {/* Conditional Header Rendering in Preview */}
                                {printHeaders && (
                                    <thead>
                                        <tr className="text-left bg-slate-50">
                                            <th className="border-r border-dashed border-black px-1">Trn.Date</th>
                                            <th className="border-r border-dashed border-black px-1">Particular</th>
                                            <th colSpan={3} className="text-center">&lt;----- SM -----&gt;</th>
                                            <th colSpan={3} className="text-center">&lt;----- CD -----&gt;</th>
                                            <th colSpan={3} className="text-center">&lt;----- OD -----&gt;</th>
                                            <th colSpan={3} className="text-center">&lt;----- RD -----&gt;</th>
                                            <th colSpan={3} className="text-center">&lt;----- RL -----&gt;</th>
                                        </tr>
                                        <tr className="border-b border-dashed border-black text-right bg-slate-50">
                                            <th className="border-r border-dashed border-black"></th>
                                            <th className="border-r border-dashed border-black"></th>
                                            <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                                            <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                                            <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                                            <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                                            <th>Dr.</th><th>Cr.</th><th>Bal.</th>
                                        </tr>
                                    </thead>
                                )}
                                <tbody>
                                    {passbookRows.map((r, idx) => {
                                        const isSelected = selectedTxIds.has(r.id);

                                        return (
                                            <tr
                                                key={r.id}
                                                onClick={() => toggleRowSelection(r.id)}
                                                className={`
                                                h-[22px] cursor-pointer transition-colors
                                                ${isSelected ? 'bg-blue-100 font-bold' : r.isPrinted ? 'text-slate-400 hover:bg-slate-50' : 'bg-yellow-50 hover:bg-yellow-100'}
                                            `}
                                            >
                                                <td className="px-1 relative text-[14px]">
                                                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                                                    {r.date}
                                                </td>
                                                <td className="px-1 truncate text-[14px]" style={{ overflow: 'hidden' }}>{r.desc}</td>
                                                <AmtCell val={r.cells.SM?.dr} /><AmtCell val={r.cells.SM?.cr} /><td className="text-right px-1 text-[16px]">{r.cells.SM ? r.cells.SM.bal.toFixed(0) : ''}</td>
                                                <AmtCell val={r.cells.CD?.dr} /><AmtCell val={r.cells.CD?.cr} /><td className="text-right px-1 text-[16px]">{r.cells.CD ? r.cells.CD.bal.toFixed(0) : ''}</td>
                                                <AmtCell val={r.cells.OD?.dr} /><AmtCell val={r.cells.OD?.cr} /><td className="text-right px-1 text-[16px]">{r.cells.OD ? r.cells.OD.bal.toFixed(0) : ''}</td>
                                                <AmtCell val={r.cells.RD?.dr} /><AmtCell val={r.cells.RD?.cr} /><td className="text-right px-1 text-[16px]">{r.cells.RD ? r.cells.RD.bal.toFixed(0) : ''}</td>
                                                <AmtCell val={r.cells.RL?.dr} /><AmtCell val={r.cells.RL?.cr} /><td className="text-right px-1 text-[16px]">{r.cells.RL ? r.cells.RL.bal.toFixed(0) : ''}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="w-full max-w-2xl">
                            <textarea
                                className="w-full h-[600px] font-mono text-sm p-8 border border-slate-300 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                value={customPrtTemplate}
                                onChange={(e) => setCustomPrtTemplate(e.target.value)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};