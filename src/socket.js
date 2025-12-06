// src/socket.js
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SIGNAL_SERVER_URL;


export const socket = io(SERVER_URL, {
  transports: ["websocket"],
});
