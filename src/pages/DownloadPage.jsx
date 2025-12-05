import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "../supabase";

export default function DownloadPage() {
  const { alias } = useParams();

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from("links")
        .select("url")
        .eq("alias", alias)
        .single();

      if (!data) {
        document.body.innerHTML = "<h2>404 — File not found</h2>";
        return;
      }

      window.location.href = data.url;
    };

    run();
  }, [alias]);

  return <h2 style={{ color: "#fff" }}>Preparing download...</h2>;
}
