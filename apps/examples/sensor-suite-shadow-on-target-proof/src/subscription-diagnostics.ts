import {
  defaultRosbridgeClientFactory,
  type RosbridgeClient,
  type RosbridgeClientFactory,
  type RosbridgeService,
  type RosbridgeServiceOptions,
  type RosbridgeTopic,
  type RosbridgeTopicListener,
  type RosbridgeTopicOptions,
} from "@ggcs/transport-rosbridge";

export interface TopicSubscriptionDiagnostic {
  readonly createTopicCalls: number;
  readonly subscribeCalls: number;
  readonly unsubscribeCalls: number;
  readonly activeSubscriptions: number;
  readonly maxActiveSubscriptions: number;
}

interface MutableTopicDiagnostic {
  createTopicCalls: number;
  subscribeCalls: number;
  unsubscribeCalls: number;
  activeSubscriptions: number;
  maxActiveSubscriptions: number;
}

export class SubscriptionDiagnostics {
  private readonly topics = new Map<string, MutableTopicDiagnostic>();

  recordCreate(topic: string): void {
    this.entry(topic).createTopicCalls += 1;
  }

  recordSubscribe(topic: string): void {
    const entry = this.entry(topic);
    entry.subscribeCalls += 1;
    entry.activeSubscriptions += 1;
    entry.maxActiveSubscriptions = Math.max(entry.maxActiveSubscriptions, entry.activeSubscriptions);
  }

  recordUnsubscribe(topic: string): void {
    const entry = this.entry(topic);
    entry.unsubscribeCalls += 1;
    entry.activeSubscriptions = Math.max(0, entry.activeSubscriptions - 1);
  }

  snapshot(): Readonly<Record<string, TopicSubscriptionDiagnostic>> {
    return Object.fromEntries(
      [...this.topics.entries()].map(([topic, value]) => [topic, { ...value }]),
    );
  }

  private entry(topic: string): MutableTopicDiagnostic {
    let entry = this.topics.get(topic);
    if (!entry) {
      entry = {
        createTopicCalls: 0,
        subscribeCalls: 0,
        unsubscribeCalls: 0,
        activeSubscriptions: 0,
        maxActiveSubscriptions: 0,
      };
      this.topics.set(topic, entry);
    }
    return entry;
  }
}

class DiagnosticTopic implements RosbridgeTopic {
  private readonly listeners = new Set<RosbridgeTopicListener>();

  constructor(
    private readonly topic: string,
    private readonly delegate: RosbridgeTopic,
    private readonly diagnostics: SubscriptionDiagnostics,
  ) {}

  subscribe(listener: RosbridgeTopicListener): void {
    if (!this.listeners.has(listener)) {
      this.listeners.add(listener);
      this.diagnostics.recordSubscribe(this.topic);
    }
    this.delegate.subscribe(listener);
  }

  unsubscribe(listener: RosbridgeTopicListener): void {
    if (this.listeners.delete(listener)) this.diagnostics.recordUnsubscribe(this.topic);
    this.delegate.unsubscribe(listener);
  }

  advertise(): void { this.delegate.advertise(); }
  unadvertise(): void { this.delegate.unadvertise(); }
  publish(message: unknown): void { this.delegate.publish(message); }
}

class DiagnosticClient implements RosbridgeClient {
  constructor(
    private readonly delegate: RosbridgeClient,
    private readonly diagnostics: SubscriptionDiagnostics,
  ) {}

  get isConnected(): boolean { return this.delegate.isConnected; }
  on(event: "connection" | "close" | "error", listener: (value?: unknown) => void): void {
    this.delegate.on(event, listener);
  }
  connect(url: string): void { this.delegate.connect(url); }
  close(): void { this.delegate.close(); }
  createTopic(options: RosbridgeTopicOptions): RosbridgeTopic {
    this.diagnostics.recordCreate(options.topic);
    return new DiagnosticTopic(options.topic, this.delegate.createTopic(options), this.diagnostics);
  }
  createService(options: RosbridgeServiceOptions): RosbridgeService {
    return this.delegate.createService(options);
  }
}


export function assertSinglePhysicalSubscriptions(
  snapshot: Readonly<Record<string, TopicSubscriptionDiagnostic>>,
  topics: readonly string[],
): void {
  for (const topic of topics) {
    const diagnostic = snapshot[topic];
    if (!diagnostic) throw new Error(`No GGCS subscription diagnostic was recorded for ${topic}`);
    if (diagnostic.activeSubscriptions !== 1 || diagnostic.maxActiveSubscriptions !== 1) {
      throw new Error(`GGCS physical subscription sharing failed for ${topic}: ${JSON.stringify(diagnostic)}`);
    }
  }
}

export function createDiagnosticClientFactory(
  diagnostics: SubscriptionDiagnostics,
  delegate: RosbridgeClientFactory = defaultRosbridgeClientFactory,
): RosbridgeClientFactory {
  return {
    create(): RosbridgeClient {
      return new DiagnosticClient(delegate.create(), diagnostics);
    },
  };
}
