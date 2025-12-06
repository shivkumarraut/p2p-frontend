// src/pages/DownloadPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";

function DownloadPage() {
  const { alias } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Preparing download...");

  useEffect(() => {
    const fetchFile = async () => {
      if (!alias) {
        setStatus("No alias provided.");
        return;
      }

      // 1) Get Supabase DB row
      const { data, error } = await supabase
        .from("links")
        .select("url, filename")
        .eq("alias", alias)
        .single();

      if (error || !data) {
        setStatus("File not found.");
        setTimeout(() => navigate("/"), 1500);
        return;
      }

      // 2) Trigger download
      const link = document.createElement("a");
      link.href = data.url;           // <- signed URL or publicURL?download
      link.download = data.filename;  // <- ORIGINAL filename
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setStatus(`Downloading ${data.filename}...`);

      // 3) Redirect AFTER download starts
      setTimeout(() => {
        navigate("/");
      }, 1200);  // 1.2s delay is enough
    };

    fetchFile();
  }, [alias, navigate]);

  return (
    <div
      style={{
        color: "white",
        fontFamily: "sans-serif",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#fff",
        fontSize: "1rem",
      }}
    >
      {status}
    </div>
  );
}

export default DownloadPage;
