import { useState } from 'react';
import { ArrowLeft, Filter, Calendar, Search, CheckCircle, Clock, AlertTriangle, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { Invoice } from '../types';
import { isWithinInterval, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceHistoryProps {
  invoices: Invoice[];
  onBack: () => void;
}

export default function InvoiceHistory({ invoices, onBack }: InvoiceHistoryProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const filteredInvoices = invoices.filter(invoice => {
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    
    let matchesDate = true;
    if (startDate && endDate) {
      const invoiceDate = parseISO(invoice.dueDate);
      matchesDate = isWithinInterval(invoiceDate, {
        start: parseISO(startDate),
        end: parseISO(endDate)
      });
    }

    return matchesStatus && matchesDate;
  });

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(26, 35, 126); // premium-navy
    doc.text('Extrato Detalhado de Faturas', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
    
    // Filters info
    let filterText = `Filtros: Status: ${statusFilter === 'all' ? 'Todos' : statusFilter === 'paid' ? 'Pagos' : statusFilter === 'pending' ? 'Pendentes' : 'Atrasados'}`;
    if (startDate && endDate) {
      filterText += ` | Período: ${format(parseISO(startDate), 'dd/MM/yyyy')} até ${format(parseISO(endDate), 'dd/MM/yyyy')}`;
    }
    doc.text(filterText, 14, 38);

    const tableColumn = ["Descrição", "Vencimento", "Pagamento", "Valor (R$)", "Status"];
    const tableRows = filteredInvoices.map(invoice => [
      invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra'),
      format(parseISO(invoice.dueDate), 'dd/MM/yyyy'),
      invoice.paymentDate ? format(parseISO(invoice.paymentDate), 'dd/MM/yyyy') : '-',
      invoice.amount.toFixed(2),
      invoice.status === 'paid' ? 'PAGO' : invoice.status === 'pending' ? 'PENDENTE' : 'ATRASADO'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 45 },
    });

    doc.save(`extrato-faturas-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle size={12}/> PAGO</span>;
      case 'pending':
        return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Clock size={12}/> PENDENTE</span>;
      case 'overdue':
        return <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><AlertTriangle size={12}/> ATRASADO</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-white rounded-full transition-colors shadow-sm border border-slate-200"
            >
              <ArrowLeft size={20} className="text-premium-navy" />
            </button>
            <h1 className="text-2xl font-bold text-premium-navy">Extrato Detalhado</h1>
          </div>
          
          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 bg-premium-gold text-white px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-opacity-90 transition-all"
          >
            <Download size={18} />
            Exportar PDF
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Status</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-premium-gold"
              >
                <option value="all">Todos os Status</option>
                <option value="paid">Pagos</option>
                <option value="pending">Pendentes</option>
                <option value="overdue">Atrasados</option>
              </select>
            </div>
          </div>
          
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Início</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-premium-gold"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Fim</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-premium-gold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-bottom border-slate-100">
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Descrição</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Vencimento</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Valor Base</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Valor Pago</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Data Pagto</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length > 0 ? (
                  filteredInvoices.map((invoice, idx) => (
                    <motion.tr 
                      key={invoice.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{invoice.description || (invoice.type === 'monthly' ? 'Taxa Condominial' : 'Cobrança Extra')}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${invoice.type === 'extra' ? 'text-premium-gold' : 'text-slate-400'}`}>
                            {invoice.type === 'extra' ? 'Boleto Extra' : 'Mensalidade'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-slate-700">
                        {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-4 text-slate-600">
                        R$ {invoice.amount.toFixed(2)}
                      </td>
                      <td className="p-4 text-slate-900 font-bold">
                        {invoice.amountPaid ? `R$ ${invoice.amountPaid.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-4 text-slate-500 text-sm">
                        {invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(invoice.status)}
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <Search size={48} className="mx-auto mb-4 opacity-20" />
                      Nenhuma fatura encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
