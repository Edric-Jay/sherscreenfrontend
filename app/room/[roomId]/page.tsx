"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Monitor, MonitorOff, Users, Copy, Check, Wifi, WifiOff, RefreshCw } from "lucide-react"
import { useWebSocket } from "@/hooks/useWebSocket"

interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "host-sharing" | "host-stopped" | "user-joined" | "user-left"
  data?: any
  from?: string
  to?: string
  roomId?: string
  isHost?: boolean
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const roomId = params.roomId as string
  const isHost = searchParams.get("host") === "true"
  const userId = useRef(Math.random().toString(36).substring(2, 15))

  const [isSharing, setIsSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hostIsSharing, setHostIsSharing] = useState(false)
  const [viewerStream, setViewerStream] = useState<MediaStream | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "failed">("connecting")

  const videoRef = useRef<HTMLVideoElement>(null)
  const viewerVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())

  // Use WebSocket hook with isHost parameter
  const { isConnected, participants, sendMessage, addMessageHandler, removeMessageHandler } = useWebSocket(
    roomId,
    userId.current,
    isHost,
  )

  const createPeerConnection = (targetUserId: string) => {
    console.log(`🔗 Creating peer connection with ${targetUserId}`)

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
      ],
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate to ${targetUserId}`)
        sendMessage({
          type: "ice-candidate",
          data: event.candidate,
          to: targetUserId,
        })
      } else {
        console.log("🧊 ICE gathering complete")
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${targetUserId}:`, pc.connectionState)
      if (pc.connectionState === "connected") {
        setConnectionStatus("connected")
        console.log("✅ WebRTC connection established!")
      } else if (pc.connectionState === "failed") {
        setConnectionStatus("failed")
        console.error("❌ WebRTC connection failed")
      } else if (pc.connectionState === "connecting") {
        setConnectionStatus("connecting")
        console.log("🔄 WebRTC connection in progress...")
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${targetUserId}:`, pc.iceConnectionState)
    }

    if (!isHost) {
      pc.ontrack = (event) => {
        console.log("📺 Received remote stream from host!", event.streams[0])
        const stream = event.streams[0]
        setViewerStream(stream)
        setConnectionStatus("connected")

        // Immediately assign to video element
        setTimeout(() => {
          if (viewerVideoRef.current) {
            viewerVideoRef.current.srcObject = stream
            viewerVideoRef.current.play().catch((error) => {
              console.error("❌ Failed to play video:", error)
            })
          }
        }, 100)
      }
    }

    peerConnections.current.set(targetUserId, pc)
    return pc
  }

  const startScreenShare = async () => {
    if (!isConnected) {
      return
    }

    try {
      console.log("🎬 Starting screen share...")
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      console.log("📺 Screen capture stream obtained:", stream)
      console.log("📺 Video tracks:", stream.getVideoTracks())
      console.log("📺 Audio tracks:", stream.getAudioTracks())

      streamRef.current = stream
      setIsSharing(true)

      // Assign stream to host's video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(console.error)
        console.log("📺 Host video element updated")
      }

      console.log("📡 Notifying viewers that host started sharing")

      // Notify all viewers via WebSocket that host started sharing
      sendMessage({
        type: "host-sharing",
      })

      // Handle stream end
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("📺 Screen share ended by user")
        stopScreenShare()
      })
    } catch (error) {
      console.error("❌ Error starting screen share:", error)
    }
  }

  const stopScreenShare = () => {
    console.log("🛑 Stopping screen share")

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
        console.log("🛑 Stopped track:", track.kind)
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    // Close all peer connections
    peerConnections.current.forEach((pc, userId) => {
      console.log(`🔌 Closing peer connection with ${userId}`)
      pc.close()
    })
    peerConnections.current.clear()

    setIsSharing(false)

    // Notify viewers via WebSocket that sharing stopped
    sendMessage({
      type: "host-stopped",
    })
  }

  const handleSignalingMessage = async (message: SignalingMessage) => {
    if (message.from === userId.current) return // Ignore own messages

    console.log("🔄 Processing WebSocket message:", message.type, "from:", message.from)

    try {
      switch (message.type) {
        case "user-joined":
          console.log("👋 User joined:", message.from, message.isHost ? "(Host)" : "(Viewer)")
          // If we're the host and currently sharing, notify the new user
          if (isHost && isSharing) {
            console.log("📺 Host is sharing, notifying new user")
            setTimeout(() => {
              sendMessage({
                type: "host-sharing",
              })
            }, 1000)
          }
          break

        case "user-left":
          console.log("👋 User left:", message.from)
          // Clean up peer connection if exists
          const pc = peerConnections.current.get(message.from!)
          if (pc) {
            pc.close()
            peerConnections.current.delete(message.from!)
          }
          break

        case "host-sharing":
          console.log("📺 Host started sharing via WebSocket")
          if (!isHost) {
            console.log("👀 Viewer detected host sharing, initiating connection")
            setHostIsSharing(true)
            setConnectionStatus("connecting")

            // Create peer connection and send offer
            setTimeout(async () => {
              try {
                const pc = createPeerConnection(message.from!)
                console.log("📤 Creating offer for host")
                const offer = await pc.createOffer({
                  offerToReceiveVideo: true,
                  offerToReceiveAudio: true,
                })
                await pc.setLocalDescription(offer)
                console.log("📤 Sending offer to host:", offer)
                sendMessage({
                  type: "offer",
                  data: offer,
                  to: message.from,
                })
              } catch (error) {
                console.error("❌ Failed to create offer:", error)
                setConnectionStatus("failed")
              }
            }, 500)
          }
          break

        case "host-stopped":
          console.log("🛑 Host stopped sharing via WebSocket")
          if (!isHost) {
            setHostIsSharing(false)
            setViewerStream(null)
            setConnectionStatus("connecting")
            if (viewerVideoRef.current) {
              viewerVideoRef.current.srcObject = null
            }
            // Close peer connection
            const pc = peerConnections.current.get(message.from!)
            if (pc) {
              pc.close()
              peerConnections.current.delete(message.from!)
            }
          }
          break

        case "offer":
          console.log("📥 Received offer via WebSocket from:", message.from, "to:", message.to)
          if (isHost && message.to === userId.current) {
            const pc = createPeerConnection(message.from!)

            console.log("📺 Setting remote description and adding stream tracks")
            await pc.setRemoteDescription(new RTCSessionDescription(message.data))

            // Add the screen share stream to the connection
            if (streamRef.current) {
              console.log("📺 Adding stream tracks to peer connection")
              streamRef.current.getTracks().forEach((track) => {
                console.log("📺 Adding track:", track.kind, track.label)
                pc.addTrack(track, streamRef.current!)
              })
            } else {
              console.warn("⚠️ No stream available to add to peer connection")
            }

            console.log("📤 Creating and sending answer")
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            sendMessage({
              type: "answer",
              data: answer,
              to: message.from,
            })
            console.log("📤 Answer sent to viewer")
          }
          break

        case "answer":
          console.log("📥 Received answer via WebSocket from:", message.from)
          if (!isHost && message.to === userId.current) {
            const pc = peerConnections.current.get(message.from!)
            if (pc) {
              console.log("📥 Setting remote description from answer")
              await pc.setRemoteDescription(new RTCSessionDescription(message.data))
              console.log("✅ Remote description set successfully")
            } else {
              console.error("❌ No peer connection found for answer")
            }
          }
          break

        case "ice-candidate":
          console.log("🧊 Received ICE candidate from:", message.from, "to:", message.to)
          if (message.to === userId.current) {
            const pc = peerConnections.current.get(message.from!)
            if (pc) {
              await pc.addIceCandidate(new RTCIceCandidate(message.data))
              console.log("🧊 ICE candidate added successfully")
            } else {
              console.error("❌ No peer connection found for ICE candidate")
            }
          }
          break
      }
    } catch (error) {
      console.error("❌ Error handling signaling message:", error)
      setConnectionStatus("failed")
    }
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
    }
  }

  const refreshConnection = () => {
    window.location.reload()
  }

  // Set up WebSocket message handler
  useEffect(() => {
    addMessageHandler(handleSignalingMessage)
    return () => removeMessageHandler(handleSignalingMessage)
  }, [isHost, isSharing])

  // Set up viewer video when stream is received
  useEffect(() => {
    if (viewerStream && viewerVideoRef.current) {
      console.log("📺 Setting up viewer video element")
      viewerVideoRef.current.srcObject = viewerStream
      viewerVideoRef.current.play().catch((error) => {
        console.error("❌ Failed to play viewer video:", error)
      })
    }
  }, [viewerStream])

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Watch Party Room</h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Room ID:</span>
                <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                  {roomId}
                </Badge>
                <Button variant="ghost" size="sm" onClick={copyRoomId} className="h-8 w-8 p-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-600">{participants} watching</span>
              </div>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm text-gray-600">{isConnected ? "Connected" : "Connecting..."}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isConnected && (
              <Button variant="outline" size="sm" onClick={refreshConnection}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
            {isHost && (
              <>
                {!isSharing ? (
                  <Button onClick={startScreenShare} className="space-x-2" disabled={!isConnected}>
                    <Monitor className="h-4 w-4" />
                    <span>Start Sharing</span>
                  </Button>
                ) : (
                  <Button onClick={stopScreenShare} variant="destructive" className="space-x-2">
                    <MonitorOff className="h-4 w-4" />
                    <span>Stop Sharing</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Video Display */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative bg-black aspect-video flex items-center justify-center">
              {isHost && isSharing ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted={true}
                  controls={false}
                  className="w-full h-full object-contain"
                />
              ) : !isHost && viewerStream ? (
                <video
                  ref={viewerVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  controls={true}
                  className="w-full h-full object-contain"
                />
              ) : !isHost && hostIsSharing ? (
                <div className="text-center space-y-4">
                  <Monitor
                    className={`h-16 w-16 mx-auto animate-pulse ${
                      connectionStatus === "connecting"
                        ? "text-yellow-400"
                        : connectionStatus === "connected"
                          ? "text-green-400"
                          : "text-red-400"
                    }`}
                  />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-white">
                      {connectionStatus === "connecting"
                        ? "Connecting to host..."
                        : connectionStatus === "connected"
                          ? "Connected! Video loading..."
                          : "Connection failed"}
                    </h3>
                    <p className="text-gray-300">
                      {connectionStatus === "connecting"
                        ? "Setting up video stream"
                        : connectionStatus === "connected"
                          ? "Video should appear shortly"
                          : "Please refresh and try again"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Monitor className="h-16 w-16 text-gray-400 mx-auto" />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-white">
                      {isHost ? "Ready to share your screen" : "Waiting for host to share screen"}
                    </h3>
                    <p className="text-gray-300">
                      {isHost
                        ? isConnected
                          ? "Click 'Start Sharing' to begin the watch party"
                          : "Connecting to server..."
                        : "The host will start sharing their screen soon"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Participants ({participants})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm">You {isHost && "(Host)"}</span>
              </div>
              {Array.from({ length: participants - 1 }, (_, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm">Viewer {i + 1}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Connection Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">WebSocket:</span>
                  <Badge variant={isConnected ? "default" : "destructive"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Role:</span>
                  <Badge variant={isHost ? "default" : "secondary"}>{isHost ? "Host" : "Viewer"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Screen Sharing:</span>
                  <Badge variant={isSharing || hostIsSharing ? "default" : "outline"}>
                    {isSharing ? "Sharing" : hostIsSharing ? "Watching" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Video Stream:</span>
                  <Badge
                    variant={
                      connectionStatus === "connected"
                        ? "default"
                        : connectionStatus === "connecting"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {connectionStatus === "connected"
                      ? "Connected"
                      : connectionStatus === "connecting"
                        ? "Connecting"
                        : "Failed"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
