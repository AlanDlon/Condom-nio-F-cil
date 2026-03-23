import React, { useState } from 'react';
import { LogIn, ShieldCheck, Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { signInWithEmailAndPassword, sendEmailVerification, GoogleAuthProvider, signInWithPopup, OAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface LoginProps {
  onLogin: (role: 'resident' | 'admin') => void;
  onGoToRegister: () => void;
}

export default function Login({ onLogin, onGoToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loginType, setLoginType] = useState<'resident' | 'admin'>('resident');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setNeedsVerification(false);
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setNeedsVerification(true);
        setLoading(false);
        setError('Seu e-mail ainda não foi verificado. Verifique sua caixa de entrada.');
        return;
      }

      // Fetch user role from Firestore
      const userPath = `users/${user.uid}`;
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const userRole = userData.role as 'resident' | 'admin';
          
          if (userRole !== loginType) {
            setError(`Esta conta não tem permissão para entrar como ${loginType === 'admin' ? 'Administrador' : 'Morador'}.`);
            setLoading(false);
            return;
          }

          // Sync email verification status to Firestore
          const { updateDoc } = await import('firebase/firestore');
          await updateDoc(doc(db, 'users', user.uid), {
            emailVerified: user.emailVerified
          });
          
          onLogin(userRole);
        } else {
          // If user exists in Auth but not in Firestore (shouldn't happen with correct flow)
          setError('Perfil de usuário não encontrado.');
          setLoading(false);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    } catch (err: any) {
      setLoading(false);
      if (err.code === 'auth/operation-not-allowed') {
        console.error("Erro no login (configuração):", err);
        setError(
          <span>
            O login por e-mail e senha ainda não foi habilitado no Console do Firebase. 
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
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        // Don't log technical error for simple wrong credentials
        setError('E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Muitas tentativas de login sem sucesso. Sua conta foi temporariamente bloqueada por segurança. Tente novamente mais tarde.');
      } else {
        console.error("Erro no login:", err);
        setError('Ocorreu um erro ao tentar entrar. Por favor, tente novamente.');
      }
    }
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        alert('E-mail de verificação reenviado!');
      } catch (err) {
        alert('Erro ao reenviar e-mail.');
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, insira seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('E-mail de recuperação enviado! Verifique sua caixa de entrada para redefinir sua senha com segurança.');
    } catch (err: any) {
      console.error("Erro ao recuperar senha:", err);
      if (err.code === 'auth/user-not-found') {
        setError('Não encontramos nenhuma conta com este e-mail.');
      } else if (err.code === 'auth/invalid-email') {
        setError('O e-mail digitado é inválido.');
      } else {
        setError('Ocorreu um erro ao enviar o e-mail de recuperação. Verifique sua conexão e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userRole = userData.role as 'resident' | 'admin';
        
        if (userRole !== loginType) {
          setError(`Esta conta não tem permissão para entrar como ${loginType === 'admin' ? 'Administrador' : 'Morador'}.`);
          setLoading(false);
          return;
        }
        
        onLogin(userRole);
      } else {
        // Check if user exists by email (admin might have pre-registered them)
        const { collection, query, where, getDocs, updateDoc } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), where('email', '==', user.email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const oldDocRef = querySnapshot.docs[0].ref;
          const userData = querySnapshot.docs[0].data();
          
          // Create new document with UID as ID
          const { setDoc, deleteDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'users', user.uid), {
            ...userData,
            id: user.uid
          });
          
          // Delete old document
          await deleteDoc(oldDocRef);
          
          onLogin(userData.role as 'resident' | 'admin');
        } else {
          // Auto-register as resident if not found
          const { setDoc, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
          const isFirstAdmin = user.email === 'alandloon123@gmail.com';
          
          const newUser = {
            id: user.uid,
            name: user.displayName || (isFirstAdmin ? 'Admin' : 'Novo Morador'),
            nickname: user.displayName?.split(' ')[0] || (isFirstAdmin ? 'Admin' : 'Morador'),
            email: user.email,
            role: isFirstAdmin ? 'admin' : 'resident',
            houseNumber: isFirstAdmin ? 'ADM' : 'A definir',
            cpf: '000.000.000-00',
            createdAt: new Date().toISOString()
          };
          
          await setDoc(doc(db, 'users', user.uid), newUser);

          if (!isFirstAdmin) {
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
          }

          onLogin(newUser.role as 'resident' | 'admin');
        }
      }
    } catch (err: any) {
      console.error("Erro no Google Login:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError(
          <span>
            O login com Google ainda não foi habilitado no Console do Firebase. 
            <a 
              href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
              target="_blank" 
              rel="noopener noreferrer"
              className="block mt-2 underline font-bold text-rose-700"
            >
              Clique aqui para habilitar "Google" em Authentication &gt; Sign-in method.
            </a>
          </span>
        );
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(
          <span>
            Este domínio não está autorizado para login com Google. 
            <a 
              href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
              target="_blank" 
              rel="noopener noreferrer"
              className="block mt-2 underline font-bold text-rose-700"
            >
              Clique aqui para adicionar "{window.location.hostname}" aos domínios autorizados em Authentication &gt; Settings.
            </a>
          </span>
        );
      } else if (err.code === 'auth/popup-blocked') {
        setError('O popup de login foi bloqueado pelo seu navegador. Por favor, permita popups para este site e tente novamente.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Já existe uma conta com este e-mail usando um método de login diferente (ex: E-mail/Senha). Por favor, use o método original.');
      } else if (err.message?.includes('Missing or insufficient permissions')) {
        setError('Erro de permissão ao acessar seu perfil. Por favor, tente novamente ou contate o administrador.');
      } else {
        setError('Erro ao entrar com Google. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new OAuthProvider('apple.com');
      // Apple login might not return email if it's the second time or if user hides it
      // but Firebase usually handles the linking if configured
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userRole = userData.role as 'resident' | 'admin';
        
        if (userRole !== loginType) {
          setError(`Esta conta não tem permissão para entrar como ${loginType === 'admin' ? 'Administrador' : 'Morador'}.`);
          setLoading(false);
          return;
        }
        
        onLogin(userRole);
      } else {
        // Check if user exists by email
        if (user.email) {
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const q = query(collection(db, 'users'), where('email', '==', user.email));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const oldDocRef = querySnapshot.docs[0].ref;
            const userData = querySnapshot.docs[0].data();
            
            const { setDoc, deleteDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'users', user.uid), {
              ...userData,
              id: user.uid
            });
            await deleteDoc(oldDocRef);
            
            onLogin(userData.role as 'resident' | 'admin');
          } else {
            // Auto-register as resident if not found
            const { setDoc, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
            const isFirstAdmin = user.email === 'alandloon123@gmail.com';
            
            const newUser = {
              id: user.uid,
              name: user.displayName || (isFirstAdmin ? 'Admin' : 'Novo Morador'),
              nickname: user.displayName?.split(' ')[0] || (isFirstAdmin ? 'Admin' : 'Morador'),
              email: user.email,
              role: isFirstAdmin ? 'admin' : 'resident',
              houseNumber: isFirstAdmin ? 'ADM' : 'A definir',
              cpf: '000.000.000-00',
              createdAt: new Date().toISOString()
            };
            
            await setDoc(doc(db, 'users', user.uid), newUser);

            if (!isFirstAdmin) {
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
            }

            onLogin(newUser.role as 'resident' | 'admin');
          }
        } else {
          setError('Não foi possível obter seu e-mail da conta Apple. Tente outro método.');
          await auth.signOut();
        }
      }
    } catch (err: any) {
      console.error("Erro no Apple Login:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError(
          <span>
            O login com Apple ainda não foi habilitado no Console do Firebase. 
            <a 
              href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
              target="_blank" 
              rel="noopener noreferrer"
              className="block mt-2 underline font-bold text-rose-700"
            >
              Clique aqui para habilitar "Apple" em Authentication &gt; Sign-in method.
            </a>
          </span>
        );
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(
          <span>
            Este domínio não está autorizado para login com Apple. 
            <a 
              href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
              target="_blank" 
              rel="noopener noreferrer"
              className="block mt-2 underline font-bold text-rose-700"
            >
              Clique aqui para adicionar "{window.location.hostname}" aos domínios autorizados em Authentication &gt; Settings.
            </a>
          </span>
        );
      } else if (err.code === 'auth/popup-blocked') {
        setError('O popup de login foi bloqueado pelo seu navegador. Por favor, permita popups para este site e tente novamente.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Já existe uma conta com este e-mail usando um método de login diferente (ex: Google ou E-mail/Senha). Por favor, use o método original.');
      } else if (err.message?.includes('Missing or insufficient permissions')) {
        setError('Erro de permissão ao acessar seu perfil. Por favor, tente novamente ou contate o administrador.');
      } else {
        setError('Erro ao entrar com Apple. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-premium-navy p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border-t-4 border-premium-gold"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-premium-gold rounded-full flex items-center justify-center mb-4 shadow-lg">
            {loginType === 'admin' ? <ShieldCheck className="text-white w-10 h-10" /> : <LogIn className="text-white w-10 h-10" />}
          </div>
          <h1 className="text-2xl font-bold text-premium-navy tracking-tight">Condomínio Fácil</h1>
          <p className="text-slate-500 text-sm">{loginType === 'admin' ? 'Acesso Administrativo' : 'Gestão Financeira Exclusiva'}</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
          <button
            onClick={() => setLoginType('resident')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginType === 'resident' ? 'bg-white text-premium-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Morador
          </button>
          <button
            onClick={() => setLoginType('admin')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginType === 'admin' ? 'bg-premium-navy text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Administrador
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm font-medium border border-rose-100">
              {error}
              {needsVerification && (
                <button 
                  type="button"
                  onClick={resendVerification}
                  className="block mt-2 underline hover:text-rose-700"
                >
                  Reenviar e-mail de verificação
                </button>
              )}
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-sm font-medium border border-emerald-100">
              {success}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 text-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
              Google
            </button>
            <button
              type="button"
              onClick={handleAppleLogin}
              disabled={loading}
              className="bg-black text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 text-sm"
            >
              <svg viewBox="0 0 384 512" className="w-4 h-4 fill-current">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Apple
            </button>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-xs font-medium uppercase tracking-widest">ou e-mail</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold focus:border-transparent outline-none transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-premium-gold focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-premium-navy hover:bg-opacity-90 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={20} />
                Acessar Sistema
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex flex-col items-center gap-2">
          <button 
            onClick={onGoToRegister}
            className="text-premium-gold hover:text-premium-gold-light text-sm font-bold transition-colors"
          >
            Primeiro Acesso? Crie sua conta
          </button>
          <button 
            onClick={handleForgotPassword}
            className="text-slate-400 hover:text-slate-500 text-xs transition-colors"
          >
            Esqueci minha senha
          </button>
        </div>
      </motion.div>
    </div>
  );
}
