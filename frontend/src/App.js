import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Chat from './pages/Chat';
import AdminLayout from './pages/Admin/AdminLayout';
import Dashboard from './pages/Admin/Dashboard';
import OAuth from './pages/Admin/OAuth';
import UserManagement from './pages/Admin/UserManagement';
import SecurityDashboard from './pages/Admin/SecurityDashboard';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      } />

      {/* Admin section with nested protected routes */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="oauth" element={<OAuth />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="security" element={<SecurityDashboard />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
