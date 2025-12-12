import { createSchema, createYoga } from "graphql-yoga";
import OpenAI from "openai";

export const runtime = 'edge';

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 定义 GraphQL Schema
const typeDefs = `
  type Message {
    role: String!
    content: String!
  }

  input MessageInput {
    role: String!
    content: String!
  }

  type ChatResponse {
    content: String
    toolCalls: [String]
  }

  type Query {
    hello: String
  }

  type Mutation {
    chat(message: String!, history: [MessageInput]): ChatResponse
  }
`;

const mcpTools = {
  amapGeocode: async (address: string, city?: string) => {
    const key = process.env.AMAP_API_KEY;
    if (!key) return JSON.stringify({ error: "Missing AMAP_API_KEY" });
    const params = new URLSearchParams({ key, address });
    if (city) params.set("city", city);
    const url = `https://restapi.amap.com/v3/geocode/geo?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    return JSON.stringify(data);
  },
  amapSearchPOI: async (keywords: string, city?: string, page?: number, offset?: number) => {
    const key = process.env.AMAP_API_KEY;
    if (!key) return JSON.stringify({ error: "Missing AMAP_API_KEY" });
    const params = new URLSearchParams({ key, keywords, extensions: "all" });
    if (city) params.set("city", city);
    if (page) params.set("page", String(page));
    if (offset) params.set("offset", String(offset));
    const url = `https://restapi.amap.com/v3/place/text?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    return JSON.stringify(data);
  },
  amapGetRoute: async (origin: string, destination: string, mode: "driving" | "walking" | "bicycling" | "transit" = "driving") => {
    const key = process.env.AMAP_API_KEY;
    if (!key) return JSON.stringify({ error: "Missing AMAP_API_KEY" });
    const toCoords = async (input: string) => {
      if (input.includes(",")) return input;
      const g = await fetch(`https://restapi.amap.com/v3/geocode/geo?${new URLSearchParams({ key, address: input }).toString()}`);
      const gj = await g.json();
      const loc = gj?.geocodes?.[0]?.location;
      return typeof loc === "string" ? loc : "";
    };
    const o = await toCoords(origin);
    const d = await toCoords(destination);
    if (!o || !d) return JSON.stringify({ error: "Geocode failed" });
    let path = "";
    if (mode === "driving") path = "direction/driving";
    else if (mode === "walking") path = "direction/walking";
    else if (mode === "bicycling") path = "direction/bicycling";
    else path = "direction/transit/integrated";
    const params = new URLSearchParams({ key, origin: o, destination: d });
    const url = `https://restapi.amap.com/v3/${path}?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    return JSON.stringify(data);
  }
};

// 定义 OpenAI Tools 格式
const openAITools = [
  {
    type: "function" as const,
    function: {
      name: "amapSearchPOI",
      description: "Search points of interest using Amap (Gaode) for travel planning.",
      parameters: {
        type: "object",
        properties: {
          keywords: { type: "string" },
          city: { type: "string" },
          page: { type: "number" },
          offset: { type: "number" }
        },
        required: ["keywords"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "amapGetRoute",
      description: "Plan route between origin and destination using Amap.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          mode: { type: "string", enum: ["driving", "walking", "bicycling", "transit"] }
        },
        required: ["origin", "destination"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "amapGeocode",
      description: "Geocode an address to coordinates using Amap.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string" },
          city: { type: "string" }
        },
        required: ["address"]
      }
    }
  }
];

// Resolvers
const resolvers = {
  Query: {
    hello: () => "Hello from GraphQL Yoga on Cloudflare Workers!",
  },
  Mutation: {
    chat: async (_: unknown, { message, history }: { message: string; history: Array<{ role: string; content: string }> }) => {
      try {
        const messages: Array<Record<string, unknown>> = [
          { role: "system", content: "You are a travel planning assistant. Use Amap tools to search POIs and plan routes. Provide practical itineraries and step-by-step directions." },
          ...(history || []),
          { role: "user", content: message }
        ];

        // 第一次调用 OpenAI (决定是否使用工具)
        const completion = await openai.chat.completions.create({
          model: "gpt-5.1",
          messages,
          tools: openAITools,
          tool_choice: "auto",
        });

        const choice = completion.choices[0];
        
        const toolCalls = choice.message.tool_calls;

        // 如果没有工具调用，直接返回内容
        if (!toolCalls || toolCalls.length === 0) {
          return {
            content: choice.message.content,
            toolCalls: []
          };
        }

        // 处理工具调用
        const toolResults = [];
        const toolCallLogs = [];

        // 将 Assistant 的 tool_calls 消息加入历史
        messages.push(choice.message as unknown as Record<string, unknown>);

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          const fnName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          let result = "";
          if (fnName === "amapSearchPOI") {
            result = await mcpTools.amapSearchPOI(args.keywords, args.city, args.page, args.offset);
            toolCallLogs.push(`Using Tool: Amap POI ("${args.keywords}")`);
          } else if (fnName === "amapGetRoute") {
            result = await mcpTools.amapGetRoute(args.origin, args.destination, args.mode);
            toolCallLogs.push(`Using Tool: Amap Route ("${args.origin}" → "${args.destination}")`);
          } else if (fnName === "amapGeocode") {
            result = await mcpTools.amapGeocode(args.address, args.city);
            toolCallLogs.push(`Using Tool: Amap Geocode ("${args.address}")`);
          }

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fnName,
            content: result
          });
        }

        // 将工具执行结果加入消息历史
        messages.push(...(toolResults as Array<Record<string, unknown>>));

        // 第二次调用 OpenAI (根据工具结果生成最终回答)
        const finalCompletion = await openai.chat.completions.create({
          model: "gpt-5.1",
          messages,
        });

        return {
          content: finalCompletion.choices[0].message.content,
          toolCalls: toolCallLogs
        };

      } catch (error) {
        console.error("OpenAI Error:", error);
        return {
          content: "Sorry, I encountered an error processing your request.",
          toolCalls: []
        };
      }
    }
  }
};

const schema = createSchema({
  typeDefs,
  resolvers,
});

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  fetchAPI: { Response }
});

export { handleRequest as GET, handleRequest as POST };
