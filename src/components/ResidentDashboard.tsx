import { useState, useEffect, useMemo, FormEvent } from 'react';
import { Wallet, CreditCard, Clock, Copy, QrCode, LogOut, ListFilter, CheckCircle, AlertTriangle, ShieldCheck, XCircle, FileText, Landmark, Settings, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Tooltip as RechartsTooltip, ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';
import { Invoice, User, Expense } from '../types';
import InvoiceHistory from './InvoiceHistory';
import PaymentHistory from './PaymentHistory';
import { auth, db, handleFirestoreError, OperationType, messaging } from '../firebase';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

interface ResidentDashboardProps {
  onLogout: () => void;
  onSwitchToAdmin?: () => void;
  user: any;
}

export default function ResidentDashboard({ onLogout, onSwitchToAdmin, user }: ResidentDashboardProps) {
  const [view, setView] = useState<'main' | 'history' | 'settings' | 'payments'>('main');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [boletoCode, setBoletoCode] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Bank Account Form State
  const [bankInfo, setBankInfo] = useState({
    bank: '',
    agency: '',
    account: '',
    type: 'checking' as 'checking' | 'savings',
    automaticDebit: false
  });

  const userId = user.uid;

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

  useEffect(() => {
    if (!userId || !messaging) return;

    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, {
            vapidKey: 'TODO_VAPID_KEY' // In a real app, this would be your VAPID key
          });
          
          if (token) {
            console.log('FCM Token:', token);
            await fetch('/api/register-fcm-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, token })
            });
          }
        }
      } catch (error) {
        console.error('Error getting FCM token:', error);
      }
    };

    requestPermission();

    const unsubscribeMessage = onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      alert(`${payload.notification?.title}: ${payload.notification?.body}`);
    });

    return () => unsubscribeMessage();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const userPath = `users/${userId}`;
    const invoicesPath = 'invoices';

    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data() as User;
          setUserProfile(data);
          if (data.bankAccount) {
            setBankInfo(data.bankAccount);
          }
        }
      } catch (err) {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, userPath);
        }
      }
    };

    fetchProfile();

    const q = query(collection(db, 'invoices'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      setInvoices(invoicesData);
      setLoading(false);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.LIST, invoicesPath);
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
      unsubscribe();
      unsubscribeExpenses();
    };
  }, [userId]);

  const handleUpdateBankInfo = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/update-bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bankAccount: bankInfo })
      });
      const data = await response.json();
      if (data.success) {
        alert('Dados bancários atualizados com sucesso!');
        setView('main');
      } else {
        throw new Error(data.error || 'Erro ao atualizar dados');
      }
    } catch (error) {
      console.error('Erro ao atualizar banco:', error);
      alert('Erro ao salvar dados bancários.');
    }
  };

  const handlePayClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handlePayPix = async () => {
    if (!selectedInvoice) return;
    try {
      const response = await fetch('/api/generate-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: selectedInvoice.id, amount: selectedInvoice.amount })
      });
      const data = await response.json();
      if (data.pixCode) {
        setPixCode(data.pixCode);
        setShowPaymentModal(false);
      }
    } catch (error) {
      console.error('Erro Pix:', error);
    }
  };

  const handlePayBoleto = async () => {
    if (!selectedInvoice) return;
    try {
      const response = await fetch('/api/generate-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: selectedInvoice.id, amount: selectedInvoice.amount })
      });
      const data = await response.json();
      if (data.boletoCode) {
        setBoletoCode(data.boletoCode);
        setShowPaymentModal(false);
      }
    } catch (error) {
      console.error('Erro Boleto:', error);
    }
  };

  const handleAutomaticDebit = () => {
    if (!userProfile?.bankAccount) {
      alert('Por favor, registre seus dados bancários primeiro.');
      setView('settings');
      setShowPaymentModal(false);
      return;
    }
    alert('Esta fatura será processada via débito automático em sua conta cadastrada.');
    setShowPaymentModal(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-premium-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (view === 'history') {
    return <InvoiceHistory invoices={invoices} onBack={() => setView('main')} />;
  }

  if (view === 'payments') {
    return <PaymentHistory invoices={invoices} onBack={() => setView('main')} />;
  }

  if (view === 'settings') {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-premium-navy text-white p-6 shadow-lg">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button onClick={() => setView('main')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <XCircle size={24} />
            </button>
            <h1 className="text-xl font-bold">Configurações de Pagamento</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto p-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-2xl font-bold text-premium-navy mb-6 flex items-center gap-2">
              <Landmark className="text-premium-gold" />
              Dados Bancários
            </h2>
            <form onSubmit={handleUpdateBankInfo} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Banco</label>
                  <input 
                    type="text" 
                    value={bankInfo.bank} 
                    onChange={e => setBankInfo({...bankInfo, bank: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="Ex: Itaú, Bradesco..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Conta</label>
                  <select 
                    value={bankInfo.type} 
                    onChange={e => setBankInfo({...bankInfo, type: e.target.value as any})}
                    className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                  >
                    <option value="checking">Conta Corrente</option>
                    <option value="savings">Conta Poupança</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Agência</label>
                  <input 
                    type="text" 
                    value={bankInfo.agency} 
                    onChange={e => setBankInfo({...bankInfo, agency: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="0000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Conta</label>
                  <input 
                    type="text" 
                    value={bankInfo.account} 
                    onChange={e => setBankInfo({...bankInfo, account: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none"
                    placeholder="00000-0"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <input 
                  type="checkbox" 
                  id="autoDebit"
                  checked={bankInfo.automaticDebit}
                  onChange={e => setBankInfo({...bankInfo, automaticDebit: e.target.checked})}
                  className="w-5 h-5 accent-premium-gold"
                />
                <label htmlFor="autoDebit" className="text-sm font-medium text-slate-700">
                  Ativar Débito Automático para faturas de condomínio
                </label>
              </div>
              <button 
                type="submit"
                className="w-full bg-premium-navy hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
              >
                Salvar Alterações
              </button>
            </form>
          </motion.div>
        </main>
      </div>
    );
  }

  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const totalDebt = unpaidInvoices.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-premium-navy text-white p-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Olá, {userProfile ? userProfile.nickname : '...'}
              </h1>
              <p className="text-slate-300 text-xs">
                {userProfile ? `Unidade ${userProfile.houseNumber}` : 'Carregando...'}
              </p>
            </div>
            {onSwitchToAdmin && (
              <button onClick={onSwitchToAdmin} className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all text-xs font-bold border border-white/10">
                <ShieldCheck size={16} className="text-premium-gold" /> Painel Admin
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setView('settings')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Settings size={20} />
            </button>
            <button onClick={onLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-premium-gold/10 rounded-full flex items-center justify-center">
              <Wallet className="text-premium-gold w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Saldo Devedor</p>
              <h2 className="text-3xl font-bold text-premium-navy">
                R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h2>
            </div>
          </div>
          {unpaidInvoices.length > 0 && (
            <button onClick={() => handlePayClick(unpaidInvoices[0])} className="w-full md:w-auto bg-premium-navy hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
              <CreditCard size={20} /> PAGAR AGORA
            </button>
          )}
        </motion.div>

        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-premium-navy flex items-center gap-2">
              <Clock size={20} className="text-premium-gold" /> Próximas Faturas
            </h3>
            <button onClick={() => setView('history')} className="text-premium-gold text-sm font-bold flex items-center gap-1 hover:underline">
              <ListFilter size={16} /> Ver Extrato Completo
            </button>
            <button onClick={() => setView('payments')} className="text-premium-gold text-sm font-bold flex items-center gap-1 hover:underline">
              <Clock size={16} /> Histórico de Pagamentos
            </button>
          </div>
          <div className="space-y-4">
            {unpaidInvoices.length > 0 ? unpaidInvoices.map((invoice) => (
              <div key={invoice.id} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-800">{invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra')}</span>
                    {invoice.type === 'extra' && (
                      <span className="bg-premium-gold/10 text-premium-gold text-[10px] font-bold px-2 py-0.5 rounded uppercase">Extra</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm">Vencimento: {new Date(invoice.dueDate).toLocaleDateString('pt-BR')} • Valor: R$ {invoice.amount.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {invoice.status === 'overdue' ? (
                    <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold">ATRASADO</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">PENDENTE</span>
                  )}
                  <button onClick={() => handlePayClick(invoice)} className="p-2 hover:bg-slate-100 rounded-lg text-premium-navy transition-colors">
                    <CreditCard size={20} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="bg-emerald-50 text-emerald-600 p-8 rounded-2xl text-center border border-emerald-100">
                <p className="font-bold">Parabéns! Você está em dia com o condomínio.</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-premium-navy flex items-center gap-2">
              <TrendingUp size={20} className="text-premium-gold" /> Transparência Financeira
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
            >
              <h4 className="text-sm font-bold text-premium-navy mb-4">Distribuição de Gastos</h4>
              <div className="h-[200px]">
                {expenseChartData.length > 0 ? (
                  <RechartsResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {expenseChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#1A237E', '#C5A059', '#10B981', '#EF4444', '#F59E0B', '#6366F1'][index % 6]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </RechartsResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                    Nenhuma despesa registrada para exibir.
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
            >
              <h4 className="text-sm font-bold text-premium-navy mb-4">Resumo por Categoria</h4>
              <div className="space-y-3 max-h-[200px] overflow-y-auto no-scrollbar">
                {expenseChartData.sort((a, b) => b.value - a.value).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#1A237E', '#C5A059', '#10B981', '#EF4444', '#F59E0B', '#6366F1'][idx % 6] }} />
                      <span className="text-xs font-medium text-slate-700">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-premium-navy">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {expenseChartData.length === 0 && (
                  <p className="text-center text-slate-400 text-xs italic py-4">Sem dados disponíveis.</p>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Payment Modal */}
        {showPaymentModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-md space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-premium-navy">Forma de Pagamento</h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 uppercase font-bold">Fatura de {new Date(selectedInvoice.dueDate).toLocaleDateString('pt-BR')}</p>
                <p className="text-2xl font-bold text-premium-navy">R$ {selectedInvoice.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <button onClick={handlePayPix} className="w-full bg-slate-50 hover:bg-slate-100 p-4 rounded-2xl flex items-center gap-4 transition-all border border-slate-100 text-left">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><QrCode className="text-emerald-600" size={20} /></div>
                  <div><p className="font-bold text-slate-800">Pix</p><p className="text-xs text-slate-500">Instantâneo</p></div>
                </button>
                <button onClick={handlePayBoleto} className="w-full bg-slate-50 hover:bg-slate-100 p-4 rounded-2xl flex items-center gap-4 transition-all border border-slate-100 text-left">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><FileText className="text-blue-600" size={20} /></div>
                  <div><p className="font-bold text-slate-800">Boleto Bancário</p><p className="text-xs text-slate-500">Compensação em até 3 dias</p></div>
                </button>
                <button onClick={handleAutomaticDebit} className="w-full bg-slate-50 hover:bg-slate-100 p-4 rounded-2xl flex items-center gap-4 transition-all border border-slate-100 text-left">
                  <div className="w-10 h-10 bg-premium-gold/10 rounded-xl flex items-center justify-center"><Landmark className="text-premium-gold" size={20} /></div>
                  <div><p className="font-bold text-slate-800">Débito Automático</p><p className="text-xs text-slate-500">{userProfile?.bankAccount?.automaticDebit ? 'Ativo em sua conta' : 'Configurar conta'}</p></div>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Pix Modal */}
        {pixCode && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-sm text-center space-y-6">
              <h3 className="text-xl font-bold text-premium-navy">Pagamento via Pix</h3>
              <div className="bg-slate-100 p-4 rounded-2xl flex justify-center"><QrCode size={180} className="text-premium-navy" /></div>
              <p className="text-slate-500 text-sm">Copie o código abaixo para pagar no seu banco.</p>
              <button onClick={() => copyToClipboard(pixCode)} className="w-full bg-slate-900 text-white py-4 rounded-xl flex items-center justify-center gap-2 font-bold"><Copy size={18} /> Copiar Código Pix</button>
              <button onClick={() => setPixCode(null)} className="w-full text-slate-400 font-medium py-2">Fechar</button>
            </motion.div>
          </div>
        )}

        {/* Boleto Modal */}
        {boletoCode && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-sm text-center space-y-6">
              <h3 className="text-xl font-bold text-premium-navy">Boleto Bancário</h3>
              <div className="bg-slate-100 p-6 rounded-2xl break-all font-mono text-sm text-slate-700">{boletoCode}</div>
              <p className="text-slate-500 text-sm">Copie a linha digitável acima para pagar no seu banco ou lotérica.</p>
              <button onClick={() => copyToClipboard(boletoCode)} className="w-full bg-slate-900 text-white py-4 rounded-xl flex items-center justify-center gap-2 font-bold"><Copy size={18} /> Copiar Linha Digitável</button>
              <button onClick={() => setBoletoCode(null)} className="w-full text-slate-400 font-medium py-2">Fechar</button>
            </motion.div>
          </div>
        )}
        {/* Toast Message */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 50, x: '-50%' }}
              className="fixed bottom-10 left-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-2 font-bold text-sm"
            >
              <CheckCircle size={18} className="text-emerald-400" />
              Copiado com sucesso!
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
