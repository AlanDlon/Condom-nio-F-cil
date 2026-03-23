import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import Login from './components/Login';
import Register from './components/Register';
import ResidentDashboard from './components/ResidentDashboard';
import AdminDashboard from './components/AdminDashboard';

type View = 'login' | 'register' | 'resident' | 'admin';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default function App() {
  const [view, setView] = useState<View>('login');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'resident' | 'admin' | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user && user.emailVerified) {
        const userPath = `users/${user.uid}`;
        try {
          let userDoc = await getDoc(doc(db, 'users', user.uid));
          
          // If user doc doesn't exist, check if they were pre-registered as admin
          if (!userDoc.exists() && user.email) {
            const preRegDoc = await getDoc(doc(db, 'users', user.email));
            
            if (preRegDoc.exists() && preRegDoc.data().role === 'admin') {
              const adminData = preRegDoc.data();
              // Claim the account: create new doc with UID and delete pre-reg doc
              await setDoc(doc(db, 'users', user.uid), {
                ...adminData,
                id: user.uid,
                emailVerified: true
              });
              await deleteDoc(doc(db, 'users', user.email));
              userDoc = await getDoc(doc(db, 'users', user.uid));
            }
          }

          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role as 'resident' | 'admin');
            setView(userData.role as View);
          } else {
            setView('login');
          }
        } catch (err) {
          // Only handle error if we are still logged in
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, userPath);
          }
          setView('login');
        }
      } else {
        setView('login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (role: 'resident' | 'admin') => {
    setUserRole(role);
    setView(role);
  };

  const handleLogout = async () => {
    setView('login');
    setCurrentUser(null);
    setUserRole(null);
    await signOut(auth);
  };

  const goToRegister = () => {
    setView('register');
  };

  const goToLogin = () => {
    setView('login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-premium-navy">
        <div className="w-12 h-12 border-4 border-premium-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      {view === 'login' && <Login onLogin={handleLogin} onGoToRegister={goToRegister} />}
      {view === 'register' && <Register onBack={goToLogin} />}
      {view === 'resident' && currentUser && (
        <ResidentDashboard 
          onLogout={handleLogout} 
          user={currentUser} 
          onSwitchToAdmin={userRole === 'admin' ? () => setView('admin') : undefined}
        />
      )}
      {view === 'admin' && currentUser && (
        <AdminDashboard 
          onLogout={handleLogout} 
          user={currentUser} 
          onSwitchToResident={() => setView('resident')}
        />
      )}
    </div>
  );
}
