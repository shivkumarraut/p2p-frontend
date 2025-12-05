import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Header from './components/Header.jsx'
import Home from './Home.jsx'
import DownloadPage from "./pages/DownloadPage";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>

      <Header/>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:alias" element={<DownloadPage />} />
      </Routes>

    </BrowserRouter>
  </StrictMode>
)
