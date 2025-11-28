import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Chat from './pages/Chat';
import AdminLayout from './pages/Admin/AdminLayout';
import Dashboard from './pages/Admin/Dashboard';
import OAuth from './pages/Admin/OAuth';
import UserManagement from './pages/Admin/UserManagement';
import './App.css';
import ChatMessage from './components/ChatMessage';
import { sendMessage } from './services/api';

function App() {
  return (
    <Routes>
      {/* Chat page - main interface */}
      <Route path="/" element={<Chat />} />

      {/* Admin section with nested routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="oauth" element={<OAuth />} />
        <Route path="users" element={<UserManagement />} />
        {/* Add more admin routes here as needed */}
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
