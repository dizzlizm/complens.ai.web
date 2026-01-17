import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Apps from './pages/Apps';
import Chat from './pages/Chat';
import Settings from './pages/Settings';

function App() {
  return (
    <Authenticator
      signUpAttributes={['email']}
      components={{
        Header() {
          return (
            <div className="text-center py-6">
              <h1 className="text-2xl font-bold text-brand-600">Complens</h1>
              <p className="text-gray-500 text-sm mt-1">Your digital privacy dashboard</p>
            </div>
          );
        }
      }}
    >
      {({ signOut, user }) => (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout user={user} signOut={signOut} />}>
              <Route index element={<Dashboard />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="apps" element={<Apps />} />
              <Route path="chat" element={<Chat />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="/callback" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}

export default App;
