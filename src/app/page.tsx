"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, Terminal } from "lucide-react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[]; // 记录使用的工具
};

type GraphQLResponse = {
  data?: { chat: { content: string; toolCalls: string[] } };
  errors?: Array<{ message: string }>;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 构造 GraphQL Query
      const query = `
        mutation Chat($message: String!, $history: [MessageInput]) {
          chat(message: $message, history: $history) {
            content
            toolCalls
          }
        }
      `;

      // 准备历史消息 (去除 toolCalls 字段，只保留 role 和 content)
      const history = messages.map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: { message: userMessage.content, history },
        }),
      });

      const json = (await res.json()) as GraphQLResponse;
      
      if (json.errors) {
        throw new Error(json.errors[0].message);
      }

      const data = json.data!.chat;
      
      setMessages((prev) => [
        ...prev,
        { 
          role: "assistant", 
          content: data.content,
          toolCalls: data.toolCalls
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please check your API Key configuration." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg border border-blue-500/30">
            <Bot className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Web3 AI Agent
            </h1>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Powered by OpenNext & Cloudflare
            </p>
          </div>
        </div>
        <div className="flex gap-2">
           <a 
             href="https://github.com/opennextjs/opennextjs-cloudflare" 
             target="_blank"
             className="p-2 hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-white"
           >
             <Terminal className="w-5 h-5" />
           </a>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
            <Sparkles className="w-12 h-12 text-blue-500/50" />
            <p className="text-gray-400 text-lg">Ask me about crypto prices or search the web!</p>
            <div className="flex gap-2 text-sm text-gray-500">
              <span className="bg-gray-900 px-3 py-1 rounded-full border border-gray-800">"Price of BTC?"</span>
              <span className="bg-gray-900 px-3 py-1 rounded-full border border-gray-800">"Latest Next.js news?"</span>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  "flex gap-4 max-w-3xl mx-auto",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-5 h-5 text-blue-400" />
                  </div>
                )}
                
                <div className={clsx(
                  "flex flex-col gap-2 max-w-[80%]",
                  msg.role === "user" ? "items-end" : "items-start"
                )}>
                  {/* Tool Usage Logs */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="flex flex-col gap-1 mb-1">
                      {msg.toolCalls.map((tool, tIdx) => (
                        <div key={tIdx} className="text-xs text-gray-500 flex items-center gap-1 bg-gray-900/50 px-2 py-1 rounded border border-gray-800">
                          <Terminal className="w-3 h-3" />
                          {tool}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={clsx(
                      "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-lg",
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-5 h-5 text-gray-300" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4 max-w-3xl mx-auto"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-none border border-gray-700 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-sm text-gray-400">Thinking...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 sm:p-6 bg-gray-900/50 backdrop-blur-md border-t border-gray-800">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about crypto prices or search the web..."
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-5 py-4 pr-12 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-3 p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white transition-colors shadow-lg shadow-blue-900/20"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
        <p className="text-center text-xs text-gray-600 mt-3">
          AI can make mistakes. Please verify important information.
        </p>
      </footer>
    </div>
  );
}
