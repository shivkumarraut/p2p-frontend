// src/socket.js
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3001";

export const socket = io(SERVER_URL, {
  transports: ["websocket"],
});
