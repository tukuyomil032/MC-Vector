import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AdvancedSettingsWindow from './renderer/components/properties/AdvancedSettingsWindow'
import './main.css'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (window.location.hash === '#settings') {
  root.render(
    <React.StrictMode>
      <AdvancedSettingsWindow />
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}