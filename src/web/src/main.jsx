import React from 'react'
import { createRoot } from 'react-dom/client'

// If you want to use App.jsx:
import App from './App.jsx'

// If you prefer App.js, change the import above to:
// import App from './App.js'

import './styles.css'

createRoot(document.getElementById('root')).render(<App />)
