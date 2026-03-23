import React, { useState } from 'react';
import { UserPlus, Mail, Lock, User, Home, CreditCard, ArrowLeft, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

interface RegisterProps {
  onBack: () => void;
}

export default function Register({ onBack }: RegisterProps) {
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    email: '',
    cpf: '',
    houseNumber: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (formData.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      // Create user document in Firestore
      const userPath = `users/${user.uid}`;
      try {
        await setDoc(doc(db, 'users', user.uid), {
          id: user.uid,
          name: formData.name,
          nickname: formData.nickname,
          email: formData.email,
          cpf: formData.cpf,
          houseNumber: formData.houseNumber,
          role: 'resident',
          createdAt: new Date().toISOString()
        });

        // Generate initial invoice of R$ 50.00
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 10); // Due in 10 days

        await addDoc(collection(db, 'invoices'), {
          id: Math.random().toString(36).substr(2, 9),
          userId: user.uid,
          amount: 50.00,
          dueDate: dueDate.toISOString(),
          status: 'pending',
          createdAt: serverTimestamp(),
          pixCode: '00020126330014BR.GOV.BCB.PIX011112345678901520400005303986540550.005802BR5915CondominioFacil6009SAO PAULO62070503***6304E1D1'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }

      setSuccess(true);
    } catch (err: any) {
      console.error("Erro no cadastro:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError(
          <div className="flex flex-col gap-2">
            <span>Este e-mail já está em uso por outra conta.</span>
            <button 
              onClick={() => window.location.href = '/login'}
              className="text-sm font-bold underline text-rose-700 text-left"
            >
              Já possui uma conta? Clique aqui para entrar.
            </button>
          </div>
        );
      } else if (err.code === 'auth/operation-not-allowed') {
        setError(
          <span>
            O cadastro por e-mail ainda não foi habilitado no Console do Firebase. 
            <a 
              href="https://console.firebase.google.com/project/gen-lang-client-0617354751/authentication/providers" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block mt-2 underline font-bold text-rose-700"
            >
              Clique aqui para habilitar "Email/Password" em Authentication &gt; Sign-in method.
            </a>
          </span>
        );
      } else {
        setError('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-premium-navy p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="text-emerald-600 w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-premium-navy mb-4">Verifique seu E-mail</h2>
          <p className="text-slate-600 mb-8">
            Enviamos um link de confirmação para <strong>{formData.email}</strong>. 
            Por favor, verifique sua caixa de entrada para ativar sua conta.
          </p>
          <button 
            onClick={onBack}
            className="w-full bg-premium-navy text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all"
          >
            Voltar para o Login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-premium-navy p-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border-t-4 border-premium-gold"
      >
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-premium-navy transition-colors mb-6 text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Voltar para o Login
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-premium-gold rounded-full flex items-center justify-center mb-4 shadow-lg">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-premium-navy tracking-tight">Criar Conta</h1>
          <p className="text-slate-500 text-sm">Cadastre-se no Condomínio Fácil</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm font-medium border border-rose-100 flex flex-col gap-2">
              <p>{error}</p>
              {error.includes('já está em uso') && (
                <button 
                  type="button"
                  onClick={onBack}
                  className="text-premium-gold hover:underline text-left font-bold"
                >
                  Ir para Login
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                  placeholder="Seu nome"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Apelido</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                  placeholder="Como te chamam"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CPF</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                  placeholder="000.000.000-00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
              <div className="relative">
                <Home className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.houseNumber}
                  onChange={(e) => setFormData({...formData, houseNumber: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                  placeholder="Ex: 101-A"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold outline-none text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-premium-navy text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus size={20} />
                Criar Minha Conta
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
