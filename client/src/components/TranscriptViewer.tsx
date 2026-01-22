import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, User, Bot, Wrench, AlertCircle, ExternalLink, Search, Copy, ChevronDown, ChevronRight } from "lucide-react";

interface TranscriptMessage {
  type: string;
  role?: string;
  content?: string;
  tool?: string;
  timestamp?: string;
}

interface TranscriptViewerProps {
  sessionId: string;
  color: string;
}

export function TranscriptViewer({ sessionId, color: _color }: TranscriptViewerProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchTranscript = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/sessions/${sessionId}/transcript`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load transcript");
        setMessages([]);
      } else {
        setMessages(data.messages || []);
        setLastRefresh(new Date());
      }
    } catch (e) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/transcript?sessionId=${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" && data.message) {
          // Append new message to the list
          setMessages(prev => [...prev, data.message]);
          setLastRefresh(new Date());
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [sessionId]);

  // Initial fetch and fallback polling (only when WebSocket is not connected)
  useEffect(() => {
    fetchTranscript();

    // Poll every 5 seconds as fallback when WebSocket is not connected
    const interval = setInterval(() => {
      if (!wsConnected) {
        fetchTranscript();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, wsConnected, fetchTranscript]);

  const toggleToolExpanded = (index: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Filter messages based on search query
  const filteredMessages = searchQuery
    ? messages.filter(msg =>
        msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.tool?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessage = (msg: TranscriptMessage, index: number) => {
    const isUser = msg.type === "user";
    const isAssistant = msg.type === "assistant";
    const isTool = msg.type === "tool";
    const isToolResult = msg.type === "tool_result";
    const isExpanded = expandedTools.has(index);
    const hasLongContent = (msg.content?.length || 0) > 500;

    return (
      <div
        key={index}
        className={`mb-3 ${isUser ? "pl-0" : "pl-4"} group`}
      >
        <div className="flex items-start gap-2">
          {/* Icon */}
          <div
            className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
              isUser
                ? "bg-blue-500/20"
                : isAssistant
                ? "bg-purple-500/20"
                : isTool
                ? "bg-orange-500/20"
                : "bg-zinc-500/20"
            }`}
          >
            {isUser && <User className="w-3 h-3 text-blue-400" />}
            {isAssistant && <Bot className="w-3 h-3 text-purple-400" />}
            {(isTool || isToolResult) && <Wrench className="w-3 h-3 text-orange-400" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Label and timestamp */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${
                    isUser
                      ? "text-blue-400"
                      : isAssistant
                      ? "text-purple-400"
                      : "text-orange-400"
                  }`}
                >
                  {isUser && "You"}
                  {isAssistant && "Claude"}
                  {isTool && `Tool: ${msg.tool}`}
                  {isToolResult && "Result"}
                </span>
                {msg.timestamp && (
                  <span className="text-[9px] text-zinc-600">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {/* Copy button */}
              <button
                onClick={() => copyToClipboard(msg.content || "")}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded transition-opacity"
                title="Copy to clipboard"
              >
                <Copy className="w-3 h-3 text-zinc-500" />
              </button>
            </div>

            {/* Message content */}
            <div
              className={`text-xs leading-relaxed ${
                isUser ? "text-zinc-300" : "text-zinc-400"
              }`}
            >
              {isTool || isToolResult ? (
                <div>
                  {hasLongContent && (
                    <button
                      onClick={() => toggleToolExpanded(index)}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-400 mb-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  )}
                  <pre className={`whitespace-pre-wrap font-mono text-[10px] bg-black/30 rounded p-2 overflow-x-auto ${
                    isExpanded ? "max-h-none" : "max-h-32"
                  } overflow-y-auto`}>
                    {isExpanded ? msg.content : msg.content?.slice(0, 500)}
                    {!isExpanded && hasLongContent && "..."}
                  </pre>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">
                  {msg.content?.slice(0, 1000)}
                  {(msg.content?.length || 0) > 1000 && "..."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading && messages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0d0d0d] p-4">
        <div className="text-center">
          <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500">Loading transcript...</p>
        </div>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0d0d0d] p-4">
        <div className="text-center max-w-xs">
          <AlertCircle className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
          <p className="text-xs text-zinc-500 mb-2">{error}</p>
          <p className="text-[10px] text-zinc-600">
            External sessions show transcript history once Claude starts working.
          </p>
          <button
            onClick={fetchTranscript}
            className="mt-3 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors flex items-center gap-1.5 mx-auto"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0d0d0d]">
      {/* Header bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              External Session Transcript
            </span>
            {wsConnected && (
              <span className="text-[9px] text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-[10px] text-zinc-600">
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchTranscript}
              disabled={loading}
              className="p-1 hover:bg-zinc-800 rounded transition-colors"
              title="Refresh transcript"
            >
              <RefreshCw
                className={`w-3 h-3 text-zinc-500 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
        {/* Search bar */}
        <div className="relative">
          <Search className="w-3 h-3 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-[10px] bg-zinc-900 border border-zinc-800 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3"
        style={{ minHeight: 0 }}
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-zinc-600 text-center">
              {searchQuery ? (
                <>No messages match your search.</>
              ) : (
                <>
                  No transcript yet.
                  <br />
                  <span className="text-zinc-700">
                    Messages will appear here as Claude works.
                  </span>
                </>
              )}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, i) => renderMessage(msg, i))
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/50">
        <p className="text-[10px] text-zinc-600">
          {filteredMessages.length}{searchQuery && ` of ${messages.length}`} messages
          {loading && " (refreshing...)"}
          {!wsConnected && " (polling)"}
        </p>
      </div>
    </div>
  );
}
