import { judgmentFingerprint, judgeProfile, JUDGMENT_VERSION, type CachedJudgment, type JudgmentProfile } from './character';
import type { WalletFeatures } from './types';

/** Serializes a wallet's evaluations, never holding the application's persistence lock during an API call. */
export class JudgmentCache {
  private pending = new Map<string, Promise<unknown>>();
  constructor(
    private read: (key: string) => Promise<CachedJudgment | undefined>,
    private write: (key: string, value: CachedJudgment) => Promise<void>,
    private evaluate: (features: WalletFeatures) => Promise<JudgmentProfile> = judgeProfile,
  ) {}
  async get(key: string, features: WalletFeatures): Promise<JudgmentProfile> {
    const fingerprint = judgmentFingerprint(features);
    const before = this.pending.get(key);
    const task = (async () => {
      // A failed prior request must not permanently block this wallet.
      await before?.catch(() => {});
      const cached = await this.read(key);
      if (cached?.fingerprint === fingerprint && cached.profile.version === JUDGMENT_VERSION) return cached.profile;
      const profile = await this.evaluate(features);
      await this.write(key, { fingerprint, profile });
      return profile;
    })();
    this.pending.set(key, task);
    try { return await task; }
    finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }
}
