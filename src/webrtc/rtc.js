// src/webrtc/rtc.js
import { socket } from "../socket";

export let peerConnection = null;
export let dataChannel = null;

// Global state
let currentRoomCode = null;
let isCaller = false;

// Receive state
let receiveBuffer = [];
let receivedMetadata = null;
let receivedBytes = 0;

// Send queue + ACK
let sendQueue = [];
let isSending = false;
let currentSendProgressCb = null;

// React callbacks
let onReceiveFileCb = null;
let onChannelOpenCb = null;
let onReceiveProgressCb = null;

/* ------------------------------------------------------------------ */
/*  CRYPTO HELPERS (AES-GCM derived from room code)                    */
/* ------------------------------------------------------------------ */
async function getKey(roomCode) {
  const enc = new TextEncoder();
  const salt = enc.encode("p2p-file-share-salt");
  const raw = enc.encode(roomCode);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 80000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr.buffer;
}

/* ------------------------------------------------------------------ */
/*  INIT WEBRTC                                                        */
/* ------------------------------------------------------------------ */
export function initWebRTC(
  roomCode,
  onReceiveFile,
  onChannelOpen,
  onReceiveProgress
) {
  console.log("[RTC] initWebRTC for room", roomCode);

  currentRoomCode = roomCode;
  isCaller = false;

  onReceiveFileCb = onReceiveFile;
  onChannelOpenCb = onChannelOpen;
  onReceiveProgressCb = onReceiveProgress;

  // Reset state
  receiveBuffer = [];
  receivedMetadata = null;
  receivedBytes = 0;
  sendQueue = [];
  isSending = false;
  currentSendProgressCb = null;

  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (e) {
      console.warn("[RTC] error closing old peerConnection", e);
    }
  }

  peerConnection = new RTCPeerConnection({
    iceServers: [
  {
    urls: [
      "stun:stun.openrelay.metered.ca:80",
      "turn:turn.openrelay.metered.ca:80",
      "turn:turn.openrelay.metered.ca:443",
      "turn:turn.openrelay.metered.ca:3478?transport=udp",
      "turn:turn.openrelay.metered.ca:3478?transport=tcp"
    ],
    username: "openrelayproject",
    credential: "openrelayproject"
  }
],

  });

  peerConnection.ondatachannel = (event) => {
    console.log("[RTC] ondatachannel fired");
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomCode) {
      socket.emit("signal", {
        room: currentRoomCode,
        data: { candidate: event.candidate },
      });
    }
  };

  // Only one signal handler at a time
  socket.off("signal");
  socket.on("signal", async ({ data }) => {
    if (!peerConnection) return;

    if (data.offer && !isCaller) {
      console.log("[RTC] received offer");
      await peerConnection.setRemoteDescription(data.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", {
        room: currentRoomCode,
        data: { answer },
      });
      return;
    }

    if (data.answer && isCaller) {
      console.log("[RTC] received answer");
      await peerConnection.setRemoteDescription(data.answer);
      return;
    }

    if (data.candidate) {
      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (e) {
        console.warn("[RTC] addIceCandidate error", e);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  DATA CHANNEL                                                       */
/* ------------------------------------------------------------------ */
function setupDataChannel() {
  if (!dataChannel) return;

  console.log("[RTC] setting up dataChannel");

  dataChannel.onopen = () => {
    console.log("[RTC] dataChannel OPEN");
    onChannelOpenCb?.(true);
  };

  dataChannel.onclose = () => {
    console.log("[RTC] dataChannel CLOSE");
  };

  dataChannel.onmessage = async (event) => {
    const data = event.data;

    // Control messages
    if (typeof data === "string") {
      if (data === "EOF") {
        console.log("[RTC] EOF received");
        completeFile();
        return;
      }

      if (data.startsWith("ACK:")) {
        console.log("[RTC] ACK received:", data);
        // current file fully delivered
        if (currentSendProgressCb) currentSendProgressCb(100);
        currentSendProgressCb = null;
        isSending = false;
        processQueue(); // send next file
        return;
      }

      // Metadata
      try {
        receivedMetadata = JSON.parse(data);
        console.log("[RTC] metadata received", receivedMetadata);
        receiveBuffer = [];
        receivedBytes = 0;
        onReceiveProgressCb?.(0);
      } catch (e) {
        console.warn("[RTC] metadata parse failed", e);
      }
      return;
    }

    // Binary chunk
    receiveBuffer.push(data);
    receivedBytes += data.byteLength;

    if (receivedMetadata?.size && onReceiveProgressCb) {
      const pct = Math.min(
        (receivedBytes / receivedMetadata.size) * 100,
        100
      );
      onReceiveProgressCb(pct);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  COMPLETE FILE                                                      */
/* ------------------------------------------------------------------ */
async function completeFile() {
  if (!receivedMetadata || !receiveBuffer.length) {
    console.warn("[RTC] completeFile called with no data");
    return;
  }

  try {
    const encryptedBlob = new Blob(receiveBuffer);
    const encryptedBuf = await encryptedBlob.arrayBuffer();

    const key = await getKey(currentRoomCode);
    const iv = new Uint8Array(base64ToBuf(receivedMetadata.iv));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedBuf
    );

    const fileBlob = new Blob([decrypted], {
      type: receivedMetadata.type,
    });

    onReceiveFileCb?.({
      blob: fileBlob,
      name: receivedMetadata.name,
      type: receivedMetadata.type,
      size: receivedMetadata.size,
    });

    console.log("[RTC] file completed:", receivedMetadata.name);

    // Send ACK so sender knows to send next file
    dataChannel?.send(`ACK:${receivedMetadata.name}`);
  } catch (e) {
    console.error("[RTC] error completing file", e);
  } finally {
    receiveBuffer = [];
    receivedMetadata = null;
    receivedBytes = 0;
    onReceiveProgressCb?.(0);
  }
}

/* ------------------------------------------------------------------ */
/*  START WEBRTC AS CALLER (HOST)                                     */
/* ------------------------------------------------------------------ */
export async function startWebRTC(roomCode) {
  console.log("[RTC] startWebRTC as caller for room", roomCode);
  isCaller = true;

  if (!peerConnection) {
    console.warn("[RTC] startWebRTC: no peerConnection");
    return;
  }

  dataChannel = peerConnection.createDataChannel("files");
  setupDataChannel();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("signal", {
    room: roomCode,
    data: { offer },
  });
}

/* ------------------------------------------------------------------ */
/*  SEND QUEUE + FILE SENDER                                           */
/* ------------------------------------------------------------------ */
export function sendFile(file, onProgress) {
  sendQueue.push({ file, onProgress });
  processQueue();
}

async function processQueue() {
  if (isSending) return;
  if (!sendQueue.length) return;
  if (!dataChannel || dataChannel.readyState !== "open") return;

  const { file, onProgress } = sendQueue.shift();
  isSending = true;
  currentSendProgressCb = onProgress || null;

  try {
    const fileBuf = await file.arrayBuffer();
    const key = await getKey(currentRoomCode);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      fileBuf
    );

    const meta = JSON.stringify({
      name: file.name,
      size: encrypted.byteLength,
      type: file.type,
      iv: bufToBase64(iv.buffer),
    });

    console.log("[RTC] sending metadata", meta);
    dataChannel.send(meta);

    const CHUNK = 64 * 1024;
    const view = new Uint8Array(encrypted);

    for (let offset = 0; offset < view.length; offset += CHUNK) {
      // backpressure
      while (dataChannel.bufferedAmount > 500000) {
        await new Promise((res) => setTimeout(res, 10));
      }

      const chunk = view.slice(offset, offset + CHUNK);
      dataChannel.send(chunk);

      if (currentSendProgressCb) {
        currentSendProgressCb((offset / view.length) * 100);
      }
    }

    dataChannel.send("EOF");
    // We do NOT mark complete here; we wait for ACK in onmessage
  } catch (e) {
    console.error("[RTC] sendFile error", e);
    isSending = false;
    currentSendProgressCb = null;
    processQueue();
  }
}

/* ------------------------------------------------------------------ */
/*  CLOSE CONNECTION                                                   */
/* ------------------------------------------------------------------ */
export function closeConnection() {
  console.log("[RTC] closeConnection");

  try {
    dataChannel?.close();
  } catch (e) {
    console.warn("[RTC] error closing dataChannel", e);
  }

  try {
    peerConnection?.close();
  } catch (e) {
    console.warn("[RTC] error closing peerConnection", e);
  }

  dataChannel = null;
  peerConnection = null;

  receiveBuffer = [];
  receivedMetadata = null;
  receivedBytes = 0;

  sendQueue = [];
  isSending = false;
  currentSendProgressCb = null;

  currentRoomCode = null;
  isCaller = false;

  socket.off("signal");
}
