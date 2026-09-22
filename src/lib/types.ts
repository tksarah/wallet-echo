import type { GenerationStyle } from './styles';
export type AddressType = 'evm' | 'substrate';
export type CharacterType = 'humanoid' | 'monster';
export type WorldStyle = 'fantasy' | 'japan' | 'space' | 'storybook';
export interface GenerationInput {
  addressType: AddressType;
  address: string;
  style: GenerationStyle;
}
export interface Activity {
  id: string;
  timestamp: number;
  kind: string;
  target: string | null;
  success: boolean;
}
export interface WalletFeatures {
  source: 'Blockscout' | 'Subscan via PubFi';
  addressType: AddressType;
  address: string;
  fetchedAt: string;
  observedTransactions: number;
  pendingTransactions: number;
  successfulTransactions: number;
  activeDaysLast30d: number;
  uniqueTargets: number;
  operationKinds: string[];
  /** Optional only for results saved before judgment v2. */
  operationDistribution?: { kind: string; count: number; share: number }[];
  dailyActivity?: { date: string; count: number; successful: number }[];
  activeDaysObserved?: number;
  observedSpanDays?: number;
  stakingInteractions: number;
  governanceInteractions: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  truncated: boolean;
  sampleLimit: number;
  unknownFeatures: string[];
}
export interface Character {
  name: string;
  temperament: string;
  specialTrait: string;
  summary: string;
  interpretation?: {
    version: number;
    temperamentLabel: string;
    motifLabel: string;
    pose: string;
    motif: string;
    evidence: { key: string; text: string }[];
    notice?: string;
  };
  style?: GenerationStyle;
  characterType?: CharacterType;
  worldStyle?: WorldStyle;
}
export type JobStatus = 'analyzing' | 'judging' | 'generating' | 'complete' | 'failed';
export interface Job {
  id: string;
  input: GenerationInput | LegacyInput;
  status: JobStatus;
  createdAt: string;
  expiresAt: string;
  features?: WalletFeatures;
  character?: Character;
  imagePrompt?: string;
  imageUrl?: string;
  attemptStartedAt?: string;
  imageDelivery?: 'pending' | 'received' | 'expired' | 'unavailable';
  imageExpiresAt?: string;
  imageUnavailableReason?: 'restarted' | 'legacy-deleted';
  walletRemaining?: number;
  error?: { code: string; message: string; retryImage: boolean };
}

export interface LegacyInput {addressType:AddressType;address:string;worldStyle:WorldStyle;characterType:CharacterType|'random';style?:never}
