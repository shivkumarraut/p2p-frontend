import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import Header from './components/Header.jsx'
import Home from './Home.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Header/>
    <Home/>
  </StrictMode>,
)
