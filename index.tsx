import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';
import './index.css';
import { Buffer } from 'buffer';

// 设置 Buffer 为全局变量，供 music-metadata-browser 使用
window.Buffer = Buffer;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
