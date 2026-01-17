import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

// Log platform for debugging
console.log('Platform:', Capacitor.getPlatform());
console.log('Is native:', Capacitor.isNativePlatform());

// Render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
