import { Invoice } from '../types';
import { motion } from 'motion/react';
import { ChevronLeft, CheckCircle, Calendar, DollarSign, FileText, Clock, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';

interface PaymentHistoryProps {
  invoices: Invoice[];
  onBack: () => void;
}

export default function PaymentHistory({ invoices, onBack }: PaymentHistoryProps) {
  const paidInvoices = invoices
    .filter(inv => inv.status === 'paid')
    .sort((a, b) => {
      const dateA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
      const dateB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
      return dateB - dateA;
    });

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(26, 35, 126); // premium-navy
    doc.text('Histórico de Pagamentos', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

    const tableColumn = ["Descrição", "Vencimento", "Data Pagamento", "Valor Pago (R$)"];
    const tableRows = paidInvoices.map(invoice => [
      invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra'),
      format(parseISO(invoice.dueDate), 'dd/MM/yyyy'),
      invoice.paymentDate ? format(parseISO(invoice.paymentDate), 'dd/MM/yyyy') : '-',
      (invoice.amountPaid || invoice.amount).toFixed(2)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 40 },
    });

    doc.save(`historico-pagamentos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-premium-navy text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold">Histórico de Pagamentos</h1>
          </div>
          
          {paidInvoices.length > 0 && (
            <button 
              onClick={exportToPDF}
              className="flex items-center gap-2 bg-premium-gold text-white px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-opacity-90 transition-all text-sm"
            >
              <Download size={18} />
              Exportar PDF
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {paidInvoices.length > 0 ? (
          <div className="space-y-4">
            {paidInvoices.map((invoice) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={invoice.id}
                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800">
                        {invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra')}
                      </span>
                      {invoice.type === 'extra' && (
                        <span className="bg-premium-gold/10 text-premium-gold text-[10px] font-bold px-2 py-0.5 rounded uppercase">Extra</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 text-sm">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} /> Pago em: {invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleDateString('pt-BR') : '-'}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={14} /> Vencimento: {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right w-full md:w-auto">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Valor Pago</p>
                  <p className="text-xl font-bold text-emerald-600 flex items-center justify-end gap-1">
                    <DollarSign size={18} />
                    {invoice.amountPaid ? invoice.amountPaid.toFixed(2) : invoice.amount.toFixed(2)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <Clock size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-premium-navy">Nenhum pagamento encontrado</h3>
              <p className="text-slate-500">Seu histórico de pagamentos aparecerá aqui assim que as faturas forem liquidadas.</p>
            </div>
            <button 
              onClick={onBack}
              className="text-premium-gold font-bold hover:underline"
            >
              Voltar ao Início
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
