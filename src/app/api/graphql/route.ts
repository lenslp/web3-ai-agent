import { createSchema, createYoga } from "graphql-yoga";
import OpenAI from "openai";

export const runtime = "edge";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Convert GraphQL message format → OpenAI Responses API format
function toResponsesMessages(
  msgs: Array<{ role: string; content: string }>
) {
  return msgs.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

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
      }: { message: string; history?: Array<{ role: string; content: string }> }
    ) => {
      try {
        // Validate history
        const safeHistory = Array.isArray(history)
          ? history.filter((m) => m.role && m.content)
          : [];

        // Build messages
        const messages = [
          { role: "system", content: "You are a helpful assistant." },
          ...safeHistory,
          { role: "user", content: message },
        ];

        // Convert to Responses API input format
        const input = toResponsesMessages(messages);

        // Call OpenAI Responses API
        const resp = await openai.responses.create({
          model: "gpt-5.1",
          input,
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
  fetchAPI: { Response },
});

export { handleRequest as GET, handleRequest as POST };
