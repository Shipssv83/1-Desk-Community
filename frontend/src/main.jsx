import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Sync theme before first render — prevents flash
const _t = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', _t);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
