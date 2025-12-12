import { createSchema, createYoga, YogaInitialContext } from "graphql-yoga";
import OpenAI from "openai";

// 1. 定义 Cloudflare 环境变量类型（需与 Workers 配置一致）
interface Env {
  OPENAI_API_KEY: string;
}

// 2. 扩展 Yoga 上下文，关联 Cloudflare Env
interface GraphQLContext extends YogaInitialContext {
  env: Env;
}

// 3. GraphQL Schema（保持不变）
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

// 4. 工具函数（保持不变）
function extractOutputText(resp: unknown): string {
  const o = resp as { output_text?: string };
  return typeof o.output_text === "string" ? o.output_text : "";
}

// 5. Resolvers（保持不变，仅依赖 ctx.env）
const resolvers = {
  Query: {
    hello: () => "Hello from GraphQL Yoga on Cloudflare Workers!",
  },
  Mutation: {
    chat: async (
      _: unknown,
      { message, history }: { message: string; history?: Array<{ role: string; content: string }> },
      ctx: GraphQLContext
    ) => {
      try {
        // 仅从 ctx.env 获取 API Key（移除 process.env 兼容）
        const apiKey = ctx?.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return {
            content: "OpenAI API key is not configured. Set OPENAI_API_KEY in Cloudflare Secrets.",
            toolCalls: [],
          };
        }

        const openai = new OpenAI({ apiKey });
        const safeHistory = Array.isArray(history)
          ? history.filter((m) => m.role && m.content)
          : [];
        const historyText = safeHistory.map((m) => `${m.role}: ${m.content}`).join("\n");
        const input = `${historyText ? historyText + "\n" : ""}user: ${message}`;

        const resp = await openai.responses.create({
          model: "gpt-5.1",
          input,
          instructions: "You are a helpful assistant.",
        });

        const content = extractOutputText(resp);
        return { content, toolCalls: [] };
      } catch (error) {
        console.error("OpenAI Error:", error);
        const msg = (error as { message?: string })?.message ?? "Sorry, I encountered an error processing your request.";
        return { content: msg, toolCalls: [] };
      }
    },
  },
};

// 6. 创建 Schema（保持不变）
const schema = createSchema({ typeDefs, resolvers });

// 7. 关键修复：创建 Yoga 时指定上下文工厂，动态注入 Cloudflare Env
const yoga = createYoga<{ env: Env }>({ // 显式声明上下文类型
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Request, Response },
  // 上下文工厂：每次请求时传递 Cloudflare 的 env
  context: ({ env }) => ({
    env,    // 注入 Cloudflare 环境变量
  }),
});

// 兼容 GET/POST 单独导出（可选，推荐用上面的 fetch 入口）
export async function GET(request: Request, env: Env) {
  return yoga.handleRequest(request, { env });
}

export async function POST(request: Request, env: Env) {
  return yoga.handleRequest(request, { env });
}