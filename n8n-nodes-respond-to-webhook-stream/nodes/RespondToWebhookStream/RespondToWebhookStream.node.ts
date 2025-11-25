import type {
        IDataObject,
        IExecuteFunctions,
        INodeExecutionData,
        INodeProperties,
        INodeType,
        INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Response } from 'express';

const headerCollection: INodeProperties = {
        displayName: 'Response Headers',
        name: 'responseHeaders',
        placeholder: 'Add Response Header',
        description: 'Add headers to the webhook response',
        type: 'fixedCollection',
        typeOptions: {
                multipleValues: true,
        },
        default: {},
        options: [
                {
                        name: 'entries',
                        displayName: 'Entries',
                        values: [
                                {
                                        displayName: 'Name',
                                        name: 'name',
                                        type: 'string',
                                        default: '',
                                        description: 'Name of the header',
                                },
                                {
                                        displayName: 'Value',
                                        name: 'value',
                                        type: 'string',
                                        default: '',
                                        description: 'Value of the header',
                                },
                        ],
                },
        ],
};

function formatChunk(content: string, appendNewline: boolean) {
        if (!content) return undefined;
        return appendNewline ? `${content}\n\n` : content;
}

export class RespondToWebhookStream implements INodeType {
        description: INodeTypeDescription = {
                displayName: 'Respond to Webhook (Streaming)',
                name: 'respondToWebhookStream',
                icon: { light: 'file:webhook.svg', dark: 'file:webhook.dark.svg' },
                group: ['transform'],
                version: 1,
                description: 'Manually stream responses to a Webhook trigger',
                defaults: {
                        name: 'Streaming Response',
                },
                inputs: ['main'],
                outputs: ['main'],
                properties: [
                        {
                                displayName: 'Operation',
                                name: 'operation',
                                type: 'options',
                                options: [
                                        {
                                                name: 'Open Stream',
                                                value: 'open',
                                                description: 'Open the HTTP response and optionally send the first chunk',
                                        },
                                        {
                                                name: 'Send Chunk',
                                                value: 'send',
                                                description: 'Write a chunk to the open response without closing it',
                                        },
                                        {
                                                name: 'Close Stream',
                                                value: 'close',
                                                description: 'Finish the response (calls res.end)',
                                        },
                                ],
                                default: 'open',
                                description: 'How this node should interact with the streaming response',
                        },
                        {
                                displayName: 'Chunk Content',
                                name: 'chunk',
                                type: 'string',
                                typeOptions: { rows: 3 },
                                default: '',
                                displayOptions: {
                                        show: {
                                                operation: ['open', 'send', 'close'],
                                        },
                                },
                                description: 'Raw data to write to the HTTP stream (e.g. SSE formatted text)',
                        },
                        {
                                displayName: 'Append Blank Line',
                                name: 'appendNewline',
                                type: 'boolean',
                                default: true,
                                description: 'Whether to append two newlines to the chunk (useful for Server-Sent Events)',
                        },
                        {
                                displayName: 'Status Code',
                                name: 'statusCode',
                                type: 'number',
                                default: 200,
                                typeOptions: {
                                        minValue: 100,
                                        maxValue: 599,
                                },
                                displayOptions: {
                                        show: {
                                                operation: ['open'],
                                        },
                                },
                                description: 'Status code to use when opening the stream',
                        },
                        headerCollection,
                        {
                                displayName: 'Add Default Streaming Headers',
                                name: 'useDefaultHeaders',
                                type: 'boolean',
                                default: true,
                                displayOptions: {
                                        show: {
                                                operation: ['open'],
                                        },
                                },
                                description:
                                        'Automatically apply text/event-stream headers (Content-Type, Cache-Control, Connection, X-Accel-Buffering)',
                        },
                        {
                                displayName: 'Allow Write Without Open',
                                name: 'allowUnopened',
                                type: 'boolean',
                                default: false,
                                displayOptions: {
                                        show: {
                                                operation: ['send', 'close'],
                                        },
                                },
                                description:
                                        'If enabled, chunks can be sent even if the stream was not opened earlier in the workflow',
                        },
                ],
        };

        async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
                const items = this.getInputData();
                const operation = this.getNodeParameter('operation', 0) as 'open' | 'send' | 'close';
                const chunk = this.getNodeParameter('chunk', 0, '') as string;
                const appendNewline = this.getNodeParameter('appendNewline', 0, true) as boolean;
                const state = this.getWorkflowStaticData('node') as IDataObject & {
                        streamOpen?: boolean;
                };

                const res = this.getResponseObject() as Response | undefined;
                if (!res) {
                        throw new NodeOperationError(
                                this.getNode(),
                                'No HTTP response found. Ensure this node is used after a Webhook trigger.',
                        );
                }

                const writeChunk = (response: Response, content?: string) => {
                        if (!content) return;
                        response.write(content);
                        response.flush?.();
                };

                if (operation === 'open') {
                        const statusCode = this.getNodeParameter('statusCode', 0, 200) as number;
                        const useDefaultHeaders = this.getNodeParameter('useDefaultHeaders', 0, true) as boolean;
                        const headerEntries = this.getNodeParameter(
                                'responseHeaders.entries',
                                0,
                                [],
                        ) as IDataObject[];

                        const headers: Record<string, string> = {};
                        if (useDefaultHeaders) {
                                headers['content-type'] = 'text/event-stream';
                                headers['cache-control'] = 'no-cache';
                                headers['connection'] = 'keep-alive';
                                headers['x-accel-buffering'] = 'no';
                        }

                        for (const entry of headerEntries) {
                                if (!entry.name) continue;
                                headers[entry.name.toString().toLowerCase()] = entry.value?.toString() ?? '';
                        }

                        res.writeHead(statusCode, headers);
                        res.flushHeaders?.();
                        writeChunk(res, formatChunk(chunk, appendNewline));
                        state.streamOpen = true;
                } else {
                        const allowUnopened = this.getNodeParameter('allowUnopened', 0, false) as boolean;
                        if (!state.streamOpen && !allowUnopened) {
                                throw new NodeOperationError(
                                        this.getNode(),
                                        'No open stream found. Add an "Open Stream" operation earlier or enable "Allow Write Without Open".',
                                );
                        }

                        if (operation === 'send') {
                                writeChunk(res, formatChunk(chunk, appendNewline));
                        } else if (operation === 'close') {
                                const formatted = formatChunk(chunk, appendNewline);
                                if (formatted) {
                                        res.end(formatted);
                                } else {
                                        res.end();
                                }
                                state.streamOpen = false;
                        }
                }

                return [items];
        }
}
