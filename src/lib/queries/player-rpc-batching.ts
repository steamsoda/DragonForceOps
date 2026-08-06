const DEFAULT_PLAYER_RPC_CHUNK_SIZE = 150;
const DEFAULT_RPC_MAX_RESPONSE_ROWS = 1000;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
};

export async function fetchPlayerRpcInChunks<T>(
  client: RpcClient,
  rpcName: string,
  args: Record<string, unknown> & { p_player_ids: string[] },
  options: {
    chunkSize?: number;
    errorLabel?: string;
    maxRowsPerCall?: number;
    maxRowsPerPlayer?: number;
  } = {},
) {
  const requestedChunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_PLAYER_RPC_CHUNK_SIZE));
  const maxRowsPerCall = Math.max(1, Math.floor(options.maxRowsPerCall ?? DEFAULT_RPC_MAX_RESPONSE_ROWS));
  const maxRowsPerPlayer = options.maxRowsPerPlayer == null
    ? null
    : Math.max(1, Math.floor(options.maxRowsPerPlayer));
  const rowSafeChunkSize = maxRowsPerPlayer == null
    ? requestedChunkSize
    : Math.max(1, Math.floor(maxRowsPerCall / maxRowsPerPlayer));
  const chunkSize = Math.min(requestedChunkSize, rowSafeChunkSize);
  const rows: T[] = [];

  for (let index = 0; index < args.p_player_ids.length; index += chunkSize) {
    const playerChunk = args.p_player_ids.slice(index, index + chunkSize);
    const { data, error } = await client.rpc(rpcName, {
      ...args,
      p_player_ids: playerChunk,
    });

    if (error) {
      throw new Error(`${options.errorLabel ?? rpcName}: ${error.message ?? "query failed"}`);
    }

    rows.push(...((data ?? []) as T[]));
  }

  return rows;
}
