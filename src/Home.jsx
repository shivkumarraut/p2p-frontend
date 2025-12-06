// src/Home.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import "./styles/Index.css";
import "./styles/global.css";
import { socket } from "./socket";
import { generateCode } from "./utils/code";
import {
  initWebRTC,
  startWebRTC,
  sendFile,
  closeConnection,
} from "./webrtc/rtc";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { supabase } from "./supabase";



function Home() {
  const [isFlipped, setIsFlipped] = useState(false);

  const [roomCode, setRoomCode] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileProgress, setFileProgress] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);

  const [isConnected, setIsConnected] = useState(false);

  const [joinError, setJoinError] = useState("");
  const [incomingRequest, setIncomingRequest] = useState(null);

  const [toast, setToast] = useState(null);

  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);

  const [receiving, setReceiving] = useState(false);
  const [receiveProgress, setReceiveProgress] = useState(0);

  const [availableRooms, setAvailableRooms] = useState([]);

  const [showScanner, setShowScanner] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const scanCanvasRef = useRef(null);
  const scanLoopRef = useRef(null);

  // Toast helper

 const timeoutRef = useRef(null);

const showToast = useCallback((message, type = "info") => {
  setToast({ message, type });

  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }

  timeoutRef.current = setTimeout(() => {
    setToast(null);
  }, 3000);
}, []);
useEffect(() => {
  if (toast) {
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }
}, [toast]);



  // Helper: generate a simple unique-ish name suffix
  const makeDisplayName = (name) => {
    const stamp = Date.now().toString().slice(-6);
    if (!name.includes(".")) return `${name}_${stamp}`;
    const dot = name.lastIndexOf(".");
    const base = name.slice(0, dot);
    const ext = name.slice(dot);
    return `${base}_${stamp}${ext}`;
  };

  // Receive file callback from rtc.js
  const handleFileReceive = useCallback(
    ({ blob, name, type, size }) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const displayName = makeDisplayName(name || "file");

      setSharedFiles((prev) => [
        ...prev,
        {
          id,
          name: displayName,
          type,
          size,
          direction: "received",
          blob,
        },
      ]);

      showToast(`📥 Received: ${displayName}`, "success");
      setReceiving(false);
      setReceiveProgress(0);
    },
    [showToast]
  );

  const handleChannelOpen = useCallback(() => {
    setIsConnected(true);
    console.log("✅ P2P Connection Established");
    showToast("🟢 Connected! Ready to share files.", "success");
  }, [showToast]);

  const handleReceiveProgress = useCallback((p) => {
    setReceiving(p > 0);
    setReceiveProgress(p);
  }, []);

  // Generate first room code
  useEffect(() => {
    const code = generateCode();
    setRoomCode(code);
    setSessionCode(code);
  }, []);

  // Host lifecycle when roomCode changes
  useEffect(() => {
    if (!roomCode) return;

    console.log("🏠 Setting up room as host with code:", roomCode);

    socket.emit("create_room", roomCode);

    initWebRTC(
      roomCode,
      handleFileReceive,
      handleChannelOpen,
      handleReceiveProgress
    );

    const handleRoomCreated = ({ roomCode }) => {
      console.log("✅ Room created on server:", roomCode);
    };

    const handleConnectionRequest = ({ roomCode, fromSocketId }) => {
      console.log("📥 Incoming connection request from", fromSocketId);
      setIncomingRequest({ roomCode, fromSocketId });
      showToast("New connection request. Check the popup.", "info");
      setSessionCode(roomCode);
    };

    const handlePeerJoined = ({ peerId }) => {
      console.log(
        `🔥 Peer ${peerId} joined room ${roomCode} — starting WebRTC offer`
      );
      startWebRTC(roomCode);
    };

    const handleRoomInvalid = ({ roomCode }) => {
      console.log("❌ Invalid room code:", roomCode);
      setJoinError(`❌ Invalid code: ${roomCode}. Please check and try again.`);
      showToast(`Invalid code: ${roomCode}`, "error");
      setIsConnected(false);
    };

    const handleConnectionAccepted = ({ roomCode }) => {
      console.log("🔓 Connection accepted for room:", roomCode);
      showToast(
        "Connection accepted by host. Establishing secure channel…",
        "success"
      );
      setSessionCode(roomCode);
    };

    const handleConnectionRejected = ({ roomCode }) => {
      console.log("🚫 Connection rejected for room:", roomCode);
      setJoinError(`Connection to ${roomCode} was rejected by the host.`);
      showToast("Connection was rejected by the host.", "error");
      setIsConnected(false);
    };

    const handlePeerDisconnected = () => {
      console.log("👋 Peer disconnected");
      showToast("Peer disconnected. Reloading…", "info");
      closeConnection();
      // Hard reload so both sides always get a fresh code & fresh RTC state
      window.location.reload();
    };

    const handleRoomClosed = ({ roomCode }) => {
      console.log("🧹 Room closed by host:", roomCode);
      showToast("Room was closed. Reloading…", "error");
      closeConnection();
      window.location.reload();
    };

    socket.on("room_created", handleRoomCreated);
    socket.on("connection_request", handleConnectionRequest);
    socket.on("peer_joined", handlePeerJoined);
    socket.on("room_invalid", handleRoomInvalid);
    socket.on("connection_accepted", handleConnectionAccepted);
    socket.on("connection_rejected", handleConnectionRejected);
    socket.on("peer_disconnected", handlePeerDisconnected);
    socket.on("room_closed", handleRoomClosed);

    return () => {
      socket.off("room_created", handleRoomCreated);
      socket.off("connection_request", handleConnectionRequest);
      socket.off("peer_joined", handlePeerJoined);
      socket.off("room_invalid", handleRoomInvalid);
      socket.off("connection_accepted", handleConnectionAccepted);
      socket.off("connection_rejected", handleConnectionRejected);
      socket.off("peer_disconnected", handlePeerDisconnected);
      socket.off("room_closed", handleRoomClosed);
    };
  }, [
    roomCode,
    handleFileReceive,
    handleChannelOpen,
    handleReceiveProgress,
    showToast,
  ]);

  // LAN discovery
  const refreshRooms = () => {
    socket.emit("list_rooms", (rooms) => {
      const list = rooms.filter((code) => code !== roomCode);
      setAvailableRooms(list);
    });
  };

  useEffect(() => {
    refreshRooms();
    const t = setInterval(refreshRooms, 5000);
    return () => clearInterval(t);
  }, [roomCode]);

  // Guest join flow
  const joinPeerRoom = () => {
    setJoinError("");

    const trimmed = joinCode.trim();

    if (!trimmed) {
      const msg = "Please enter a code.";
      setJoinError(msg);
      showToast(msg, "error");
      return;
    }

    if (!/^\d{6}$/.test(trimmed)) {
      const msg = "Please enter a valid 6-digit code.";
      setJoinError(msg);
      showToast(msg, "error");
      return;
    }

    if (trimmed === roomCode) {
      const msg =
        "You are already hosting this code. Share it with another device instead of joining it.";
      setJoinError(msg);
      showToast(msg, "error");
      return;
    }

    initWebRTC(
      trimmed,
      handleFileReceive,
      handleChannelOpen,
      handleReceiveProgress
    );

    setSessionCode(trimmed);
    showToast(`Requesting to join room ${trimmed}…`, "info");

    socket.emit("join_room", trimmed);
  };

  const handleAcceptRequest = () => {
    if (!incomingRequest) return;
    socket.emit("answer_connection", {
      roomCode: incomingRequest.roomCode,
      targetSocketId: incomingRequest.fromSocketId,
      accepted: true,
    });
    setSessionCode(incomingRequest.roomCode);
    showToast("Connection accepted. Establishing link…", "success");
    setIncomingRequest(null);
  };

  const handleDeclineRequest = () => {
    if (!incomingRequest) return;
    socket.emit("answer_connection", {
      roomCode: incomingRequest.roomCode,
      targetSocketId: incomingRequest.fromSocketId,
      accepted: false,
    });
    showToast("Connection request declined.", "info");
    setIncomingRequest(null);
  };

  
 const handleDisconnect = () => {
  if (sessionCode) {
    socket.emit("leave_room", sessionCode);
  }
  closeConnection();

  setIsConnected(false);
  setSelectedFiles([]);
  setFileProgress([]);
  setJoinCode("");
  setJoinError("");
  setSending(false);
  setSendProgress(0);
  setReceiving(false);
  setReceiveProgress(0);
  setSharedFiles([]);

  showToast("Disconnected. Generating a new code…", "info");

  const newCode = generateCode();
  setRoomCode(newCode);
  setSessionCode(newCode);

  // 🔥 Force UI reset
  setTimeout(() => {
    window.location.reload();
  }, 150);
};


  // QR code drawing
 // QR code drawing using qrcode
useEffect(() => {
  if (sessionCode && canvasRef.current) {
    QRCode.toCanvas(canvasRef.current, sessionCode, {
      width: 160,
      errorCorrectionLevel: "H",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  }
}, [sessionCode]);


  // File selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    setFileProgress(
      files.map((f) => ({
        name: f.name,
        progress: 0,
        status: "pending",
      }))
    );
  };

  // Watch fileProgress to know when all done
  useEffect(() => {
    if (
      fileProgress.length > 0 &&
      fileProgress.every((f) => f.status === "done")
    ) {
      setSending(false);
      setSendProgress(0);
      setSelectedFiles([]);
      showToast("All files sent.", "success");
    }
  }, [fileProgress, showToast]);

  const handleSend = () => {
    if (!selectedFiles.length) {
      showToast("Please select at least one file.", "error");
      return;
    }
    if (!isConnected) {
      showToast("Not connected. Wait for peer before sending.", "error");
      return;
    }

    setSending(true);

    selectedFiles.forEach((file, index) => {
      sendFile(file, (p) => {
        setSendProgress(p);
        setFileProgress((prev) => {
          const copy = [...prev];
          if (!copy[index]) return prev;
          copy[index] = {
            ...copy[index],
            progress: p,
            status: p >= 100 ? "done" : "sending",
          };
          return copy;
        });

        // When progress is 100, append to sharedFiles as "sent"
        if (p >= 100) {
          const displayName = makeDisplayName(file.name);
          setSharedFiles((prev) => [
            ...prev,
            {
              id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
              name: displayName,
              direction: "sent",
              blob: null,
            },
          ]);
        }
      });
    });
  };

  // QR scanner
  const startScanner = async () => {
    setShowScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();
        scanLoop();
      }
    } catch (err) {
      console.error("Camera error:", err);
      showToast("Unable to access camera for QR scanning.", "error");
      setShowScanner(false);
    }
  };

  const stopScanner = () => {
    setShowScanner(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
    }
  };

  const scanLoop = () => {
    if (!videoRef.current || !scanCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    const ctx = canvas.getContext("2d");

    const w = video.videoWidth;
    const h = video.videoHeight;

    if (!w || !h) {
      scanLoopRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    const code = jsQR(imageData.data, w, h);

    if (code && code.data) {
      const text = code.data.trim();
      showToast(`QR detected: ${text}`, "success");
      setJoinCode(text);
      stopScanner();
      return;
    }

    scanLoopRef.current = requestAnimationFrame(scanLoop);
  };

  const [alias, setAlias] = useState("");
  const [file, setFile] = useState(null);
const [uploading, setUploading] = useState(false);
const [showCloudShare, setShowCloudShare] = useState(false);
const [cloudShareLink, setCloudShareLink] = useState("");

const handleCloudUpload = async () => {
  if (!file || !alias) {
    setToast({ type: "error", message: "Enter alias and select file!" });
    return;
  }

  setUploading(true);  // 🔥 show loader

  const ext = file.name.split(".").pop();
  const storagePath = `${alias}.${ext}`;

  // 1. Upload file
  const { error: uploadError } = await supabase.storage
    .from("files")
    .upload(storagePath, file);

  if (uploadError) {
    setUploading(false);
    setToast({ type: "error", message: uploadError.message });
    return;
  }

  // 2. Get download URL
 // signed URL that forces browser filename
const { data: signed } = await supabase.storage
  .from("files")
  .createSignedUrl(storagePath, 60 * 60 * 24 * 365, {
    download: file.name,
  });

const publicURL = signed.signedUrl;

  // 3. DB insert
  const { error: insertError } = await supabase
    .from("links")
    .insert([{ alias, url: publicURL, filename: file.name }]);

  if (insertError) {
    setUploading(false);
    setToast({ type: "error", message: insertError.message });
    return;
  }

  // 4. Generate front-end share link
  const shareLink = `${window.location.origin}/${alias}`;

  setCloudShareLink(shareLink);     // 🔥 for QR + copy
  setShowCloudShare(true);          // 🔥 open popup
  setUploading(false);              // 🔥 stop loader
  setAlias("");
  setFile(null);
};




  // Render
  return (
    <div className="flip-container">
      <div className={`flip-card ${isFlipped ? "flipped" : ""}`}>
        {/* FRONT: Local P2P */}
        <div className="flip-card-front">
          <div className="top-name">
            <button className="mode-toggle" onClick={() => setIsFlipped(true)}>
              Switch to Cloud →
            </button>
            <h2>Local P2P Sharing</h2>
          </div>

          <div className="qr-box">
            <canvas ref={canvasRef}></canvas>
            <h3 style={{ letterSpacing: "5px", fontSize: "2rem" }}>
              {sessionCode}
            </h3>
          </div>

          <p
            style={{
              color: isConnected ? "green" : "gray",
              fontWeight: "bold",
            }}
          >
            {isConnected
              ? "🟢 Connected! Ready to Share."
              : "🔴 Waiting for Peer..."}
          </p>

          {/* LAN discovery */}
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              borderRadius: "8px",
              background: "#111",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "0.9rem", color: "#ccc" }}>
                Devices on this network
              </span>
              <button
                className="btn"
                style={{ padding: "4px 10px", fontSize: "0.7rem" }}
                onClick={refreshRooms}
              >
                Refresh
              </button>
            </div>
            {availableRooms.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#666" }}>
                No other devices discovered yet.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                {availableRooms.map((code) => (
                  <button
                    key={code}
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: "0.8rem",
                      background: "#263238",
                    }}
                    onClick={() => setJoinCode(code)}
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Incoming connection request modal */}
          {incomingRequest && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9998,
              }}
            >
              <div
                style={{
                  background: "#1d1d1d",
                  padding: "24px",
                  borderRadius: "16px",
                  width: "320px",
                  textAlign: "center",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
              >
                <h3 style={{ color: "#fff", marginBottom: "12px" }}>
                  🔐 Connection Request
                </h3>
                <p style={{ color: "#cfcfcf", marginBottom: "20px" }}>
                  A device wants to connect and share files using code{" "}
                  <strong>{incomingRequest.roomCode}</strong>.
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    className="btn"
                    style={{ background: "#2e7d32" }}
                    onClick={handleAcceptRequest}
                  >
                    Accept
                  </button>

                  <button
                    className="btn"
                    style={{ background: "#b71c1c" }}
                    onClick={handleDeclineRequest}
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FILE INPUT */}
         <label className="file-upload">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
            />
            📁 Choose File(s)
          </label>
            {selectedFiles.length > 0 && (
              <p className="file-list">
                {selectedFiles.map((f) => f.name).join(", ")}
              </p>
            )}


          <button
            className="btn"
            onClick={handleSend}
            disabled={!isConnected || !selectedFiles.length || sending}
            style={{
              opacity:
                isConnected && selectedFiles.length && !sending ? 1 : 0.5,
            }}
          >
            {sending ? "Sending..." : "Send File(s)"}
          </button>

          {/* PER-FILE PROGRESS */}
          {fileProgress.length > 0 && (
            <div style={{ width: "100%", marginTop: "12px" }}>
              {fileProgress.map((f, idx) => (
                <div key={idx} style={{ marginBottom: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.75rem",
                      marginBottom: "2px",
                    }}
                  >
                    <span
                      style={{
                        maxWidth: "70%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.name}
                    </span>
                    <span>
                      {f.status === "done"
                        ? "✅ Done"
                        : `${Math.round(f.progress)}%`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "6px",
                      background: "#333",
                      borderRadius: "999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${f.progress}%`,
                        height: "100%",
                        background: "#4CAF50",
                        transition: "width 0.15s linear",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RECEIVE PROGRESS */}
          {receiving && (
            <div
              style={{
                width: "100%",
                height: "8px",
                background: "#333",
                borderRadius: "999px",
                overflow: "hidden",
                marginTop: "12px",
              }}
            >
              <div
                style={{
                  width: `${receiveProgress}%`,
                  height: "100%",
                  background: "#2196F3",
                  transition: "width 0.15s linear",
                }}
              />
            </div>
          )}

          {/* SHARED FILES LIST */}
          {sharedFiles.length > 0 && (
            <div
              style={{
                marginTop: "20px",
                background: "#111",
                padding: "10px",
                borderRadius: "12px",
                width: "100%",
              }}
            >
              <h3 style={{ marginBottom: "8px", color: "#fff" }}>
                📁 Shared Files
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {sharedFiles.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      background: "#222",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        maxWidth: "70%",
                      }}
                    >
                      <span
                        style={{
                          color: "#ddd",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color:
                            f.direction === "sent" ? "limegreen" : "#64b5f6",
                        }}
                      >
                        {f.direction === "sent" ? "You sent this" : "Received"}
                      </span>
                    </div>

                    {f.direction === "received" && f.blob ? (
                      <button
                        className="btn"
                        style={{ fontSize: "0.8rem" }}
                        onClick={() => {
                          const url = URL.createObjectURL(f.blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = f.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        ⬇️ Download
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "lime",
                        }}
                      >
                        ✅ Sent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disconnect */}
          <button
            className="btn"
            onClick={handleDisconnect}
            style={{ marginTop: "10px", backgroundColor: "#444" }}
          >
            Disconnect & New Code
          </button>

          <hr style={{ margin: "20px 0" }} />

          {/* JOIN A ROOM */}
          <div className="join-box">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <input
                type="text"
                className="input-field code"
                maxLength="6"
                placeholder="Enter Peer's Code"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  setJoinError("");
                }}
                style={{ textAlign: "center", flex: 1, margin: 0 }}
              />
              <button
                className="btn"
                style={{ whiteSpace: "nowrap" }}
                onClick={startScanner}
              >
                Scan QR
              </button>
            </div>

            <button
              className="btn"
              onClick={joinPeerRoom}
                disabled={!joinCode.trim() || isConnected}
              style={{
                opacity: !joinCode.trim() || isConnected ? 0.5 : 1,
                pointerEvents: !joinCode.trim() || isConnected ? "none" : "auto",
              }}
            >
              Join Room
            </button>
            {isConnected && (
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#bbb",
                  marginTop: "6px",
                  textAlign: "center",
                }}
              >
                You are already connected. Disconnect to join a different room.
              </p>
            )}
            {joinError && (
              <p
                style={{
                  color: "red",
                  marginTop: "8px",
                  fontSize: "0.85rem",
                }}
              >
                {joinError}
              </p>
            )}
          </div>
        </div>

        {/* BACK: Cloud placeholder */}
        <div className="flip-card-back">
          <div className="top-name">
            <button className="mode-toggle" onClick={() => setIsFlipped(false)}>
              ← Back to Local
            </button>
            <h2>Cloud Sharing</h2>
          </div>
                  <p>Upload a file, create a custom alias link.</p>

          <input
          type="text"
          className="input-field"
          placeholder="Enter custom alias (ex: myfile123)"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />

        <label className="file-upload">
          <input
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files[0])}
          />
           {file ? `📄 ${file.name}` : "📁 Choose File(s)"}
        </label>

        <button className="btn upload" onClick={handleCloudUpload}>
          Upload File
        </button>
        </div>
      </div>
      {/* Cloud Upload Loader */}
{uploading && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
    }}
  >
    <div
      style={{
        background: "#111",
        padding: "20px 30px",
        borderRadius: "16px",
        color: "#fff",
        fontSize: "1.1rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      ⏳ Uploading...
    </div>
  </div>
)}

{/* Cloud Share Popup */}
{showCloudShare && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
      background: "rgba(0,0,0,0.55)", // optional blur overlay
      backdropFilter: "blur(6px)",
    }}
  >
    <div
      style={{
        background: "#6a00ff",
        padding: "22px",
        borderRadius: "16px",
        width: "90%",
        maxWidth: "340px",
        textAlign: "center",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      }}
    >
      <h3 style={{ color: "#fff", marginBottom: "12px" }}>🔥 File Ready</h3>

      <p style={{ color: "#ccc", fontSize: "0.85rem", marginBottom: "10px" }}>
        Scan or copy link to share:
      </p>

      {/* QR code canvas */}
      <canvas
        ref={(canvas) =>
          canvas &&
          QRCode.toCanvas(canvas, cloudShareLink, {
            width: 200,
            errorCorrectionLevel: "H",
            color: { dark: "#ffffff", light: "#111111" },
          })
        }
        style={{
          width: "200px",
          height: "200px",
          background: "#fff",
          borderRadius: "12px",
          margin: "0 auto 12px",
          padding: "10px",
        }}
      />

      {/* READ-ONLY LINK INPUT */}
      <input
        type="text"
        value={cloudShareLink}
        readOnly
        style={{
          width: "webkit-fill-available",
          padding: "10px 12px",
          textAlign:"center",
          background: "#1a1a1a",
          color: "#eee",
          border: "1px solid #333",
          borderRadius: "10px",
          fontSize: "0.85rem",
          marginBottom: "12px",
          letterSpacing: "0.3px",
        }}
      />

      {/* Copy button */}
      <button
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: "10px",
          fontWeight: "600",
          marginBottom: "10px",
          background: "linear-gradient(135deg, #6a00ff, #4b00cc)",
          color: "#fff",
          boxShadow: "0 8px 18px rgba(46, 22, 22, 0.4)" ,
          cursor: "pointer",
        }}
        onClick={() => {
          navigator.clipboard.writeText(cloudShareLink);
          showToast("Link copied to clipboard!", "success");
        }}
      >
        📋 Copy Link
      </button>

      {/* Close */}
      <button
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: "10px",
          fontWeight: "600",
          background: "#444",
          color: "#fff",
          cursor: "pointer",
        }}
        onClick={() => setShowCloudShare(false)}
      >
        Close
      </button>
    </div>
  </div>
)}



      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top:"42%",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "14px 22px",
            borderRadius: "12px",
            background:
              toast.type === "success"
                ? "linear-gradient(135deg, #43a047, #2e7d32)"
                : toast.type === "error"
                ? "linear-gradient(135deg, #e53935, #b71c1c)"
                : "linear-gradient(135deg, #424242, #1e1e1e)",
            color: "#fff",
            fontSize: "0.95rem",
            letterSpacing: "0.5px",
            boxShadow: "0px 6px 20px rgba(0,0,0,0.4)",
            zIndex: 9999,
            backdropFilter: "blur(6px)",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* QR Scanner dialog */}
      {showScanner && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#111",
              padding: "20px",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "360px",
              textAlign: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
            }}
          >
            <h3 style={{ color: "#fff", marginBottom: "10px" }}>
              📷 Scan QR Code
            </h3>
            <p
              style={{
                color: "#aaa",
                fontSize: "0.85rem",
                marginBottom: "10px",
              }}
            >
              Point your camera at the other device’s QR code.
            </p>
            <video
              ref={videoRef}
              style={{
                width: "100%",
                borderRadius: "12px",
                background: "#000",
                marginBottom: "10px",
              }}
            ></video>
            <canvas ref={scanCanvasRef} style={{ display: "none" }}></canvas>

            <button
              className="btn"
              style={{ background: "#b71c1c", marginTop: "4px" }}
              onClick={stopScanner}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
