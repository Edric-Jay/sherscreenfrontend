"use client"

import { useState, useEffect, useCallback, useRef } from "react"

// Define the SignalingMessage interface that matches what the WebSocket server expects
export interface SignalingMessage {
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
  isHost?: boolean
}

type MessageHandler = (message: SignalingMessage) => void

export function useWebSocket(roomId: string, userId: string, isHost: boolean) {
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState(1)
  const socketRef = useRef<WebSocket | null>(null)
  const messageHandlers = useRef<Set<MessageHandler>>(new Set())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>()
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)

  const connectWebSocket = useCallback(() => {
    // Use secure WebSocket if on HTTPS
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    // Use the current host with a different port for WebSocket
    // In production, you'd use your deployed WebSocket server URL
    const wsUrl = `${protocol}//${window.location.hostname}:3001`

    console.log(`🔌 Connecting to WebSocket server at ${wsUrl}`)

    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => {
      console.log("🔌 WebSocket connection established")
      setIsConnected(true)
      reconnectAttemptsRef.current = 0

      // Join the room
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "join-room",
            roomId,
            userId,
            isHost,
          }),
        )
      }
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SignalingMessage
        console.log(`📥 Received message: ${message.type}`, message)

        // Handle participant count updates
        if (message.type === "participant-count") {
          setParticipants(message.data)
        }

        // Notify all registered handlers
        messageHandlers.current.forEach((handler) => {
          try {
            handler(message)
          } catch (error) {
            console.error("Error in message handler:", error)
          }
        })
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error)
      }
    }

    socket.onclose = (event) => {
      console.log(`🔌 WebSocket connection closed: ${event.code} ${event.reason}`)
      setIsConnected(false)

      // Attempt to reconnect if not closed cleanly and not at max attempts
      if (!event.wasClean && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000)
        console.log(
          `🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`,
        )

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++
          connectWebSocket()
        }, delay)
      }
    }

    socket.onerror = (error) => {
      console.error("WebSocket error:", error)
    }

    return socket
  }, [roomId, userId, isHost])

  const connect = () => {
    try {
      // Use proper WebSocket protocol - wss:// for secure connections
      const wsUrl =
        process.env.NODE_ENV === "production"
          ? "wss://sharescreen-bo3d.onrender.com"
          : "wss://sharescreen-bo3d.onrender.com"

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
    const socket = connectWebSocket()

    return () => {
      console.log("🔌 Cleaning up WebSocket connection")
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (socket) {
        socket.close()
      }
    }
  }, [connectWebSocket])

  const sendMessage = useCallback(
    (message: Partial<SignalingMessage>) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        const fullMessage = {
          ...message,
          from: userId,
          roomId,
        }
        console.log("📤 Sending message:", fullMessage)
        socketRef.current.send(JSON.stringify(fullMessage))
      } else {
        console.warn("Cannot send message, WebSocket is not connected")
      }
    },
    [userId, roomId],
  )

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler)
  }, [])

  const removeMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.delete(handler)
  }, [])

  return {
    isConnected,
    participants,
    sendMessage,
    addMessageHandler,
    removeMessageHandler,
  }
}
