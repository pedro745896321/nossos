
export interface User {
  id: string;
  name: string;
  avatar: string;
  income: number; 
}

export type TransactionType = 'expense' | 'revenue';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  spenderId: string; 
  emoji: string;
  type: TransactionType;
  isPaid?: boolean;
  isFixed?: boolean;
  paidMonths?: string[];
  isDeleted?: boolean;
  recurringGroupId?: string; 
  installments?: {
    current: number;
    total: number;
  };
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  imageUrl: string;
  purchaseUrl?: string;
  color: string;
  isDeleted?: boolean;
}

export interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  isDeleted?: boolean;
}

// Added ChatMessage interface to resolve import error in components/AiMediator.tsx
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
