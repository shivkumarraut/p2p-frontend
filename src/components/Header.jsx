import { useState } from "react";
import logo from "../assets/download.png";
import "../styles/Header.css";
import "../styles/global.css";

function Header({ onModeChange }) {
  const [mode, setMode] = useState("local");

  const toggleMode = () => {
    const newMode = mode === "local" ? "cloud" : "local";
    setMode(newMode);
    onModeChange(newMode);
  };

  return (
    <header className="app-header">
      {/* LEFT: LOGO */}
      <div className="header-left">
        <img src={logo} alt="logo" className="header-logo" />
        <h1 className="header-title">Quick-Share</h1>
      </div>

      {/* CENTER NAV 
      <nav className="header-nav">
        <a href="#">Send</a>
        <a href="#">Receive</a>
        <a href="#">History</a>
      </nav>*/}

      {/* RIGHT: MODE SWITCH */}
      <div className="header-right">
        <button className="mode-toggle" onClick={toggleMode}>
          {mode === "local" ? "Local Mode" : "Cloud Mode"}
        </button>
      </div>
    </header>
  );
}

export default Header;
