export interface SnowflakeConfig {
  epoch?: number; // Custom epoch timestamp in ms (default: 2026-01-01T00:00:00Z)
  workerId?: number; // 0 - 31 (5 bits)
  datacenterId?: number; // 0 - 31 (5 bits)
}

export interface DeconstructedSnowflake {
  timestamp: number;
  date: Date;
  datacenterId: number;
  workerId: number;
  sequence: number;
  binary: string;
}

export class SnowflakeGenerator {
  // Default custom epoch: 2026-01-01T00:00:00.000Z (1767225600000 ms)
  private readonly epoch: bigint;
  private readonly workerId: bigint;
  private readonly datacenterId: bigint;

  private readonly workerIdBits = 5n;
  private readonly datacenterIdBits = 5n;
  private readonly sequenceBits = 12n;

  private readonly maxWorkerId = (1n << this.workerIdBits) - 1n; // 31
  private readonly maxDatacenterId = (1n << this.datacenterIdBits) - 1n; // 31
  private readonly maxSequence = (1n << this.sequenceBits) - 1n; // 4095

  private readonly workerIdShift = this.sequenceBits; // 12
  private readonly datacenterIdShift = this.sequenceBits + this.workerIdBits; // 17
  private readonly timestampLeftShift =
    this.sequenceBits + this.workerIdBits + this.datacenterIdBits; // 22

  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(config: SnowflakeConfig = {}) {
    const defaultEpoch = 1767225600000; // 2026-01-01T00:00:00Z
    const epochInput = config.epoch ?? defaultEpoch;
    const workerIdInput = config.workerId ?? 1;
    const datacenterIdInput = config.datacenterId ?? 1;

    this.epoch = BigInt(epochInput);
    this.workerId = BigInt(workerIdInput);
    this.datacenterId = BigInt(datacenterIdInput);

    if (this.workerId > this.maxWorkerId || this.workerId < 0n) {
      throw new Error(
        `Worker ID must be between 0 and ${this.maxWorkerId.toString()}`,
      );
    }

    if (this.datacenterId > this.maxDatacenterId || this.datacenterId < 0n) {
      throw new Error(
        `Datacenter ID must be between 0 and ${this.maxDatacenterId.toString()}`,
      );
    }
  }

  public NextId(): string {
    return this.nextIdBigInt().toString();
  }

  public NextIdBigInt(): bigint {
    return this.nextIdBigInt();
  }

  public Deconstruct(id: string | bigint): DeconstructedSnowflake {
    const bigIntId = typeof id === 'string' ? BigInt(id) : id;

    const sequence = Number(bigIntId & this.maxSequence);
    const workerId = Number(
      (bigIntId >> this.workerIdShift) & this.maxWorkerId,
    );
    const datacenterId = Number(
      (bigIntId >> this.datacenterIdShift) & this.maxDatacenterId,
    );
    const timestampMs = Number(
      (bigIntId >> this.timestampLeftShift) + this.epoch,
    );

    return {
      timestamp: timestampMs,
      date: new Date(timestampMs),
      datacenterId,
      workerId,
      sequence,
      binary: bigIntId.toString(2).padStart(64, '0'),
    };
  }

  private nextIdBigInt(): bigint {
    let currentTimestamp = this.getCurrentTimestamp();

    if (currentTimestamp < this.lastTimestamp) {
      const offset = this.lastTimestamp - currentTimestamp;

      if (offset <= 5n) {
        // Small clock skew, wait it out
        currentTimestamp = this.waitUntilNextMs(this.lastTimestamp);
      } else {
        throw new Error(
          `Clock moved backwards. Refusing to generate id for ${offset.toString()}ms`,
        );
      }
    }

    if (this.lastTimestamp === currentTimestamp) {
      this.sequence = (this.sequence + 1n) & this.maxSequence;

      if (this.sequence === 0n) {
        currentTimestamp = this.waitUntilNextMs(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = currentTimestamp;

    return (
      ((currentTimestamp - this.epoch) << this.timestampLeftShift) |
      (this.datacenterId << this.datacenterIdShift) |
      (this.workerId << this.workerIdShift) |
      this.sequence
    );
  }

  private getCurrentTimestamp(): bigint {
    return BigInt(Date.now());
  }

  private waitUntilNextMs(lastTimestamp: bigint): bigint {
    let timestamp = this.getCurrentTimestamp();

    while (timestamp <= lastTimestamp) {
      timestamp = this.getCurrentTimestamp();
    }

    return timestamp;
  }
}

// Global default singleton instance
export const defaultSnowflake = new SnowflakeGenerator({
  epoch: 1767225600000,
  workerId: 1,
  datacenterId: 1,
});

export function generate(): string {
  return defaultSnowflake.NextId();
}

export function deconstructSnowflakeId(
  id: string | bigint,
  epoch?: number,
): DeconstructedSnowflake {
  if (epoch !== undefined) {
    const customGenerator = new SnowflakeGenerator({ epoch });
    return customGenerator.Deconstruct(id);
  }

  return defaultSnowflake.Deconstruct(id);
}
