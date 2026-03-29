import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ServiceDeskDemoPage from './pages/ServiceDeskDemoPage.tsx'
import ServiceDeskEmbedPage from './pages/ServiceDeskEmbedPage.tsx'
import OperationsConsolePage from './pages/OperationsConsolePage.tsx'
import ChatOnlyPage from './pages/ChatOnlyPage.tsx'
import { CHAT_ONLY_ROUTE_SEGMENTS, readPathSegments } from './pages/serviceDeskPageParams.ts'
import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const mode = searchParams.get('mode')?.trim().toLowerCase() ?? ''
const embedFlag = searchParams.get('embed')?.trim().toLowerCase() ?? ''
const pathSegments = readPathSegments(window.location.pathname).map((segment) => segment.toLowerCase())
const routeSegment = pathSegments.find((segment) =>
  segment === 'embed' || segment === 'ops' || (CHAT_ONLY_ROUTE_SEGMENTS as readonly string[]).includes(segment),
)
const isEmbedPath = routeSegment === 'embed'
const isOpsPath = routeSegment === 'ops'
const isChatOnlyPath = !!routeSegment && (CHAT_ONLY_ROUTE_SEGMENTS as readonly string[]).includes(routeSegment)

const isEmbedMode = [
  'service-desk-embed',
  'widget-embed',
  'embed',
].includes(mode) || ['1', 'true', 'yes', 'on'].includes(embedFlag) || isEmbedPath

const isOpsMode = ['ops', 'ops-console', 'analytics-console'].includes(mode) || isOpsPath
const isChatOnlyMode = ['chat-only', 'ask-only', 'qa-only'].includes(mode)

const RootComponent = mode === 'service-desk-demo'
  ? ServiceDeskDemoPage
  : isOpsMode
    ? OperationsConsolePage
    : isChatOnlyMode || isChatOnlyPath
      ? ChatOnlyPage
      : isEmbedMode
        ? ServiceDeskEmbedPage
        : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
