"use client"

import { useEffect, useRef, useState } from "react"

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
  const wsRef = useRef<WebSocket | null>(null)
  const messageHandlers = useRef<((message: SignalingMessage) => void)[]>([])
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const sendMessage = (message: Omit<SignalingMessage, "from" | "roomId">) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const fullMessage = {
        ...message,
        from: userId,
        roomId: roomId,
      }
      wsRef.current.send(JSON.stringify(fullMessage))
      console.log("📤 Sent WebSocket message:", fullMessage.type, fullMessage)
    } else {
      console.warn("⚠️ WebSocket not connected, cannot send message:", message.type)
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

  const connect = () => {
    try {
      // Use proper WebSocket protocol - wss:// for secure connections
      const wsUrl =
        process.env.NODE_ENV === "production"
          ? "https://sharescreen-bo3d.onrender.com"
          : "https://sharescreen-bo3d.onrender.com"

      console.log("🔌 Connecting to WebSocket server:", wsUrl)
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected")
        setIsConnected(true)
        reconnectAttempts.current = 0
        // Join the room immediately after connection
        setTimeout(() => {
          sendMessage({
            type: "join-room",
            isHost: isHost,
          })
        }, 100)
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: SignalingMessage = JSON.parse(event.data)
          console.log("📥 Received WebSocket message:", message.type, message)

          // Handle system messages
          switch (message.type) {
            case "welcome":
              console.log("👋 Server welcome:", message.message)
              break
            case "participant-count":
              setParticipants(message.count || 1)
              break
            case "error":
              console.error("❌ Server error:", message.message)
              break
            default:
              // Forward to message handlers
              messageHandlers.current.forEach((handler) => handler(message))
          }
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error)
        }
      }

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket disconnected:", event.code, event.reason)
        setIsConnected(false)

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
          console.log(
            `🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`,
          )
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        } else {
          console.error("❌ Max reconnection attempts reached")
        }
      }

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
        setIsConnected(false)
      }
    } catch (error) {
      console.error("❌ Failed to create WebSocket connection:", error)
      setIsConnected(false)
      // Retry connection after 5 seconds
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++
          connect()
        }, 5000)
      }
    }
  }

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [roomId, userId, isHost])

  return {
    isConnected,
    participants,
    sendMessage,
    addMessageHandler,
    removeMessageHandler,
  }
}
