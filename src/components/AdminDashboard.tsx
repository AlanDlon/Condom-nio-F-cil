import { useState, useMemo, useEffect, FormEvent } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';
import { Users, AlertTriangle, TrendingUp, Download, LogOut, Search, Mail, Bell, CheckCircle, XCircle, Plus, X, DollarSign, Calendar, Building2, BarChart3, Settings, CreditCard, FileText, ChevronRight, ChevronDown, Home, ShieldCheck, Trash2, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { BRAZILIAN_BANKS } from '../constants';
import { validateCPF, formatCPF } from '../utils/validation';

interface AdminDashboardProps {
  onLogout: () => void;
  onSwitchToResident: () => void;
  user: any;
}

interface ResidentRecord {
  id: string;
  name: string;
  nickname: string;
  unit: string;
  email: string;
  status: 'adimplente' | 'inadimplente';
  lastPayment: string;
  debtAmount: number;
  emailVerified?: boolean;
  automaticDebit?: boolean;
  bankAccount?: {
    bank: string;
    agency: string;
    account: string;
    type: string;
  };
}

interface Invoice {
  docId: string;
  id: string;
  userId: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  paymentDate?: string;
  amountPaid?: number;
  pixCode?: string;
}

interface Expense {
  docId: string;
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  createdAt: any;
}

export default function AdminDashboard({ onLogout, onSwitchToResident, user }: AdminDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'adimplente' | 'inadimplente'>('all');
  const [residents, setResidents] = useState<ResidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showInvoicesListModal, setShowInvoicesListModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedResidentForEmail, setSelectedResidentForEmail] = useState<ResidentRecord | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceType, setInvoiceType] = useState<'monthly' | 'extra'>('monthly');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [showResidentModal, setShowResidentModal] = useState(false);
  const [newResident, setNewResident] = useState({
    name: '',
    nickname: '',
    email: '',
    cpf: '',
    houseNumber: ''
  });
  const [creatingResident, setCreatingResident] = useState(false);
  const [editingResident, setEditingResident] = useState<ResidentRecord | null>(null);
  const [showEditResidentModal, setShowEditResidentModal] = useState(false);
  const [deletingResidentId, setDeletingResidentId] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState('');
  const [activeTab, setActiveTab] = useState<'residents' | 'bank' | 'reports' | 'admins' | 'expenses'>('residents');
  const [admins, setAdmins] = useState<any[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [bankAccount, setBankAccount] = useState({
    bankName: '',
    accountType: 'corrente',
    agency: '',
    accountNumber: '',
    pixKey: '',
    ownerName: '',
    ownerCpfCnpj: ''
  });
  const [savingBank, setSavingBank] = useState(false);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    category: 'Manutenção',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(250);
  const [recurringDay, setRecurringDay] = useState<number>(10);
  const [recurringMode, setRecurringMode] = useState<'all' | 'manual'>('all');
  const [recurringResidentIds, setRecurringResidentIds] = useState<string[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const filteredBanks = useMemo(() => {
    if (!bankSearch) return BRAZILIAN_BANKS;
    return BRAZILIAN_BANKS.filter(b => 
      b.name.toLowerCase().includes(bankSearch.toLowerCase()) || 
      b.code.includes(bankSearch)
    );
  }, [bankSearch]);

  useEffect(() => {
    if (!user) return;

    const usersPath = 'users';
    const invoicesPath = 'invoices';
    const settingsPath = 'settings';

    // Fetch Bank Account
    getDoc(doc(db, 'settings', 'bankAccount')).then((docSnap) => {
      if (docSnap.exists()) {
        setBankAccount(docSnap.data() as any);
      }
    }).catch(err => handleFirestoreError(err, OperationType.GET, settingsPath));

    // Fetch General Settings
    getDoc(doc(db, 'settings', 'general')).then((docSnap) => {
      if (docSnap.exists()) {
        const val = docSnap.data().monthlyContribution || 250;
        const day = docSnap.data().recurringDay || 10;
        const mode = docSnap.data().recurringMode || 'all';
        const ids = docSnap.data().recurringResidentIds || [];
        setMonthlyContribution(val);
        setRecurringDay(day);
        setRecurringMode(mode);
        setRecurringResidentIds(ids);
        setInvoiceAmount(val.toString());
      }
    }).catch(err => handleFirestoreError(err, OperationType.GET, settingsPath));

    const unsubscribeUsers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'resident')), (userSnapshot) => {
      const usersData = userSnapshot.docs.map(doc => doc.data());
      
      const unsubscribeInvoices = onSnapshot(collection(db, 'invoices'), (invoiceSnapshot) => {
        const invoicesData = invoiceSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as Invoice));
        setAllInvoices(invoicesData);
        
        const processedResidents: ResidentRecord[] = usersData.map(user => {
          const userInvoices = invoicesData.filter(inv => inv.userId === user.id);
          const now = new Date();
          
          // Inadimplente if has any 'overdue' invoice OR 'pending' invoice with dueDate in the past
          const overdueInvoices = userInvoices.filter(inv => 
            inv.status === 'overdue' || 
            (inv.status === 'pending' && new Date(inv.dueDate) < now)
          );
          
          const unpaidInvoices = userInvoices.filter(inv => inv.status !== 'paid');
          const paidInvoices = userInvoices.filter(inv => inv.status === 'paid');
          
          const debtAmount = unpaidInvoices.reduce((acc, curr) => acc + (curr.amount || 0), 0);
          const lastPayment = paidInvoices.length > 0 
            ? paidInvoices.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0].paymentDate 
            : '';

          return {
            id: user.id,
            name: user.name,
            nickname: user.nickname,
            unit: user.houseNumber,
            email: user.email,
            status: overdueInvoices.length > 0 ? 'inadimplente' : 'adimplente',
            lastPayment,
            debtAmount,
            emailVerified: user.emailVerified,
            automaticDebit: user.bankAccount?.automaticDebit || false,
            bankAccount: user.bankAccount
          };
        });

        setResidents(processedResidents);
        setLoading(false);
      }, (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.LIST, invoicesPath);
        }
      });

      return () => unsubscribeInvoices();
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, usersPath);
      }
    });

    const unsubscribeAdmins = onSnapshot(query(collection(db, 'users'), where('role', '==', 'admin')), (snapshot) => {
      const adminsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdmins(adminsData);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, usersPath);
      }
    });

    const unsubscribeExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as Expense));
      setExpenses(expensesData);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, 'expenses');
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeAdmins();
      unsubscribeExpenses();
    };
  }, [user]);

  const handleCreateInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedResidentId || !invoiceAmount || !invoiceDueDate) return;

    setCreatingInvoice(true);
    const invoicesPath = 'invoices';
    try {
      const amount = parseFloat(invoiceAmount);
      const dueDate = invoiceDueDate;
      const createdAt = serverTimestamp();
      const pixCode = '00020126330014BR.GOV.BCB.PIX011112345678901520400005303986540550.005802BR5915CondominioFacil6009SAO PAULO62070503***6304E1D1';

      if (selectedResidentId === 'all') {
        // Create invoices for all residents and admins
        const allUsers = [...residents, ...admins];
        const promises = allUsers.map(user => 
          addDoc(collection(db, 'invoices'), {
            userId: user.id,
            amount,
            dueDate,
            status: 'pending',
            createdAt,
            pixCode,
            type: invoiceType,
            description: invoiceDescription || (invoiceType === 'monthly' ? 'Taxa Condominial Mensal' : 'Cobrança Extra'),
            id: Math.random().toString(36).substr(2, 9)
          })
        );
        await Promise.all(promises);
        alert(`${allUsers.length} faturas geradas com sucesso!`);
      } else {
        // Create single invoice
        await addDoc(collection(db, 'invoices'), {
          userId: selectedResidentId,
          amount,
          dueDate,
          status: 'pending',
          createdAt,
          pixCode,
          type: invoiceType,
          description: invoiceDescription || (invoiceType === 'monthly' ? 'Taxa Condominial Mensal' : 'Cobrança Extra'),
          id: Math.random().toString(36).substr(2, 9)
        });
        alert('Fatura gerada com sucesso!');
      }

      setShowInvoiceModal(false);
      setInvoiceDescription('');
      setInvoiceType('monthly');
      setSelectedResidentId('');
      setInvoiceAmount(monthlyContribution.toString());
      setInvoiceDueDate('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, invoicesPath);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleDeleteInvoice = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta fatura? Esta ação não pode ser desfeita.')) return;

    setDeletingInvoiceId(docId);
    try {
      await deleteDoc(doc(db, 'invoices', docId));
      alert('Fatura excluída com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invoices/${docId}`);
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  const handleCreateExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount || !newExpense.date) return;

    setCreatingExpense(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        ...newExpense,
        amount: parseFloat(newExpense.amount),
        id: Math.random().toString(36).substr(2, 9),
        createdAt: serverTimestamp()
      });
      alert('Despesa registrada com sucesso!');
      setShowExpenseModal(false);
      setNewExpense({
        description: '',
        category: 'Manutenção',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'expenses');
    } finally {
      setCreatingExpense(false);
    }
  };

  const handleDeleteExpense = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta despesa?')) return;

    setDeletingExpenseId(docId);
    try {
      await deleteDoc(doc(db, 'expenses', docId));
      alert('Despesa excluída com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${docId}`);
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const handleDeleteResident = async (residentId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este morador? Todas as faturas associadas também serão excluídas.')) return;

    setDeletingResidentId(residentId);
    try {
      // Delete user document
      await deleteDoc(doc(db, 'users', residentId));

      // Delete associated invoices
      const invoicesQuery = query(collection(db, 'invoices'), where('userId', '==', residentId));
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const deletePromises = invoicesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      alert('Morador e suas faturas excluídos com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${residentId}`);
    } finally {
      setDeletingResidentId(null);
    }
  };

  const handleUpdateResident = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingResident) return;

    setCreatingResident(true); // Reusing state for loading
    try {
      await setDoc(doc(db, 'users', editingResident.id), {
        name: editingResident.name,
        nickname: editingResident.nickname,
        email: editingResident.email,
        houseNumber: editingResident.unit,
        // Keep other fields
      }, { merge: true });

      alert('Dados do morador atualizados com sucesso!');
      setShowEditResidentModal(false);
      setEditingResident(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingResident.id}`);
    } finally {
      setCreatingResident(false);
    }
  };

  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);

  const handleUpdateInvoiceAmount = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    try {
      await setDoc(doc(db, 'invoices', editingInvoice.docId), {
        amount: parseFloat(editingInvoice.amount),
        dueDate: editingInvoice.dueDate,
        description: editingInvoice.description
      }, { merge: true });

      alert('Fatura atualizada com sucesso!');
      setShowEditInvoiceModal(false);
      setEditingInvoice(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invoices/${editingInvoice.docId}`);
    }
  };

  const handleCreateResident = async (e: FormEvent) => {
    e.preventDefault();
    setCpfError('');

    // Validate CPF
    if (!validateCPF(newResident.cpf)) {
      setCpfError('CPF inválido. Verifique os números e tente novamente.');
      return;
    }

    setCreatingResident(true);
    const usersPath = 'users';
    try {
      const userRef = doc(collection(db, 'users'));
      const userId = userRef.id;
      await setDoc(userRef, {
        ...newResident,
        id: userId,
        role: 'resident',
        createdAt: serverTimestamp()
      });

      // Generate initial invoice of R$ 50.00
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10); // Due in 10 days

      await addDoc(collection(db, 'invoices'), {
        id: Math.random().toString(36).substr(2, 9),
        userId: userId,
        amount: 50.00,
        dueDate: dueDate.toISOString(),
        status: 'pending',
        createdAt: serverTimestamp(),
        pixCode: '00020126330014BR.GOV.BCB.PIX011112345678901520400005303986540550.005802BR5915CondominioFacil6009SAO PAULO62070503***6304E1D1'
      });

      setShowResidentModal(false);
      setNewResident({ name: '', nickname: '', email: '', cpf: '', houseNumber: '' });
      alert('Morador cadastrado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, usersPath);
    } finally {
      setCreatingResident(false);
    }
  };

  const handleSaveBank = async (e: FormEvent) => {
    e.preventDefault();
    setSavingBank(true);
    try {
      await setDoc(doc(db, 'settings', 'bankAccount'), {
        ...bankAccount,
        id: 'bankAccount',
        updatedAt: serverTimestamp()
      });
      alert('Dados bancários salvos com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/bankAccount');
    } finally {
      setSavingBank(false);
    }
  };

  const handleSendVerificationEmail = async (residentId: string) => {
    try {
      const response = await fetch('/api/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: residentId })
      });
      const data = await response.json();
      if (data.success) {
        alert('E-mail de verificação enviado com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao enviar e-mail');
      }
    } catch (error: any) {
      console.error('Erro ao enviar e-mail:', error);
      alert(`Erro: ${error.message}`);
    }
  };

  const handleCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingAdmin(true);
    try {
      // Use email as ID directly to allow rules to check it before the user has a UID
      const adminId = newAdmin.email;
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        name: newAdmin.name,
        nickname: newAdmin.name.split(' ')[0],
        email: newAdmin.email,
        role: 'admin',
        houseNumber: 'ADM',
        cpf: '000.000.000-00',
        createdAt: new Date().toISOString()
      });
      
      alert(`Administrador ${newAdmin.name} pré-cadastrado! Ele deve entrar com este e-mail para acessar o painel.`);
      setShowAdminModal(false);
      setNewAdmin({ name: '', email: '', password: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const generateReport = (period: 'monthly' | 'quarterly' | 'annual') => {
    const now = new Date();
    let startDate = new Date();

    if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'quarterly') startDate.setMonth(now.getMonth() - 3);
    else if (period === 'annual') startDate.setFullYear(now.getFullYear() - 1);

    const filteredInvoices = allInvoices.filter(inv => {
      const date = new Date(inv.createdAt?.seconds ? inv.createdAt.seconds * 1000 : inv.createdAt || inv.dueDate);
      return date >= startDate;
    });

    const filteredExpenses = expenses.filter(exp => {
      const date = new Date(exp.date);
      return date >= startDate;
    });

    const totalRevenue = filteredInvoices.filter(inv => inv.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
    const totalPending = filteredInvoices.filter(inv => inv.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
    const totalOverdue = filteredInvoices.filter(inv => inv.status === 'overdue').reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpenses = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      totalRevenue,
      totalPending,
      totalOverdue,
      totalExpenses,
      count: filteredInvoices.length,
      paidCount: filteredInvoices.filter(inv => inv.status === 'paid').length,
      invoices: filteredInvoices,
      expenses: filteredExpenses
    };
  };

  const reportData = useMemo(() => {
    const monthly = generateReport('monthly');
    const quarterly = generateReport('quarterly');
    const annual = generateReport('annual');

    return [
      { name: 'Mensal', ...monthly },
      { name: 'Trimestral', ...quarterly },
      { name: 'Anual', ...annual }
    ];
  }, [allInvoices]);

  const expenseChartData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    expenses.forEach(exp => {
      categories[exp.category] = (categories[exp.category] || 0) + exp.amount;
    });
    return Object.keys(categories).map(cat => ({
      name: cat,
      value: categories[cat]
    }));
  }, [expenses]);

  const handleExportPDF = (specificReport?: any) => {
    const doc = new jsPDF();
    const reportsToExport = specificReport ? [specificReport] : reportData;
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(26, 35, 126); // premium-navy
    doc.text('Relatório Financeiro - Condomínio Fácil', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
    doc.text(`Tipo: ${specificReport ? `Relatório ${specificReport.name}` : 'Resumo Geral'}`, 14, 36);

    let currentY = 45;

    reportsToExport.forEach((report, index) => {
      if (index > 0) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(16);
      doc.setTextColor(26, 35, 126);
      doc.text(`Resumo: ${report.name}`, 14, currentY);
      currentY += 10;

      const summaryData = [
        ['Total Receita (Paga)', `R$ ${report.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total Pendente', `R$ ${report.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total em Atraso', `R$ ${report.totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total Despesas', `R$ ${report.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Saldo do Período', `R$ ${(report.totalRevenue - report.totalExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total de Faturas', report.count.toString()],
        ['Faturas Pagas', report.paidCount.toString()]
      ];

      autoTable(doc, {
        startY: currentY,
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Invoices Table
      if (report.invoices && report.invoices.length > 0) {
        doc.setFontSize(14);
        doc.text('Detalhamento de Faturas', 14, currentY);
        currentY += 7;

        const invoiceRows = report.invoices.map((inv: any) => {
          const resident = residents.find(r => r.id === inv.userId);
          return [
            resident?.unit || 'N/A',
            resident?.name || 'N/A',
            `R$ ${inv.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            new Date(inv.dueDate).toLocaleDateString('pt-BR'),
            inv.status.toUpperCase()
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [['Unidade', 'Morador', 'Valor', 'Vencimento', 'Status']],
          body: invoiceRows,
          theme: 'striped',
          headStyles: { fillColor: [26, 35, 126] },
          styles: { fontSize: 8 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Expenses Table
      if (report.expenses && report.expenses.length > 0) {
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(14);
        doc.text('Detalhamento de Despesas', 14, currentY);
        currentY += 7;

        const expenseRows = report.expenses.map((exp: any) => [
          exp.description,
          exp.category,
          `R$ ${exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          new Date(exp.date).toLocaleDateString('pt-BR')
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Descrição', 'Categoria', 'Valor', 'Data']],
          body: expenseRows,
          theme: 'striped',
          headStyles: { fillColor: [197, 160, 89] }, // premium-gold
          styles: { fontSize: 8 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      }
    });
    
    const fileName = specificReport ? `relatorio-${specificReport.name.toLowerCase()}.pdf` : 'relatorio-financeiro-geral.pdf';
    doc.save(fileName);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Invoices Data (Revenue)
    const invoiceData = allInvoices.map(inv => {
      const resident = residents.find(r => r.id === inv.userId);
      return {
        'Unidade': resident?.unit || 'N/A',
        'Morador': resident?.name || 'N/A',
        'Valor (R$)': inv.amount,
        'Vencimento': new Date(inv.dueDate).toLocaleDateString('pt-BR'),
        'Status': inv.status === 'paid' ? 'PAGO' : inv.status === 'pending' ? 'PENDENTE' : 'ATRASADO',
        'Data de Pagamento': inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString('pt-BR') : '-',
        'Valor Pago (R$)': inv.amountPaid || 0
      };
    });
    const wsInvoices = XLSX.utils.json_to_sheet(invoiceData);
    XLSX.utils.book_append_sheet(wb, wsInvoices, "Receitas");

    // Expenses Data
    const expenseData = expenses.map(exp => ({
      'Descrição': exp.description,
      'Categoria': exp.category,
      'Valor (R$)': exp.amount,
      'Data': new Date(exp.date).toLocaleDateString('pt-BR')
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(expenseData);
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Despesas");

    // Save File
    XLSX.writeFile(wb, `movimentacoes-financeiras-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredResidents = useMemo(() => {
    return residents.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           r.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           r.unit.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, filterStatus, residents]);

  const statsData = [
    { name: 'Adimplentes', value: residents.filter(r => r.status === 'adimplente').length, color: '#1A237E' },
    { name: 'Inadimplentes', value: residents.filter(r => r.status === 'inadimplente').length, color: '#C5A059' },
  ];

  const totalDebt = residents.reduce((acc, curr) => acc + curr.debtAmount, 0);
  const complianceRate = residents.length > 0 ? Math.round((statsData[0].value / residents.length) * 100) : 0;

  const stats = [
    { label: 'Total Unidades', value: residents.length.toString(), icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Taxa de Adimplência', value: `${complianceRate}%`, icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total em Atraso', value: `R$ ${totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: AlertTriangle, color: 'bg-rose-50 text-rose-600' },
  ];

  const handleNotify = async (resident: ResidentRecord) => {
    setSelectedResidentForEmail(resident);
    setEmailSubject('Comunicado do Condomínio Fácil');
    setEmailMessage(`Olá ${resident.nickname},\n\nEste é um comunicado importante sobre o condomínio.`);
    setShowEmailModal(true);
  };

  const handleSendEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedResidentForEmail) return;

    setSendingEmail(true);
    try {
      const response = await fetch('/api/send-notification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedResidentForEmail.id,
          subject: emailSubject,
          message: emailMessage
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('E-mail de notificação enviado com sucesso!');
        setShowEmailModal(false);
        setEmailSubject('');
        setEmailMessage('');
      } else {
        throw new Error(data.error || 'Erro ao enviar e-mail');
      }
    } catch (error: any) {
      console.error('Erro ao enviar e-mail:', error);
      alert(`Erro: ${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-premium-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-premium-navy text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Condomínio Fácil</h1>
            <p className="text-slate-300 text-xs uppercase font-bold tracking-widest">Painel Administrativo</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-bold">Síndico Geral</p>
              <p className="text-[10px] text-slate-400">{user.email?.toUpperCase()}</p>
            </div>
            <button 
              onClick={onSwitchToResident}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all text-sm font-bold border border-white/10"
            >
              <Home size={18} className="text-premium-gold" />
              Minha Unidade
            </button>
            <button onClick={onLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors border border-white/10">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('residents')}
            className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'residents' ? 'border-premium-gold text-premium-navy' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <Users size={18} /> Moradores
          </button>
          <button 
            onClick={() => setActiveTab('bank')}
            className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'bank' ? 'border-premium-gold text-premium-navy' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <Settings size={18} /> Configurações
          </button>
          <button 
            onClick={() => setActiveTab('admins')}
            className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'admins' ? 'border-premium-gold text-premium-navy' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <ShieldCheck size={18} /> Administradores
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'reports' ? 'border-premium-gold text-premium-navy' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <BarChart3 size={18} /> Relatórios Financeiros
          </button>
          <button 
            onClick={() => setActiveTab('expenses')}
            className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'expenses' ? 'border-premium-gold text-premium-navy' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <DollarSign size={18} /> Despesas do Condomínio
          </button>
        </div>

        {activeTab === 'residents' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.5 }}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <stat.icon size={24} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className="text-xl font-bold text-premium-navy">{stat.value}</p>
                  </div>
                </motion.div>
              ))}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="bg-premium-gold p-6 rounded-2xl shadow-lg flex items-center gap-4 text-white"
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1">Receita Prevista</p>
                  <p className="text-xl font-bold">R$ 5.950,00</p>
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Chart Card */}
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 lg:col-span-1"
              >
                <h3 className="text-lg font-bold text-premium-navy mb-6">Visão Geral de Pagamentos</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statsData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {statsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend verticalAlign="bottom" iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Adimplentes</span>
                    <span className="font-bold text-premium-navy">{statsData[0].value} unidades</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Inadimplentes</span>
                    <span className="font-bold text-premium-gold">{statsData[1].value} unidades</span>
                  </div>
                </div>
              </motion.div>

              {/* Detailed List Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-50 space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="text-lg font-bold text-premium-navy">Gestão de Moradores</h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowResidentModal(true)}
                        className="bg-premium-navy text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all"
                      >
                        <Plus size={18} /> Novo Morador
                      </button>
                      <button className="p-2 hover:bg-slate-50 rounded-lg border border-slate-200 text-slate-400">
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setInvoiceType('extra');
                          setShowInvoiceModal(true);
                        }}
                        className="bg-premium-gold text-premium-navy px-4 py-2 rounded-lg text-sm font-bold hover:bg-opacity-90 transition-all flex items-center gap-2"
                      >
                        <Plus size={18} />
                        Boleto Extra
                      </button>
                      <button 
                        onClick={() => {
                          setInvoiceType('monthly');
                          setShowInvoiceModal(true);
                        }}
                        className="bg-premium-navy text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-opacity-90 transition-all flex items-center gap-2"
                      >
                        <Plus size={18} />
                        Fatura Mensal
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        placeholder="Buscar por nome ou unidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-premium-gold transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      <button 
                        onClick={() => setFilterStatus('all')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterStatus === 'all' ? 'bg-white text-premium-navy shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Todos
                      </button>
                      <button 
                        onClick={() => setFilterStatus('adimplente')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterStatus === 'adimplente' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Adimplentes
                      </button>
                      <button 
                        onClick={() => setFilterStatus('inadimplente')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterStatus === 'inadimplente' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Inadimplentes
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Morador / Unidade</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagto Automático</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Último Pagto</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Débito</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[200px] text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="popLayout">
                        {filteredResidents.map((resident) => (
                          <motion.tr 
                            layout
                            key={resident.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors group"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-premium-navy font-bold text-sm">
                                  {resident.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{resident.name}</p>
                                  <p className="text-slate-400 text-xs">"{resident.nickname}" • Unidade {resident.unit}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              {resident.status === 'adimplente' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">
                                  <CheckCircle size={12} /> Adimplente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">
                                  <XCircle size={12} /> Inadimplente
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              {resident.automaticDebit ? (
                                <div className="flex items-center gap-2 text-emerald-600" title={`${resident.bankAccount?.bank} - Ag: ${resident.bankAccount?.agency} CC: ${resident.bankAccount?.account}`}>
                                  <CheckCircle size={14} />
                                  <span className="text-[10px] font-bold uppercase">Ativo</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px] font-bold uppercase">Inativo</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-500 text-xs">
                              {resident.lastPayment ? new Date(resident.lastPayment).toLocaleDateString('pt-BR') : '-'}
                            </td>
                            <td className="p-4">
                              <p className={`text-sm font-bold ${resident.debtAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {resident.debtAmount > 0 ? `R$ ${resident.debtAmount.toFixed(2)}` : 'R$ 0,00'}
                              </p>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2 whitespace-nowrap">
                                {!resident.emailVerified && (
                                  <button 
                                    onClick={() => handleSendVerificationEmail(resident.id)}
                                    className="p-2 hover:bg-amber-50 text-amber-500 rounded-lg transition-colors"
                                    title="Enviar e-mail de verificação"
                                  >
                                    <Mail size={16} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleNotify(resident)}
                                  className="p-2 hover:bg-premium-gold/10 text-premium-gold rounded-lg transition-colors"
                                  title="Enviar Notificação"
                                >
                                  <Bell size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setSelectedResidentId(resident.id);
                                    setShowInvoicesListModal(true);
                                  }}
                                  className="p-2 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors" 
                                  title="Ver Débitos/Faturas"
                                >
                                  <FileText size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setSelectedResidentId(resident.id);
                                    setShowInvoiceModal(true);
                                  }}
                                  className="p-2 hover:bg-premium-navy/10 text-premium-navy rounded-lg transition-colors" 
                                  title="Nova Fatura"
                                >
                                  <Plus size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setEditingResident(resident);
                                    setShowEditResidentModal(true);
                                  }}
                                  className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors" 
                                  title="Editar Morador"
                                >
                                  <Settings size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteResident(resident.id)}
                                  disabled={deletingResidentId === resident.id}
                                  className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors disabled:opacity-50" 
                                  title="Excluir Morador"
                                >
                                  {deletingResidentId === resident.id ? (
                                    <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  {filteredResidents.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                      <Search size={48} className="mx-auto mb-4 opacity-10" />
                      <p>Nenhum morador encontrado com esses critérios.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}

        {activeTab === 'bank' && (
          <div className="space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-premium-navy/5 flex items-center justify-center text-premium-navy">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-premium-navy">Faturamento Recorrente</h3>
                    <p className="text-slate-500 text-sm">Configure a cobrança automática mensal para todos os moradores.</p>
                  </div>
                </div>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Valor da Contribuição (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input 
                        type="number"
                        value={monthlyContribution}
                        onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none font-bold text-lg"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Dia de Vencimento (1-28)</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="number"
                        min="1"
                        max="28"
                        value={recurringDay}
                        onChange={(e) => setRecurringDay(Number(e.target.value))}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none font-bold text-lg"
                        placeholder="Ex: 10"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <label className="block text-sm font-medium text-slate-700">Público-Alvo do Faturamento</label>
                  <div className="flex flex-col md:flex-row gap-4">
                    <button 
                      onClick={() => setRecurringMode('all')}
                      className={`flex-1 p-5 rounded-2xl border-2 transition-all text-left ${recurringMode === 'all' ? 'border-premium-gold bg-premium-gold/5 ring-1 ring-premium-gold/20' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${recurringMode === 'all' ? 'bg-premium-gold text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Users size={18} />
                        </div>
                        <span className="font-bold text-premium-navy">Todos os Moradores</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Inclui todos os residentes e administradores cadastrados no sistema.</p>
                    </button>
                    <button 
                      onClick={() => setRecurringMode('manual')}
                      className={`flex-1 p-5 rounded-2xl border-2 transition-all text-left ${recurringMode === 'manual' ? 'border-premium-gold bg-premium-gold/5 ring-1 ring-premium-gold/20' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${recurringMode === 'manual' ? 'bg-premium-gold text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <CheckCircle size={18} />
                        </div>
                        <span className="font-bold text-premium-navy">Seleção Manual</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Escolha individualmente quem receberá a cobrança mensal.</p>
                    </button>
                  </div>
                </div>

                {recurringMode === 'manual' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-6 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50"
                  >
                    <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-premium-navy">Selecionar Moradores</span>
                        <span className="bg-premium-gold/10 text-premium-gold text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {recurringResidentIds.length} selecionados
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          const allUserIds = [...residents, ...admins].map(u => u.id);
                          if (recurringResidentIds.length === allUserIds.length) {
                            setRecurringResidentIds([]);
                          } else {
                            setRecurringResidentIds(allUserIds);
                          }
                        }}
                        className="text-xs font-bold text-premium-gold hover:text-premium-navy transition-colors"
                      >
                        {recurringResidentIds.length === (residents.length + admins.length) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-2 no-scrollbar">
                      {[...residents, ...admins].map(user => (
                        <label 
                          key={user.id} 
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${recurringResidentIds.includes(user.id) ? 'bg-white border-premium-gold/30 shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`}
                        >
                          <div className="relative flex items-center">
                            <input 
                              type="checkbox"
                              checked={recurringResidentIds.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRecurringResidentIds([...recurringResidentIds, user.id]);
                                } else {
                                  setRecurringResidentIds(recurringResidentIds.filter(id => id !== user.id));
                                }
                              }}
                              className="w-5 h-5 accent-premium-gold rounded border-slate-300"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                              {user.unit ? `Unidade ${user.unit}` : 'Administrador'}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className="mt-8 p-4 bg-premium-gold/5 border border-premium-gold/10 rounded-2xl flex gap-4">
                  <AlertTriangle className="text-premium-gold flex-shrink-0" size={24} />
                  <div className="text-sm text-slate-600">
                    <p className="font-bold text-premium-navy mb-1">Como funciona o faturamento recorrente?</p>
                    <p>
                      Todo dia <strong>{recurringDay}</strong> de cada mês, o sistema gerará automaticamente uma fatura de <strong>R$ {monthlyContribution.toFixed(2)}</strong> para <strong>{recurringMode === 'all' ? 'todos os moradores e administradores' : `${recurringResidentIds.length} moradores selecionados`}</strong>.
                    </p>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      await setDoc(doc(db, 'settings', 'general'), {
                        monthlyContribution,
                        recurringDay,
                        recurringMode,
                        recurringResidentIds: recurringMode === 'manual' ? recurringResidentIds : [],
                        updatedAt: serverTimestamp()
                      });
                      setInvoiceAmount(monthlyContribution.toString());
                      alert('Configurações de faturamento atualizadas com sucesso!');
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, 'settings/general');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                  className="mt-8 bg-premium-navy text-white px-8 py-4 rounded-xl font-bold hover:bg-opacity-90 transition-all disabled:opacity-50 shadow-lg"
                >
                  {savingSettings ? 'Salvando...' : 'Salvar Configurações de Faturamento'}
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-premium-navy/5 flex items-center justify-center text-premium-navy">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-premium-navy">Dados para Recebimento</h3>
                    <p className="text-slate-500 text-sm">Configure a conta onde os moradores realizarão os pagamentos.</p>
                  </div>
                </div>
              </div>

            <form onSubmit={handleSaveBank} className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-premium-gold">Informações da Conta</h4>
                  <div className="space-y-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Banco</label>
                      <div className="relative">
                        <input 
                          type="text"
                          value={showBankDropdown ? bankSearch : bankAccount.bankName}
                          onFocus={() => {
                            setShowBankDropdown(true);
                            setBankSearch('');
                          }}
                          onChange={(e) => setBankSearch(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none pr-10"
                          placeholder="Pesquisar banco..."
                          required
                        />
                        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} size={18} />
                      </div>

                      <AnimatePresence>
                        {showBankDropdown && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto no-scrollbar"
                          >
                            {filteredBanks.length > 0 ? (
                              filteredBanks.map((bank) => (
                                <button
                                  key={`${bank.code}-${bank.name}`}
                                  type="button"
                                  onClick={() => {
                                    setBankAccount({...bankAccount, bankName: `${bank.code} - ${bank.name}`});
                                    setShowBankDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between"
                                >
                                  <span className="text-sm font-medium text-slate-700">{bank.name}</span>
                                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">{bank.code}</span>
                                </button>
                              ))
                            ) : (
                              <div className="p-4 text-center text-slate-400 text-sm">Nenhum banco encontrado</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      {/* Overlay to close dropdown */}
                      {showBankDropdown && (
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowBankDropdown(false)}
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Agência</label>
                        <input 
                          type="text"
                          value={bankAccount.agency}
                          onChange={(e) => setBankAccount({...bankAccount, agency: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                          placeholder="0000"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Conta</label>
                        <input 
                          type="text"
                          value={bankAccount.accountNumber}
                          onChange={(e) => setBankAccount({...bankAccount, accountNumber: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                          placeholder="00000-0"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Conta</label>
                      <select 
                        value={bankAccount.accountType}
                        onChange={(e) => setBankAccount({...bankAccount, accountType: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none bg-white"
                      >
                        <option value="corrente">Conta Corrente</option>
                        <option value="poupanca">Conta Poupança</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-premium-gold">Chave PIX & Titular</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Chave PIX</label>
                      <input 
                        type="text"
                        value={bankAccount.pixKey}
                        onChange={(e) => setBankAccount({...bankAccount, pixKey: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                        placeholder="E-mail, CPF, Celular ou Chave Aleatória"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Titular</label>
                      <input 
                        type="text"
                        value={bankAccount.ownerName}
                        onChange={(e) => setBankAccount({...bankAccount, ownerName: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                        placeholder="Nome completo ou Razão Social"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">CPF ou CNPJ do Titular</label>
                      <input 
                        type="text"
                        value={bankAccount.ownerCpfCnpj}
                        onChange={(e) => setBankAccount({...bankAccount, ownerCpfCnpj: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                        placeholder="000.000.000-00"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 flex justify-end">
                <button 
                  type="submit"
                  disabled={savingBank}
                  className="bg-premium-navy text-white px-8 py-4 rounded-2xl font-bold shadow-lg hover:bg-opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingBank ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Salvar Configurações
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

        {activeTab === 'admins' && (
          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
            <div className="flex flex-col items-center text-center mb-8">
              <h3 className="text-xl font-bold text-premium-navy">Gestão de Administradores</h3>
              <p className="text-slate-500 text-sm mb-6">Apenas administradores podem cadastrar novos gestores.</p>
              <button 
                onClick={() => setShowAdminModal(true)}
                className="bg-premium-navy text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all shadow-lg active:scale-95"
              >
                <Plus size={20} />
                Novo Administrador
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {admins.map((admin, idx) => (
                <motion.div 
                  key={admin.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.5 }}
                  className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex items-center gap-4"
                >
                  <div className="w-12 h-12 bg-premium-gold/10 rounded-full flex items-center justify-center">
                    <ShieldCheck className="text-premium-gold" size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-premium-navy">{admin.name}</h4>
                    <p className="text-xs text-slate-500">{admin.email}</p>
                    <div className="mt-2 inline-block bg-premium-gold/20 text-premium-gold text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      Administrador
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-premium-navy">Despesas do Condomínio</h3>
                <p className="text-slate-500 text-sm">Registre serviços, manutenções e outras despesas do condomínio.</p>
              </div>
              <button 
                onClick={() => setShowExpenseModal(true)}
                className="bg-premium-navy text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all shadow-lg active:scale-95"
              >
                <Plus size={20} />
                Nova Despesa
              </button>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((expense) => (
                    <tr key={expense.docId} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors group">
                      <td className="p-4 text-sm text-slate-600">
                        {new Date(expense.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-bold text-premium-navy">{expense.description}</p>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-[10px] font-bold uppercase">
                          {expense.category}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-bold text-rose-600">
                        R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteExpense(expense.docId)}
                          disabled={deletingExpenseId === expense.docId}
                          className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                          title="Excluir Despesa"
                        >
                          {deletingExpenseId === expense.docId ? (
                            <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 text-sm italic">
                        Nenhuma despesa registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {reportData.map((report, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.5 }}
                  className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-xs font-bold text-premium-gold uppercase tracking-widest mb-1">Relatório {report.name}</p>
                      <h4 className="text-2xl font-bold text-premium-navy">R$ {report.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                    </div>
                    <button 
                      onClick={() => handleExportPDF(report)}
                      className="w-10 h-10 rounded-xl bg-premium-navy/5 text-premium-navy flex items-center justify-center hover:bg-premium-navy hover:text-white transition-all shadow-sm"
                      title="Exportar PDF"
                    >
                      <Download size={18} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Total de Faturas</span>
                      <span className="font-bold text-slate-700">{report.count}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Faturas Pagas</span>
                      <span className="font-bold text-emerald-600">{report.paidCount}</span>
                    </div>
                    <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full rounded-full" 
                        style={{ width: `${report.count > 0 ? (report.paidCount / report.count) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="pt-4 border-t border-slate-50 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Pendente</span>
                        <span className="font-bold text-premium-gold">R$ {report.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Em Atraso</span>
                        <span className="font-bold text-rose-600">R$ {report.totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-50">
                        <span className="text-slate-400">Total Despesas</span>
                        <span className="font-bold text-slate-700">R$ {report.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold text-premium-navy">Comparativo de Receita</h3>
                  <p className="text-slate-500 text-sm">Análise visual da saúde financeira do condomínio.</p>
                </div>
                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 text-sm font-bold text-premium-gold hover:text-premium-navy transition-colors"
                >
                  <Download size={18} /> Exportar PDF
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-premium-navy transition-colors"
                >
                  <FileSpreadsheet size={18} /> Exportar Excel
                </button>
              </div>

              <div className="h-[350px] w-full">
                <RechartsResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickFormatter={(value) => `R$ ${value}`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="totalRevenue" name="Receita" fill="#1A237E" radius={[6, 6, 0, 0]} barSize={40} />
                    <Bar dataKey="totalPending" name="Pendente" fill="#C5A059" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </RechartsResponsiveContainer>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
              >
                <h3 className="text-xl font-bold text-premium-navy mb-6">Distribuição de Despesas</h3>
                <div className="h-[300px]">
                  {expenseChartData.length > 0 ? (
                    <RechartsResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {expenseChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#1A237E', '#C5A059', '#10B981', '#EF4444', '#F59E0B', '#6366F1'][index % 6]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </RechartsResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 italic">
                      Nenhuma despesa registrada para exibir.
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
              >
                <h3 className="text-xl font-bold text-premium-navy mb-6">Resumo de Gastos</h3>
                <div className="space-y-4">
                  {expenseChartData.sort((a, b) => b.value - a.value).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#1A237E', '#C5A059', '#10B981', '#EF4444', '#F59E0B', '#6366F1'][idx % 6] }} />
                        <span className="text-sm font-medium text-slate-700">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold text-premium-navy">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {expenseChartData.length === 0 && (
                    <p className="text-center text-slate-400 italic py-8">Sem dados disponíveis.</p>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </main>

      {/* New Invoice Modal */}
      <AnimatePresence>
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border-t-4 border-premium-gold"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">
                  {invoiceType === 'monthly' ? 'Gerar Fatura Mensal' : 'Gerar Boleto Extra'}
                </h3>
                <button 
                  onClick={() => {
                    setShowInvoiceModal(false);
                    setInvoiceType('monthly');
                    setInvoiceDescription('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateInvoice} className="space-y-5">
                <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceType('monthly');
                      setInvoiceAmount(monthlyContribution.toString());
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${invoiceType === 'monthly' ? 'bg-white text-premium-navy shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceType('extra');
                      setInvoiceAmount('');
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${invoiceType === 'extra' ? 'bg-white text-premium-navy shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Extra
                  </button>
                </div>

                {invoiceType === 'extra' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descrição do Boleto Extra</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={invoiceDescription}
                        onChange={(e) => setInvoiceDescription(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                        placeholder="Ex: Taxa de Mudança, Multa, etc."
                        required={invoiceType === 'extra'}
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Selecionar Morador</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      value={selectedResidentId}
                      onChange={(e) => setSelectedResidentId(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none bg-white appearance-none"
                      required
                    >
                      <option value="">Selecione um morador...</option>
                      <option value="all" className="font-bold text-premium-gold">TODOS OS USUÁRIOS ({residents.length + admins.length})</option>
                      <optgroup label="Moradores">
                        {residents.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.nickname}) - {r.unit}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Administradores">
                        {admins.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Admin)</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="number"
                      step="0.01"
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                      placeholder="0,00"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de Vencimento</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="date"
                      value={invoiceDueDate}
                      onChange={(e) => setInvoiceDueDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={creatingInvoice}
                    className="w-full bg-premium-navy text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {creatingInvoice ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle size={20} />
                        Gerar Fatura
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showAdminModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">Novo Administrador</h3>
                <button onClick={() => setShowAdminModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreateAdmin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                  <input 
                    type="text"
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin({...newAdmin, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="Ex: João Silva"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input 
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="admin@exemplo.com"
                    required
                  />
                </div>
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-800 text-xs flex gap-3">
                  <AlertTriangle className="flex-shrink-0" size={18} />
                  <p>
                    O novo administrador deverá realizar o login utilizando o e-mail cadastrado acima. 
                    O sistema reconhecerá automaticamente o papel de administrador.
                  </p>
                </div>
                <button 
                  type="submit"
                  disabled={creatingAdmin}
                  className="w-full bg-premium-navy text-white py-4 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {creatingAdmin ? 'Cadastrando...' : 'Confirmar Cadastro'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showResidentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">Cadastrar Novo Morador</h3>
                <button onClick={() => setShowResidentModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreateResident} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={newResident.name}
                    onChange={(e) => setNewResident({...newResident, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="Nome do morador"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apelido</label>
                  <input
                    type="text"
                    value={newResident.nickname}
                    onChange={(e) => setNewResident({...newResident, nickname: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="Como o morador é chamado"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newResident.email}
                    onChange={(e) => setNewResident({...newResident, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="email@morador.com"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">CPF</label>
                    <input
                      type="text"
                      value={newResident.cpf}
                      onChange={(e) => {
                        const formatted = formatCPF(e.target.value);
                        setNewResident({...newResident, cpf: formatted});
                        if (cpfError) setCpfError('');
                      }}
                      className={`w-full px-4 py-3 rounded-xl border ${cpfError ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200'} focus:ring-2 focus:ring-premium-gold outline-none`}
                      placeholder="000.000.000-00"
                      required
                    />
                    {cpfError && (
                      <p className="text-rose-500 text-xs mt-1 font-medium">{cpfError}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
                    <input
                      type="text"
                      value={newResident.houseNumber}
                      onChange={(e) => setNewResident({...newResident, houseNumber: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                      placeholder="Ex: 101-A"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingResident}
                  className="w-full bg-premium-navy text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 mt-4"
                >
                  {creatingResident ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={20} />
                      Cadastrar Morador
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
        {showInvoicesListModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl border-t-4 border-premium-gold max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-premium-navy">Débitos e Faturas</h3>
                  <p className="text-slate-500 text-sm">
                    {residents.find(r => r.id === selectedResidentId)?.name || admins.find(a => a.id === selectedResidentId)?.name} 
                    {residents.find(r => r.id === selectedResidentId)?.unit ? ` - Unidade ${residents.find(r => r.id === selectedResidentId)?.unit}` : ' (Administrador)'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowInvoicesListModal(false);
                    setSelectedResidentId('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allInvoices
                      .filter(inv => inv.userId === selectedResidentId)
                      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
                      .map((invoice) => (
                        <tr key={invoice.docId} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-800">{invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra')}</span>
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${invoice.type === 'extra' ? 'text-premium-gold' : 'text-slate-400'}`}>
                                {invoice.type === 'extra' ? 'Extra' : 'Mensal'}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-4 text-sm font-bold text-premium-navy">
                            R$ {invoice.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4">
                            {invoice.status === 'paid' ? (
                              <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[10px] font-bold uppercase">Pago</span>
                            ) : invoice.status === 'overdue' || (invoice.status === 'pending' && new Date(invoice.dueDate) < new Date()) ? (
                              <span className="bg-rose-50 text-rose-600 px-2 py-1 rounded-full text-[10px] font-bold uppercase">Atrasado</span>
                            ) : (
                              <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded-full text-[10px] font-bold uppercase">Pendente</span>
                            )}
                          </td>
                          <td className="p-4 text-right flex justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingInvoice(invoice);
                                setShowEditInvoiceModal(true);
                              }}
                              className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                              title="Editar Fatura"
                            >
                              <Settings size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteInvoice(invoice.docId)}
                              disabled={deletingInvoiceId === invoice.docId}
                              className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors disabled:opacity-50"
                              title="Excluir Fatura"
                            >
                              {deletingInvoiceId === invoice.docId ? (
                                <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    {allInvoices.filter(inv => inv.userId === selectedResidentId).length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400 text-sm italic">
                          Nenhum débito ou fatura encontrada para este morador.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {showExpenseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border-t-4 border-premium-navy"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">Registrar Despesa</h3>
                <button 
                  onClick={() => setShowExpenseModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateExpense} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descrição do Serviço</label>
                  <input
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-navy outline-none"
                    placeholder="Ex: Troca de lâmpadas, Limpeza da piscina..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-navy outline-none bg-white"
                    required
                  >
                    <option value="Manutenção">Manutenção</option>
                    <option value="Limpeza">Limpeza</option>
                    <option value="Segurança">Segurança</option>
                    <option value="Utilidades">Utilidades (Água/Luz)</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-navy outline-none"
                      placeholder="0,00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Data</label>
                    <input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-navy outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingExpense}
                  className="w-full bg-premium-navy text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                >
                  {creatingExpense ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Salvar Despesa
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
        {showEditResidentModal && editingResident && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">Editar Morador</h3>
                <button onClick={() => setShowEditResidentModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleUpdateResident} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={editingResident.name}
                    onChange={(e) => setEditingResident({...editingResident, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apelido</label>
                  <input
                    type="text"
                    value={editingResident.nickname}
                    onChange={(e) => setEditingResident({...editingResident, nickname: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editingResident.email}
                    onChange={(e) => setEditingResident({...editingResident, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidade / Casa</label>
                  <input
                    type="text"
                    value={editingResident.unit}
                    onChange={(e) => setEditingResident({...editingResident, unit: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={creatingResident}
                  className="w-full bg-premium-navy text-white py-4 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {creatingResident ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showEmailModal && selectedResidentForEmail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl border-t-4 border-premium-navy"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-premium-navy">Enviar Notificação por E-mail</h3>
                  <p className="text-slate-500 text-sm">Para: {selectedResidentForEmail.name} ({selectedResidentForEmail.email})</p>
                </div>
                <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSendEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assunto</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="Ex: Aviso sobre manutenção de elevadores"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem</label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none min-h-[200px] resize-none"
                    placeholder="Escreva sua mensagem aqui..."
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={sendingEmail}
                    className="flex-[2] bg-premium-navy text-white py-4 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingEmail ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail size={20} />
                        Enviar E-mail
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showEditInvoiceModal && editingInvoice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-premium-navy">Editar Fatura</h3>
                <button onClick={() => setShowEditInvoiceModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleUpdateInvoiceAmount} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={editingInvoice.description || ''}
                    onChange={(e) => setEditingInvoice({...editingInvoice, description: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.amount}
                    onChange={(e) => setEditingInvoice({...editingInvoice, amount: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de Vencimento</label>
                  <input
                    type="date"
                    value={editingInvoice.dueDate.split('T')[0]}
                    onChange={(e) => setEditingInvoice({...editingInvoice, dueDate: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-premium-navy text-white py-4 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all active:scale-95"
                >
                  Salvar Alterações
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
