import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './stores/appStore';

import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Apps from './pages/Apps';
import Settings from './pages/Settings';
import { LoadingScreen } from './components/ui';

function App() {
  const { isAuthenticated, isLoading, init } = useAppStore();

  useEffect(() => {
    init();
  }, [init]);

  // Show loading screen while initializing
  if (isLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Authenticated - show main app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="apps" element={<Apps />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
