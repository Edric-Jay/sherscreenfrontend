"use client"

import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

interface SignalingMessage {
  type:
    | "offer"
    | "answer"
    | "ice-candidate"
    | "host-sharing"
    | "host-stopped"
    | "user-joined"
    | "user-left"
    | "join-room"
    | "participant-count"
    | "welcome"
    | "error"
  data?: any
  from?: string
  to?: string
  roomId?: string
  count?: number
  message?: string
  isHost?: boolean
}

export function useWebSocket(roomId: string, userId: string, isHost = false) {
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState(1)
  const socketRef = useRef<Socket | null>(null)
  const messageHandlers = useRef<((message: SignalingMessage) => void)[]>([])

  useEffect(() => {
    // Connect to Socket.IO server
    const socketUrl =
      process.env.NODE_ENV === "production"
        ? "https://sharescreen-bo3d.onrender.com"
        : "https://sharescreen-bo3d.onrender.com"

    console.log("🔌 Connecting to Socket.IO server:", socketUrl)

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })

    socketRef.current = socket

    // Connection events
    socket.on("connect", () => {
      console.log("✅ Socket.IO connected")
      setIsConnected(true)

      // Join the room immediately after connection
      socket.emit("join-room", {
        roomId,
        userId,
        isHost,
      })
    })

    socket.on("disconnect", () => {
      console.log("🔌 Socket.IO disconnected")
      setIsConnected(false)
    })

    socket.on("connect_error", (error : any) => {
      console.error("❌ Socket.IO connection error:", error)
      setIsConnected(false)
    })

    // Server messages
    socket.on("welcome", (data : any) => {
      console.log("👋 Server welcome:", data.message)
    })

    socket.on("participant-count", (message : any) => {
      setParticipants(message.count || 1)
    })

    socket.on("error", (message : any) => {
      console.error("❌ Server error:", message.message)
    })

    // Handle all signaling messages
    const handleMessage = (type: string) => {
      socket.on(type, (message: any) => {
        console.log(`📥 Received Socket.IO message: ${type}`, message)

        // Convert to SignalingMessage format
        const signalingMessage: SignalingMessage = {
          ...message,
          type: type as any,
        }

        // Forward to message handlers
        messageHandlers.current.forEach((handler) => {
          try {
            handler(signalingMessage)
          } catch (error) {
            console.error(`❌ Error in message handler for ${type}:`, error)
          }
        })
      })
    }

    // Register handlers for all signaling message types
    handleMessage("user-joined")
    handleMessage("user-left")
    handleMessage("host-sharing")
    handleMessage("host-stopped")
    handleMessage("offer")
    handleMessage("answer")
    handleMessage("ice-candidate")

    // Cleanup on unmount
    return () => {
      console.log("🔌 Cleaning up Socket.IO connection")
      socket.disconnect()
    }
  }, [roomId, userId, isHost])

  const sendMessage = (message: Omit<SignalingMessage, "from" | "roomId">) => {
    if (socketRef.current && socketRef.current.connected) {
      // With Socket.IO, we emit the message type as the event name
      const { type, ...data } = message

      // Add user ID and room ID if not present
      const fullData = {
        ...data,
        from: userId,
        roomId: roomId,
      }

      console.log(`📤 Sending Socket.IO message: ${type}`, fullData)
      socketRef.current.emit(type, fullData)
    } else {
      console.warn("⚠️ Socket.IO not connected, cannot send message:", message.type)
    }
  }

  const addMessageHandler = (handler: (message: SignalingMessage) => void) => {
    messageHandlers.current.push(handler)
  }

  const removeMessageHandler = (handler: (message: SignalingMessage) => void) => {
    const index = messageHandlers.current.indexOf(handler)
    if (index > -1) {
      messageHandlers.current.splice(index, 1)
    }
  }

  return {
    isConnected,
    participants,
    sendMessage,
    addMessageHandler,
    removeMessageHandler,
  }
}
