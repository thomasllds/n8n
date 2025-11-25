# n8n-nodes-respond-to-webhook-stream

A programmatic n8n node that lets you manually stream HTTP responses back to a Webhook trigger. It is based on the core `Respond to Webhook` node and adds support for opening, writing to, and closing a streaming response (for example when implementing Server-Sent Events).

## Features
- Open a streaming HTTP response with sensible defaults for Server-Sent Events.
- Write one or more chunks to the open stream without closing it.
- Close the stream explicitly, with optional final content.
- Customize response headers and status codes.

## Node operations
| Operation | Purpose |
| --- | --- |
| **Open Stream** | Start the response, optionally sending the first chunk and default SSE headers. |
| **Send Chunk** | Write a chunk to the open response without closing it. |
| **Close Stream** | Finish the response and optionally send a final chunk. |

Use this node after a Webhook trigger configured to "Respond using Respond to Webhook node". The node tracks whether a stream is open across executions using workflow static data.

## Development

Install dependencies in the project root and then:

```bash
pnpm --filter n8n-nodes-respond-to-webhook-stream install
pnpm --filter n8n-nodes-respond-to-webhook-stream run dev
```

### Build
```bash
pnpm --filter n8n-nodes-respond-to-webhook-stream run build
```

### Lint
```bash
pnpm --filter n8n-nodes-respond-to-webhook-stream run lint
```

## Publish

When you are ready to release to npm, run:

```bash
pnpm --filter n8n-nodes-respond-to-webhook-stream run release
```

The release script runs the production build and lint checks before preparing the package for publication.
