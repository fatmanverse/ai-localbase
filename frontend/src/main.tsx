import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ServiceDeskDemoPage from './pages/ServiceDeskDemoPage.tsx'
import ServiceDeskEmbedPage from './pages/ServiceDeskEmbedPage.tsx'
import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const mode = searchParams.get('mode')?.trim().toLowerCase() ?? ''
const embedFlag = searchParams.get('embed')?.trim().toLowerCase() ?? ''
const pathSegments = window.location.pathname
  .split('/')
  .map((segment) => segment.trim().toLowerCase())
  .filter(Boolean)
const isEmbedPath = pathSegments.includes('embed')

const isEmbedMode = [
  'service-desk-embed',
  'widget-embed',
  'embed',
].includes(mode) || ['1', 'true', 'yes', 'on'].includes(embedFlag) || isEmbedPath

const RootComponent = mode === 'service-desk-demo'
  ? ServiceDeskDemoPage
  : isEmbedMode
    ? ServiceDeskEmbedPage
    : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
