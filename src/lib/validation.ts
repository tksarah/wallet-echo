import { z } from 'zod';
import { checkAddress, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { AppError } from './errors';
import type { GenerationInput } from './types';
const schema = z.object({
  addressType: z.enum(['evm', 'substrate']),
  address: z.string().trim().min(1).max(100),
  style: z.enum(['rpg-hero','wallet-beast','cyber-agent','collectible','legendary-card']),
}).strict();
export function validateInput(value: unknown): GenerationInput {
  if(value&&typeof value==='object'&&('worldStyle' in value||'characterType' in value))throw new AppError('CLIENT_OUTDATED','ページを再読み込みし、新しい生成スタイルを選んでください。',409);
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('INVALID_INPUT', '入力項目を確認してください。');
  const input = result.data;
  if (input.addressType === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) throw new AppError('INVALID_ADDRESS', 'EVMは0xから始まる42文字のアドレスを入力してください。');
    input.address = input.address.toLowerCase();
  } else {
    try {
      // Accept Astar (5) and generic Substrate (42) SS58 representations only.
      if (input.address.startsWith('0x') || !(checkAddress(input.address, 5)[0] || checkAddress(input.address, 42)[0])) throw new Error();
      const decoded = decodeAddress(input.address);
      if (decoded.length !== 32) throw new Error();
      input.address = encodeAddress(decoded, 5);
    } catch { throw new AppError('INVALID_ADDRESS', 'Astarまたは汎用Substrate形式の有効なアドレスを入力してください。'); }
  }
  return input;
}
