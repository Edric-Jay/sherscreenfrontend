"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Monitor, Play } from "lucide-react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const [roomId, setRoomId] = useState("")
  const router = useRouter()

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    router.push(`/room/${newRoomId}?host=true`)
  }

  const joinRoom = () => {
    if (roomId.trim()) {
      router.push(`/room/${roomId.toUpperCase()}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <Monitor className="h-8 w-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">WatchParty</h1>
          </div>
          <p className="text-gray-600">Share your screen and watch together</p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Play className="h-5 w-5" />
                <span>Host a Watch Party</span>
              </CardTitle>
              <CardDescription>Create a room and share your screen with others</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={createRoom} className="w-full" size="lg">
                Create Room
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Join a Watch Party</span>
              </CardTitle>
              <CardDescription>Enter a room ID to join an existing watch party</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="text-center font-mono text-lg"
              />
              <Button
                onClick={joinRoom}
                variant="outline"
                className="w-full bg-transparent"
                size="lg"
                disabled={!roomId.trim()}
              >
                Join Room
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>Share the room ID with friends to watch together</p>
        </div>
      </div>
    </div>
  )
}
