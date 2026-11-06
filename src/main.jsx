import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useStore } from './lib/store'
import { importFiles } from './lib/importer'
import { pedsFromGta, mergeItemTextures, embeddedTextures, addCustomPed, importCustomPedClothes, importAddonForPed, loadCustomPeds } from './lib/desktop'
import { planExport, exportResource, buildProjectData, openProject } from './lib/exporter'

// Bara i utvecklingsläge: gör det möjligt att styra appen från automatiska tester.
if (import.meta.env.DEV) window.__alex = { useStore, importFiles, pedsFromGta, mergeItemTextures, embeddedTextures, planExport, exportResource, addCustomPed, importCustomPedClothes, importAddonForPed, loadCustomPeds, buildProjectData, openProject }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
