import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

import './styles/theme.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/auth.css';
import './styles/kiosk.css';
import './styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
