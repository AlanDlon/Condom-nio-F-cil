export interface User {
  id: string;
  name: string;
  nickname: string;
  cpf: string;
  email: string;
  houseNumber: string;
  role: 'resident' | 'admin';
  bankAccount?: {
    bank: string;
    agency: string;
    account: string;
    type: 'checking' | 'savings';
    automaticDebit: boolean;
  };
}

export interface Unit {
  id: string;
  block: string;
  apartment: string;
  residentId: string;
}

export interface Invoice {
  id: string;
  userId: string;
  amount: number;
  amountPaid?: number;
  dueDate: string;
  paymentDate?: string;
  status: 'paid' | 'pending' | 'overdue';
  pixCode?: string;
  boletoCode?: string;
  description?: string;
  type?: 'monthly' | 'extra';
  createdAt?: any;
}

export interface Expense {
  docId: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  createdAt: any;
}
