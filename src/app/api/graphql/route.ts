import { createSchema, createYoga, YogaInitialContext } from "graphql-yoga";
import OpenAI from "openai";

interface Env {
  OPENAI_API_KEY: string;
}

// Resolver context type
interface GraphQLContext extends YogaInitialContext {
  env: Env;
}

// GraphQL Schema
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

// Safe extraction of Responses API output text
function extractOutputText(resp: unknown): string {
  const o = resp as { output_text?: string };
  return typeof o.output_text === "string" ? o.output_text : "";
}

// Resolvers
const resolvers = {
  Query: {
    hello: () => "Hello from GraphQL Yoga on Cloudflare Workers!",
  },

  Mutation: {
    chat: async (
      _: unknown,
      {
        message,
        history,
      }: { message: string; history?: Array<{ role: string; content: string }> },
      ctx: GraphQLContext
    ) => {
      try {
        const apiKey = ctx.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return {
            content:
              "OpenAI API key is not configured. Set OPENAI_API_KEY in Cloudflare secrets or .dev.vars.",
            toolCalls: [],
          };
        }
        const openai = new OpenAI({ apiKey });

        // Validate history
        const safeHistory = Array.isArray(history)
          ? history.filter((m) => m.role && m.content)
          : [];

        // Build plain-text input for Responses API
        const historyText = safeHistory
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");
        const input = `${historyText ? historyText + "\n" : ""}user: ${message}`;

        // Call OpenAI Responses API
        const resp = await openai.responses.create({
          model: "gpt-5.1",
          input,
          instructions: "You are a helpful assistant.",
        });

        // Extract text from Responses output
        const content = extractOutputText(resp);

        return {
          content,
          toolCalls: [], // extend here if adding tools later
        };
      } catch (error) {
        console.error("OpenAI Error:", error);
        const msg = (error as { message?: string })?.message ?? "Sorry, I encountered an error processing your request.";
        return { content: msg, toolCalls: [] };
      }
    },
  },
};

// Create Yoga schema
const schema = createSchema({ typeDefs, resolvers });

// Create Yoga handler for Cloudflare
const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Request, Response },
});

export async function GET(request: Request) {
  return handleRequest(request, {});
}

export async function POST(request: Request) {
  return handleRequest(request, {});
}
