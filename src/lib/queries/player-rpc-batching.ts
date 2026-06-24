const DEFAULT_PLAYER_RPC_CHUNK_SIZE = 150;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
};

export async function fetchPlayerRpcInChunks<T>(
  client: RpcClient,
  rpcName: string,
  args: Record<string, unknown> & { p_player_ids: string[] },
  options: { chunkSize?: number; errorLabel?: string } = {},
) {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_PLAYER_RPC_CHUNK_SIZE);
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
