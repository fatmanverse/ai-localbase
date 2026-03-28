import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ServiceDeskDemoPage from './pages/ServiceDeskDemoPage.tsx'
import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const mode = searchParams.get('mode')
const RootComponent = mode === 'service-desk-demo' ? ServiceDeskDemoPage : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
