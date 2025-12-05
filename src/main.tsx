import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AdvancedSettingsWindow from './renderer/components/properties/AdvancedSettingsWindow' // 後で作ります
import './main.css' // CSSは共通で読み込みます

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

// URLのハッシュ値（#settingsなど）を見て、表示するコンポーネントを変える
// これで1つのReactアプリで複数のウィンドウデザインを使い分けられます
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