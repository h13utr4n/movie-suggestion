import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import MovieDetail from './MovieDetail.jsx'
import ActivateAccount from './ActivateAccount.jsx'
import AdminPanel from './AdminPanel.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/movie/:imdbID" element={<MovieDetail />} />
        <Route path="/activate" element={<ActivateAccount />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>,
  // </React.StrictMode>,
)
