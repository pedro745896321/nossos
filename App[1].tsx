
import React, { useState, useEffect } from 'react';
import { USERS, MOCK_TRANSACTIONS, MOCK_GOALS, CATEGORIES } from './constants';
import { Transaction, User, Goal, ShoppingItem } from './types';
import { Home } from './components/Home';
import { Dashboard } from './components/Dashboard';
import { Goals } from './components/Goals';
import { BudgetSettings } from './components/BudgetSettings'; 
import { ShoppingList } from './components/ShoppingList';
import { Analytics } from './components/Analytics';
import { AddTransactionModal } from './components/AddTransactionModal';
import { ConfirmationModal } from './components/ui/ConfirmationModal';
import { Login } from './components/Login';
import { auth, syncData, listenToData, listenToFirestoreTransactions, updateFirestoreTransaction, deleteFirestoreTransaction, firestore } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { 
  Target, 
  Plus, 
  Settings, 
  ShoppingCart, 
  LogOut, 
  Heart,
  Loader2,
  TrendingUp,
  Home as HomeIcon,
  ListOrdered
} from 'lucide-react';

type Tab = 'home' | 'dashboard' | 'analytics' | 'goals' | 'budget' | 'shopping';
type Theme = 'dark' | 'light';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('nc_theme') as Theme) || 'dark');
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [users, setUsers] = useState<{ A: User; B: User }>(USERS);
  const [familyName, setFamilyName] = useState('Nossa Família');
  const [alertThreshold, setAlertThreshold] = useState(15);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const unsubGoals = listenToData('goals', (data) => data && setGoals(data));
    const unsubShopping = listenToData('shoppingItems', (data) => data && setShoppingItems(data));
    const unsubUsers = listenToData('users', (data) => data && setUsers(data));
    const unsubFamily = listenToData('familyName', (data) => data && setFamilyName(data));
    const unsubThreshold = listenToData('alertThreshold', (data) => data && setAlertThreshold(data));

    const unsubFirestore = listenToFirestoreTransactions((data: any[]) => {
      const mappedTransactions: Transaction[] = data.map(item => {
        let formattedDate = item.data;
        if (formattedDate && formattedDate.includes('-') && formattedDate.split('-').length === 3) {
           const [y, m, d] = formattedDate.split('-');
           formattedDate = `${d}/${m}/${y}`;
        }

        return {
          id: item.id,
          title: item.descricao || 'Sem título',
          amount: Number(item.valor) || 0,
          category: item.categoria || 'Geral',
          date: formattedDate || new Date().toLocaleDateString('pt-BR'),
          spenderId: item.userId || 'unknown',
          emoji: item.emoji || (item.tipo === 'despesa' ? '💸' : '💰'),
          type: item.tipo === 'despesa' ? 'expense' : 'revenue',
          isPaid: item.pago ?? false,
          isFixed: item.isFixed ?? false,
          paidMonths: item.paidMonths || [],
          installments: item.installments || undefined
        };
      });
      setTransactions(mappedTransactions);
    });

    return () => {
      unsubGoals?.(); unsubShopping?.(); unsubUsers?.(); unsubFamily?.(); 
      unsubThreshold?.(); unsubFirestore?.();
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('nc_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleSaveGoal = async (goal: Goal) => {
    setIsSyncing(true);
    const existing = goals.find(g => g.id === goal.id);
    let updatedGoals;
    if (existing) {
      updatedGoals = goals.map(g => g.id === goal.id ? goal : g);
    } else {
      updatedGoals = [...goals, goal];
    }
    setGoals(updatedGoals);
    await syncData('goals', updatedGoals);
    setIsSyncing(false);
  };

  const handleUpdateGoalProgress = async (goalId: string, amountToAdd: number) => {
    setIsSyncing(true);
    const updated = goals.map(g => {
      if (g.id === goalId) {
        return { ...g, currentAmount: g.currentAmount + amountToAdd };
      }
      return g;
    });
    setGoals(updated);
    await syncData('goals', updated);
    setIsSyncing(false);
  };

  const handleDeleteGoal = async (goalId: string) => {
    setIsSyncing(true);
    const updated = goals.filter(g => g.id !== goalId);
    setGoals(updated);
    await syncData('goals', updated);
    setIsSyncing(false);
  };

  const handleTogglePaid = async (id: string, targetMonth?: string) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    if (tx.isFixed && targetMonth) {
      const currentPaidMonths = tx.paidMonths || [];
      const updatedMonths = currentPaidMonths.includes(targetMonth)
        ? currentPaidMonths.filter(m => m !== targetMonth)
        : [...currentPaidMonths, targetMonth];
      
      await updateFirestoreTransaction(id, { paidMonths: updatedMonths });
    } else {
      await updateFirestoreTransaction(id, { pago: !tx.isPaid });
    }
  };

  const handleAddOrUpdateTransaction = async (tx: Transaction) => {
    setIsSyncing(true);
    try {
      const [d, m, y] = tx.date.split('/');
      const isoDate = `${y}-${m}-${d}`;

      const payload = {
        descricao: tx.title,
        valor: tx.amount,
        categoria: tx.category,
        data: isoDate,
        userId: tx.spenderId,
        emoji: tx.emoji,
        tipo: tx.type === 'expense' ? 'despesa' : 'receita',
        pago: tx.isPaid,
        isFixed: tx.isFixed,
        paidMonths: tx.paidMonths || [],
        installments: tx.installments || null
      };

      if (editingTransaction) {
        await updateFirestoreTransaction(editingTransaction.id, payload);
      } else {
        await addDoc(collection(firestore, "transacoes"), payload);
      }
      setIsAddModalOpen(false);
      setEditingTransaction(null);
    } catch (e) {
      console.error("Erro ao salvar transação:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Lançamento?',
      message: 'Esta ação removerá o registro permanentemente do banco de dados.',
      variant: 'danger',
      onConfirm: async () => {
        await deleteFirestoreTransaction(id);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const triggerSync = async (path: string, data: any) => {
    setIsSyncing(true);
    await syncData(path, data);
    setTimeout(() => setIsSyncing(false), 1000);
  };

  const forceFullSync = async (overrideUsers?: { A: User; B: User }, overrideFamilyName?: string, overrideThreshold?: number) => {
    setIsSyncing(true);
    try {
      await Promise.all([
        syncData('goals', goals),
        syncData('shoppingItems', shoppingItems),
        syncData('users', overrideUsers || users),
        syncData('familyName', overrideFamilyName || familyName),
        syncData('alertThreshold', overrideThreshold || alertThreshold)
      ]);
    } catch (e) {
      console.error("[App] Erro na sincronização", e);
    }
    setTimeout(() => setIsSyncing(false), 1000);
  };

  if (authLoading) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><Loader2 className="text-primary animate-spin" size={48} /></div>;
  if (!user) return <Login onLoginSuccess={() => {}} />;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-200 flex flex-col md:flex-row transition-colors duration-300">
      
      {/* Indicador de Conectividade Local */}
      <div className="fixed top-[calc(env(safe-area-inset-top)+10px)] right-4 md:right-6 z-[100] flex items-center space-x-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 shadow-xl">
        {isSyncing ? (
          <><Loader2 size={10} className="text-primary animate-spin" /><span className="text-[7px] font-black text-neutral-500 uppercase tracking-widest">Sinc</span></>
        ) : (
          <><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /><span className="text-[7px] font-black text-neutral-400 uppercase tracking-widest">On</span></>
        )}
      </div>

      {/* Navegação Lateral (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 bg-white dark:bg-neutral-900/50 border-r border-neutral-200 dark:border-neutral-800 sticky top-0 h-screen p-8 z-50">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-neutral-950 shadow-glow"><Heart size={20} strokeWidth={3} /></div>
            <div>
              <h1 className="text-lg font-display font-bold text-neutral-900 dark:text-white tracking-tight leading-none">Nossa Carteira</h1>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest truncate mt-1">{familyName}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-2">
          <SidebarItem icon={<HomeIcon />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <SidebarItem icon={<ListOrdered />} label="Extrato" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={<TrendingUp />} label="Análises" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
          <SidebarItem icon={<Target />} label="Metas" active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} />
          <SidebarItem icon={<ShoppingCart />} label="Compras" active={activeTab === 'shopping'} onClick={() => setActiveTab('shopping')} />
          <SidebarItem icon={<Settings />} label="Ajustes" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
        </nav>
        <div className="mt-auto pt-8 border-t border-neutral-200 dark:border-neutral-800">
          <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between p-2 hover:bg-red-500/10 rounded-2xl transition-all text-neutral-500 hover:text-red-500">
            <span className="text-[10px] font-black uppercase tracking-widest ml-2">Sair</span><LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 md:px-12 md:py-16 pb-36 md:pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        {activeTab === 'home' && (
          <Home 
            transactions={transactions}
            goals={goals}
            users={users}
            familyName={familyName}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard 
            transactions={transactions} 
            totalIncome={users.A.income + users.B.income} 
            currentDate={currentDate}
            users={users}
            alertThreshold={alertThreshold}
            onMonthChange={(dir) => {
              const nd = new Date(currentDate);
              nd.setMonth(nd.getMonth() + (dir === 'next' ? 1 : -1));
              setCurrentDate(nd);
            }}
            onDelete={handleDeleteTransaction}
            onTogglePaid={handleTogglePaid}
            onEdit={(tx) => { setEditingTransaction(tx); setIsAddModalOpen(true); }}
            onClearAll={() => {}}
            onOpenShopping={() => setActiveTab('shopping')}
            onOpenAddModal={() => { setEditingTransaction(null); setIsAddModalOpen(true); }}
          />
        )}
        {activeTab === 'analytics' && (
          <Analytics 
            transactions={transactions}
            baseIncome={users.A.income + users.B.income}
            currentDate={currentDate}
            onMonthChange={(dir) => {
              const nd = new Date(currentDate);
              nd.setMonth(nd.getMonth() + (dir === 'next' ? 1 : -1));
              setCurrentDate(nd);
            }}
          />
        )}
        {activeTab === 'goals' && (
          <Goals 
            goals={goals} 
            onUpdateGoal={handleUpdateGoalProgress} 
            onSaveGoal={handleSaveGoal} 
            onDeleteGoal={handleDeleteGoal} 
          />
        )}
        {activeTab === 'shopping' && <ShoppingList items={shoppingItems} onAdd={() => {}} onToggle={() => {}} onDelete={() => {}} />}
        {activeTab === 'budget' && (
          <BudgetSettings 
            users={users} familyName={familyName} alertThreshold={alertThreshold} 
            onUpdateUser={(uid, data) => {
              const key = uid === users.A.id ? 'A' : 'B';
              const updated = { ...users, [key]: { ...users[key], ...data } };
              setUsers(updated);
              triggerSync('users', updated);
            }} 
            onUpdateFamilySettings={(name, threshold) => {
              setFamilyName(name); setAlertThreshold(threshold);
              triggerSync('familyName', name); triggerSync('alertThreshold', threshold);
            }}
            currentTheme={theme} onThemeToggle={setTheme} onLogout={() => signOut(auth)}
            onForceSync={forceFullSync}
            isSyncing={isSyncing}
          />
        )}
      </main>

      {/* Navegação Inferior (Mobile) */}
      <nav className="md:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-4 right-4 h-16 bg-white/80 dark:bg-neutral-900/90 backdrop-blur-2xl border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] flex justify-around items-center z-[100] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] px-2 transition-all">
         <MobileNavItem icon={<HomeIcon />} active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
         <MobileNavItem icon={<ListOrdered />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
         
         <button 
           onClick={() => { setEditingTransaction(null); setIsAddModalOpen(true); }}
           className="w-14 h-14 bg-primary rounded-[1.8rem] flex items-center justify-center text-neutral-950 shadow-glow -translate-y-5 active:scale-90 transition-all border-[6px] border-neutral-50 dark:border-neutral-950"
         >
           <Plus size={28} strokeWidth={3} />
         </button>

         <MobileNavItem icon={<TrendingUp />} active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
         <MobileNavItem icon={<Settings />} active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
      </nav>

      <AddTransactionModal 
        isOpen={isAddModalOpen} 
        users={users} 
        initialDate={currentDate} 
        onClose={() => { setIsAddModalOpen(false); setEditingTransaction(null); }} 
        onAdd={handleAddOrUpdateTransaction} 
        editingTransaction={editingTransaction} 
      />
      <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} variant={confirmModal.variant} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} />
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-4 px-4 py-3.5 rounded-2xl transition-all duration-200 group ${active ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 dark:hover:text-white'}`}>
    <div className={active ? 'text-primary' : 'text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-400'}>{React.cloneElement(icon, { size: 18, strokeWidth: active ? 2.5 : 2 })}</div>
    <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
  </button>
);

const MobileNavItem = ({ icon, active, onClick }: any) => (
  <button onClick={onClick} className={`p-4 rounded-2xl transition-all ${active ? 'text-primary' : 'text-neutral-400 opacity-60'}`}>
    {React.cloneElement(icon, { size: 22, strokeWidth: active ? 3.5 : 2 })}
  </button>
);

export default App;
