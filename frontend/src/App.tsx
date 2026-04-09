import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import HomePage from './HomePage'
import LoginPage from './LoginPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
