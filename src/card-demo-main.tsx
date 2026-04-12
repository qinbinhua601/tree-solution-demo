import React from 'react';
import ReactDOM from 'react-dom/client';
import { CardDemoApp } from './CardDemoApp';
import './card-demo.css';
import './mock/server';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CardDemoApp />
  </React.StrictMode>,
);
